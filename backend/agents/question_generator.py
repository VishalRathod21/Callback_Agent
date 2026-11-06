"""Resume-aware, role-aware, RAG-based question generation.

Inputs: candidate resume (structured + retrieved chunks), target role, optional
job description, difficulty, round, category plan, conversation so far.

Output: one question with metadata:
    {question, category, difficulty, is_follow_up, rationale,
     retrieval_sources: [...], generation_source: "llm" | "bank"}

When the LLM is unavailable the generator falls back to a curated question
bank (clearly labelled ``generation_source="bank"``) so the interview can still
proceed and be evaluated heuristically.
"""

from __future__ import annotations

import logging
import random
import re
import time
import difflib

from services.llm_service import llm_service as global_llm_service, LLMUnavailableError
from agents.difficulty_policy import LEVEL_GUIDANCE, normalize_level

logger = logging.getLogger(__name__)

# ── Categories ─────────────────────────────────────────────────────────────────

CATEGORIES: dict[str, dict] = {
    "python": {"label": "Python", "keywords": ["python", "django", "flask", "fastapi", "pandas", "numpy"]},
    "dsa": {"label": "Data Structures & Algorithms", "keywords": ["algorithm", "data structure", "leetcode", "complexity"]},
    "sql_dbms": {"label": "SQL & DBMS", "keywords": ["sql", "postgres", "mysql", "database", "dbms", "index", "query"]},
    "machine_learning": {"label": "Machine Learning", "keywords": ["machine learning", "scikit", "regression", "classification", "xgboost", "model"]},
    "deep_learning": {"label": "Deep Learning", "keywords": ["deep learning", "pytorch", "tensorflow", "cnn", "rnn", "neural"]},
    "nlp": {"label": "NLP", "keywords": ["nlp", "text", "tokeniz", "bert", "transformer", "sentiment", "spacy"]},
    "generative_ai": {"label": "Generative AI", "keywords": ["llm", "gpt", "gemini", "prompt", "generative", "fine-tun", "groq"]},
    "langchain_langgraph": {"label": "LangChain & LangGraph", "keywords": ["langchain", "langgraph", "agent", "orchestrat"]},
    "rag": {"label": "RAG", "keywords": ["rag", "retrieval", "embedding", "faiss", "vector", "chroma", "pinecone"]},
    "system_design": {"label": "System Design", "keywords": ["microservice", "scalab", "kafka", "redis", "architecture", "distributed", "docker", "kubernetes", "aws"]},
    "resume_projects": {"label": "Resume Projects", "keywords": []},
    "hr_behavioral": {"label": "HR & Behavioral", "keywords": []},
}

ROUND_CATEGORIES: dict[str, list[str]] = {
    "technical": ["resume_projects", "python", "sql_dbms", "machine_learning", "deep_learning", "nlp",
                  "generative_ai", "langchain_langgraph", "rag", "system_design"],
    "dsa": ["dsa"],
    "hr": ["hr_behavioral"],
}

ROLE_PRIORITIES: dict[str, list[str]] = {
    "ml": ["machine_learning", "deep_learning", "python", "sql_dbms", "nlp", "resume_projects"],
    "data scien": ["machine_learning", "sql_dbms", "python", "deep_learning", "resume_projects"],
    "nlp": ["nlp", "deep_learning", "generative_ai", "rag", "resume_projects"],
    "ai": ["generative_ai", "langchain_langgraph", "rag", "machine_learning", "resume_projects"],
    "gen": ["generative_ai", "rag", "langchain_langgraph", "nlp", "resume_projects"],
    "backend": ["python", "sql_dbms", "system_design", "resume_projects"],
    "software": ["resume_projects", "python", "sql_dbms", "system_design"],
    "data engineer": ["sql_dbms", "python", "system_design", "resume_projects"],
    "full": ["resume_projects", "python", "sql_dbms", "system_design"],
    "devops": ["system_design", "python", "resume_projects"],
}

# ── Fallback question bank (used only when the LLM is unavailable) ─────────────

