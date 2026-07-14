import os
import json
import logging
import asyncio
import pickle
from pathlib import Path
from typing import Optional

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from core.config import settings

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────
EMBED_MODEL   = "all-MiniLM-L6-v2"   # 80MB, fast, good quality
EMBED_DIM     = 384                    # output dimension of MiniLM
PERSIST_DIR   = settings.faiss_dir
TOP_K_DEFAULT = 5


class FAISSService:
    """
    Drop-in replacement for ChromaDB.
    
    Architecture:
    - One FAISS IndexFlatIP per "collection" (resumes, questions, etc.)
    - Metadata stored alongside as a JSON list (id, text, metadata)
    - Embeddings via sentence-transformers (runs fully local, no API needed)
    - Persists to disk as .index + .meta files
    - All search/add operations are synchronous internally,
      wrapped with asyncio.to_thread for async compatibility
    """

    def __init__(self):
        logger.info(f"Loading embedding model '{EMBED_MODEL}'...")
        self.model = SentenceTransformer(EMBED_MODEL)
        logger.info("Embedding model loaded.")

        self.indexes: dict[str, faiss.Index]     = {}
        self.metadata: dict[str, list[dict]]     = {}

        Path(PERSIST_DIR).mkdir(parents=True, exist_ok=True)
        logger.info(f"FAISS store directory: {PERSIST_DIR}")

    # ── Internal: get or create index ────────────────────────
    def _get_index(self, collection: str) -> faiss.Index:
        if collection not in self.indexes:
            # Try loading from disk first
            index_path = os.path.join(PERSIST_DIR, f"{collection}.index")
            meta_path  = os.path.join(PERSIST_DIR, f"{collection}.meta")

            if os.path.exists(index_path) and os.path.exists(meta_path):
                self.indexes[collection]  = faiss.read_index(index_path)
                with open(meta_path, "r") as f:
                    self.metadata[collection] = json.load(f)
                logger.info(
                    f"[FAISS] Loaded '{collection}' from disk "
                    f"({self.indexes[collection].ntotal} vectors)"
                )
            else:
                # Create new flat inner-product index (cosine similarity after normalize)
                self.indexes[collection]  = faiss.IndexFlatIP(EMBED_DIM)
                self.metadata[collection] = []
                logger.info(f"[FAISS] Created new index '{collection}'")

        return self.indexes[collection]

    # ── Internal: persist to disk ─────────────────────────────
    def _save(self, collection: str):
        index_path = os.path.join(PERSIST_DIR, f"{collection}.index")
        meta_path  = os.path.join(PERSIST_DIR, f"{collection}.meta")
        faiss.write_index(self.indexes[collection], index_path)
        with open(meta_path, "w") as f:
            json.dump(self.metadata[collection], f)

    # ── Internal: embed text ──────────────────────────────────
    def _embed(self, texts: list[str]) -> np.ndarray:
        embeddings = self.model.encode(
            texts,
            normalize_embeddings=True,   # normalize for cosine similarity
            show_progress_bar=False,
            batch_size=32,
        )
        return embeddings.astype(np.float32)

    # ══════════════════════════════════════════════════════════
    # PUBLIC API — matches ChromaDB usage patterns
    # ══════════════════════════════════════════════════════════

    async def add(
        self,
        collection: str,
        doc_id: str,
        text: str,
        metadata: Optional[dict] = None,
    ) -> None:
        """Add a single document to a collection."""
        def _add():
            index = self._get_index(collection)

            # Check for duplicate id — remove old entry if exists
            existing_ids = [m["id"] for m in self.metadata[collection]]
            if doc_id in existing_ids:
                logger.info(f"[FAISS] Updating existing doc '{doc_id}' in '{collection}'")
                idx = existing_ids.index(doc_id)
                # FAISS FlatIP doesn't support deletion — rebuild index without the old entry
                self.metadata[collection].pop(idx)
                all_texts = [m["text"] for m in self.metadata[collection]]
                if all_texts:
                    new_embeddings = self._embed(all_texts)
                    new_index = faiss.IndexFlatIP(EMBED_DIM)
                    new_index.add(new_embeddings)
                    self.indexes[collection] = new_index
                else:
                    self.indexes[collection] = faiss.IndexFlatIP(EMBED_DIM)

            # Add new entry
            embedding = self._embed([text])
            self.indexes[collection].add(embedding)
            self.metadata[collection].append({
                "id":       doc_id,
                "text":     text,
                "metadata": metadata or {},
            })
            self._save(collection)
            logger.info(
                f"[FAISS] Added '{doc_id}' to '{collection}' "
                f"(total: {self.indexes[collection].ntotal})"
            )

        await asyncio.to_thread(_add)

    async def add_many(
        self,
        collection: str,
        documents: list[dict],  # each: {"id": str, "text": str, "metadata": dict}
    ) -> None:
        """Batch add multiple documents."""
        def _add_many():
            index = self._get_index(collection)
            texts = [d["text"] for d in documents]
            embeddings = self._embed(texts)
            index.add(embeddings)
            for doc in documents:
                self.metadata[collection].append({
                    "id":       doc["id"],
                    "text":     doc["text"],
                    "metadata": doc.get("metadata", {}),
                })
            self._save(collection)
            logger.info(
                f"[FAISS] Batch added {len(documents)} docs to '{collection}' "
                f"(total: {index.ntotal})"
            )

        await asyncio.to_thread(_add_many)

    async def search(
        self,
        collection: str,
        query: str,
        n_results: int = TOP_K_DEFAULT,
        filter_metadata: Optional[dict] = None,
    ) -> list[dict]:
        """
        Search for similar documents.
        Returns list of dicts: [{"id", "text", "metadata", "score"}, ...]
        Score is cosine similarity (0-1, higher = more similar).
        """
        def _search():
            index = self._get_index(collection)

            if index.ntotal == 0:
                return []

            query_embedding = self._embed([query])
            k = min(n_results * 3, index.ntotal)  # over-fetch for metadata filtering
            scores, indices = index.search(query_embedding, k)

            results = []
            for score, idx in zip(scores[0], indices[0]):
                if idx == -1:
                    continue
                if idx >= len(self.metadata[collection]):
                    continue

                meta = self.metadata[collection][idx]

                # Apply metadata filter if provided
                if filter_metadata:
                    match = all(
                        meta["metadata"].get(k) == v
                        for k, v in filter_metadata.items()
                    )
                    if not match:
                        continue

                results.append({
                    "id":       meta["id"],
                    "text":     meta["text"],
                    "metadata": meta["metadata"],
                    "score":    float(score),
                })

                if len(results) >= n_results:
                    break

            return results

        return await asyncio.to_thread(_search)

    async def delete(self, collection: str, doc_id: str) -> bool:
        """Remove a document by ID. Returns True if found and deleted."""
        def _delete():
            index = self._get_index(collection)
            existing_ids = [m["id"] for m in self.metadata[collection]]

            if doc_id not in existing_ids:
                return False

            idx = existing_ids.index(doc_id)
            self.metadata[collection].pop(idx)

            # Rebuild index without the deleted entry
            remaining_texts = [m["text"] for m in self.metadata[collection]]
            if remaining_texts:
                new_embeddings = self._embed(remaining_texts)
                new_index = faiss.IndexFlatIP(EMBED_DIM)
                new_index.add(new_embeddings)
                self.indexes[collection] = new_index
            else:
                self.indexes[collection] = faiss.IndexFlatIP(EMBED_DIM)

            self._save(collection)
            logger.info(f"[FAISS] Deleted '{doc_id}' from '{collection}'")
            return True

        return await asyncio.to_thread(_delete)

    async def get(self, collection: str, doc_id: str) -> Optional[dict]:
        """Retrieve a specific document by ID."""
        self._get_index(collection)
        for meta in self.metadata.get(collection, []):
            if meta["id"] == doc_id:
                return meta
        return None

    async def count(self, collection: str) -> int:
        """Return number of documents in a collection."""
        index = self._get_index(collection)
        return index.ntotal

    async def clear_collection(self, collection: str) -> None:
        """Delete all documents in a collection."""
        self.indexes[collection]  = faiss.IndexFlatIP(EMBED_DIM)
        self.metadata[collection] = []
        self._save(collection)
        logger.info(f"[FAISS] Cleared collection '{collection}'")

    def get_stats(self) -> dict:
        """Return stats for all loaded collections."""
        return {
            col: {
                "total_vectors": self.indexes[col].ntotal,
                "metadata_count": len(self.metadata[col]),
            }
            for col in self.indexes
        }
