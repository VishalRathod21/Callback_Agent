"""DSA Coding Round API endpoints."""

import logging
import uuid
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from agents.dsa_agent import DSAInterviewAgent
from api.websocket import _orchestrator, _dsa_agent
from core.database import get_db
from core.models import InterviewSession, RoundTranscript, SessionStatus, RoundName

logger = logging.getLogger(__name__)

# Note: The prompt requests the router to be prefix='/api/interviews/{session_id}/dsa'.
# We can declare the router with prefix='/interviews/{session_id}/dsa' since the prefix in main.py is '/api'.
router = APIRouter(prefix="/interviews/{session_id}/dsa", tags=["dsa"])


class HintRequest(BaseModel):
    current_code: str
    language: str


class SubmitRequest(BaseModel):
    code: str
    language: str
    verbal_explanation: str | None = None
    problem_index: int


@router.get("/problem")
async def get_dsa_problem(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Retrieve the current DSA problem. Generates a new one if not yet initialized."""
    try:
        state = await _orchestrator.get_state(str(session_id), db)
    except KeyError:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    # Determine target role
    target_role = state.get("target_role", "Software Engineer")

    # Determine difficulty based on completed count
    completed = state.get("dsa_problems_completed", 0)
    if completed == 0:
        difficulty = "medium"
    elif completed == 1:
        difficulty = "medium/hard"
    else:
        difficulty = "hard"

    # Call DSA Interview Agent
    problem = await _dsa_agent.get_problem(
        target_role=target_role,
        difficulty=difficulty,
        resume_text=state.get("resume_text", ""),
        session_id=str(session_id)
    )

    # Store problem in orchestrator state
    state["current_dsa_problem"] = problem
    # Reset hints count for the new problem
    state["dsa_hints_used"] = 0
    
    _orchestrator._sessions[str(session_id)] = state

    return problem


@router.post("/hint")
async def get_dsa_hint(
    session_id: uuid.UUID,
    body: HintRequest,
    db: AsyncSession = Depends(get_db)
):
    """Get a targeted hint for the current problem based on the candidate's code."""
    try:
        state = await _orchestrator.get_state(str(session_id), db)
    except KeyError:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    problem = state.get("current_dsa_problem")
    if not problem:
        raise HTTPException(status_code=400, detail="No active DSA problem in session state.")

    submissions = state.get("dsa_submissions", [])

    # Call agent
    hint = await _dsa_agent.get_hint(
        problem=problem,
        current_code=body.current_code,
        conversation_history=submissions
    )

    # Increment hints used counter
    state["dsa_hints_used"] = state.get("dsa_hints_used", 0) + 1
    _orchestrator._sessions[str(session_id)] = state

    return {"hint": hint}


@router.post("/submit")
async def submit_dsa_solution(
    session_id: uuid.UUID,
    body: SubmitRequest,
    db: AsyncSession = Depends(get_db)
):
    """Submit a solution for evaluation."""
    try:
        state = await _orchestrator.get_state(str(session_id), db)
    except KeyError:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    problem = state.get("current_dsa_problem")
    if not problem:
        raise HTTPException(status_code=400, detail="No active DSA problem in session state.")

    hints_used = state.get("dsa_hints_used", 0)

    # Call DSA agent to evaluate the code
    evaluation = await _dsa_agent.evaluate_submission(
        problem=problem,
        submitted_code=body.code,
        language=body.language,
        verbal_explanation=body.verbal_explanation,
        hints_used=hints_used
    )

    # Append to submissions list
    submissions = list(state.get("dsa_submissions", []))
    submissions.append(evaluation)
    state["dsa_submissions"] = submissions

    # Increment completed problems
    state["dsa_problems_completed"] = state.get("dsa_problems_completed", 0) + 1
    state["dsa_hints_used"] = 0  # reset for next problem

    # Save individual problem transcript to RoundTranscript DB table
    transcript_record = RoundTranscript(
        session_id=session_id,
        round_name="dsa",
        transcript=json.dumps({
            "code": body.code,
            "language": body.language,
            "evaluation": evaluation
        }),
        ai_evaluation=evaluation,
        score=float(evaluation.get("overall_score", 0.0))
    )
    db.add(transcript_record)
    await db.flush()

    # Check if it was the last problem
    total_problems = state.get("dsa_problems_total", 2)
    completed = state["dsa_problems_completed"]

    if body.problem_index >= total_problems - 1 or completed >= total_problems:
        # Last problem completed! Evaluate the whole round
        round_eval = await _dsa_agent.evaluate_round(submissions)
        round_score = float(round_eval.get("score", 0.0))

        # Advance orchestrator state using submit_round_result
        aggregate_transcript = json.dumps(submissions)

        updated_state = await _orchestrator.submit_round_result(
            state=state,
            round_name="dsa",
            transcript=aggregate_transcript,
            score=round_score,
            evaluation=round_eval
        )

        # Update DB session record
        db_session = await db.get(InterviewSession, session_id)
        if db_session:
            db_session.round_scores = updated_state["round_scores"]
            db_session.current_round = RoundName.TECHNICAL
            await db.commit()

        return {
            "evaluation": evaluation,
            "next_problem": None,
            "round_complete": True
        }
    else:
        # Get next problem
        target_role = state.get("target_role", "Software Engineer")
        completed = state.get("dsa_problems_completed", 0)
        if completed == 0:
            difficulty = "medium"
        elif completed == 1:
            difficulty = "medium/hard"
        else:
            difficulty = "hard"
        next_problem = await _dsa_agent.get_problem(
            target_role=target_role,
            difficulty=difficulty,
            resume_text=state.get("resume_text", ""),
            session_id=str(session_id)
        )
        state["current_dsa_problem"] = next_problem
        _orchestrator._sessions[str(session_id)] = state

        # Commit DB session for transcript record
        await db.commit()

        return {
            "evaluation": evaluation,
            "next_problem": next_problem,
            "round_complete": False
        }
