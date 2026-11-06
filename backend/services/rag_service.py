"""Retrieval-Augmented Generation service for resume context.

Responsibilities
* Index a candidate's resume as section-aware chunks (``index_resume``).
* Retrieve the most relevant chunks for a query, restricted to that candidate
  (``retrieve``), returning source references usable in prompts and in the UI.
* Build a compact prompt block with citations (``build_context_block``).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from core.config import settings
from services.resume_chunker import chunk_resume

logger = logging.getLogger(__name__)

RESUME_COLLECTION = "resumes"          # one full-text document per candidate (legacy + fallback)
CHUNK_COLLECTION = "resume_chunks"     # section-aware chunks used for retrieval


@dataclass
class RetrievedChunk:
    chunk_id: str
    section: str
    chunk_index: int
    score: float
    text: str

    def source_ref(self) -> dict:
        preview = self.text.split("\n", 1)[-1].strip().replace("\n", " ")
        return {
            "chunk_id": self.chunk_id,
            "section": self.section,
            "chunk_index": self.chunk_index,
            "score": self.score,
            "preview": preview[:160] + ("…" if len(preview) > 160 else ""),
        }


class RAGService:
    def __init__(self, faiss_service):
        self.faiss = faiss_service

    @property
    def backend(self) -> str:
        return getattr(self.faiss, "backend_name", "unknown")

    # ── Indexing ───────────────────────────────────────────────────────────
    async def index_resume(self, candidate_id: str, resume_text: str, metadata: dict | None = None) -> int:
        """(Re)index a resume. Returns the number of chunks stored."""
        cid = str(candidate_id)
        # Full document (used for restoring resume text and as coarse fallback)
        await self.faiss.add(
            RESUME_COLLECTION, cid, resume_text,
            metadata={**(metadata or {}), "candidate_id": cid, "doc_type": "resume_full"},
        )
        # Replace previous chunk set for this candidate
        await self.faiss.delete_where(CHUNK_COLLECTION, {"candidate_id": cid})
        chunks = chunk_resume(cid, resume_text)
        if chunks:
            await self.faiss.add_many(CHUNK_COLLECTION, [c.to_document() for c in chunks])
        logger.info("Indexed resume for candidate %s: %d chunks (backend=%s)", cid, len(chunks), self.backend)
        return len(chunks)

    async def delete_candidate(self, candidate_id: str) -> None:
        cid = str(candidate_id)
        await self.faiss.delete(RESUME_COLLECTION, cid)
        await self.faiss.delete_where(CHUNK_COLLECTION, {"candidate_id": cid})

    async def get_resume_text(self, candidate_id: str) -> str:
        rec = await self.faiss.get(RESUME_COLLECTION, str(candidate_id))
        return rec["text"] if rec else ""

    async def list_chunks(self, candidate_id: str) -> list[dict]:
        recs = await self.faiss.list_where(CHUNK_COLLECTION, {"candidate_id": str(candidate_id)})
        recs.sort(key=lambda r: r["metadata"].get("chunk_index", 0))
        return [
            {"chunk_id": r["id"], "section": r["metadata"].get("section"),
             "chunk_index": r["metadata"].get("chunk_index"), "text": r["text"]}
            for r in recs
        ]

    # ── Retrieval ──────────────────────────────────────────────────────────
    async def retrieve(
        self,
        candidate_id: str,
        query: str,
        k: int | None = None,
        sections: list[str] | None = None,
    ) -> list[RetrievedChunk]:
        """Top-k chunks for this candidate. Optionally restrict to sections."""
        k = k or settings.RAG_TOP_K
        cid = str(candidate_id)
        hits = await self.faiss.search(
            CHUNK_COLLECTION, query, n_results=k * (2 if sections else 1),
            filter_metadata={"candidate_id": cid},
        )
        results = []
        for h in hits:
            sec = h["metadata"].get("section", "other")
            if sections and sec not in sections:
                continue
            results.append(RetrievedChunk(
                chunk_id=h["id"], section=sec,
                chunk_index=h["metadata"].get("chunk_index", 0),
                score=h["score"], text=h["text"],
            ))
            if len(results) >= k:
                break
        return results

    @staticmethod
    def build_context_block(chunks: list[RetrievedChunk], max_chars: int = 2400) -> str:
        """Format retrieved chunks with citation tags for a prompt."""
        if not chunks:
            return "No resume context retrieved."
        lines = []
        used = 0
        for c in chunks:
            body = c.text.strip()
            if used + len(body) > max_chars:
                body = body[: max(0, max_chars - used)]
            if not body:
                break
            lines.append(f"[source: {c.section}#{c.chunk_index} | relevance={c.score:.2f}]\n{body}")
            used += len(body)
        return "\n\n".join(lines)

    @staticmethod
    def sources(chunks: list[RetrievedChunk]) -> list[dict]:
        return [c.source_ref() for c in chunks]