QUESTION_BANK: dict[str, dict[str, list[str]]] = {
    "python": {
        "easy": ["What is the difference between a list and a tuple in Python, and when would you use each?",
                 "Explain what a Python dictionary is and how lookups work."],
        "medium": ["How does Python's garbage collection handle reference cycles?",
                   "Explain the difference between `@staticmethod`, `@classmethod` and instance methods with an example."],
        "hard": ["How does the GIL affect multi-threaded Python programs, and how would you achieve CPU parallelism?",
                 "Explain how asyncio's event loop schedules coroutines and what blocks it."],
    },
    "dsa": {
        "easy": ["Explain the difference between a stack and a queue with a real-world use case for each.",
                 "What is Big-O notation and what is the complexity of binary search?"],
        "medium": ["How would you detect a cycle in a linked list in O(1) extra space?",
                   "Compare BFS and DFS: when does each one fit better?"],
        "hard": ["Explain how you would design an LRU cache with O(1) get and put.",
                 "How does dynamic programming differ from divide-and-conquer? Give a problem where memoisation changes the complexity class."],
    },
    "sql_dbms": {
        "easy": ["What is the difference between INNER JOIN and LEFT JOIN?",
                 "What is a primary key and why does a table need one?"],
        "medium": ["How does a B-tree index speed up queries, and when can an index hurt performance?",
                   "Explain database normalisation up to 3NF with an example."],
        "hard": ["Explain transaction isolation levels and the anomalies each one prevents.",
                 "How would you diagnose and fix a slow query in PostgreSQL using EXPLAIN ANALYZE?"],
    },
    "machine_learning": {
        "easy": ["What is overfitting and how can you detect it?",
                 "Explain the difference between supervised and unsupervised learning."],
        "medium": ["Explain the bias-variance trade-off and how regularisation affects it.",
                   "When would you prefer precision over recall? Give a concrete example."],
        "hard": ["How does gradient boosting differ from random forests, and why does boosting overfit more easily?",
                 "How would you handle data leakage in a time-series forecasting pipeline?"],
    },
    "deep_learning": {
        "easy": ["What does an activation function do in a neural network?",
                 "What is a convolution in a CNN?"],
        "medium": ["Explain backpropagation and why vanishing gradients happen.",
                   "What is batch normalisation and what problem does it solve?"],
        "hard": ["Explain self-attention in a transformer block, including why we scale by sqrt(d_k).",
                 "How would you train a model that does not fit in GPU memory?"],
    },
    "nlp": {
        "easy": ["What is tokenisation and why does it matter for language models?",
                 "What is the difference between stemming and lemmatisation?"],
        "medium": ["How do word embeddings like Word2Vec capture meaning?",
                   "Explain how you would evaluate a text classification model on an imbalanced dataset."],
        "hard": ["Compare BERT-style encoders with GPT-style decoders for a document retrieval task.",
                 "How would you reduce hallucinations in a summarisation system?"],
    },
    "generative_ai": {
        "easy": ["What is a large language model and what does 'temperature' control?",
                 "What is prompt engineering?"],
        "medium": ["Compare fine-tuning and retrieval-augmented generation for adding domain knowledge.",
                   "How would you evaluate the output quality of an LLM application?"],
        "hard": ["How would you design guardrails and evaluation for an LLM agent that takes actions?",
                 "Explain how you would reduce latency and cost in a production LLM pipeline."],
    },
    "langchain_langgraph": {
        "easy": ["What problem does LangChain solve compared with calling an LLM API directly?",
                 "What is an agent in the LangChain sense?"],
        "medium": ["Explain how LangGraph models an agent workflow as a state graph with conditional edges.",
                   "How would you share state between multiple agents in LangGraph?"],
        "hard": ["How would you add checkpointing and human-in-the-loop interrupts to a LangGraph workflow?",
                 "Discuss failure handling and retries in a multi-agent LangGraph pipeline."],
    },
    "rag": {
        "easy": ["What is retrieval-augmented generation and why is it used?",
                 "What is a vector embedding?"],
        "medium": ["How do chunk size and overlap affect retrieval quality in a RAG system?",
                   "Compare FAISS flat indexes with approximate indexes such as HNSW."],
        "hard": ["How would you measure Precision@K and Recall@K for your retriever, and what would you do if recall is low?",
                 "Explain hybrid retrieval (BM25 + dense) and re-ranking; when is it worth the cost?"],
    },
    "system_design": {
        "easy": ["What is the difference between vertical and horizontal scaling?",
                 "What is a REST API?"],
        "medium": ["How would you design a rate limiter for an API?",
                   "Explain caching strategies and cache invalidation trade-offs."],
        "hard": ["Design a real-time voice interview pipeline: streaming audio, speech-to-text, LLM, text-to-speech. Where are the latency bottlenecks?",
                 "How would you make a WebSocket-based service resilient to reconnections and duplicate events?"],
    },
    "resume_projects": {
        "easy": ["Walk me through one project on your resume: what problem did it solve and what was your role?"],
        "medium": ["Pick a project from your resume: what was the hardest technical decision and why did you make it?"],
        "hard": ["Take one system you built: how would you scale it to 100x the load and what would break first?"],
    },
    "hr_behavioral": {
        "easy": ["Tell me about a time you worked in a team to deliver something. What was your contribution?",
                 "Why are you interested in this role?"],
        "medium": ["Describe a conflict you had with a teammate or stakeholder. How did you resolve it?",
                   "Tell me about a time you missed a deadline or failed. What did you learn?"],
        "hard": ["Describe a situation where you had to make a decision with incomplete information and significant consequences.",
                 "Tell me about a time you had to influence people without authority."],
    },
}

