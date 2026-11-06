"""Experiment 1 — Generic vs resume-based question generation (and RAG vs no-RAG context).

For each synthetic candidate we generate a technical round plan in three
conditions and measure *question relevance* as the lexical overlap between the
question and the candidate's own resume (resume-term hit rate), plus whether
the question names an entity from the candidate's projects/experience.

Conditions
    generic   : no resume structure, no retrieval (role only)
    structured: structured resume profile, no retrieval
    rag       : structured profile + FAISS retrieval with citations

With no LLM key the generator uses the question bank; the bank path still
personalises project questions from the structured profile, so the comparison
is meaningful but weaker than with a live model (recorded in `environment`).
"""

from __future__ import annotations

import asyncio
import shutil
import statistics
import tempfile

from common import RESUMES, RESUME_STRUCTURED, TARGET_ROLES, save, tokens


def entities(structured: dict) -> set[str]:
    ents = set()
    for p in structured.get("projects", []):
        ents |= tokens(p.get("name", ""))
    for e in structured.get("experience", []):
        ents |= tokens(e.get("company", "")) | tokens(e.get("role", ""))
    return ents


async def run(questions_per_candidate: int = 5):
    from services.faiss_service import FAISSService
    from services.rag_service import RAGService
    from agents.question_generator import QuestionGenerator, plan_categories

    tmp = tempfile.mkdtemp()
    rag = RAGService(FAISSService(persist_dir=tmp))
    for cid, text in RESUMES.items():
        await rag.index_resume(cid, text)

    conditions = {"generic": {}, "structured": {}, "rag": {}}
    detail = []
    for cid, resume in RESUMES.items():
        resume_terms = tokens(resume)
        ents = entities(RESUME_STRUCTURED[cid])
        role = TARGET_ROLES[cid]
        for cond in conditions:
            gen = QuestionGenerator(rag_service=rag if cond == "rag" else None)
            structured = RESUME_STRUCTURED[cid] if cond != "generic" else {}
            plan = plan_categories(role, structured, "technical", questions_per_candidate)
            asked: list[str] = []
            overlaps, ent_hits, cited = [], 0, 0
            for i, cat in enumerate(plan):
                out = await gen.generate(
                    round_name="technical", target_role=role, candidate_id=cid if cond == "rag" else None,
                    resume_structured=structured, difficulty="medium", category=cat, question_number=i + 1,
                    total_questions=questions_per_candidate, asked_questions=asked, use_rag=(cond == "rag"),
                )
                asked.append(out["question"])
                q_terms = tokens(out["question"])
                overlap = len(q_terms & resume_terms) / max(1, len(q_terms))
                overlaps.append(overlap)
                ent_hits += int(bool(q_terms & ents))
                cited += int(bool(out.get("retrieval_sources")))
                detail.append({"candidate": cid, "condition": cond, "category": cat, "question": out["question"],
                               "resume_term_overlap": round(overlap, 3), "names_resume_entity": bool(q_terms & ents),
                               "generation_source": out["generation_source"], "sources": len(out.get("retrieval_sources", []))})
            conditions[cond].setdefault("overlap", []).append(statistics.mean(overlaps))
            conditions[cond].setdefault("entity_rate", []).append(ent_hits / questions_per_candidate)
            conditions[cond].setdefault("cited_rate", []).append(cited / questions_per_candidate)

    summary = {
        cond: {
            "mean_resume_term_overlap": round(statistics.mean(v["overlap"]), 3),
            "mean_entity_mention_rate": round(statistics.mean(v["entity_rate"]), 3),
            "mean_citation_rate": round(statistics.mean(v["cited_rate"]), 3),
        }
        for cond, v in conditions.items()
    }
    shutil.rmtree(tmp, ignore_errors=True)
    save("exp1_generic_vs_resume", {"summary": summary, "questions_per_candidate": questions_per_candidate,
                                    "candidates": len(RESUMES), "detail": detail,
                                    "metric_definitions": {
                                        "resume_term_overlap": "share of question tokens that occur in the candidate's resume",
                                        "entity_mention_rate": "share of questions naming a project/company/role from the resume",
                                        "citation_rate": "share of questions with at least one retrieved resume chunk attached",
                                    }})
    for cond, v in summary.items():
        print(cond, v)


if __name__ == "__main__":
    asyncio.run(run())
