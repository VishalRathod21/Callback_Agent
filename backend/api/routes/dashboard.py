"""Dashboard / analytics endpoints built from persisted interview data only."""

from __future__ import annotations

import uuid
from collections import defaultdict
from statistics import pstdev

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import get_current_user
from core.database import get_db
from core.models import Candidate, InterviewSession, InterviewQuestion, SessionStatus, User
from core.timeutil import seconds_between

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

RUBRIC_KEYS = ["technical_correctness", "conceptual_understanding", "answer_completeness", "communication_clarity"]


def _duration_min(s: InterviewSession) -> int:
    if s.duration_seconds is not None:
        return round(s.duration_seconds / 60)
    secs = seconds_between(s.started_at, s.ended_at)
    return round(secs / 60) if secs is not None else 0


def _timeline(sessions: list[InterviewSession]) -> list[dict]:
    out = []
    for i, s in enumerate(sessions):
        scores = s.round_scores or {}
        out.append({
            "session_number": i + 1,
            "session_id": str(s.id),
            "date": s.started_at.isoformat() if s.started_at else None,
            "overall": s.overall_score if s.overall_score is not None else 0,
            "dsa": scores.get("dsa"),
            "technical": scores.get("technical"),
            "hr": scores.get("hr"),
            "duration_min": _duration_min(s),
            "mode": s.mode,
            "target_role": s.target_role,
        })
    return out


def _avg(values: list) -> float | None:
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def _readiness(timeline: list[dict]) -> tuple[int, dict]:
    """Weighted readiness: latest 40% · improvement 30% · consistency 20% · volume 10%."""
    if not timeline:
        return 0, {}
    overall = [t["overall"] for t in timeline]
    latest_factor = (overall[-1] / 100) * 40
    improvement = max(0.0, overall[-1] - overall[0]) if len(overall) > 1 else 0.0
    trend_factor = min(30.0, (improvement / 20) * 30)
    consistency_factor = max(0.0, 20 - (pstdev(overall) / 5)) if len(overall) > 1 else 10.0
    volume_factor = min(10.0, len(overall) * 2)
    score = int(round(max(0.0, min(100.0, latest_factor + trend_factor + consistency_factor + volume_factor))))
    return score, {
        "latest_score_factor": round(latest_factor, 1), "trend_factor": round(trend_factor, 1),
        "consistency_factor": round(consistency_factor, 1), "sessions_factor": round(volume_factor, 1),
    }


async def _skill_and_rubric_stats(db: AsyncSession, session_ids: list[uuid.UUID]) -> tuple[list[dict], dict, dict]:
    if not session_ids:
        return [], {k: None for k in RUBRIC_KEYS}, {"llm": 0, "heuristic": 0, "unavailable": 0}
    rows = (await db.execute(
        select(InterviewQuestion).where(InterviewQuestion.session_id.in_(session_ids), InterviewQuestion.overall_score.isnot(None))
    )).scalars().all()
    by_cat: dict[str, list[float]] = defaultdict(list)
    rubric: dict[str, list[float]] = defaultdict(list)
    provenance = {"llm": 0, "heuristic": 0, "unavailable": 0}
    for q in rows:
        by_cat[q.category or "general"].append(q.overall_score)
        for k in RUBRIC_KEYS:
            v = getattr(q, k)
            if v is not None:
                rubric[k].append(v)
        provenance[q.evaluation_source or "unavailable"] = provenance.get(q.evaluation_source or "unavailable", 0) + 1
    skills = sorted(
        [{"category": c, "average": round(sum(v) / len(v), 2), "questions": len(v)} for c, v in by_cat.items()],
        key=lambda x: x["average"],
    )
    rubric_avg = {k: (round(sum(v) / len(v), 2) if v else None) for k, v in ((k, rubric[k]) for k in RUBRIC_KEYS)}
    return skills, rubric_avg, provenance