_GEN_SYSTEM = """\
You are an expert interviewer. You generate exactly ONE interview question at a time.
Rules:
- Ground the question in the RETRIEVED RESUME CONTEXT when it is relevant; reference concrete project names,
  technologies or responsibilities that actually appear there. Never invent experience the candidate does not have.
- Match the requested difficulty and category.
- Never repeat or paraphrase a previously asked question.
- Ask one focused question (max 2 sentences). No preamble, no answer hints, no multiple parts.
- Return ONLY JSON.
"""

_GEN_PROMPT = """\
ROUND: {round_name}
TARGET ROLE: {target_role}
{jd_block}
DIFFICULTY: {difficulty} ({difficulty_guidance})
CATEGORY TO TEST: {category_label}
QUESTION NUMBER: {question_number} of {total_questions}

RETRIEVED RESUME CONTEXT:
{context_block}

CANDIDATE PROFILE SUMMARY:
{profile_block}

PREVIOUSLY ASKED (do not repeat):
{asked_block}

{followup_block}

Return JSON:
{{
  "question": "<the question>",
  "category": "{category}",
  "is_follow_up": true|false,
  "rationale": "<one sentence: why this question for this candidate now>",
  "grounded_in": ["<source tag you used, e.g. projects#3>", ...]
}}
"""


def _norm(s: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9\s]", "", (s or "").lower()).split())


def is_similar(a: str, b: str, threshold: float = 0.8) -> bool:
    return difflib.SequenceMatcher(None, _norm(a), _norm(b)).ratio() >= threshold


def infer_categories(target_role: str, resume_structured: dict | None, round_name: str) -> list[str]:
    """Order the categories for a round using role priorities and resume skills."""
    base = list(ROUND_CATEGORIES.get(round_name, ["resume_projects"]))
    if round_name != "technical":
        return base
    role = (target_role or "").lower()
    prio: list[str] = []
    for key, cats in ROLE_PRIORITIES.items():
        if key in role:
            prio = cats
            break
    skills_text = " ".join((resume_structured or {}).get("skills", []) or []).lower()
    projects_text = " ".join(
        f"{p.get('name','')} {p.get('description','')} {' '.join(p.get('tech', []) or [])}"
        for p in (resume_structured or {}).get("projects", []) or []
    ).lower()
    haystack = skills_text + " " + projects_text
    scored = []
    for cat in base:
        score = 0
        if cat in prio:
            score += (len(prio) - prio.index(cat)) * 2
        score += sum(1 for kw in CATEGORIES[cat]["keywords"] if kw in haystack)
        if cat == "resume_projects" and (resume_structured or {}).get("projects"):
            score += 3
        scored.append((score, cat))
    scored.sort(key=lambda x: -x[0])
    ordered = [c for s, c in scored if s > 0] or [c for _, c in scored]
    # Always start with the candidate's own work when available
    if "resume_projects" in ordered:
        ordered.remove("resume_projects")
        ordered.insert(0, "resume_projects")
    return ordered


