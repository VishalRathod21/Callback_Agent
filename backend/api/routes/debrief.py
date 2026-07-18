from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy import select
import uuid
from core.database import AsyncSessionLocal
from core.models import Candidate, InterviewSession, RoundTranscript, User
from api.routes.auth import get_current_user
from agents.debrief_agent import DebriefAgent

router = APIRouter(prefix="/api/debrief", tags=["debrief"])

# In-memory conversation store (per candidate, cleared after 2 hours)
_conversations: dict = {}  # candidate_id → list of messages

class ChatRequest(BaseModel):
    candidate_id: str
    message: str

class ChatResponse(BaseModel):
    response: str
    conversation_id: str

@router.get("/{candidate_id}/context")
async def get_debrief_context(
    candidate_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Load all interview data for a candidate.
    Returns: transcript, scores, suggestions for debrief chat.
    """
    try:
        candidate_uuid = uuid.UUID(candidate_id)
    except ValueError:
        raise HTTPException(400, "Invalid candidate ID format")

    async with AsyncSessionLocal() as db:
        # Get candidate
        candidate = await db.get(Candidate, candidate_uuid)
        if not candidate:
            raise HTTPException(404, "Candidate not found")
        
        if candidate.user_id != current_user.id:
            raise HTTPException(403, "Access denied. You do not own this candidate record.")
        
        # Get latest completed session
        result = await db.execute(
            select(InterviewSession)
            .where(InterviewSession.candidate_id == candidate_uuid)
            .where(InterviewSession.status == "completed")
            .order_by(InterviewSession.ended_at.desc())
            .limit(1)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(404, "No completed interview found")
        
        # Get all round transcripts
        trans_result = await db.execute(
            select(RoundTranscript)
            .where(RoundTranscript.session_id == session.id)
            .order_by(RoundTranscript.created_at)
        )
        transcripts = trans_result.scalars().all()
        
        # Get existing conversation or start fresh
        conv_id = str(candidate_id)
        if conv_id not in _conversations:
            _conversations[conv_id] = []
        
        agent = DebriefAgent()  # uses default llm_service
        scores = session.round_scores or {}
        starter_questions = agent.get_starter_questions(scores)
        
        return {
            "candidate_name": candidate.name,
            "target_role": candidate.target_role,
            "overall_score": session.overall_score,
            "round_scores": scores,
            "starter_questions": starter_questions,
            "has_existing_conversation": len(_conversations.get(conv_id, [])) > 0
        }

@router.post("/chat")
async def debrief_chat(
    request: ChatRequest,
    req: Request,
    current_user: User = Depends(get_current_user)
):
    """Send a message to the debrief AI coach."""
    try:
        candidate_uuid = uuid.UUID(request.candidate_id)
    except ValueError:
        raise HTTPException(400, "Invalid candidate ID format")

    async with AsyncSessionLocal() as db:
        candidate = await db.get(Candidate, candidate_uuid)
        if not candidate:
            raise HTTPException(404, "Candidate not found")
        
        if candidate.user_id != current_user.id:
            raise HTTPException(403, "Access denied. You do not own this candidate record.")
        
        result = await db.execute(
            select(InterviewSession)
            .where(InterviewSession.candidate_id == candidate_uuid)
            .where(InterviewSession.status == "completed")
            .order_by(InterviewSession.ended_at.desc())
            .limit(1)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(404, "No completed interview found")
        
        trans_result = await db.execute(
            select(RoundTranscript)
            .where(RoundTranscript.session_id == session.id)
        )
        transcripts = trans_result.scalars().all()
    
    # Get or init conversation
    conv_id = request.candidate_id
    if conv_id not in _conversations:
        _conversations[conv_id] = []
    
    history = _conversations[conv_id]
    
    # Build agent
    agent = DebriefAgent()
    
    # Build context
    context = agent._build_context(
        transcripts=[{
            "round_name": t.round_name,
            "transcript": t.transcript,
            "score": t.score,
            "ai_evaluation": t.ai_evaluation or {}
        } for t in transcripts],
        scores=session.round_scores or {},
        resume_structured=candidate.resume_structured or {},
        evaluation_data={}
    )
    
    # Get AI response
    response_text = await agent.chat(request.message, history, context)
    
    # Update conversation history
    history.append({"role": "user", "content": request.message})
    history.append({"role": "assistant", "content": response_text})
    _conversations[conv_id] = history[-20:]  # keep last 20 messages
    
    return ChatResponse(
        response=response_text,
        conversation_id=conv_id
    )

@router.delete("/{candidate_id}/conversation")
async def clear_conversation(
    candidate_id: str,
    current_user: User = Depends(get_current_user)
):
    """Clear conversation history for a candidate."""
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

    _conversations.pop(candidate_id, None)
    return {"cleared": True}
