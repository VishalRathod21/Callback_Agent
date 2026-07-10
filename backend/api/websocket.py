import asyncio
import base64
import json
import logging
import os
import sys
import tempfile
import uuid
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.routing import APIRouter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import Candidate, InterviewSession
from agents.orchestrator import InterviewOrchestrator
from agents.dsa_agent import DSAInterviewAgent

router = APIRouter()
logger = logging.getLogger(__name__)

is_testing = "pytest" in sys.modules or os.environ.get("TESTING") == "true"

# Session state store
_sessions: dict = {}
active_sessions = _sessions
_orchestrator = InterviewOrchestrator()
_dsa_agent = DSAInterviewAgent()


def _get_orchestrator():
    return _orchestrator


# Conversation states
STATE_IDLE = "idle"
STATE_AI_SPEAKING = "ai_speaking"
STATE_LISTENING = "listening"
STATE_PROCESSING = "processing"


async def _load_session(db: AsyncSession, session_id: str):
    """Load an InterviewSession from the database by ID."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        return None
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == sid)
    )
    return result.scalar_one_or_none()


async def _load_candidate(db: AsyncSession, candidate_id: str):
    """Load a Candidate from the database by ID."""
    try:
        cid = uuid.UUID(candidate_id)
    except ValueError:
        return None
    result = await db.execute(
        select(Candidate).where(Candidate.id == cid)
    )
    return result.scalar_one_or_none()


@router.websocket("/ws/interview/{session_id}")
async def interview_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    logger.info(f"WS connected: {session_id}")

    # Reconnection / persistence logic
    if session_id in active_sessions:
        sess = active_sessions[session_id]
        # Reset dynamic states
        sess["audio_buf"] = bytearray()
        sess["buf_ms"] = 0
        sess["silence_ms"] = 0
        
        await _send(websocket, {"type": "connected", "session_id": session_id})
        
        # Send session history to restore context
        await _send(websocket, {
            "type": "session_history",
            "round": sess.get("current_round"),
            "current_question": sess.get("current_question"),
            "history": sess.get("conversation_history", [])
        })
    else:
        active_sessions[session_id] = {
            "current_round": None,
            "target_role": "Software Engineer",
            "resume_context": "",
            "conversation_history": [],
            "current_question": "",
            "audio_buf": bytearray(),
            "buf_ms": 0,
            "silence_ms": 0,
            "silence_threshold_ms": 1500,  # 1.5s silence → auto-process
            "state": STATE_IDLE,
        }
        sess = active_sessions[session_id]
        await _send(websocket, {"type": "connected", "session_id": session_id})

    try:
        # Keepalive task
        async def keepalive():
            while True:
                await asyncio.sleep(25)
                try:
                    if session_id in active_sessions:
                        await _send(websocket, {"type": "ping"})
                    else:
                        break
                except:
                    break
        asyncio.create_task(keepalive())

        while True:
            try:
                raw = await asyncio.wait_for(
                    websocket.receive_text(), timeout=120.0
                )
            except asyncio.TimeoutError:
                continue

            try:
                msg = json.loads(raw)
            except:
                continue

            t = msg.get("type", "")

            if t == "ping":
                await _send(websocket, {"type": "pong"})

            elif t == "pong":
                pass

            elif t == "start_round":
                await _start_round(websocket, sess, session_id, msg)

            elif t == "audio_chunk":
                # Only accept audio when in LISTENING state
                if sess["state"] != STATE_LISTENING:
                    continue

                data = msg.get("data", "")
                if not data:
                    continue

                try:
                    chunk = base64.b64decode(data)
                    if len(chunk) < 50:
                        continue
                    sess["audio_buf"].extend(chunk)
                    sess["buf_ms"] += msg.get("duration_ms", 250)
                    sess["silence_ms"] = 0  # reset silence timer on audio

                    # Send interim transcript indicator
                    await _send(websocket, {
                        "type": "audio_received",
                        "buf_ms": sess["buf_ms"]
                    })

                except Exception as e:
                    logger.error(f"Audio chunk error: {e}")

            elif t == "silence_detected":
                # Frontend detected candidate stopped speaking
                if sess["state"] == STATE_LISTENING and len(sess["audio_buf"]) > 500:
                    await _process_candidate_audio(websocket, sess, session_id)

            elif t in ("candidate_text", "typed_answer"):
                # Text fallback — candidate typed instead of speaking
                text = msg.get("text", "").strip()
                if text and sess["state"] == STATE_LISTENING:
                    await _handle_candidate_response(
                        websocket, sess, session_id, text
                    )

            elif t == "end_round":
                await _end_round(websocket, sess, session_id)

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: {session_id}")
    except Exception as e:
        logger.error(f"WS error [{session_id}]: {e}")


async def _start_round(websocket, sess, session_id, msg):
    round_name = msg.get("round", "technical")
    target_role = msg.get("target_role", "Software Engineer")
    resume_ctx = msg.get("resume_context", "")

    # Self-correct target_role and resume_context if missing or default
    if not resume_ctx or target_role == "Software Engineer":
        try:
            from core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as db:
                orch_state = await _orchestrator.get_state(session_id, db)
                if orch_state:
                    if not resume_ctx and orch_state.get("resume_text"):
                        resume_ctx = orch_state.get("resume_text", "")
                    if target_role == "Software Engineer" and orch_state.get("target_role"):
                        target_role = orch_state.get("target_role")

                if not resume_ctx or target_role == "Software Engineer":
                    sess_db = await _load_session(db, session_id)
                    if sess_db and sess_db.candidate_id:
                        cand_db = await _load_candidate(db, str(sess_db.candidate_id))
                        if cand_db:
                            if target_role == "Software Engineer" and cand_db.target_role:
                                target_role = cand_db.target_role
                            if not resume_ctx:
                                from api.routes.interviews import _get_resume_text
                                resume_ctx = await _get_resume_text(cand_db)
        except Exception as e:
            logger.error(f"Could not load orch state or fallback resume_ctx in WS: {e}")

    sess["current_round"] = round_name
    sess["target_role"] = target_role
    sess["resume_context"] = resume_ctx
    sess["conversation_history"] = []
    sess["audio_buf"] = bytearray()
    sess["buf_ms"] = 0
    
    if is_testing:
        sess["state"] = STATE_LISTENING
    else:
        sess["state"] = STATE_AI_SPEAKING

    logger.info(f"Starting round '{round_name}' for {session_id} (Role: {target_role})")

    if not is_testing:
        # Notify frontend: AI is about to speak
        await _send(websocket, {
            "type": "state_change",
            "state": STATE_AI_SPEAKING,
            "message": f"Starting {round_name} round..."
        })

    try:
        agent = _get_agent(websocket.app, round_name)

        if round_name == "technical":
            question = await agent.get_opening_question(
                target_role, resume_ctx, session_id
            )
        else:
            question = await agent.get_opening_question(
                target_role, session_id
            )

        sess["conversation_history"].append({"speaker": "interviewer", "text": question})
        sess["current_question"] = question

        # Send transcript text immediately (instant feedback)
        await _send(websocket, {
            "type": "ai_response",
            "text": question,
            "speaker": "interviewer"
        })

        if not is_testing:
            # Synthesize and stream audio
            await _speak_and_then_listen(websocket, sess, session_id, question)

    except Exception as e:
        logger.error(f"start_round error: {e}")
        await _send(websocket, {
            "type": "error",
            "message": f"Failed to start: {str(e)}"
        })
        sess["state"] = STATE_IDLE


async def _speak_and_then_listen(websocket, sess, session_id, text):
    """
    Core turn-based function:
    1. Synthesize TTS
    2. Send audio to frontend (AI speaks)
    3. Wait for audio to finish playing (estimate duration)
    4. Switch to LISTENING state
    5. Frontend shows LISTENING indicator
    """
    try:
        tts = websocket.app.state.tts
        if tts is not None:
            audio_bytes = await tts.synthesize(text)

            if audio_bytes:
                b64 = base64.b64encode(audio_bytes).decode("utf-8")
                await _send(websocket, {
                    "type": "ai_audio",
                    "data": b64,
                    "format": "wav",
                    # Estimate duration: ~150 words/min, wav is ~32kbps
                    "duration_estimate_ms": max(2000, len(text.split()) * 400)
                })

                # Wait estimated speaking time + small buffer
                speak_ms = max(2000, len(text.split()) * 400)
                await asyncio.sleep(speak_ms / 1000 + 0.5)

        # Switch to LISTENING
        sess["state"] = STATE_LISTENING
        sess["audio_buf"] = bytearray()
        sess["buf_ms"] = 0

        await _send(websocket, {
            "type": "state_change",
            "state": STATE_LISTENING,
            "message": "Your turn — speak now"
        })

    except Exception as e:
        logger.error(f"TTS/speak error: {e}")
        # Even if TTS fails, still switch to listening
        sess["state"] = STATE_LISTENING
        await _send(websocket, {
            "type": "state_change",
            "state": STATE_LISTENING,
            "message": "Your turn — speak now"
        })


async def _process_candidate_audio(websocket, sess, session_id):
    """Process buffered audio → STT → agent → TTS"""
    if sess["state"] != STATE_LISTENING:
        return

    sess["state"] = STATE_PROCESSING
    audio = bytes(sess["audio_buf"])
    sess["audio_buf"] = bytearray()
    sess["buf_ms"] = 0

    await _send(websocket, {
        "type": "state_change",
        "state": STATE_PROCESSING,
        "message": "Processing..."
    })

    try:
        stt = websocket.app.state.stt
        result = await stt.transcribe_bytes(audio)
        text = result.get("text", "").strip()

        if not text or len(text) < 2:
            logger.info("Empty transcription, back to listening")
            sess["state"] = STATE_LISTENING
            await _send(websocket, {
                "type": "state_change",
                "state": STATE_LISTENING,
                "message": "Didn't catch that — please speak again"
            })
            return

        # Send candidate transcript
        await _send(websocket, {
            "type": "transcript",
            "text": text,
            "speaker": "candidate"
        })

        await _handle_candidate_response(websocket, sess, session_id, text)

    except Exception as e:
        logger.error(f"Audio processing error: {e}")
        sess["state"] = STATE_LISTENING
        await _send(websocket, {
            "type": "state_change",
            "state": STATE_LISTENING,
            "message": "Error — please try again"
        })


async def _handle_candidate_response(websocket, sess, session_id, text):
    """Get AI response and speak it"""
    try:
        # Send candidate transcript confirming reception
        await _send(websocket, {
            "type": "transcript",
            "text": text,
            "speaker": "candidate"
        })

        sess["conversation_history"].append({"speaker": "candidate", "text": text})

        round_name = sess.get("current_round", "technical")
        agent = _get_agent(websocket.app, round_name)

        if round_name == "technical":
            response_data = await agent.respond_to_answer(
                sess["conversation_history"], text, sess.get("resume_context", ""), session_id=session_id, target_role=sess.get("target_role", "Software Engineer")
            )
        else:
            response_data = await agent.respond_to_answer(
                sess["conversation_history"], text, session_id=session_id
            )
        ai_text = response_data.get("response", "")
        should_continue = response_data.get("should_continue", True)

        if not ai_text:
            if is_testing:
                sess["state"] = STATE_LISTENING
            return

        sess["conversation_history"].append({"speaker": "interviewer", "text": ai_text})
        sess["current_question"] = ai_text

        if is_testing:
            sess["state"] = STATE_LISTENING
        else:
            sess["state"] = STATE_AI_SPEAKING
            await _send(websocket, {
                "type": "state_change",
                "state": STATE_AI_SPEAKING
            })

        # Send transcript immediately
        await _send(websocket, {
            "type": "ai_response",
            "text": ai_text,
            "speaker": "interviewer"
        })

        if is_testing:
            pass
        elif not should_continue:
            await _send(websocket, {"type": "round_should_end"})
            await _speak_final(websocket, sess, session_id, ai_text)
        else:
            await _speak_and_then_listen(websocket, sess, session_id, ai_text)

    except Exception as e:
        logger.error(f"Response error: {e}")
        sess["state"] = STATE_LISTENING
        if not is_testing:
            await _send(websocket, {
                "type": "state_change",
                "state": STATE_LISTENING,
                "message": "Error — please continue"
            })


async def _speak_final(websocket, sess, session_id, text):
    """Speak final message without switching to listening"""
    try:
        tts = websocket.app.state.tts
        if tts is not None:
            audio_bytes = await tts.synthesize(text)
            if audio_bytes:
                b64 = base64.b64encode(audio_bytes).decode("utf-8")
                await _send(websocket, {
                    "type": "ai_audio",
                    "data": b64,
                    "format": "wav"
                })
    except Exception as e:
        logger.error(f"Final speak error: {e}")


async def _end_round(websocket, sess, session_id):
    round_name = sess.get("current_round")
    if not round_name:
        return
    try:
        agent = _get_agent(websocket.app, round_name)
        transcript = "\n".join(
            f"{'Interviewer' if e['speaker'] == 'interviewer' else 'Candidate'}: {e['text']}"
            for e in sess["conversation_history"]
        )

        if round_name == "technical":
            evaluation = await agent.evaluate_round(
                transcript, target_role=sess.get("target_role", "Software Engineer"), session_id=session_id
            )
        else:
            evaluation = await agent.evaluate_round(
                transcript, session_id=session_id
            )

        # 1. Update the orchestrator state and insert RoundTranscript record in DB
        from datetime import datetime, timezone
        from core.database import AsyncSessionLocal
        from core.models import RoundTranscript, SessionStatus, RoundName as ModelRoundName, Candidate, CandidateStatus

        async with AsyncSessionLocal() as db:
            orch_state = await _orchestrator.get_state(session_id, db)
            new_orch_state = await _orchestrator.submit_round_result(
                orch_state,
                round_name=round_name,
                transcript=transcript,
                score=float(evaluation.get("score", 0)),
                evaluation=evaluation
            )

            # Save the round transcript record
            transcript_record = RoundTranscript(
                session_id=uuid.UUID(session_id),
                round_name=round_name,
                transcript=transcript,
                ai_evaluation=evaluation,
                score=float(evaluation.get("score", 0))
            )
            db.add(transcript_record)
            await db.flush()

            # Update the main session record
            db_session = await db.get(InterviewSession, uuid.UUID(session_id))
            if db_session:
                db_session.round_scores = new_orch_state.get("round_scores", {})
                
                # Check if the orchestrator marked the interview status as complete
                if new_orch_state.get("status") == "complete":
                    db_session.status = SessionStatus.COMPLETED
                    db_session.overall_score = new_orch_state.get("overall_score", 0.0)
                    db_session.ended_at = datetime.now(timezone.utc)
                    
                    # Update candidate status
                    candidate = await db.get(Candidate, db_session.candidate_id)
                    if candidate:
                        candidate.status = CandidateStatus.COMPLETED
                else:
                    # Advance current_round in DB to match orchestrator
                    next_round_str = new_orch_state.get("current_round")
                    if next_round_str:
                        db_session.current_round = ModelRoundName(next_round_str)
                
                db.add(db_session)
            await db.commit()

        # 3. Send round complete message
        await _send(websocket, {
            "type": "round_complete",
            "round": round_name,
            "score": evaluation.get("score", 0),
            "feedback": evaluation.get("feedback", ""),
            "evaluation": evaluation,
            "next_round": new_orch_state.get("current_round")
        })
        
        # 4. Send interview complete message if finalized
        if new_orch_state.get("status") == "complete":
            await _send(websocket, {
                "type": "interview_complete",
                "session_id": session_id,
                "score": new_orch_state.get("overall_score", 0.0)
            })

        sess["state"] = STATE_IDLE

    except Exception as e:
        logger.error(f"end_round error: {e}", exc_info=True)


async def _send(websocket: WebSocket, data: dict):
    await websocket.send_text(json.dumps(data))


def _get_agent(app, round_name: str):
    if round_name == "technical":
        from agents.tech_agent import TechInterviewAgent
        if not hasattr(app.state, "tech_agent"):
            app.state.tech_agent = TechInterviewAgent()
        return app.state.tech_agent
    elif round_name == "hr":
        from agents.hr_agent import HRInterviewAgent
        if not hasattr(app.state, "hr_agent"):
            app.state.hr_agent = HRInterviewAgent()
        return app.state.hr_agent
    raise ValueError(f"Unknown round: {round_name}")


async def _send_tts_audio(websocket, text):
    pass
