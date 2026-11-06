"""Interview session endpoints: configuration, start, history, details, cancel."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.config import settings
from core.database import get_db
from core.models import (Candidate, CandidateStatus, InterviewSession, SessionStatus, RoundName, User,
                         InterviewQuestion, RoundTranscript)
from api.routes.auth import get_current_user
from agents.orchestrator import normalise_config, VALID_ROUNDS, VALID_MODES
from agents.difficulty_policy import LEVELS, default_policy
from core.timeutil import seconds_between

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interviews", tags=["interviews"])

TARGET_ROLES = [
    "Software Engineer", "Backend Developer", "Frontend Developer", "Fullstack Developer",
    "ML Engineer", "Data Scientist", "Data Engineer", "AI Engineer", "NLP Engineer",
    "Generative AI Engineer", "DevOps Engineer", "Cloud Architect", "Mobile Engineer",
    "QA Automation Engineer", "Product Manager",
]


class InterviewConfigIn(BaseModel):
    rounds: Optional[list[str]] = Field(None, description="Subset of dsa|technical|hr")
    difficulty: Optional[str] = Field("medium", pattern="^(easy|medium|hard)$")
    mode: Optional[str] = Field("text", pattern="^(voice|text)$")
    questions_per_round: Optional[int] = Field(None, ge=2, le=12)
    dsa_problems: Optional[int] = Field(None, ge=1, le=4)
    duration_minutes: Optional[int] = Field(30, ge=10, le=120)
    adaptive: Optional[bool] = True
    use_rag: Optional[bool] = True
    job_description: Optional[str] = Field("", max_length=4000)
    target_role: Optional[str] = Field(None, min_length=2, max_length=100, pattern=r"^[A-Za-z0-9.+# -/()]+$")


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_resume_text(candidate: Candidate, faiss_or_rag=None) -> str:
    """Resume text from the vector store, falling back to re-parsing the file."""
    cid = str(candidate.id)
    if faiss_or_rag is not None:
        try:
            if hasattr(faiss_or_rag, "get_resume_text"):
                text = await faiss_or_rag.get_resume_text(cid)
            else:
                rec = await faiss_or_rag.get(collection="resumes", doc_id=cid)
                text = rec["text"] if rec else ""
            if text:
                return text
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to retrieve resume from vector store: %s", exc)
    if candidate.resume_path:
        from services import resume_parser
        try:
            parsed = await resume_parser.parse_resume(candidate.resume_path)
            return parsed["raw_text"]
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to parse resume from disk fallback: %s", exc)
    return ""


def _session_summary(s: InterviewSession, candidate: Candidate | None = None, question_count: int | None = None) -> dict:
    cfg = s.config or {}
    duration = s.duration_seconds
    if duration is None:
        duration = seconds_between(s.started_at, s.ended_at)
    return {
        "session_id": str(s.id),
        "candidate_id": str(s.candidate_id),
        "candidate_name": candidate.name if candidate else None,
        "target_role": s.target_role or (candidate.target_role if candidate else None),
        "status": s.status.value,
        "current_round": s.current_round.value,
        "rounds": cfg.get("rounds", list(VALID_ROUNDS)),
        "mode": s.mode or cfg.get("mode", "text"),
        "difficulty": cfg.get("difficulty", "medium"),
        "adaptive": cfg.get("adaptive", True),
        "round_scores": s.round_scores or {},
        "overall_score": s.overall_score,
        "total_questions": question_count if question_count is not None else s.total_questions,
        "duration_seconds": duration,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
        "has_report": s.report is not None if "report" in s.__dict__ else None,
    }


def _question_view(q: InterviewQuestion, include_answer: bool = True) -> dict:
    ev = q.evaluation or {}
    return {
        "id": str(q.id),
        "round": q.round_name,
        "index": q.question_index,
        "category": q.category,
        "difficulty": q.difficulty,
        "next_difficulty": q.next_difficulty,
        "is_follow_up": q.is_follow_up,
        "question": q.question_text,
        "answer": q.answer_text if include_answer else None,
        "scores": {
            "technical_correctness": q.technical_correctness,
            "conceptual_understanding": q.conceptual_understanding,
            "answer_completeness": q.answer_completeness,
            "communication_clarity": q.communication_clarity,
            "overall": q.overall_score,
        },
        "feedback": ev.get("feedback"),
        "strengths": ev.get("strengths", []),
        "gaps": ev.get("gaps", []),
        "ideal_answer_points": ev.get("ideal_answer_points", []),
        "learning_topics": ev.get("learning_topics", []),
        "policy": ev.get("policy_decision"),
        "evaluation_source": q.evaluation_source,
        "generation_source": q.generation_source,
        "retrieval_sources": q.retrieval_sources or [],
        "generation_latency_ms": q.generation_latency_ms,
        "evaluation_latency_ms": q.evaluation_latency_ms,
        "asked_at": q.asked_at.isoformat() if q.asked_at else None,
        "answered_at": q.answered_at.isoformat() if q.answered_at else None,
    }


# ── Static configuration ───────────────────────────────────────────────────────

@router.get("/config/options")
async def config_options():
    """Options for the interview configuration page."""
    return {
        "target_roles": TARGET_ROLES,
        "rounds": [
            {"id": "dsa", "label": "DSA Coding", "description": "Algorithmic problems in a code editor with hints and complexity analysis."},
            {"id": "technical", "label": "Technical", "description": "Resume-aware technical questions with adaptive difficulty."},
            {"id": "hr", "label": "HR / Behavioural", "description": "Behavioural questions evaluated for structure, relevance and completeness."},
        ],
        "difficulties": LEVELS,
        "modes": list(VALID_MODES),
        "voice_available": bool(settings.VOICE_ENABLED and (settings.DEEPGRAM_API_KEY or settings.ELEVENLABS_API_KEY)),
        "defaults": {
            "questions_per_round": settings.DEFAULT_QUESTIONS_PER_ROUND,
            "dsa_problems": settings.DEFAULT_DSA_PROBLEMS,
            "difficulty": "medium",
            "duration_minutes": 30,
            "adaptive": settings.ADAPTIVE_ENABLED,
        },
        "limits": {"questions_per_round": [2, settings.MAX_QUESTIONS_PER_ROUND], "dsa_problems": [1, 4],
                   "duration_minutes": [10, 120]},
        "policy": default_policy.describe(),
        "rubric_weights": settings.rubric_weights,
        "llm_available": __import__("services.llm_service", fromlist=["llm_service"]).llm_service.available,
    }


@router.get("/engine/graph")
async def engine_graph(request: Request):
    """Topology of the LangGraph interview graph and the active difficulty policy."""
    from api.websocket import _orchestrator
    return {"graph": _orchestrator.graph_runner.describe(), "policy": default_policy.describe(),
            "rubric_weights": settings.rubric_weights, "embedding_backend": getattr(request.app.state, "faiss", None) and request.app.state.faiss.backend_name}


# ── Start ──────────────────────────────────────────────────────────────────────

@router.post("/start/{candidate_id}")
async def start_interview(
    candidate_id: uuid.UUID,
    request: Request,
    body: InterviewConfigIn | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an interview session with the given configuration and initialise the orchestrator."""
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    if candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied. You do not own this candidate record.")
    if candidate.status == CandidateStatus.UPLOADED:
        raise HTTPException(status_code=400, detail="Resume has not been screened yet.")

    cfg = normalise_config(body.model_dump(exclude_none=True) if body else {}, candidate.target_role)
    if cfg["mode"] == "voice" and not getattr(request.app.state, "stt", None):
        logger.info("Voice mode requested but voice services are unavailable; session will use text fallback.")
        cfg["voice_available"] = False
    else:
        cfg["voice_available"] = cfg["mode"] == "voice"

    from api.websocket import _orchestrator
    from agents.orchestrator import PERSONAS
    import random
    persona = random.choice(PERSONAS)

    session = InterviewSession(
        candidate_id=candidate.id,
        current_round=RoundName(cfg["rounds"][0]),
        round_scores={},
        overall_score=None,
        status=SessionStatus.ACTIVE,
        config=cfg,
        mode=cfg["mode"],
        target_role=cfg["target_role"],
        persona=persona,
        total_questions=0,
    )
    db.add(session)
    await db.flush()
    candidate.status = CandidateStatus.INTERVIEWING
    if cfg["target_role"] and cfg["target_role"] != candidate.target_role:
        candidate.target_role = cfg["target_role"]
    await db.flush()

    rag = getattr(request.app.state, "rag", None)
    resume_text = await _get_resume_text(candidate, rag or getattr(request.app.state, "faiss", None))

    await _orchestrator.start_session(
        candidate_id=str(candidate.id), session_id=str(session.id), target_role=cfg["target_role"],
        resume_text=resume_text, config=cfg, resume_structured=candidate.resume_structured or {},
        user_id=str(current_user.id), persona=persona,
    )
    logger.info("Started session %s for candidate %s (rounds=%s mode=%s)", session.id, candidate.id, cfg["rounds"], cfg["mode"])
    return {
        "session_id": str(session.id),
        "candidate_id": str(candidate.id),
        "status": session.status.value,
        "current_round": session.current_round.value,
        "rounds_queue": cfg["rounds"],
        "config": cfg,
        "persona": persona,
    }


