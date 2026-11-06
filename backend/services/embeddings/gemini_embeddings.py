"""Gemini embedding service (text-embedding-004, 768 dimensions)."""

import os
import asyncio
import logging

from core.config import settings

logger = logging.getLogger(__name__)


class GeminiEmbeddingService:
    name = "gemini"
    MODEL = settings.GEMINI_EMBEDDING_MODEL
    DIM = settings.EMBEDDING_DIM

    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY") or getattr(settings, "GEMINI_API_KEY", "")
        self.client = None
        if not self.api_key:
            logger.warning("GEMINI_API_KEY is not set; Gemini embeddings unavailable.")
            return
        try:
            from google import genai
            self.client = genai.Client(api_key=self.api_key)
        except Exception as exc:  # pragma: no cover - import/runtime environment issue
            logger.error("Failed to initialise Gemini client: %s", exc)
            self.client = None

    def _ensure_client(self) -> None:
        if self.client is None and self.api_key:
            try:
                from google import genai
                self.client = genai.Client(api_key=self.api_key)
            except Exception as exc:  # pragma: no cover
                logger.error("Failed to initialise Gemini client: %s", exc)

    def _config(self):
        from google.genai import types
        return types.EmbedContentConfig(output_dimensionality=self.DIM)

    def probe(self) -> bool:
        """One real call at startup so a wrong model name degrades to the local backend instead of failing uploads."""
        if not self.available:
            return False
        try:
            resp = self.client.models.embed_content(model=self.MODEL, contents="probe", config=self._config())
            return bool(resp.embeddings) and len(resp.embeddings[0].values) == self.DIM
        except Exception as exc:  # noqa: BLE001
            logger.error("Gemini embedding probe failed (model=%s): %s", self.MODEL, exc)
            return False

    @property
    def available(self) -> bool:
        self._ensure_client()
        return bool(self.api_key and self.client)

    async def embed(self, text: str) -> list[float]:
        """Generate an embedding for a single string. Raises on API failure."""
        if not text or not text.strip():
            return []
        if not self.available:
            raise RuntimeError("Gemini embeddings are not configured.")

        def _embed():
            response = self.client.models.embed_content(model=self.MODEL, contents=text.strip(), config=self._config())
            if response.embeddings:
                return list(response.embeddings[0].values)
            return []

        return await asyncio.to_thread(_embed)

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of strings. Raises on API failure."""
        if not texts:
            return []
        if not self.available:
            raise RuntimeError("Gemini embeddings are not configured.")
        cleaned = [t.strip() for t in texts]

        def _embed_batch():
            response = self.client.models.embed_content(model=self.MODEL, contents=cleaned, config=self._config())
            if response.embeddings:
                return [list(e.values) for e in response.embeddings]
            return [[] for _ in cleaned]

        return await asyncio.to_thread(_embed_batch)
