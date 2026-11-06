"""Embedding backends.

`get_embedding_service()` returns the backend selected by
`settings.EMBEDDING_BACKEND` (gemini | hashing | auto).
"""

import logging

from core.config import settings
from services.embeddings.hashing_embeddings import HashingEmbeddingService

logger = logging.getLogger(__name__)


def get_embedding_service():
    backend = settings.embedding_backend
    if backend == "gemini":
        from services.embeddings.gemini_embeddings import GeminiEmbeddingService

        svc = GeminiEmbeddingService()
        if svc.available and svc.probe():
            return svc
        logger.warning("Gemini embeddings unavailable or probe failed (model=%s) — falling back to hashing embeddings.",
                       settings.GEMINI_EMBEDDING_MODEL)
    return HashingEmbeddingService(dim=settings.EMBEDDING_DIM)


__all__ = ["get_embedding_service", "HashingEmbeddingService"]
