"""Central interview orchestrator.

Owns session state, runs the LangGraph turn graph (``agents.interview_graph``)
and persists every question/answer/evaluation to PostgreSQL/SQLite so sessions
can be restored after a restart.

Public API (all async):

    start_session(candidate, session, config)    → InterviewState
    open_round(session_id)                       → {question, record}
    submit_answer(session_id, answer)            → {evaluation, question|None, round_should_end, closing_message}
    finalize_round(session_id)                   → {round_result, next_round, status, overall_score}
    get_state(session_id, db=None)               → InterviewState (restores from DB when db given)
    cancel_session(session_id)
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import uuid
from datetime import datetime, timezone

from core.config import settings
from agents.difficulty_policy import normalize_level
from agents.evaluation_agent import EvaluationAgent
from agents.interview_graph import InterviewGraph, InterviewState
from agents.question_generator import QuestionGenerator, plan_categories

logger = logging.getLogger(__name__)

PERSONAS = [
    {"name": "Senior Staff Engineer",
     "description": "Direct and rigorous. Focuses on correctness, efficiency and precise reasoning."},
    {"name": "Collaborative Mentor",
     "description": "Encouraging and curious; asks guiding questions to help the candidate reason out loud."},
    {"name": "Deep-Dive Architect",
     "description": "Constantly asks 'why'; explores scalability, trade-offs and alternative designs."},
    {"name": "Fast-Paced Startup Interviewer",
     "description": "Pragmatic and quick; cares about delivery, practical problem-solving and ownership."},
    {"name": "Research-Oriented Interviewer",
     "description": "First-principles thinker; probes fundamentals, complexity and theoretical understanding."},
]

VALID_ROUNDS = ("dsa", "technical", "hr")
VALID_MODES = ("voice", "text")


def normalise_config(raw: dict | None, candidate_target_role: str | None = None) -> dict:
    """Validate/normalise an interview configuration dict."""
    raw = raw or {}
    rounds = [r for r in (raw.get("rounds") or list(VALID_ROUNDS)) if r in VALID_ROUNDS]
    if not rounds:
        rounds = list(VALID_ROUNDS)
    # keep canonical order dsa → technical → hr
    rounds = [r for r in VALID_ROUNDS if r in rounds]
    qpr = int(raw.get("questions_per_round") or settings.DEFAULT_QUESTIONS_PER_ROUND)
    qpr = max(2, min(settings.MAX_QUESTIONS_PER_ROUND, qpr))
    dsa_problems = int(raw.get("dsa_problems") or settings.DEFAULT_DSA_PROBLEMS)
    dsa_problems = max(1, min(4, dsa_problems))
    mode = raw.get("mode") if raw.get("mode") in VALID_MODES else "text"
    duration = int(raw.get("duration_minutes") or 30)
    duration = max(10, min(120, duration))
    return {
        "rounds": rounds,
        "questions_per_round": qpr,
        "dsa_problems": dsa_problems,
        "difficulty": normalize_level(raw.get("difficulty"), "medium"),
        "mode": mode,
        "duration_minutes": duration,
        "adaptive": bool(raw.get("adaptive", True)),
        "use_rag": bool(raw.get("use_rag", True)),
        "job_description": (raw.get("job_description") or "")[:4000],
        "target_role": (raw.get("target_role") or candidate_target_role or "Software Engineer")[:100],
    }


class InterviewOrchestrator:
    """Manages multi-round interview sessions using the LangGraph turn graph."""

    def __init__(self, rag_service=None, llm_service=None, tech_agent=None, hr_agent=None, dsa_agent=None) -> None:
        from services.llm_service import llm_service as global_llm

        self.llm_service = llm_service or global_llm
        self.rag = rag_service
        self.evaluator = EvaluationAgent(self.llm_service)
        self.qgen = QuestionGenerator(self.llm_service, rag_service)
        self.graph_runner = InterviewGraph(self.qgen, self.evaluator, self.llm_service,
                                          tech_agent=tech_agent, hr_agent=hr_agent, dsa_agent=dsa_agent)
        self._sessions: dict[str, InterviewState] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    # Backwards-compatible attribute used by older code/tests
    @property
    def _graph(self):
        return self.graph_runner.graph

    def attach_rag(self, rag_service) -> None:
        self.rag = rag_service
        self.qgen.rag = rag_service

    def lock_for(self, session_id: str) -> asyncio.Lock:
        return self._locks.setdefault(session_id, asyncio.Lock())

    # ── Session lifecycle ──────────────────────────────────────────────────
    async def start_session(
        self,
        candidate_id: str,
        session_id: str,
        rounds_queue: list[str] | None = None,
        target_role: str = "Software Engineer",
        resume_text: str = "",
        config: dict | None = None,
        resume_structured: dict | None = None,
        user_id: str | None = None,
        persona: dict | None = None,
    ) -> InterviewState:
        cfg = normalise_config({**(config or {}), **({"rounds": rounds_queue} if rounds_queue else {})}, target_role)
        if resume_structured is None:
            resume_structured = await self._load_resume_structured(candidate_id)
        persona = persona or random.choice(PERSONAS)
        rounds = list(cfg["rounds"])
        first = rounds.pop(0)

        state: InterviewState = {
            "session_id": session_id,
            "candidate_id": candidate_id,
            "user_id": user_id or "",
            "target_role": cfg["target_role"],
            "job_description": cfg["job_description"],
            "resume_structured": resume_structured or {},
            "persona": persona,
            "config": cfg,
            "rounds_queue": rounds,
            "current_round": first,
            "status": "active",
            "current_difficulty": cfg["difficulty"],
            "category_plan": [],
            "questions": [],
            "conversation_history": [],
            "asked_questions_all": [],
            "round_scores": {},
            "round_results": {},
            "overall_score": 0.0,
            "dsa_problems_total": cfg["dsa_problems"],
            "dsa_problems_completed": 0,
            "dsa_submissions": [],
            "current_dsa_problem": None,
            "dsa_hints_used": 0,
            "phase": "open",
            "candidate_answer": "",
            "next_question": None,
            "last_evaluation": None,
            "round_should_end": False,
            "closing_message": "",
            "last_message": f"Session initialised. First round: {first}.",
            "turn_counter": 0,
            # legacy field kept for callers that still read it
            "resume_text": resume_text,  # type: ignore[typeddict-unknown-key]
        }
        self._sessions[session_id] = state
        logger.info("Session %s started (candidate %s, rounds=%s, difficulty=%s, mode=%s, adaptive=%s)",
                    session_id, candidate_id, cfg["rounds"], cfg["difficulty"], cfg["mode"], cfg["adaptive"])
        return state

    async def _load_resume_structured(self, candidate_id: str) -> dict:
        try:
            from core.database import AsyncSessionLocal
            from core.models import Candidate

            async with AsyncSessionLocal() as db:
                candidate = await db.get(Candidate, uuid.UUID(candidate_id))
                return (candidate.resume_structured or {}) if candidate else {}
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not load resume_structured for %s: %s", candidate_id, exc)
            return {}

    # ── Turns ──────────────────────────────────────────────────────────────
    async def open_round(self, session_id: str) -> dict:
        state = await self.get_state(session_id)
        if state.get("current_round") in (None, "", "complete"):
            raise ValueError("No active round to open.")
        if state.get("questions"):
            # Round already opened (reconnect) — return the pending question.
            pending = state["questions"][-1]
            return {"question": pending.get("spoken_text") or pending["question"], "record": pending, "reopened": True}
        new_state = await self.graph_runner.run(state, phase="open")
        self._sessions[session_id] = new_state
        record = new_state.get("next_question") or {}
        await self._persist_question(new_state, record)
        return {"question": record.get("spoken_text") or record.get("question", ""), "record": record, "reopened": False}

    async def submit_answer(self, session_id: str, answer: str) -> dict:
        state = await self.get_state(session_id)
        if not state.get("questions"):
            raise ValueError("No question is awaiting an answer.")
        answered_before = state["questions"][-1]
        new_state = await self.graph_runner.run(state, phase="answer", candidate_answer=answer)
        self._sessions[session_id] = new_state

        # persist the answered question (it is the one that was last before this turn)
        answered = next((q for q in new_state.get("questions", []) if q.get("index") == answered_before.get("index")), None)
        if answered:
            await self._persist_question(new_state, answered)
        nxt = new_state.get("next_question")
        if nxt and not new_state.get("round_should_end"):
            await self._persist_question(new_state, nxt)
        return {
            "evaluation": new_state.get("last_evaluation"),
            "question": (nxt.get("spoken_text") or nxt.get("question")) if nxt else None,
            "record": nxt,
            "round_should_end": bool(new_state.get("round_should_end")),
            "closing_message": new_state.get("closing_message") or "",
            "current_difficulty": new_state.get("current_difficulty"),
            "progress": self.progress(new_state),
        }

    async def finalize_round(self, session_id: str) -> dict:
        state = await self.get_state(session_id)
        round_name = state.get("current_round")
        new_state = await self.graph_runner.run(state, phase="finalize")
        self._sessions[session_id] = new_state
        result = new_state["round_results"].get(round_name, {})
        return {
            "round": round_name,
            "round_result": result,
            "round_scores": new_state.get("round_scores", {}),
            "next_round": new_state.get("current_round"),
            "status": new_state.get("status"),
            "overall_score": new_state.get("overall_score", 0.0),
        }

    async def submit_round_result(self, state: InterviewState, round_name: str, transcript: str,
                                  score: float | None, evaluation: dict) -> InterviewState:
        """Record an externally evaluated round (DSA coding round) and advance.

        Kept for the REST DSA flow; routes through the same finalize node so
        round transitions have a single implementation.
        """
        session_id = state["session_id"]
        state = {**state, "round_results": {**state.get("round_results", {})},
                 "round_scores": {**state.get("round_scores", {})}}
        if score is not None:
            state["round_scores"][round_name] = float(score)
        state["round_results"][round_name] = {**evaluation, "transcript": transcript, "score": score,
                                              "completed_at": datetime.now(timezone.utc).isoformat()}
        # finalize_round aggregates `questions`; for DSA the result is already aggregated, so clear them
        state["questions"] = []
        state["conversation_history"] = []
        self._sessions[session_id] = state
        new_state = await self.graph_runner.run(state, phase="finalize")
        # finalize recomputed round_results[round_name] from (empty) questions — restore the external result
        new_state["round_results"][round_name] = state["round_results"][round_name]
        if score is not None:
            new_state["round_scores"][round_name] = float(score)
            scored = [v for v in new_state["round_scores"].values() if v is not None]
            if new_state.get("status") == "complete" and scored:
                new_state["overall_score"] = round(sum(scored) / len(scored), 2)
        self._sessions[session_id] = new_state
        return new_state

    async def cancel_session(self, session_id: str) -> None:
        state = self._sessions.get(session_id)
        if state:
            state["status"] = "cancelled"
            state["current_round"] = "complete"

    def progress(self, state: InterviewState) -> dict:
        cfg = state.get("config") or {}
        answered = sum(1 for q in state.get("questions", []) if q.get("answer") is not None)
        rounds = cfg.get("rounds", list(VALID_ROUNDS))
        current = state.get("current_round")
        return {
            "round": current,
            "rounds": rounds,
            "round_index": rounds.index(current) if current in rounds else len(rounds),
            "questions_per_round": cfg.get("questions_per_round"),
            "questions_asked": len(state.get("questions", [])),
            "questions_answered": answered,
            "difficulty": state.get("current_difficulty"),
            "adaptive": cfg.get("adaptive", True),
            "status": state.get("status"),
        }

    # ── Persistence ────────────────────────────────────────────────────────
    async def _persist_question(self, state: InterviewState, record: dict) -> None:
        if not record or not record.get("question"):
            return
        try:
            from core.database import AsyncSessionLocal
            from core.models import InterviewQuestion
            from sqlalchemy import select

            sid = uuid.UUID(state["session_id"])
            ev = record.get("evaluation") or {}
            async with AsyncSessionLocal() as db:
                res = await db.execute(
                    select(InterviewQuestion).where(
                        InterviewQuestion.session_id == sid,
                        InterviewQuestion.round_name == record.get("round", state.get("current_round")),
                        InterviewQuestion.question_index == int(record.get("index", 0)),
                    )
                )
                row = res.scalar_one_or_none()
                if row is None:
                    row = InterviewQuestion(session_id=sid, round_name=record.get("round", state.get("current_round")),
                                            question_index=int(record.get("index", 0)), question_text=record["question"])
                    db.add(row)
                row.category = record.get("category")
                row.difficulty = record.get("difficulty")
                row.is_follow_up = bool(record.get("is_follow_up"))
                row.retrieval_sources = record.get("retrieval_sources") or []
                row.generation_latency_ms = record.get("generation_latency_ms")
                if record.get("generation_source") and record["generation_source"] != "restored":
                    row.generation_source = record["generation_source"]
                row.answer_text = record.get("answer")
                if ev:
                    row.technical_correctness = ev.get("technical_correctness")
                    row.conceptual_understanding = ev.get("conceptual_understanding")
                    row.answer_completeness = ev.get("answer_completeness")
                    row.communication_clarity = ev.get("communication_clarity")
                    row.overall_score = ev.get("overall_score")
                    row.next_difficulty = ev.get("next_difficulty")
                    row.evaluation = ev
                    row.evaluation_source = ev.get("evaluation_source")
                    row.evaluation_latency_ms = ev.get("evaluation_latency_ms")
                    if record.get("answered_at"):
                        try:
                            row.answered_at = datetime.fromisoformat(record["answered_at"])
                        except ValueError:
                            row.answered_at = datetime.now(timezone.utc)
                await db.commit()
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to persist question for session %s: %s", state.get("session_id"), exc)

    # ── State access / restore ─────────────────────────────────────────────
    async def get_state(self, session_id: str, db=None) -> InterviewState:
        if session_id not in self._sessions:
            if db is None:
                # Try restoring with a fresh DB session so callers don't have to pass one.
                from core.database import AsyncSessionLocal

                async with AsyncSessionLocal() as own_db:
                    await self.restore_session(session_id, own_db)
            else:
                await self.restore_session(session_id, db)
        return self._sessions[session_id]

    def has_session(self, session_id: str) -> bool:
        return session_id in self._sessions

    async def restore_session(self, session_id: str, db) -> None:
        """Rebuild orchestrator state from the database after a restart."""
        from sqlalchemy import select
        from core.models import InterviewSession, Candidate, RoundTranscript, InterviewQuestion

        try:
            sid = uuid.UUID(session_id)
        except ValueError:
            raise KeyError(f"Invalid session ID format: {session_id}")

        session = await db.get(InterviewSession, sid)
        if not session:
            raise KeyError(f"No session found in DB with ID: {session_id}")
        candidate = await db.get(Candidate, session.candidate_id)
        if not candidate:
            raise KeyError(f"No candidate found for session: {session_id}")

        cfg = normalise_config(session.config or {}, candidate.target_role)
        current_round = session.current_round.value if session.status.value in ("active", "pending") else "complete"
        rounds = cfg["rounds"]
        try:
            idx = rounds.index(current_round)
            queue = rounds[idx + 1:]
        except ValueError:
            queue = []

        q_rows = (await db.execute(
            select(InterviewQuestion).where(InterviewQuestion.session_id == sid)
            .order_by(InterviewQuestion.asked_at.asc(), InterviewQuestion.question_index.asc())
        )).scalars().all()
        t_rows = (await db.execute(
            select(RoundTranscript).where(RoundTranscript.session_id == sid).order_by(RoundTranscript.created_at.asc())
        )).scalars().all()

        round_scores = dict(session.round_scores or {})
        round_results: dict = {}
        dsa_submissions: list[dict] = []
        for t in t_rows:
            if t.round_name == "dsa" and t.transcript and t.transcript.lstrip().startswith("{"):
                try:
                    data = json.loads(t.transcript)
                    if isinstance(data, dict) and "evaluation" in data:
                        dsa_submissions.append(data["evaluation"])
                        continue
                except Exception:  # noqa: BLE001
                    pass
            round_results[t.round_name] = {**(t.ai_evaluation or {}), "transcript": t.transcript, "score": t.score}
            if t.round_name not in round_scores and t.score is not None:
                round_scores[t.round_name] = float(t.score)

        # Questions of the current (unfinished) round
        questions = []
        asked_all = []
        history = []
        for q in q_rows:
            asked_all.append(q.question_text)
            if q.round_name == current_round and current_round not in round_results:
                rec = {
                    "index": q.question_index, "round": q.round_name, "question": q.question_text,
                    "spoken_text": q.question_text, "category": q.category, "difficulty": q.difficulty,
                    "is_follow_up": q.is_follow_up, "retrieval_sources": q.retrieval_sources or [],
                    "generation_source": q.generation_source or "restored", "asked_at": q.asked_at.isoformat() if q.asked_at else None,
                    "answer": q.answer_text, "evaluation": q.evaluation,
                    "answered_at": q.answered_at.isoformat() if q.answered_at else None,
                }
                questions.append(rec)
                history.append({"speaker": "interviewer", "text": q.question_text})
                if q.answer_text:
                    history.append({"speaker": "candidate", "text": q.answer_text})

        difficulty = cfg["difficulty"]
        last_eval = None
        for q in reversed(questions):
            if q.get("evaluation"):
                last_eval = q["evaluation"]
                difficulty = normalize_level(last_eval.get("next_difficulty"), difficulty)
                break

        state: InterviewState = {
            "session_id": session_id,
            "candidate_id": str(candidate.id),
            "user_id": str(candidate.user_id) if candidate.user_id else "",
            "target_role": session.target_role or cfg["target_role"],
            "job_description": cfg["job_description"],
            "resume_structured": candidate.resume_structured or {},
            "persona": session.persona or random.choice(PERSONAS),
            "config": cfg,
            "rounds_queue": queue,
            "current_round": current_round,
            "status": "complete" if session.status.value == "completed" else session.status.value,
            "current_difficulty": difficulty,
            "category_plan": plan_categories(cfg["target_role"], candidate.resume_structured, current_round,
                                             cfg["questions_per_round"]) if current_round in VALID_ROUNDS else [],
            "questions": questions,
            "conversation_history": history,
            "asked_questions_all": asked_all,
            "round_scores": round_scores,
            "round_results": round_results,
            "overall_score": session.overall_score or 0.0,
            "dsa_problems_total": cfg["dsa_problems"],
            "dsa_problems_completed": len(dsa_submissions),
            "dsa_submissions": dsa_submissions,
            "current_dsa_problem": None,
            "dsa_hints_used": 0,
            "phase": "open",
            "candidate_answer": "",
            "next_question": questions[-1] if questions and questions[-1].get("answer") is None else None,
            "last_evaluation": last_eval,
            "round_should_end": False,
            "closing_message": "",
            "last_message": "Restored from database.",
            "turn_counter": len(q_rows),
            "resume_text": "",  # type: ignore[typeddict-unknown-key]
        }
        if self.rag is not None:
            try:
                state["resume_text"] = await self.rag.get_resume_text(str(candidate.id))  # type: ignore[typeddict-unknown-key]
            except Exception:  # noqa: BLE001
                pass
        self._sessions[session_id] = state
        logger.info("Restored session %s from DB (round=%s, %d questions)", session_id, current_round, len(questions))
