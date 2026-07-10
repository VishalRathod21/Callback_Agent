"""Interviews API endpoints for starting and monitoring sessions."""

import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.orchestrator import InterviewOrchestrator
from core.database import get_db
from core.models import Candidate, CandidateStatus, InterviewSession, SessionStatus, RoundName
from services.chroma_service import _collection

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interviews", tags=["interviews"])


# ── Helper to retrieve candidate resume text ───────────────────────────────────

async def _get_resume_text(candidate: Candidate) -> str:
    """Retrieve candidate's resume text from ChromaDB, falling back to disk parsing."""
    cid_str = str(candidate.id)
    try:
        res = _collection.get(ids=[cid_str])
        if res and res["documents"]:
            return res["documents"][0]
    except Exception as exc:
        logger.warning("Failed to retrieve resume from ChromaDB: %s", exc)

    if candidate.resume_path:
        from services import resume_parser
        try:
            parsed = await resume_parser.parse_resume(candidate.resume_path)
            return parsed["raw_text"]
        except Exception as exc:
            logger.error("Failed to parse resume from disk fallback: %s", exc)

    return ""


# ── POST /api/interviews/start/{candidate_id} ───────────────────────────────────


@router.post("/start/{candidate_id}")
async def start_interview(
    candidate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Start an interview session for a candidate.

    Checks if candidate status is 'screened', creates the session in the DB,
    initializes the LangGraph orchestrator state, and returns the session ID.
    """
    # 1. Fetch Candidate
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    # 2. Check Candidate Status
    if candidate.status != CandidateStatus.SCREENED:
        raise HTTPException(
            status_code=400,
            detail=f"Candidate must be in 'screened' status to start interview (current: {candidate.status.value})."
        )

    # 3. Create DB session
    session = InterviewSession(
        candidate_id=candidate.id,
        current_round=RoundName.DSA,
        round_scores={},
        overall_score=0.0,
        status=SessionStatus.ACTIVE
    )
    db.add(session)
    await db.flush()

    # Update candidate status to interviewing
    candidate.status = CandidateStatus.INTERVIEWING
    await db.flush()

    # 4. Fetch resume text for the orchestrator
    resume_text = await _get_resume_text(candidate)

    # 5. Initialize the orchestrator state
    from fastapi import Request
    # Note: We will attempt to use the orchestrator singleton initialized in app.state if available,
    # otherwise fallback to a newly created orchestrator instance.
    from api.websocket import _orchestrator
    orchestrator = _orchestrator

    rounds_queue = ["dsa", "technical", "hr"]

    await orchestrator.start_session(
        candidate_id=str(candidate.id),
        session_id=str(session.id),
        rounds_queue=rounds_queue,
        target_role=candidate.target_role or "Software Engineer",
        resume_text=resume_text
    )

    logger.info(
        "Successfully started session %s for candidate %s (%s)",
        session.id, candidate.name, candidate.email
    )

    return {
        "session_id": str(session.id),
        "candidate_id": str(candidate.id),
        "status": session.status.value,
        "current_round": session.current_round.value,
        "rounds_queue": rounds_queue
    }


# ── GET /api/interviews/{session_id} ──────────────────────────────────────────


@router.get("/{session_id}")
async def get_interview_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Retrieve full details of an active or completed interview session."""
    session = await db.get(InterviewSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    # Try to load candidate
    candidate = await db.get(Candidate, session.candidate_id)
    resume_text = await _get_resume_text(candidate) if candidate else ""

    # Attempt to load orchestrator state
    from api.websocket import _orchestrator
    orchestrator = _orchestrator
    try:
        orch_state = await orchestrator.get_state(str(session_id))
    except KeyError:
        orch_state = None

    return {
        "session_id": str(session.id),
        "candidate_id": str(session.candidate_id),
        "candidate_name": candidate.name if candidate else None,
        "target_role": candidate.target_role if candidate else None,
        "resume_text": resume_text,
        "current_round": session.current_round.value,
        "round_scores": session.round_scores or {},
        "overall_score": session.overall_score or 0.0,
        "status": session.status.value,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "orchestrator_state": orch_state
    }