def plan_categories(target_role: str, resume_structured: dict | None, round_name: str, total: int) -> list[str]:
    """Build a category plan of length ``total`` cycling through the ordered categories."""
    ordered = infer_categories(target_role, resume_structured, round_name)
    if not ordered:
        ordered = ["resume_projects"]
    plan = []
    i = 0
    while len(plan) < total:
        plan.append(ordered[i % len(ordered)])
        i += 1
    return plan


def profile_block(resume_structured: dict | None) -> str:
    rs = resume_structured or {}
    lines = []
    if rs.get("summary"):
        lines.append(f"Summary: {rs['summary']}")
    if rs.get("skills"):
        lines.append("Skills: " + ", ".join(rs["skills"][:20]))
    for p in (rs.get("projects") or [])[:4]:
        tech = ", ".join(p.get("tech", []) or [])
        lines.append(f"Project: {p.get('name','')} — {p.get('description','')}" + (f" [{tech}]" if tech else ""))
    for e in (rs.get("experience") or [])[:3]:
        lines.append(f"Experience: {e.get('role','')} at {e.get('company','')} ({e.get('duration','')})")
    for ed in (rs.get("education") or [])[:2]:
        lines.append(f"Education: {ed.get('degree','')} — {ed.get('institution','')} ({ed.get('year','')})")
    return "\n".join(lines) if lines else "No structured profile available."


