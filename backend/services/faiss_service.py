"""FAISS vector store with per-collection indexes and rich metadata.

Design
------
* One ``IndexIDMap2(IndexFlatIP)`` per collection → cosine similarity on
  L2-normalised vectors, with stable integer ids so single documents can be
  removed without re-embedding the whole collection.
* Metadata is kept in a JSON side-car (``{collection}.meta``) keyed by the
  integer id: ``{"id": str, "text": str, "metadata": dict}``.
* The embedding backend name and dimension are persisted so an index built
  with one backend is never queried with another.
* Metadata filtering happens *before* the top-k cut (we over-fetch and then
  filter, retrying with a larger k when a filter is selective), so callers
  always get up to ``n_results`` matching documents.
"""

from __future__ import annotations

import os
import json
import logging
import asyncio
from pathlib import Path
from typing import Optional

import faiss
import numpy as np

from core.config import settings
from services.embeddings import get_embedding_service

logger = logging.getLogger(__name__)

TOP_K_DEFAULT = settings.RAG_TOP_K


class FAISSService:
    """Async-friendly FAISS wrapper (CPU) used for resume RAG."""

    def __init__(self, embedding_service=None, persist_dir: str | None = None):
        self.model = embedding_service or get_embedding_service()
        self.backend_name = getattr(self.model, "name", "unknown")
        self.persist_dir = persist_dir or settings.faiss_dir
        self.dim = settings.EMBEDDING_DIM

        self.indexes: dict[str, faiss.Index] = {}
        self.metadata: dict[str, dict[int, dict]] = {}   # collection → {int_id: record}
        self.next_id: dict[str, int] = {}

        Path(self.persist_dir).mkdir(parents=True, exist_ok=True)
        logger.info("FAISS store: %s (backend=%s, dim=%d)", self.persist_dir, self.backend_name, self.dim)

    # ── Paths ──────────────────────────────────────────────────────────────
    def _paths(self, collection: str) -> tuple[str, str]:
        return (
            os.path.join(self.persist_dir, f"{collection}.index"),
            os.path.join(self.persist_dir, f"{collection}.meta"),
        )

    # ── Index lifecycle ────────────────────────────────────────────────────
    def _new_index(self) -> faiss.Index:
        return faiss.IndexIDMap2(faiss.IndexFlatIP(self.dim))

    def _get_index(self, collection: str) -> faiss.Index:
        if collection in self.indexes:
            return self.indexes[collection]

        index_path, meta_path = self._paths(collection)
        if os.path.exists(index_path) and os.path.exists(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    payload = json.load(f)
                stored_backend = payload.get("backend")
                stored_dim = payload.get("dim")
                loaded = faiss.read_index(index_path)
                if stored_backend == self.backend_name and stored_dim == self.dim and loaded.d == self.dim:
                    self.indexes[collection] = loaded
                    self.metadata[collection] = {int(k): v for k, v in payload.get("records", {}).items()}
                    self.next_id[collection] = int(payload.get("next_id", len(self.metadata[collection])))
                    logger.info("[FAISS] Loaded '%s' (%d vectors)", collection, loaded.ntotal)
                    return loaded
                logger.warning(
                    "[FAISS] Index '%s' was built with backend=%s dim=%s; current backend=%s dim=%d. Recreating.",
                    collection, stored_backend, stored_dim, self.backend_name, self.dim,
                )
            except Exception as exc:
                logger.error("[FAISS] Could not load '%s': %s. Recreating.", collection, exc)

        self.indexes[collection] = self._new_index()
        self.metadata[collection] = {}
        self.next_id[collection] = 0
        return self.indexes[collection]

    def _save(self, collection: str) -> None:
        index_path, meta_path = self._paths(collection)
        faiss.write_index(self.indexes[collection], index_path)
        payload = {
            "backend": self.backend_name,
            "dim": self.dim,
            "next_id": self.next_id[collection],
            "records": {str(k): v for k, v in self.metadata[collection].items()},
        }
        tmp = meta_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f)
        os.replace(tmp, meta_path)

    # ── Embedding ──────────────────────────────────────────────────────────
    async def _embed(self, texts: list[str]) -> np.ndarray:
        vectors = await self.model.embed_batch(texts)
        if not vectors or any(len(v) != self.dim for v in vectors):
            raise RuntimeError(
                f"Embedding backend '{self.backend_name}' returned vectors of unexpected size "
                f"(expected {self.dim})."
            )
        arr = np.asarray(vectors, dtype=np.float32)
        if arr.ndim == 1:
            arr = arr[None, :]
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return (arr / norms).astype(np.float32)

    # ── Public API ─────────────────────────────────────────────────────────
    async def add(self, collection: str, doc_id: str, text: str, metadata: Optional[dict] = None) -> None:
        await self.add_many(collection, [{"id": doc_id, "text": text, "metadata": metadata or {}}])

    async def add_many(self, collection: str, documents: list[dict]) -> None:
        """Insert (or replace) documents. Each: {"id": str, "text": str, "metadata": dict}."""
        if not documents:
            return
        index = self._get_index(collection)
        # Replace semantics: drop existing docs with the same ids first.
        existing = {rec["id"]: iid for iid, rec in self.metadata[collection].items()}
        to_remove = [existing[d["id"]] for d in documents if d["id"] in existing]
        embeddings = await self._embed([d["text"] for d in documents])

        def _write():
            if to_remove:
                index.remove_ids(np.asarray(to_remove, dtype=np.int64))
                for iid in to_remove:
                    self.metadata[collection].pop(iid, None)
            ids = []
            for d in documents:
                iid = self.next_id[collection]
                self.next_id[collection] += 1
                ids.append(iid)
                self.metadata[collection][iid] = {
                    "id": d["id"],
                    "text": d["text"],
                    "metadata": d.get("metadata", {}) or {},
                }
            index.add_with_ids(embeddings, np.asarray(ids, dtype=np.int64))
            self._save(collection)
            logger.info("[FAISS] Added %d docs to '%s' (total %d)", len(documents), collection, index.ntotal)

        await asyncio.to_thread(_write)

    async def search(
        self,
        collection: str,
        query: str,
        n_results: int = TOP_K_DEFAULT,
        filter_metadata: Optional[dict] = None,
        min_score: float | None = None,
    ) -> list[dict]:
        """Return up to ``n_results`` documents ordered by cosine similarity.

        Each hit: {"id", "text", "metadata", "score"}; score ∈ [-1, 1].
        """
        index = self._get_index(collection)
        if index.ntotal == 0 or not query or not query.strip():
            return []
        q = await self._embed([query])
        threshold = settings.RAG_MIN_SCORE if min_score is None else min_score

        def _matches(meta: dict) -> bool:
            if not filter_metadata:
                return True
            return all(meta.get(k) == v for k, v in filter_metadata.items())

        def _search() -> list[dict]:
            k = min(max(n_results * 4, 8), index.ntotal)
            while True:
                scores, ids = index.search(q, k)
                results = []
                for score, iid in zip(scores[0], ids[0]):
                    if iid == -1:
                        continue
                    rec = self.metadata[collection].get(int(iid))
                    if not rec or not _matches(rec["metadata"]):
                        continue
                    if float(score) < threshold:
                        continue
                    results.append({"id": rec["id"], "text": rec["text"],
                                    "metadata": rec["metadata"], "score": round(float(score), 4)})
                    if len(results) >= n_results:
                        break
                if len(results) >= n_results or k >= index.ntotal:
                    return results
                k = min(k * 4, index.ntotal)

        return await asyncio.to_thread(_search)

    async def delete(self, collection: str, doc_id: str) -> bool:
        index = self._get_index(collection)
        target = [iid for iid, rec in self.metadata[collection].items() if rec["id"] == doc_id]
        if not target:
            return False

        def _remove():
            index.remove_ids(np.asarray(target, dtype=np.int64))
            for iid in target:
                self.metadata[collection].pop(iid, None)
            self._save(collection)

        await asyncio.to_thread(_remove)
        return True

    async def delete_where(self, collection: str, filter_metadata: dict) -> int:
        """Delete every document whose metadata matches all key/value pairs."""
        index = self._get_index(collection)
        target = [
            iid for iid, rec in self.metadata[collection].items()
            if all(rec["metadata"].get(k) == v for k, v in filter_metadata.items())
        ]
        if not target:
            return 0

        def _remove():
            index.remove_ids(np.asarray(target, dtype=np.int64))
            for iid in target:
                self.metadata[collection].pop(iid, None)
            self._save(collection)

        await asyncio.to_thread(_remove)
        return len(target)

    async def get(self, collection: str, doc_id: str) -> Optional[dict]:
        self._get_index(collection)
        for rec in self.metadata[collection].values():
            if rec["id"] == doc_id:
                return rec
        return None

    async def list_where(self, collection: str, filter_metadata: dict) -> list[dict]:
        self._get_index(collection)
        return [
            rec for rec in self.metadata[collection].values()
            if all(rec["metadata"].get(k) == v for k, v in filter_metadata.items())
        ]

    async def count(self, collection: str) -> int:
        return self._get_index(collection).ntotal

    async def clear_collection(self, collection: str) -> None:
        self.indexes[collection] = self._new_index()
        self.metadata[collection] = {}
        self.next_id[collection] = 0
        self._save(collection)

    def get_stats(self) -> dict:
        return {
            "backend": self.backend_name,
            "dim": self.dim,
            "collections": {
                col: {"total_vectors": idx.ntotal, "metadata_count": len(self.metadata[col])}
                for col, idx in self.indexes.items()
            },
        }
