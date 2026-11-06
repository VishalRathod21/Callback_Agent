"""Deterministic local embeddings via feature hashing.

Used when no embedding API key is configured (and in automated tests) so that
the RAG pipeline remains functional offline.  The embedding is a normalised
bag of word unigrams, bigrams and character trigrams hashed into a fixed
dimensional space (the "hashing trick").  It captures lexical overlap, which
is what resume-section retrieval mostly relies on, but it is *not* a semantic
model: paraphrases without shared vocabulary will not match.  Experiments in
EXPERIMENTAL_RESULTS.md report which backend produced each number.
"""

from __future__ import annotations

import hashlib
import math
import re
from typing import Iterable

_TOKEN_RE = re.compile(r"[a-z0-9+#.]+")

_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "at",
    "from", "as", "is", "are", "was", "were", "be", "been", "this", "that", "these",
    "those", "it", "its", "i", "my", "we", "our", "you", "your", "using", "used",
}


def _tokens(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS and len(t) > 1]


def _features(text: str) -> Iterable[str]:
    toks = _tokens(text)
    for t in toks:
        yield "w:" + t
        # character trigrams give robustness to inflections (optimize/optimized)
        padded = f"#{t}#"
        for i in range(len(padded) - 2):
            yield "c:" + padded[i:i + 3]
    for a, b in zip(toks, toks[1:]):
        yield "b:" + a + "_" + b


class HashingEmbeddingService:
    """Offline embedding service compatible with GeminiEmbeddingService."""

    name = "hashing"

    def __init__(self, dim: int = 768) -> None:
        self.dim = dim
        self.api_key = "local"  # keeps duck-typed `if service.api_key` checks happy

    def _embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        if not text or not text.strip():
            return vec
        counts: dict[str, int] = {}
        for f in _features(text):
            counts[f] = counts.get(f, 0) + 1
        for feat, count in counts.items():
            h = hashlib.blake2b(feat.encode("utf-8"), digest_size=8).digest()
            idx = int.from_bytes(h[:4], "little") % self.dim
            sign = 1.0 if h[4] & 1 else -1.0
            # sub-linear term frequency
            vec[idx] += sign * (1.0 + math.log(count))
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec

    async def embed(self, text: str) -> list[float]:
        return self._embed_one(text)

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]