class QuestionGenerator:
    def __init__(self, llm_service=None, rag_service=None) -> None:
        self.llm_service = llm_service or global_llm_service
        self.rag = rag_service

    def _retrieval_query(self, category: str, target_role: str, resume_structured: dict | None,
                         last_answer: str | None) -> str:
        label = CATEGORIES.get(category, {}).get("label", category)
        kws = " ".join(CATEGORIES.get(category, {}).get("keywords", [])[:5])
        parts = [label, kws, target_role or ""]
        if category == "resume_projects":
            names = [p.get("name", "") for p in (resume_structured or {}).get("projects", []) or []]
            parts.append(" ".join(names[:4]))
        if category == "hr_behavioral":
            parts.append("experience responsibilities team internship role company")
        if last_answer:
            parts.append(last_answer[:300])
        return " ".join(p for p in parts if p).strip()

    async def generate(
        self,
        *,
        round_name: str,
        target_role: str,
        candidate_id: str | None,
        resume_structured: dict | None,
        difficulty: str,
        category: str,
        question_number: int,
        total_questions: int,
        asked_questions: list[str],
        last_question: str | None = None,
        last_answer: str | None = None,
        last_evaluation: dict | None = None,
        job_description: str | None = None,
        persona: dict | None = None,
        use_rag: bool = True,
    ) -> dict:
        """Generate the next question. Never raises; falls back to the bank."""
        started = time.monotonic()
        difficulty = normalize_level(difficulty)
        retrieved = []
        if use_rag and self.rag is not None and candidate_id:
            try:
                query = self._retrieval_query(category, target_role, resume_structured, last_answer)
                sections = None
                if category == "resume_projects":
                    sections = ["projects", "experience"]
                elif category == "hr_behavioral":
                    sections = ["experience", "projects", "summary", "header"]
                retrieved = await self.rag.retrieve(candidate_id, query, sections=sections)
                if not retrieved and sections:
                    retrieved = await self.rag.retrieve(candidate_id, query)
            except Exception as exc:  # noqa: BLE001
                logger.warning("RAG retrieval failed: %s", exc)
                retrieved = []

        context_block = self.rag.build_context_block(retrieved) if (self.rag and retrieved) else "No resume context retrieved."
        sources = self.rag.sources(retrieved) if (self.rag and retrieved) else []

        followup_block = ""
        if last_question and last_answer:
            gaps = ", ".join((last_evaluation or {}).get("gaps", [])[:3]) if last_evaluation else ""
            followup_block = (
                "LAST EXCHANGE:\n"
                f"Interviewer: {last_question}\n"
                f"Candidate: {last_answer[:800]}\n"
                + (f"Evaluator noted gaps: {gaps}\n" if gaps else "")
                + "Decide: if the answer left an important gap or a claim worth probing, ask ONE follow-up "
                  "(is_follow_up=true); otherwise move to the planned category (is_follow_up=false)."
            )

        persona_line = ""
        if persona:
            persona_line = f"\nINTERVIEWER PERSONA: {persona.get('name')} — {persona.get('description')}"

        prompt = _GEN_PROMPT.format(
            round_name=round_name, target_role=target_role,
            jd_block=(f"JOB DESCRIPTION (excerpt):\n{job_description[:1500]}" if job_description else ""),
            difficulty=difficulty, difficulty_guidance=LEVEL_GUIDANCE[difficulty],
            category=category, category_label=CATEGORIES.get(category, {}).get("label", category),
            question_number=question_number, total_questions=total_questions,
            context_block=context_block, profile_block=profile_block(resume_structured),
            asked_block="\n".join(f"- {q}" for q in asked_questions[-12:]) or "- none",
            followup_block=followup_block,
        ) + persona_line

        generation_source = "llm"
        question, is_follow_up, rationale, grounded = None, False, "", []
        try:
            for attempt in range(2):
                raw = await self.llm_service.generate_json(prompt, system_instruction=_GEN_SYSTEM, temperature=0.8)
                candidate_q = str(raw.get("question") or "").strip()
                if not candidate_q:
                    continue
                if any(is_similar(candidate_q, q) for q in asked_questions):
                    logger.info("Generated question too similar to an earlier one; regenerating (attempt %d)", attempt + 1)
                    prompt += f"\n[The question '{candidate_q}' was already asked. Produce a different one.]"
                    continue
                question = candidate_q
                is_follow_up = bool(raw.get("is_follow_up", False))
                rationale = str(raw.get("rationale") or "")[:300]
                grounded = [str(g) for g in (raw.get("grounded_in") or [])][:5]
                break
        except LLMUnavailableError:
            generation_source = "bank"
        except Exception as exc:  # noqa: BLE001
            logger.warning("Question generation LLM call failed: %s", exc)
            generation_source = "bank"

        if not question:
            generation_source = "bank"
            question = self._bank_question(category, difficulty, asked_questions, resume_structured)
            rationale = "Fallback question bank (LLM unavailable)."

        return {
            "question": question,
            "category": category,
            "difficulty": difficulty,
            "is_follow_up": is_follow_up,
            "rationale": rationale,
            "grounded_in": grounded,
            "retrieval_sources": sources,
            "generation_source": generation_source,
            "generation_latency_ms": int((time.monotonic() - started) * 1000),
        }

    @staticmethod
    def _bank_question(category: str, difficulty: str, asked: list[str], resume_structured: dict | None) -> str:
        bank = QUESTION_BANK.get(category) or QUESTION_BANK["resume_projects"]
        candidates = list(bank.get(difficulty, [])) + [q for lvl in bank.values() for q in lvl]
        # personalise the project questions with a real project name when possible
        projects = (resume_structured or {}).get("projects") or []
        if category == "resume_projects" and projects:
            name = random.choice(projects).get("name")
            if name:
                candidates = [q.replace("one project on your resume", f"your project '{name}'")
                               .replace("a project from your resume", f"your project '{name}'")
                               .replace("one system you built", f"'{name}'") for q in candidates]
        for q in candidates:
            if not any(is_similar(q, a) for a in asked):
                return q
        return candidates[0] if candidates else "Tell me about a technical challenge you solved recently."
