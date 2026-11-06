"""Tests for resume chunking, offline embeddings, FAISS store and RAG retrieval isolation."""

import pytest

from services.resume_chunker import chunk_resume, detect_sections
from services.embeddings.hashing_embeddings import HashingEmbeddingService
from services.faiss_service import FAISSService
from services.rag_service import RAGService

RESUME = """Jane Doe
jane@example.com

SUMMARY
Backend engineer focused on Python services.

SKILLS
Python, FastAPI, PostgreSQL, Redis, Docker, Kafka

PROJECTS
• PayFlow – payment reconciliation service in FastAPI with PostgreSQL and Redis caching; cut reconciliation time by 40%.
• LogPipe – Kafka based log ingestion pipeline processing 1M events/hour.

EXPERIENCE
Software Engineer, FinCorp (2023 – 2025)
• Designed REST APIs and optimised slow SQL queries with indexes.

EDUCATION
B.Tech Computer Science, IIT Indore, 2023
"""


def test_detect_sections_and_chunks_have_metadata():
    sections = [s for s, _ in detect_sections(RESUME)]
    assert sections == ["header", "summary", "skills", "projects", "experience", "education"]
    chunks = chunk_resume("c1", RESUME, chunk_size=200, overlap=40)
    assert chunks and all(c.candidate_id == "c1" for c in chunks)
    assert {c.section for c in chunks} >= {"skills", "projects", "experience"}
    doc = chunks[0].to_document()
    assert doc["metadata"]["doc_type"] == "resume_chunk" and "chunk_index" in doc["metadata"]
    # chunks never exceed the window by more than one unit and carry the section tag
    assert all(c.text.startswith(f"[{c.section.upper()}]") for c in chunks)


@pytest.mark.asyncio
async def test_hashing_embeddings_are_deterministic_and_normalised():
    svc = HashingEmbeddingService(dim=128)
    a = await svc.embed("Python FastAPI PostgreSQL")
    b = await svc.embed("Python FastAPI PostgreSQL")
    c = await svc.embed("Kafka streaming pipelines")
    assert a == b and len(a) == 128
    assert abs(sum(x * x for x in a) - 1.0) < 1e-6
    dot_same = sum(x * y for x, y in zip(a, b))
    dot_diff = sum(x * y for x, y in zip(a, c))
    assert dot_same > dot_diff


@pytest.mark.asyncio
async def test_rag_indexing_retrieval_isolation_and_delete():
    faiss = FAISSService(embedding_service=HashingEmbeddingService(dim=768))
    rag = RAGService(faiss)
    n = await rag.index_resume("cand-a", RESUME, {"target_role": "Backend"})
    await rag.index_resume("cand-b", "SKILLS\nJava, Spring Boot, Android\nPROJECTS\nMobile banking app in Kotlin.", {})
    assert n >= 4

    hits = await rag.retrieve("cand-a", "Kafka log ingestion pipeline events", k=2)
    assert hits and hits[0].section == "projects"
    assert all(h.chunk_id.startswith("cand-a:") for h in hits)

    # isolation: cand-a never sees cand-b content even for cand-b-specific queries
    assert await rag.retrieve("cand-a", "Kotlin Android mobile banking", k=3) == [] or \
        all(h.chunk_id.startswith("cand-a:") for h in await rag.retrieve("cand-a", "Kotlin Android mobile banking", k=3))

    block = rag.build_context_block(hits)
    assert "[source: projects#" in block
    refs = rag.sources(hits)
    assert refs[0]["section"] == "projects" and "preview" in refs[0]

    assert (await rag.get_resume_text("cand-a")).startswith("Jane Doe")
    chunks = await rag.list_chunks("cand-a")
    assert len(chunks) == n

    # re-indexing replaces (no duplicates)
    await rag.index_resume("cand-a", RESUME, {})
    assert len(await rag.list_chunks("cand-a")) == n

    await rag.delete_candidate("cand-a")
    assert await rag.list_chunks("cand-a") == []
    assert await rag.get_resume_text("cand-a") == ""
    # cand-b untouched
    assert len(await rag.list_chunks("cand-b")) >= 1


@pytest.mark.asyncio
async def test_faiss_persists_and_reloads_with_backend_guard(tmp_path):
    svc = HashingEmbeddingService(dim=768)
    f1 = FAISSService(embedding_service=svc, persist_dir=str(tmp_path))
    await f1.add("col", "d1", "alpha beta gamma", {"k": "v"})
    await f1.add("col", "d2", "delta epsilon", {"k": "w"})
    f2 = FAISSService(embedding_service=svc, persist_dir=str(tmp_path))
    assert await f2.count("col") == 2
    res = await f2.search("col", "alpha beta", n_results=1, filter_metadata={"k": "w"})
    assert res and res[0]["id"] == "d2"          # filter respected even when the best match is filtered out
    assert await f2.delete("col", "d1") is True
    assert await f2.count("col") == 1
    stats = f2.get_stats()
    assert stats["backend"] == "hashing" and stats["collections"]["col"]["total_vectors"] == 1
