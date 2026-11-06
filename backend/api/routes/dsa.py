"""DSA coding round endpoints (REST; the round runs in the code-editor workspace)."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from agents.difficulty_policy import normalize_level
from api.routes.auth import get_current_user
from api.websocket import _orchestrator, _dsa_agent
from core.database import get_db
from core.models import Candidate, InterviewSession, RoundTranscript, RoundName, SessionStatus, CandidateStatus, User
from core.timeutil import seconds_between

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interviews/{session_id}/dsa", tags=["dsa"])

ALLOWED_LANGUAGES = {"python", "javascript", "java", "cpp", "c", "go", "rust", "typescript"}


class HintRequest(BaseModel):
    current_code: str = Field(..., min_length=1, max_length=50000)
    language: str = Field(..., min_length=1, max_length=30)

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        lang = v.strip().lower()
        if lang not in ALLOWED_LANGUAGES:
            raise ValueError(f"Unsupported language. Supported languages: {', '.join(sorted(ALLOWED_LANGUAGES))}")
        return lang


class SubmitRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50000)
    language: str = Field(..., min_length=1, max_length=30)
    verbal_explanation: Optional[str] = Field(None, max_length=5000)
    problem_index: int = Field(..., ge=0, le=10)

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        lang = v.strip().lower()
        if lang not in ALLOWED_LANGUAGES:
            raise ValueError(f"Unsupported language. Supported languages: {', '.join(sorted(ALLOWED_LANGUAGES))}")
        return lang


async def _authorised_state(session_id: uuid.UUID, db: AsyncSession, current_user: User):
    session = await db.get(InterviewSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    candidate = await db.get(Candidate, session.candidate_id)
    if candidate and candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied. You do not own this interview session.")
    try:
        state = await _orchestrator.get_state(str(session_id), db)
    except KeyError:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    return session, candidate, state


def _problem_view(problem: dict, state: dict) -> dict:
    total = int(state.get("dsa_problems_total", 2))
    return {
        **problem,
        "problem_index": int(state.get("dsa_problems_completed", 0)),
        "problems_total": total,
        "difficulty_policy": state.get("dsa_policy_decision"),
        "adaptive": bool((state.get("config") or {}).get("adaptive", True)),
    }


@router.get("/problem")
async def get_dsa_problem(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Current DSA problem (generated on first call; reused on refresh)."""
    session, candidate, state = await _authorised_state(session_id, db, current_user)
    if state.get("current_round") != "dsa":
        raise HTTPException(status_code=400, detail=f"The DSA round is not active (current round: {state.get('current_round')}).")

    if state.get("current_dsa_problem"):
        return _problem_view(state["current_dsa_problem"], state)

    cfg = state.get("config") or {}
    submissions = state.get("dsa_submissions", [])
    base = normalize_level(cfg.get("difficulty"), "medium")
    if submissions:
        decision = _dsa_agent.next_difficulty(submissions[-1], submissions[-1].get("difficulty") or base, cfg.get("adaptive", True))
        difficulty = decision["next_difficulty"]
    else:
        decision = {"previous_difficulty": None, "next_difficulty": base, "direction": "start", "reason": "configured starting difficulty"}
        difficulty = base

    problem = await _dsa_agent.get_problem(
        target_role=state.get("target_role", "Software Engineer"),
        difficulty=difficulty,
        resume_text=state.get("resume_text", ""),
        session_id=str(session_id),
        resume_structured=state.get("resume_structured"),
    )
    state["current_dsa_problem"] = problem
    state["dsa_hints_used"] = 0
    state["dsa_policy_decision"] = decision
    _orchestrator._sessions[str(session_id)] = state
    return _problem_view(problem, state)