# ── History ────────────────────────────────────────────────────────────────────

@router.get("")
@router.get("/")
async def list_interviews(
    status: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """All interview sessions belonging to the current user (newest first)."""
    stmt = (
        select(InterviewSession, Candidate)
        .join(Candidate, Candidate.id == InterviewSession.candidate_id)
        .where(Candidate.user_id == current_user.id)
        .order_by(InterviewSession.started_at.desc())
        .limit(max(1, min(limit, 200)))
    )
    if status in {s.value for s in SessionStatus}:
        stmt = stmt.where(InterviewSession.status == SessionStatus(status))
    rows = (await db.execute(stmt)).all()
    session_ids = [s.id for s, _ in rows]
    counts: dict = {}
    if session_ids:
        q = (await db.execute(
            select(InterviewQuestion.session_id, func.count(InterviewQuestion.id))
            .where(InterviewQuestion.session_id.in_(session_ids)).group_by(InterviewQuestion.session_id)
        )).all()
        counts = {sid: n for sid, n in q}
    return {"sessions": [_session_summary(s, c, counts.get(s.id, s.total_questions or 0)) for s, c in rows],
            "total": len(rows)}


# ── Details ────────────────────────────────────────────────────────────────────

@router.get("/{session_id}")
async def get_interview_session(
    session_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = (await db.execute(
        select(InterviewSession).where(InterviewSession.id == session_id).options(selectinload(InterviewSession.report))
    )).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    candidate = await db.get(Candidate, session.candidate_id)
    if not candidate or candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied. You do not own this interview session.")

    questions = (await db.execute(
        select(InterviewQuestion).where(InterviewQuestion.session_id == session_id)
        .order_by(InterviewQuestion.asked_at.asc(), InterviewQuestion.question_index.asc())
    )).scalars().all()
    transcripts = (await db.execute(
        select(RoundTranscript).where(RoundTranscript.session_id == session_id).order_by(RoundTranscript.created_at.asc())
    )).scalars().all()

    from api.websocket import _orchestrator
    progress = None
    try:
        state = await _orchestrator.get_state(str(session_id), db)
        progress = _orchestrator.progress(state)
    except Exception as exc:  # noqa: BLE001
        logger.info("No orchestrator state for %s: %s", session_id, exc)

    summary = _session_summary(session, candidate, len(questions))
    summary["has_report"] = session.report is not None
    return {
        **summary,
        "candidate_name": candidate.name,
        "resume_available": bool(candidate.resume_path),
        "config": session.config or {},
        "persona": session.persona,
        "progress": progress,
        "questions": [_question_view(q) for q in questions],
        "rounds": [
            {"name": t.round_name, "score": t.score, "evaluation": {k: v for k, v in (t.ai_evaluation or {}).items() if k != "per_problem"},
             "created_at": t.created_at.isoformat() if t.created_at else None}
            for t in transcripts if not (t.transcript or "").lstrip().startswith("{")
        ],
        "voice_enabled": getattr(request.app.state, "stt", None) is not None,
    }


@router.get("/{session_id}/questions")
async def get_session_questions(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await db.get(InterviewSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    candidate = await db.get(Candidate, session.candidate_id)
    if not candidate or candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    questions = (await db.execute(
        select(InterviewQuestion).where(InterviewQuestion.session_id == session_id)
        .order_by(InterviewQuestion.asked_at.asc(), InterviewQuestion.question_index.asc())
    )).scalars().all()
    return {"session_id": str(session_id), "questions": [_question_view(q) for q in questions]}


@router.post("/{session_id}/cancel")
async def cancel_interview(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await db.get(InterviewSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    candidate = await db.get(Candidate, session.candidate_id)
    if not candidate or candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    if session.status == SessionStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Completed sessions cannot be cancelled.")
    session.status = SessionStatus.CANCELLED
    session.ended_at = datetime.now(timezone.utc)
    from api.websocket import _orchestrator
    await _orchestrator.cancel_session(str(session_id))
    await db.flush()
    return {"session_id": str(session_id), "status": session.status.value}
