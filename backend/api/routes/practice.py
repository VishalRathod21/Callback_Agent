from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime

from core.database import AsyncSessionLocal
from core.models import Candidate, InterviewSession, RoundName, SessionStatus, User
from api.routes.auth import get_current_user

router = APIRouter(prefix="/api/practice", tags=["practice"])

# In-memory session store for practice sessions
_practice_sessions: dict = {}  # session_id → session data

class StartRequest(BaseModel):
    topic: str  # "dsa_theory" | "system_design" | "behavioral" | "random"
    target_role: str = "Software Engineer"
    candidate_id: Optional[str] = None  # Optional — for resume-aware questions
    question_count: int = 6

class AnswerRequest(BaseModel):
    session_id: str
    question_id: int
    answer: str

class SavePracticeRequest(BaseModel):
    candidate_id: str
    session_id: str
    topic: str
    average_score: float

@router.post("/start")
async def start_practice(
    request: StartRequest,
    req: Request,
    current_user: User = Depends(get_current_user)
):
    """Start a new quick practice session."""
    
    resume_structured = None
    if request.candidate_id:
        try:
            candidate_uuid = uuid.UUID(request.candidate_id)
            async with AsyncSessionLocal() as db:
                candidate = await db.get(Candidate, candidate_uuid)
                if candidate:
                    if candidate.user_id != current_user.id:
                        raise HTTPException(403, "Access denied. You do not own this candidate record.")
                    resume_structured = candidate.resume_structured
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error loading resume context: {e}")
            pass
    
    # Initialize agent
    from agents.practice_agent import PracticeAgent
    agent = PracticeAgent()
    
    questions = await agent.get_questions(
        topic=request.topic,
        target_role=request.target_role,
        count=request.question_count,
        resume_structured=resume_structured
    )
    
    session_id = str(uuid.uuid4())[:8]
    _practice_sessions[session_id] = {
        "user_id": str(current_user.id),
        "topic": request.topic,
        "target_role": request.target_role,
        "questions": questions,
        "current_index": 0,
        "completed": False,
        "started_at": datetime.utcnow().isoformat()
    }
    
    return {
        "session_id": session_id,
        "topic": request.topic,
        "total_questions": len(questions),
        "first_question": questions[0]
    }

@router.post("/answer")
async def submit_answer(
    request: AnswerRequest,
    req: Request,
    current_user: User = Depends(get_current_user)
):
    """Submit answer for a practice question and get instant feedback."""
    
    session = _practice_sessions.get(request.session_id)
    if not session:
        raise HTTPException(404, "Practice session not found")
    
    if session.get("user_id") != str(current_user.id):
        raise HTTPException(403, "Access denied. You do not own this practice session.")
    
    # Find the question
    questions = session["questions"]
    q = next((q for q in questions if q["id"] == request.question_id), None)
    if not q:
        raise HTTPException(404, "Question not found")
    
    if not request.answer or len(request.answer.strip()) < 5:
        raise HTTPException(400, "Answer too short")
    
    # Evaluate with AI
    from agents.practice_agent import PracticeAgent
    agent = PracticeAgent()
    
    evaluation = await agent.evaluate_answer(
        question=q["question"],
        answer=request.answer,
        topic=session["topic"]
    )
    
    # Update session
    for question in questions:
        if question["id"] == request.question_id:
            question["answered"] = True
            question["score"] = evaluation["score"]
            question["feedback"] = evaluation
            question["candidate_answer"] = request.answer
    
    session["current_index"] = min(
        session["current_index"] + 1,
        len(questions) - 1
    )
    
    # Check if all answered
    all_answered = all(q["answered"] for q in questions)
    session["completed"] = all_answered
    
    # Next question (if any)
    next_q = None
    unanswered = [q for q in questions if not q["answered"]]
    if unanswered:
        next_q = unanswered[0]
    
    # Session summary if done
    summary = None
    if all_answered:
        scores = [q["score"] for q in questions if q["score"] is not None]
        summary = {
            "average_score": round(sum(scores) / len(scores), 1) if scores else 0,
            "total_questions": len(questions),
            "strong": sum(1 for s in scores if s >= 7),
            "decent": sum(1 for s in scores if 4 <= s < 7),
            "needs_work": sum(1 for s in scores if s < 4)
        }
    
    return {
        "evaluation": evaluation,
        "next_question": next_q,
        "session_complete": all_answered,
        "summary": summary
    }

@router.post("/save")
async def save_practice(
    request: SavePracticeRequest,
    current_user: User = Depends(get_current_user)
):
    """Save completed practice session to database."""
    try:
        candidate_uuid = uuid.UUID(request.candidate_id)
    except ValueError:
        raise HTTPException(400, "Invalid candidate ID format")
    
    session_data = _practice_sessions.get(request.session_id)
    if not session_data:
        raise HTTPException(404, "Practice session not found")
        
    if session_data.get("user_id") != str(current_user.id):
        raise HTTPException(403, "Access denied. You do not own this practice session.")
        
    async with AsyncSessionLocal() as db:
        candidate = await db.get(Candidate, candidate_uuid)
        if not candidate:
            raise HTTPException(404, "Candidate not found")
            
        if candidate.user_id != current_user.id:
            raise HTTPException(403, "Access denied. You do not own this candidate record.")
            
        # Map average score to scale of 100
        score_100 = round(request.average_score * 10, 1)
        
        round_scores = {
            "dsa": score_100 if request.topic == "dsa_theory" else 0,
            "technical": score_100 if request.topic == "system_design" else 0,
            "hr": score_100 if request.topic == "behavioral" else 0
        }
        if request.topic == "random":
            round_scores = {
                "dsa": score_100,
                "technical": score_100,
                "hr": score_100
            }
            
        try:
            started_time = datetime.fromisoformat(session_data["started_at"])
        except Exception:
            started_time = datetime.utcnow()

        new_session = InterviewSession(
            candidate_id=candidate_uuid,
            current_round=RoundName.HR,
            round_scores=round_scores,
            overall_score=score_100,
            status=SessionStatus.COMPLETED,
            started_at=started_time,
            ended_at=datetime.utcnow()
        )
        db.add(new_session)
        await db.commit()
        await db.refresh(new_session)
        
    return {"saved": True, "session_id": str(new_session.id)}

@router.get("/{session_id}")
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get current state of a practice session."""
    session = _practice_sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
        
    if session.get("user_id") != str(current_user.id):
        raise HTTPException(403, "Access denied. You do not own this practice session.")
        
    return session
