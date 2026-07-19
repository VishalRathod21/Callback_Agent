import os
import json
import logging
import asyncio
from pathlib import Path
from typing import Optional

import faiss
import numpy as np
from services.embeddings.gemini_embeddings import GeminiEmbeddingService
from core.config import settings

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────
EMBED_DIM     = 768                    # output dimension of Gemini text-embedding-004
PERSIST_DIR   = settings.faiss_dir
TOP_K_DEFAULT = 5


class FAISSService:
    """
    Drop-in replacement for ChromaDB using FAISS and Gemini embeddings.
    
    Architecture:
    - One FAISS IndexFlatIP per "collection" (resumes, questions, etc.)
    - Metadata stored alongside as a JSON list (id, text, metadata)
    - Embeddings via Gemini API
    - Persists to disk as .index + .meta files
    - Async API matching the original implementation
    """

    def __init__(self):
        logger.info("Initializing Gemini Embedding Service for FAISS...")
        self.model = GeminiEmbeddingService()
        logger.info("Gemini Embedding Service initialized.")

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
                try:
                    loaded_index = faiss.read_index(index_path)
                    # Check if dimension matches (new model has 768 dimensions)
                    if loaded_index.d == EMBED_DIM:
                        self.indexes[collection]  = loaded_index
                        with open(meta_path, "r") as f:
                            self.metadata[collection] = json.load(f)
                        logger.info(
                            f"[FAISS] Loaded '{collection}' from disk "
                            f"({self.indexes[collection].ntotal} vectors)"
                        )
                    else:
                        logger.warning(
                            f"[FAISS] Dimension mismatch for '{collection}'. "
                            f"Expected {EMBED_DIM}, got {loaded_index.d}. Recreating index."
                        )
                        self.indexes[collection]  = faiss.IndexFlatIP(EMBED_DIM)
                        self.metadata[collection] = []
                except Exception as e:
                    logger.error(f"[FAISS] Error loading index '{collection}': {e}. Recreating index.")
                    self.indexes[collection]  = faiss.IndexFlatIP(EMBED_DIM)
                    self.metadata[collection] = []
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
    async def _embed_async(self, texts: list[str]) -> np.ndarray:
        embeddings_list = await self.model.embed_batch(texts)
        # Convert to numpy array
        embeddings = np.array(embeddings_list, dtype=np.float32)
        if embeddings.ndim == 1:
            embeddings = np.expand_dims(embeddings, axis=0)
        # Normalize for cosine similarity
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1.0, norms)
        normalized_embeddings = embeddings / norms
        return normalized_embeddings.astype(np.float32)

    # ══════════════════════════════════════════════════════════
    # PUBLIC API — matches ChromaDB/previous FAISS usage patterns
    # ══════════════════════════════════════════════════════════

    async def add(
        self,
        collection: str,
        doc_id: str,
        text: str,
        metadata: Optional[dict] = None,
    ) -> None:
        """Add a single document to a collection."""
        index = self._get_index(collection)
        existing_ids = [m["id"] for m in self.metadata[collection]]

        if doc_id in existing_ids:
            logger.info(f"[FAISS] Updating existing doc '{doc_id}' in '{collection}'")
            idx = existing_ids.index(doc_id)
            self.metadata[collection].pop(idx)

            # Rebuild index with remaining documents
            all_texts = [m["text"] for m in self.metadata[collection]]
            if all_texts:
                new_embeddings = await self._embed_async(all_texts)
                def _rebuild():
                    new_index = faiss.IndexFlatIP(EMBED_DIM)
                    new_index.add(new_embeddings)
                    self.indexes[collection] = new_index
                await asyncio.to_thread(_rebuild)
            else:
                self.indexes[collection] = faiss.IndexFlatIP(EMBED_DIM)

        # Generate embedding for the new text
        embedding = await self._embed_async([text])

        # Add to index and save
        def _add_to_index():
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

        await asyncio.to_thread(_add_to_index)

    async def add_many(
        self,
        collection: str,
        documents: list[dict],  # each: {"id": str, "text": str, "metadata": dict}
    ) -> None:
        """Batch add multiple documents."""
        index = self._get_index(collection)
        texts = [d["text"] for d in documents]
        embeddings = await self._embed_async(texts)

        def _add_many():
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
        index = self._get_index(collection)

        if index.ntotal == 0:
            return []

        query_embedding = await self._embed_async([query])
        k = min(n_results * 3, index.ntotal)  # over-fetch for metadata filtering

        def _search():
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
                        meta["metadata"].get(key) == value
                        for key, value in filter_metadata.items()
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
        index = self._get_index(collection)
        existing_ids = [m["id"] for m in self.metadata[collection]]

        if doc_id not in existing_ids:
            return False

        idx = existing_ids.index(doc_id)
        self.metadata[collection].pop(idx)

        # Rebuild index without the deleted entry
        remaining_texts = [m["text"] for m in self.metadata[collection]]
        if remaining_texts:
            remaining_embeddings = await self._embed_async(remaining_texts)
            def _rebuild():
                new_index = faiss.IndexFlatIP(EMBED_DIM)
                new_index.add(remaining_embeddings)
                self.indexes[collection] = new_index
            await asyncio.to_thread(_rebuild)
        else:
            self.indexes[collection] = faiss.IndexFlatIP(EMBED_DIM)

        def _save_changes():
            self._save(collection)
            logger.info(f"[FAISS] Deleted '{doc_id}' from '{collection}'")

        await asyncio.to_thread(_save_changes)
        return True

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