# ── User-level overview ────────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Everything the main dashboard needs for the current user."""
    candidates = (await db.execute(
        select(Candidate).where(Candidate.user_id == current_user.id).order_by(Candidate.created_at.desc())
    )).scalars().all()
    cand_ids = [c.id for c in candidates]
    sessions: list[InterviewSession] = []
    if cand_ids:
        sessions = (await db.execute(
            select(InterviewSession).where(InterviewSession.candidate_id.in_(cand_ids)).order_by(InterviewSession.started_at.asc())
        )).scalars().all()
    completed = [s for s in sessions if s.status == SessionStatus.COMPLETED]
    active = [s for s in sessions if s.status == SessionStatus.ACTIVE]
    timeline = _timeline(completed)
    readiness, breakdown = _readiness(timeline)
    skills, rubric_avg, provenance = await _skill_and_rubric_stats(db, [s.id for s in completed])
    latest_candidate = candidates[0] if candidates else None
    cand_name = {c.id: c.name for c in candidates}

    trends = {}
    if len(timeline) > 1:
        for key in ("overall", "dsa", "technical", "hr"):
            first, last = timeline[0].get(key), timeline[-1].get(key)
            trends[key] = round(last - first, 1) if first is not None and last is not None else None

    recent = sorted(sessions, key=lambda s: s.started_at or 0, reverse=True)[:6]
    return {
        "has_data": bool(completed),
        "user": {"name": current_user.full_name, "email": current_user.email},
        "candidate": {
            "id": str(latest_candidate.id), "name": latest_candidate.name, "target_role": latest_candidate.target_role,
            "status": latest_candidate.status.value, "ats_score": latest_candidate.ats_score,
            "resume_uploaded": bool(latest_candidate.resume_path),
            "skills": (latest_candidate.resume_structured or {}).get("skills", [])[:12],
            "resume_parsed_at": latest_candidate.resume_parsed_at.isoformat() if latest_candidate.resume_parsed_at else None,
        } if latest_candidate else None,
        "candidates_count": len(candidates),
        "totals": {
            "interviews": len(sessions), "completed": len(completed), "active": len(active),
            "average_score": _avg([s.overall_score for s in completed]),
            "best_score": max((s.overall_score for s in completed if s.overall_score is not None), default=None),
            "total_time_min": sum(t["duration_min"] for t in timeline),
            "questions_answered": sum((s.total_questions or 0) for s in completed),
        },
        "averages": {
            "overall": _avg([t["overall"] for t in timeline]),
            "dsa": _avg([t["dsa"] for t in timeline]),
            "technical": _avg([t["technical"] for t in timeline]),
            "hr": _avg([t["hr"] for t in timeline]),
        },
        "trends": trends,
        "readiness_score": readiness,
        "readiness_breakdown": breakdown,
        "score_timeline": timeline,
        "skill_performance": skills,
        "rubric_averages": rubric_avg,
        "evaluation_provenance": provenance,
        "recent_sessions": [{
            "session_id": str(s.id), "candidate_name": cand_name.get(s.candidate_id), "target_role": s.target_role,
            "status": s.status.value, "overall_score": s.overall_score, "round_scores": s.round_scores or {},
            "mode": s.mode, "current_round": s.current_round.value,
            "started_at": s.started_at.isoformat() if s.started_at else None, "duration_min": _duration_min(s),
            "rounds": (s.config or {}).get("rounds", ["dsa", "technical", "hr"]),
        } for s in recent],
    }


# ── Per-candidate dashboard (kept for compatibility) ──────────────────────────

@router.get("/{candidate_id}")
async def get_dashboard(
    candidate_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        candidate_uuid = uuid.UUID(candidate_id)
    except ValueError:
        raise HTTPException(400, "Invalid candidate ID format")

    candidate = await db.get(Candidate, candidate_uuid)
    if not candidate:
        raise HTTPException(404, "Candidate not found")
    if candidate.user_id != current_user.id:
        raise HTTPException(403, "Access denied. You do not own this candidate record.")

    sessions = (await db.execute(
        select(InterviewSession)
        .where(InterviewSession.candidate_id == candidate_uuid, InterviewSession.status == SessionStatus.COMPLETED)
        .order_by(InterviewSession.started_at.asc())
    )).scalars().all()
    if not sessions:
        return {"has_data": False, "message": "No completed sessions yet", "candidate_name": candidate.name,
                "target_role": candidate.target_role}

    timeline = _timeline(sessions)
    readiness, breakdown = _readiness(timeline)
    skills, rubric_avg, provenance = await _skill_and_rubric_stats(db, [s.id for s in sessions])
    first, latest = timeline[0], timeline[-1]

    def trend(key):
        a, b = first.get(key), latest.get(key)
        return round(b - a, 1) if a is not None and b is not None else None

    weak_areas = sorted([
        {"name": "DSA Coding", "avg_score": _avg([t["dsa"] for t in timeline]), "trend": trend("dsa")},
        {"name": "Technical", "avg_score": _avg([t["technical"] for t in timeline]), "trend": trend("technical")},
        {"name": "HR Behavioral", "avg_score": _avg([t["hr"] for t in timeline]), "trend": trend("hr")},
    ], key=lambda x: (x["avg_score"] is None, x["avg_score"] or 0))
    by_score = sorted(timeline, key=lambda x: x["overall"])
    return {
        "has_data": True,
        "candidate_name": candidate.name,
        "target_role": candidate.target_role,
        "total_sessions": len(sessions),
        "total_time_min": sum(t["duration_min"] for t in timeline),
        "readiness_score": readiness,
        "readiness_breakdown": breakdown,
        "score_timeline": timeline,
        "trends": {k: trend(k) for k in ("overall", "dsa", "technical", "hr")},
        "averages": {"overall": _avg([t["overall"] for t in timeline]), "dsa": _avg([t["dsa"] for t in timeline]),
                     "technical": _avg([t["technical"] for t in timeline]), "hr": _avg([t["hr"] for t in timeline])},
        "weak_areas": weak_areas,
        "skill_performance": skills,
        "rubric_averages": rubric_avg,
        "evaluation_provenance": provenance,
        "best_session": by_score[-1],
        "worst_session": by_score[0],
        "latest_session": timeline[-1],
    }