@router.post("/hint")
async def get_dsa_hint(
    session_id: uuid.UUID,
    body: HintRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session, candidate, state = await _authorised_state(session_id, db, current_user)
    problem = state.get("current_dsa_problem")
    if not problem:
        raise HTTPException(status_code=400, detail="No active DSA problem in session state.")
    hint = await _dsa_agent.get_hint(problem=problem, current_code=body.current_code,
                                     conversation_history=state.get("dsa_submissions", []))
    state["dsa_hints_used"] = state.get("dsa_hints_used", 0) + 1
    _orchestrator._sessions[str(session_id)] = state
    return {"hint": hint, "hints_used": state["dsa_hints_used"]}


@router.post("/submit")
async def submit_dsa_solution(
    session_id: uuid.UUID,
    body: SubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Evaluate a submission; serve the next problem (adaptive) or close the round."""
    session, candidate, state = await _authorised_state(session_id, db, current_user)
    problem = state.get("current_dsa_problem")
    if not problem:
        raise HTTPException(status_code=400, detail="No active DSA problem in session state.")
    if body.problem_index != int(state.get("dsa_problems_completed", 0)):
        raise HTTPException(status_code=409, detail="This problem was already submitted. Load the current problem again.")

    evaluation = await _dsa_agent.evaluate_submission(
        problem=problem, submitted_code=body.code, language=body.language,
        verbal_explanation=body.verbal_explanation, hints_used=state.get("dsa_hints_used", 0),
    )
    evaluation["language"] = body.language
    evaluation["problem_index"] = body.problem_index

    submissions = list(state.get("dsa_submissions", [])) + [evaluation]
    state["dsa_submissions"] = submissions
    state["dsa_problems_completed"] = int(state.get("dsa_problems_completed", 0)) + 1
    state["dsa_hints_used"] = 0
    state["current_dsa_problem"] = None

    score_val = evaluation.get("overall_score")
    db.add(RoundTranscript(
        session_id=session_id, round_name="dsa",
        transcript=json.dumps({"code": body.code, "language": body.language, "problem": {k: problem.get(k) for k in ("title", "difficulty", "pattern")},
                               "verbal_explanation": body.verbal_explanation, "evaluation": evaluation}),
        ai_evaluation=evaluation, score=float(score_val) if score_val is not None else None,
    ))
    await db.flush()

    total_problems = int(state.get("dsa_problems_total", 2))
    cfg = state.get("config") or {}
    if state["dsa_problems_completed"] >= total_problems:
        round_eval = await _dsa_agent.evaluate_round(submissions)
        round_score = round_eval.get("score")
        aggregate_transcript = json.dumps(submissions)
        updated = await _orchestrator.submit_round_result(
            state=state, round_name="dsa", transcript=aggregate_transcript,
            score=float(round_score) if round_score is not None else None, evaluation=round_eval,
        )
        db.add(RoundTranscript(session_id=session_id, round_name="dsa",
                               transcript="\n".join(f"Problem {i + 1}: {s.get('problem_title')} — {s.get('feedback', '')}" for i, s in enumerate(submissions)),
                               ai_evaluation={k: v for k, v in round_eval.items() if k != "per_problem"},
                               score=float(round_score) if round_score is not None else None))
        db_session = await db.get(InterviewSession, session_id)
        if db_session:
            db_session.round_scores = updated.get("round_scores", {})
            db_session.total_questions = (db_session.total_questions or 0) + len(submissions)
            if updated.get("status") == "complete":
                from datetime import datetime, timezone
                db_session.status = SessionStatus.COMPLETED
                db_session.overall_score = updated.get("overall_score", 0.0)
                db_session.ended_at = datetime.now(timezone.utc)
                db_session.duration_seconds = seconds_between(db_session.started_at, db_session.ended_at)
                if candidate:
                    candidate.status = CandidateStatus.COMPLETED
            else:
                nxt = updated.get("current_round")
                if nxt in ("technical", "hr"):
                    db_session.current_round = RoundName(nxt)
        await db.flush()
        return {
            "evaluation": evaluation,
            "next_problem": None,
            "round_complete": True,
            "round_result": {k: v for k, v in round_eval.items() if k != "per_problem"},
            "next_round": updated.get("current_round"),
            "interview_status": updated.get("status"),
        }

    decision = _dsa_agent.next_difficulty(evaluation, problem.get("difficulty") or cfg.get("difficulty", "medium"), cfg.get("adaptive", True))
    next_problem = await _dsa_agent.get_problem(
        target_role=state.get("target_role", "Software Engineer"), difficulty=decision["next_difficulty"],
        resume_text=state.get("resume_text", ""), session_id=str(session_id),
        resume_structured=state.get("resume_structured"),
    )
    state["current_dsa_problem"] = next_problem
    state["dsa_policy_decision"] = decision
    _orchestrator._sessions[str(session_id)] = state
    return {
        "evaluation": evaluation,
        "next_problem": _problem_view(next_problem, state),
        "round_complete": False,
        "difficulty_decision": decision,
    }
