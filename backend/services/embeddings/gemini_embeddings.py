import os
import asyncio
import logging
from google import genai
from core.config import settings

logger = logging.getLogger(__name__)

class GeminiEmbeddingService:
    def __init__(self):
        # Read API key from environment variable GEMINI_API_KEY
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if not self.api_key:
            self.api_key = getattr(settings, "GEMINI_API_KEY", "")
        
        if not self.api_key:
            logger.warning("GEMINI_API_KEY is not set.")
            
        # Initialize Google GenAI client
        if self.api_key:
            self.client = genai.Client(api_key=self.api_key)
        else:
            self.client = genai.Client()

    async def embed(self, text: str) -> list[float]:
        """
        Generate embedding for a single text string using Gemini Embedding API.
        """
        if not text or not text.strip():
            return []

        if not self.api_key:
            logger.error("GEMINI_API_KEY is not configured.")
            return []

        def _embed():
            response = self.client.models.embed_content(
                model="text-embedding-004",
                contents=text.strip()
            )
            if response.embeddings:
                return response.embeddings[0].values
            return []

        try:
            return await asyncio.to_thread(_embed)
        except Exception as e:
            logger.error(f"Gemini embedding error: {e}")
            return []

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings for a list of text strings in batch.
        """
        if not texts:
            return []

        if not self.api_key:
            logger.error("GEMINI_API_KEY is not configured.")
            return [[] for _ in texts]

        cleaned_texts = [t.strip() for t in texts]

        def _embed_batch():
            response = self.client.models.embed_content(
                model="text-embedding-004",
                contents=cleaned_texts
            )
            if response.embeddings:
                return [emb.values for emb in response.embeddings]
            return [[] for _ in cleaned_texts]

        try:
            return await asyncio.to_thread(_embed_batch)
        except Exception as e:
            logger.error(f"Gemini batch embedding error: {e}")
            # Fallback to empty embeddings
            return [[] for _ in cleaned_texts]
