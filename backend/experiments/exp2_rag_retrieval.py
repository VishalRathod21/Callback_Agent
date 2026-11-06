"""Experiment 2 — Retrieval quality of the resume RAG pipeline.

Metrics: Precision@K and Recall@K (K = 1, 2, 3) over labelled (query → relevant
section) pairs, per-candidate isolation (leakage rate), and retrieval latency.
Also compares section-aware chunking against a naive fixed-size chunker and
reports which embedding backend produced the numbers.
"""

from __future__ import annotations

import asyncio
import shutil
import statistics
import tempfile
import time

from common import RESUMES, RETRIEVAL_QUERIES, save


async def _build(chunker: str):
    from services.faiss_service import FAISSService
    from services.rag_service import RAGService
    from services.resume_chunker import chunk_resume

    tmp = tempfile.mkdtemp()
    faiss = FAISSService(persist_dir=tmp)
    rag = RAGService(faiss)
    for cid, text in RESUMES.items():
        if chunker == "section":
            await rag.index_resume(cid, text)
        else:
            # naive: fixed 300-char windows, section label unknown → assign by offset lookup
            await faiss.add("resumes", cid, text, {"candidate_id": cid})
            sections = chunk_resume(cid, text)  # for ground-truth labelling of offsets
            docs = []
            for i in range(0, len(text), 300):
                window = text[i:i + 300]
                # label the window with the section that owns most of its span
                label = "other"
                for s in sections:
                    if s.char_start <= i < s.char_end:
                        label = s.section
                        break
                docs.append({"id": f"{cid}:naive:{i}", "text": window,
                             "metadata": {"candidate_id": cid, "section": label, "chunk_index": i // 300}})
            await faiss.add_many("resume_chunks", docs)
    return rag, tmp


async def run():
    results = {}
    for chunker in ("section", "naive"):
        rag, tmp = await _build(chunker)
        per_k = {k: {"precision": [], "recall": []} for k in (1, 2, 3)}
        latencies, leakage = [], 0
        for cid, query, relevant in RETRIEVAL_QUERIES:
            t0 = time.perf_counter()
            hits = await rag.retrieve(cid, query, k=3)
            latencies.append((time.perf_counter() - t0) * 1000)
            leakage += sum(1 for h in hits if not h.chunk_id.startswith(f"{cid}:"))
            for k in (1, 2, 3):
                top = hits[:k]
                rel_hits = [h for h in top if h.section in relevant]
                per_k[k]["precision"].append(len(rel_hits) / k)
                found_sections = {h.section for h in top} & relevant
                per_k[k]["recall"].append(len(found_sections) / len(relevant))
        results[chunker] = {
            **{f"precision@{k}": round(statistics.mean(v["precision"]), 3) for k, v in per_k.items()},
            **{f"recall@{k}": round(statistics.mean(v["recall"]), 3) for k, v in per_k.items()},
            "queries": len(RETRIEVAL_QUERIES),
            "cross_candidate_leakage": leakage,
            "latency_ms_mean": round(statistics.mean(latencies), 2),
            "latency_ms_p95": round(sorted(latencies)[int(0.95 * (len(latencies) - 1))], 2),
            "chunks_total": await rag.faiss.count("resume_chunks"),
        }
        shutil.rmtree(tmp, ignore_errors=True)
    results["notes"] = (
        "Relevance labels are section-level (a hit is relevant if its chunk belongs to a labelled section). "
        "Numbers reflect the embedding backend recorded in `environment`."
    )
    save("exp2_rag_retrieval", results)
    for name in ("section", "naive"):
        print(name, {k: v for k, v in results[name].items() if k.startswith(("precision", "recall", "latency"))})


if __name__ == "__main__":
    asyncio.run(run())
