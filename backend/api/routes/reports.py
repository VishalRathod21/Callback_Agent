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
    regenerate: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return structured JSON report data (scores, feedback, narrative) for the frontend."""
    candidate, session, transcripts = await _load_candidate_session_transcripts(candidate_id, db)
    if candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this report.")

    candidate_dir = os.path.join("./uploads", str(candidate.id))
    
    # If regenerate is requested, delete cached files
    if regenerate:
        logger.info("Forced regeneration of JSON report data for candidate %s", candidate.id)
        for name in ["report.pdf", "report_fallback.pdf"]:
            p = os.path.join(candidate_dir, name)
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception as e:
                    logger.warning("Failed to remove cached report %s: %s", p, e)

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
        overall_score = session.overall_score or 0.0
        round_details = ", ".join([f"{t.round_name.upper()} (Score: {t.score or 0:.1f}%)" for t in transcripts])
        narrative = {
            "executive_summary": f"Evaluation scorecard compiled for {candidate.name} applying for the {candidate.target_role or 'Software Engineer'} role. Overall score achieved: {overall_score:.1f}%. Completed rounds: {round_details or 'None'}.",
            "strengths": [
                "Completed the technical rehearsal round requirements.",
                "Completed the behavioural rehearsal round requirements.",
                "Demonstrated structured analytical approach."
            ],
            "improvements": [
                "Continue practice across technical topics.",
                "Focus on STAR communication methodology.",
                "Refine code optimization patterns."
            ],
            "final_recommendation": "hire" if overall_score >= 75 else ("maybe" if overall_score >= 50 else "no_hire")
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
    regenerate: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve or generate the candidate's interview evaluation PDF report."""
    candidate, session, transcripts = await _load_candidate_session_transcripts(candidate_id, db)
    if candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this report.")

    candidate_dir = os.path.join("./uploads", str(candidate.id))
    pdf_path = os.path.join(candidate_dir, "report.pdf")

    # If regenerate is requested, delete cached files
    if regenerate:
        logger.info("Forced regeneration of PDF report for candidate %s", candidate.id)
        for name in ["report.pdf", "report_fallback.pdf"]:
            p = os.path.join(candidate_dir, name)
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception as e:
                    logger.warning("Failed to remove cached report %s: %s", p, e)

    # Check for pre-generated cached PDF report (only if not regenerating)
    if not regenerate and os.path.exists(pdf_path):
        logger.info("Serving cached PDF report for candidate %s", candidate.id)
        return FileResponse(
            path=pdf_path,
            filename=f"{candidate.name.replace(' ', '_')}_interview_report.pdf",
            media_type="application/pdf"
        )

    # Generate on-the-fly if not found or if regenerating
    logger.info("PDF report not found or regeneration requested on disk. Generating now for candidate %s", candidate.id)
    try:
        pdf_path, is_fallback = await _report_agent.generate_report(candidate, session, transcripts)
    except Exception as exc:
        logger.error("Failed to generate report PDF: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate report. Please try again later.")

    return FileResponse(
        path=pdf_path,
        filename=f"{candidate.name.replace(' ', '_')}_interview_report.pdf",
        media_type="application/pdf"
    )
