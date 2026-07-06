"""Reports API endpoints — JSON data and PDF download."""

import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from agents.report_agent import ReportAgent
from core.database import get_db
from core.models import Candidate, InterviewSession, RoundTranscript, User
from api.routes.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])

_report_agent = ReportAgent()


# ── Shared helper ──────────────────────────────────────────────────────────────

async def _load_candidate_session_transcripts(candidate_id, db):
    """Fetch the candidate, latest session, and associated transcripts."""
    candidate_result = await db.execute(
        select(Candidate)
        .where(Candidate.id == candidate_id)
        .options(selectinload(Candidate.sessions))
    )
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    if not candidate.sessions:
        raise HTTPException(status_code=404, detail="No interview session found for this candidate.")

    session = candidate.sessions[-1]

    transcripts_result = await db.execute(
        select(RoundTranscript)
        .where(RoundTranscript.session_id == session.id)
        .order_by(RoundTranscript.created_at.asc())
    )
    transcripts = list(transcripts_result.scalars().all())

    return candidate, session, transcripts


# ── GET /api/reports/{candidate_id}/data ───────────────────────────────────────


@router.get("/{candidate_id}/data")
async def get_report_data(
    candidate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return structured JSON report data (scores, feedback, narrative) for the frontend."""
    candidate, session, transcripts = await _load_candidate_session_transcripts(candidate_id, db)
    if candidate.user_id is not None and candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this report.")

    # Build round details from transcripts
    rounds = []
    for t in transcripts:
        rounds.append({
            "name": t.round_name,
            "score": t.score or 0,
            "feedback": (t.ai_evaluation or {}).get("feedback", "No feedback available."),
            "evaluation": t.ai_evaluation or {},
        })

    # Generate AI narrative summary via LLM
    try:
        narrative = await _report_agent._generate_narrative_summary(candidate, session, transcripts)
    except Exception as exc:
        logger.warning("Narrative generation failed, using fallback: %s", exc)
        narrative = {
            "executive_summary": "Evaluation data is being processed.",
            "strengths": [],
            "improvements": [],
            "final_recommendation": "maybe"
        }

    return {
        "candidate": {
            "id": str(candidate.id),
            "name": candidate.name,
            "email": candidate.email,
            "target_role": candidate.target_role,
            "ats_score": candidate.ats_score,
            "status": candidate.status.value,
        },
        "session": {
            "id": str(session.id),
            "overall_score": session.overall_score or 0,
            "round_scores": session.round_scores or {},
            "status": session.status.value,
            "started_at": session.started_at.isoformat() if session.started_at else None,
        },
        "rounds": rounds,
        "narrative": narrative,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ── GET /api/reports/{candidate_id} ───────────────────────────────────────────


@router.get("/{candidate_id}", response_class=FileResponse)
async def get_report_pdf(
    candidate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve or generate the candidate's interview evaluation PDF report."""
    candidate, session, transcripts = await _load_candidate_session_transcripts(candidate_id, db)
    if candidate.user_id is not None and candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this report.")

    # Check for pre-generated PDF report
    candidate_dir = os.path.join("./uploads", str(candidate.id))
    pdf_path = os.path.join(candidate_dir, "report.pdf")

    if os.path.exists(pdf_path):
        logger.info("Serving cached PDF report for candidate %s", candidate.id)
        return FileResponse(
            path=pdf_path,
            filename=f"{candidate.name.replace(' ', '_')}_interview_report.pdf",
            media_type="application/pdf"
        )

    # Generate on-the-fly if not found
    logger.info("PDF report not found on disk. Generating now for candidate %s", candidate.id)
    try:
        pdf_path = await _report_agent.generate_report(candidate, session, transcripts)
    except Exception as exc:
        logger.error("Failed to generate report PDF: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(exc)}")

    return FileResponse(
        path=pdf_path,
        filename=f"{candidate.name.replace(' ', '_')}_interview_report.pdf",
        media_type="application/pdf"
    )
