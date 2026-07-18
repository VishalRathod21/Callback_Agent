from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
import uuid
import numpy as np
from core.database import AsyncSessionLocal
from core.models import Candidate, InterviewSession, User
from api.routes.auth import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/{candidate_id}")
async def get_dashboard(
    candidate_id: str,
    current_user: User = Depends(get_current_user)
):
    try:
        candidate_uuid = uuid.UUID(candidate_id)
    except ValueError:
        raise HTTPException(400, "Invalid candidate ID format")

    async with AsyncSessionLocal() as db:
        candidate = await db.get(Candidate, candidate_uuid)
        if not candidate:
            raise HTTPException(404, "Candidate not found")
        
        if candidate.user_id != current_user.id:
            raise HTTPException(403, "Access denied. You do not own this candidate record.")
        
        # Get ALL completed sessions, ordered by date
        result = await db.execute(
            select(InterviewSession)
            .where(InterviewSession.candidate_id == candidate_uuid)
            .where(InterviewSession.status == "completed")
            .order_by(InterviewSession.started_at.asc())
        )
        sessions = result.scalars().all()
        
        if not sessions:
            return {
                "has_data": False, 
                "message": "No completed sessions yet",
                "candidate_name": candidate.name,
                "target_role": candidate.target_role
            }
        
        # ── Build score timeline ──────────────────────────────
        score_timeline = []
        for i, s in enumerate(sessions):
            scores = s.round_scores or {}
            score_timeline.append({
                "session_number": i + 1,
                "date": s.started_at.isoformat() if s.started_at else None,
                "overall": s.overall_score or 0,
                "dsa": scores.get("dsa", 0),
                "technical": scores.get("technical", 0),
                "hr": scores.get("hr", 0),
                "session_id": str(s.id),
                "duration_min": round(
                    (s.ended_at - s.started_at).seconds / 60
                ) if s.ended_at and s.started_at else 0
            })
        
        # ── Calculate trends ──────────────────────────────────
        first = score_timeline[0]
        latest = score_timeline[-1]
        
        def trend(key):
            first_val = first.get(key, 0)
            latest_val = latest.get(key, 0)
            return round(latest_val - first_val, 1)
        
        trends = {
            "overall": trend("overall"),
            "dsa": trend("dsa"),
            "technical": trend("technical"),
            "hr": trend("hr")
        }
        
        # ── Calculate readiness score ─────────────────────────
        # Weighted formula:
        # - Latest overall score: 40%
        # - Trend (improvement): 30%
        # - Consistency (std dev inversed): 20%
        # - Sessions completed: 10%
        
        overall_scores = [s["overall"] for s in score_timeline]
        
        latest_score_factor = (latest["overall"] / 100) * 40
        
        avg_improvement = max(0, trends["overall"])
        trend_factor = min(30, (avg_improvement / 20) * 30)
        
        if len(overall_scores) > 1:
            std_dev = float(np.std(overall_scores))
            consistency_factor = max(0, 20 - (std_dev / 5))
        else:
            consistency_factor = 10
        
        sessions_factor = min(10, len(sessions) * 2)
        
        readiness_score = round(
            latest_score_factor + trend_factor + 
            consistency_factor + sessions_factor
        )
        readiness_score = max(0, min(100, readiness_score))
        
        # ── Weak areas analysis ───────────────────────────────
        avg_dsa = round(sum(s["dsa"] for s in score_timeline) / len(score_timeline), 1)
        avg_tech = round(sum(s["technical"] for s in score_timeline) / len(score_timeline), 1)
        avg_hr = round(sum(s["hr"] for s in score_timeline) / len(score_timeline), 1)
        
        weak_areas = sorted([
            {"name": "DSA Coding", "avg_score": avg_dsa, "trend": trend("dsa")},
            {"name": "Technical", "avg_score": avg_tech, "trend": trend("technical")},
            {"name": "HR Behavioral", "avg_score": avg_hr, "trend": trend("hr")}
        ], key=lambda x: x["avg_score"])
        
        # ── Best and worst sessions ───────────────────────────
        sorted_by_score = sorted(score_timeline, key=lambda x: x["overall"])
        
        return {
            "has_data": True,
            "candidate_name": candidate.name,
            "target_role": candidate.target_role,
            "total_sessions": len(sessions),
            "total_time_min": sum(s["duration_min"] for s in score_timeline),
            "readiness_score": readiness_score,
            "readiness_breakdown": {
                "latest_score_factor": round(latest_score_factor, 1),
                "trend_factor": round(trend_factor, 1),
                "consistency_factor": round(consistency_factor, 1),
                "sessions_factor": round(sessions_factor, 1)
            },
            "score_timeline": score_timeline,
            "trends": trends,
            "averages": {
                "overall": round(sum(s["overall"] for s in score_timeline) / len(score_timeline), 1),
                "dsa": avg_dsa,
                "technical": avg_tech,
                "hr": avg_hr
            },
            "weak_areas": weak_areas,
            "best_session": sorted_by_score[-1] if sorted_by_score else None,
            "worst_session": sorted_by_score[0] if sorted_by_score else None,
            "latest_session": score_timeline[-1]
        }
