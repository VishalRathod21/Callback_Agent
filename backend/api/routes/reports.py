"""Reports API — structured JSON report and PDF download, per session (and per candidate for compatibility)."""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.report_agent import ReportAgent
from api.routes.auth import get_current_user
from core.database import get_db
from core.models import Candidate, InterviewSession, RoundTranscript, InterviewQuestion, InterviewReport, User, SessionStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])

_report_agent = ReportAgent()


# ── Loading helpers ────────────────────────────────────────────────────────────

async def _load_session_bundle(session_id: uuid.UUID, db: AsyncSession, current_user: User):
    session = await db.get(InterviewSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    candidate = await db.get(Candidate, session.candidate_id)
    if not candidate or candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this report.")
    transcripts = (await db.execute(
        select(RoundTranscript).where(RoundTranscript.session_id == session.id).order_by(RoundTranscript.created_at.asc())
    )).scalars().all()
    questions = (await db.execute(
        select(InterviewQuestion).where(InterviewQuestion.session_id == session.id)
        .order_by(InterviewQuestion.asked_at.asc(), InterviewQuestion.question_index.asc())
    )).scalars().all()
    return candidate, session, list(transcripts), list(questions)


async def _latest_session_for_candidate(candidate_id: uuid.UUID, db: AsyncSession, current_user: User) -> InterviewSession:
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    if candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this report.")
    session = (await db.execute(
        select(InterviewSession).where(InterviewSession.candidate_id == candidate_id)
        .order_by((InterviewSession.status == SessionStatus.COMPLETED).desc(), InterviewSession.started_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="No interview session found for this candidate.")
    return session


async def _get_or_build_report(session_id: uuid.UUID, db: AsyncSession, current_user: User, regenerate: bool) -> tuple[dict, InterviewReport]:
    candidate, session, transcripts, questions = await _load_session_bundle(session_id, db, current_user)
    report = (await db.execute(select(InterviewReport).where(InterviewReport.session_id == session.id))).scalar_one_or_none()

    stale = report is None or regenerate
    if report is not None and not regenerate:
        # Rebuild when new data arrived after the cached report (e.g. another round finished)
        data = report.report_data or {}
        if data.get("session", {}).get("total_questions") != len(questions) or \
           data.get("session", {}).get("status") != session.status.value:
            stale = True
    if not stale:
        return report.report_data, report

    data = _report_agent.build_report_data(candidate, session, transcripts, questions)
    narrative, source = await _report_agent.generate_narrative(data)
    data["narrative"], data["narrative_source"] = narrative, source
    if report is None:
        report = InterviewReport(session_id=session.id)
        db.add(report)
    report.report_data = data
    report.narrative_source = source
    report.generated_at = datetime.now(timezone.utc)
    if regenerate and report.pdf_path and os.path.exists(report.pdf_path):
        try:
            os.remove(report.pdf_path)
        except OSError:
            pass
        report.pdf_path = None
    await db.flush()
    return data, report


async def _ensure_pdf(report: InterviewReport, data: dict, candidate: Candidate, session: InterviewSession, db: AsyncSession) -> str:
    if report.pdf_path and os.path.exists(report.pdf_path):
        return report.pdf_path
    pdf_path = _report_agent.pdf_path_for(candidate, session)
    await _report_agent.render_pdf(pdf_path, data)
    report.pdf_path = pdf_path
    await db.flush()
    return pdf_path


def _pdf_filename(candidate: Candidate, session: InterviewSession) -> str:
    safe = "".join(ch if ch.isalnum() else "_" for ch in candidate.name)[:40] or "candidate"
    return f"{safe}_interview_report_{str(session.id)[:8]}.pdf"


# ── Per-session endpoints ──────────────────────────────────────────────────────

@router.get("/session/{session_id}/data")
async def get_session_report_data(
    session_id: uuid.UUID,
    regenerate: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data, report = await _get_or_build_report(session_id, db, current_user, regenerate)
    return {**data, "report_id": str(report.id), "pdf_available": bool(report.pdf_path and os.path.exists(report.pdf_path))}


@router.get("/session/{session_id}/pdf", response_class=FileResponse)
async def get_session_report_pdf(
    session_id: uuid.UUID,
    regenerate: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data, report = await _get_or_build_report(session_id, db, current_user, regenerate)
    candidate, session, _, _ = await _load_session_bundle(session_id, db, current_user)
    try:
        pdf_path = await _ensure_pdf(report, data, candidate, session, db)
    except Exception as exc:
        logger.error("Failed to generate report PDF: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate report. Please try again later.")
    return FileResponse(path=pdf_path, filename=_pdf_filename(candidate, session), media_type="application/pdf")


# ── Per-candidate endpoints (latest session; kept for backward compatibility) ─

@router.get("/{candidate_id}/data")
async def get_report_data(
    candidate_id: uuid.UUID,
    regenerate: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await _latest_session_for_candidate(candidate_id, db, current_user)
    return await get_session_report_data(session.id, regenerate, db, current_user)


@router.get("/{candidate_id}", response_class=FileResponse)
async def get_report_pdf(
    candidate_id: uuid.UUID,
    regenerate: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await _latest_session_for_candidate(candidate_id, db, current_user)
    return await get_session_report_pdf(session.id, regenerate, db, current_user)
