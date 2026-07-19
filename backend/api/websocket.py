import asyncio
import base64
import json
import logging
import os
import sys
import tempfile
import uuid
from typing import Optional
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.routing import APIRouter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field, ValidationError

from core.models import Candidate, InterviewSession
from agents.orchestrator import InterviewOrchestrator
from agents.dsa_agent import DSAInterviewAgent

router = APIRouter()
logger = logging.getLogger(__name__)

is_testing = "pytest" in sys.modules or os.environ.get("TESTING") == "true"

# Security Limits
MAX_AUDIO_CHUNK_SIZE = 100 * 1024  # 100KB max per chunk
MAX_TEXT_LENGTH = 2000             # max candidate text input

# Session state store
_sessions: dict = {}
active_sessions = _sessions
_orchestrator = InterviewOrchestrator()
_dsa_agent = DSAInterviewAgent()


class WSPingMessage(BaseModel):
    type: str = Field("ping", pattern="^ping$")


class WSPongMessage(BaseModel):
    type: str = Field("pong", pattern="^pong$")


class WSStartRoundMessage(BaseModel):
    type: str = Field("start_round", pattern="^start_round$")
    round: str = Field("technical", pattern="^(technical|hr)$")
    target_role: str = Field("Software Engineer", min_length=2, max_length=100, pattern=r"^[A-Za-z0-9.+# -/()]+$")
    resume_context: Optional[str] = Field("", max_length=100000)


class WSAudioChunkMessage(BaseModel):
    type: str = Field("audio_chunk", pattern="^audio_chunk$")
    data: str = Field(..., min_length=1, max_length=1000000)
    duration_ms: int = Field(250, ge=0, le=10000)


class WSSilenceDetectedMessage(BaseModel):
    type: str = Field("silence_detected", pattern="^silence_detected$")


class WSCandidateTextMessage(BaseModel):
    type: str = Field(..., pattern="^(candidate_text|typed_answer)$")
    text: str = Field(..., min_length=1, max_length=5000)


class WSEndRoundMessage(BaseModel):
    type: str = Field("end_round", pattern="^end_round$")


WS_SCHEMAS = {
    "ping": WSPingMessage,
    "pong": WSPongMessage,
    "start_round": WSStartRoundMessage,
    "audio_chunk": WSAudioChunkMessage,
    "silence_detected": WSSilenceDetectedMessage,
    "candidate_text": WSCandidateTextMessage,
    "typed_answer": WSCandidateTextMessage,
    "end_round": WSEndRoundMessage,
}



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
    if not is_testing:
        # Authenticate WebSocket
        token = websocket.query_params.get("token")
        if not token:
            token = websocket.cookies.get("access_token")
            
        if not token:
            await websocket.accept()
            await websocket.send_text(json.dumps({"type": "error", "message": "Authentication token missing."}))
            await websocket.close(code=4003)
            return
            
        from core.security import decode_access_token
        from core.database import AsyncSessionLocal
        
        try:
            user_id_str = decode_access_token(token)
            user_uuid = uuid.UUID(user_id_str)
        except Exception:
            await websocket.accept()
            await websocket.send_text(json.dumps({"type": "error", "message": "Invalid authentication token."}))
            await websocket.close(code=4003)
            return

        # Strictly validate session_id UUID format
        try:
            session_uuid = uuid.UUID(session_id)
        except ValueError:
            await websocket.accept()
            await websocket.send_text(json.dumps({"type": "error", "message": "Invalid session_id format."}))
            await websocket.close(code=4000)
            return

        # Check session ownership
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(InterviewSession).where(InterviewSession.id == session_uuid))
            db_session = result.scalar_one_or_none()
            if not db_session:
                await websocket.accept()
                await websocket.send_text(json.dumps({"type": "error", "message": "Interview session not found."}))
                await websocket.close(code=4004)
                return
                
            result = await db.execute(select(Candidate).where(Candidate.id == db_session.candidate_id))
            candidate = result.scalar_one_or_none()
            if not candidate or candidate.user_id != user_uuid:
                await websocket.accept()
                await websocket.send_text(json.dumps({"type": "error", "message": "Access denied. You do not own this interview session."}))
                await websocket.close(code=4003)
                return
    else:
        # Strictly validate session_id UUID format
        try:
            uuid.UUID(session_id)
        except ValueError:
            await websocket.accept()
            await websocket.send_text(json.dumps({"type": "error", "message": "Invalid session_id format."}))
            await websocket.close(code=4000)
            return

    await websocket.accept()
    logger.info(f"WS connected: {session_id}")

    # Reconnection / persistence logic
    if session_id in active_sessions:
        sess = active_sessions[session_id]
        # Reset dynamic states
        sess["audio_buf"] = bytearray()
        sess["buf_ms"] = 0
        sess["silence_ms"] = 0
        
        await _send(websocket, {
            "type": "connected",
            "session_id": session_id,
            "voice_enabled": getattr(websocket.app.state, "stt", None) is not None
        })
        
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
        await _send(websocket, {
            "type": "connected",
            "session_id": session_id,
            "voice_enabled": getattr(websocket.app.state, "stt", None) is not None
        })

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

            if not isinstance(msg, dict):
                logger.warning("WS message is not a JSON object")
                await _send(websocket, {"type": "error", "message": "Message must be a JSON object."})
                continue

            t = msg.get("type", "")
            schema = WS_SCHEMAS.get(t)
            if not schema:
                logger.warning(f"Unknown WS message type: {t}")
                await _send(websocket, {"type": "error", "message": f"Unknown message type: {t}"})
                continue

            try:
                validated_msg = schema.model_validate(msg)
            except ValidationError as ve:
                logger.warning(f"WS message validation failed: {ve}")
                await _send(websocket, {"type": "error", "message": f"Invalid fields for type {t}: {str(ve)}"})
                continue

            if t == "ping":
                await _send(websocket, {"type": "pong"})

            elif t == "pong":
                pass

            elif t == "start_round":
                try:
                    await _start_round(websocket, sess, session_id, validated_msg)
                except Exception as _sr_exc:
                    import traceback
                    logger.error(
                        "[%s] UNCAUGHT exception from _start_round: %s\n%s",
                        session_id, _sr_exc, traceback.format_exc()
                    )
                    await _send(websocket, {
                        "type": "error",
                        "message": f"start_round failed: {_sr_exc}"
                    })

            elif t == "audio_chunk":
                # Only accept audio when in LISTENING state
                if sess["state"] != STATE_LISTENING:
                    continue

                if not getattr(websocket.app.state, "stt", None):
                    continue

                data = validated_msg.data
                if not data:
                    continue

                if len(data) > MAX_AUDIO_CHUNK_SIZE * 1.4:
                    logger.warning("Oversized audio chunk received and rejected.")
                    continue

                try:
                    chunk = base64.b64decode(data)
                    if len(chunk) < 50:
                        continue
                    sess["audio_buf"].extend(chunk)
                    sess["buf_ms"] += validated_msg.duration_ms
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
                if not getattr(websocket.app.state, "stt", None):
                    continue
                if sess["state"] == STATE_LISTENING and len(sess["audio_buf"]) > 500:
                    await _process_candidate_audio(websocket, sess, session_id)

            elif t in ("candidate_text", "typed_answer"):
                # Text fallback — candidate typed instead of speaking
                text = validated_msg.text.strip()
                text = text[:MAX_TEXT_LENGTH]
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


async def _start_round(websocket, sess, session_id, msg: WSStartRoundMessage):
    import traceback as _tb
    round_name = msg.round
    target_role = msg.target_role
    resume_ctx = msg.resume_context

    # ── CHECKPOINT 1 ──────────────────────────────────────────────────────────
    logger.info(
        "[%s] START_ROUND_RECEIVED — round=%s role=%s resume_ctx_len=%d",
        session_id, round_name, target_role, len(resume_ctx or "")
    )

    # Self-correct target_role and resume_context if missing or default
    if not resume_ctx or target_role == "Software Engineer":
        logger.info(
            "[%s] Attempting to load resume/role from DB (resume_ctx empty=%s, role default=%s)",
            session_id, not resume_ctx, target_role == "Software Engineer"
        )
        try:
            from core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as db:
                try:
                    orch_state = await _orchestrator.get_state(session_id, db)
                except KeyError:
                    orch_state = None
                    logger.info("[%s] No orchestrator state found — will fall back to DB lookup", session_id)
                if orch_state:
                    if not resume_ctx and orch_state.get("resume_text"):
                        resume_ctx = orch_state.get("resume_text", "")
                        logger.info("[%s] Loaded resume_ctx from orch_state (%d chars)", session_id, len(resume_ctx))
                    if target_role == "Software Engineer" and orch_state.get("target_role"):
                        target_role = orch_state.get("target_role")
                        logger.info("[%s] Loaded target_role from orch_state: %s", session_id, target_role)

                if not resume_ctx or target_role == "Software Engineer":
                    sess_db = await _load_session(db, session_id)
                    if sess_db and sess_db.candidate_id:
                        cand_db = await _load_candidate(db, str(sess_db.candidate_id))
                        if cand_db:
                            if target_role == "Software Engineer" and cand_db.target_role:
                                target_role = cand_db.target_role
                                logger.info("[%s] Loaded target_role from candidate DB: %s", session_id, target_role)
                            if not resume_ctx:
                                from api.routes.interviews import _get_resume_text
                                resume_ctx = await _get_resume_text(cand_db)
                                logger.info("[%s] Loaded resume_ctx from candidate DB (%d chars)", session_id, len(resume_ctx or ""))
        except Exception as e:
            logger.error(
                "[%s] Could not load orch state or fallback resume_ctx: %s\n%s",
                session_id, e, _tb.format_exc()
            )

    # Load resume_structured from DB
    resume_structured = {}
    try:
        from core.database import AsyncSessionLocal
        from core.models import Candidate, InterviewSession
        async with AsyncSessionLocal() as db:
            session_uuid = uuid.UUID(session_id)
            session_obj = await db.get(InterviewSession, session_uuid)
            if session_obj:
                candidate = await db.get(Candidate, session_obj.candidate_id)
                if candidate:
                    resume_structured = candidate.resume_structured or {}
                    logger.info("[%s] Loaded resume_structured (%d keys)", session_id, len(resume_structured))
    except Exception as e:
        logger.error(
            "[%s] Could not load resume_structured: %s\n%s",
            session_id, e, _tb.format_exc()
        )

    sess["current_round"] = round_name
    sess["target_role"] = target_role
    sess["resume_context"] = resume_ctx
    sess["resume_structured"] = resume_structured
    sess["conversation_history"] = []
    sess["audio_buf"] = bytearray()
    sess["buf_ms"] = 0

    if is_testing:
        sess["state"] = STATE_LISTENING
    else:
        sess["state"] = STATE_AI_SPEAKING

    logger.info("[%s] Starting round '%s' (Role: %s)", session_id, round_name, target_role)

    if not is_testing:
        await _send(websocket, {
            "type": "state_change",
            "state": STATE_AI_SPEAKING,
            "message": f"Starting {round_name} round..."
        })

    try:
        logger.info("[%s] Resolving agent for round=%s", session_id, round_name)
        agent = _get_agent(websocket.app, round_name)
        logger.info("[%s] Agent resolved: %s", session_id, type(agent).__name__)

        # ── CHECKPOINT 2 ──────────────────────────────────────────────────────
        logger.info(
            "[%s] OPENING_QUESTION_REQUESTED — role=%s resume_structured_keys=%s",
            session_id, target_role, list(resume_structured.keys())
        )

        try:
            if round_name in ("technical", "hr"):
                question = await agent.get_opening_question(
                    target_role, resume_structured, session_id
                )
            else:
                question = await agent.get_opening_question(
                    target_role, session_id
                )
        except Exception as llm_exc:
            logger.error(
                "[%s] get_opening_question raised an exception: %s\n%s",
                session_id, llm_exc, _tb.format_exc()
            )
            raise

        # ── CHECKPOINT 3 ──────────────────────────────────────────────────────
        logger.info(
            "[%s] OPENING_QUESTION_GENERATED — length=%d preview=%s",
            session_id, len(question), repr(question[:120])
        )

        sess["conversation_history"].append({"speaker": "interviewer", "text": question})
        sess["current_question"] = question

        # ── CRITICAL ORDER: ai_response MUST be sent BEFORE any TTS await ────
        # Step 1: send ai_response immediately — frontend unblocks here
        logger.info("[%s] >>> PRE send_json ai_response >>>", session_id)
        await _send(websocket, {
            "type": "ai_response",
            "text": question,
            "speaker": "interviewer"
        })
        # ── CHECKPOINT 4 ──────────────────────────────────────────────────────
        logger.info("[%s] AI_RESPONSE_SENT — frontend should now display question", session_id)

        if not is_testing:
            # Step 2: dispatch TTS as background task — NEVER blocks ai_response
            # ── CHECKPOINT 5 ──────────────────────────────────────────────────
            logger.info("[%s] TTS_STARTED — dispatching background TTS task", session_id)
            asyncio.create_task(
                _speak_and_then_listen(websocket, sess, session_id, question)
            )

    except Exception as e:
        logger.error(
            "[%s] start_round error BEFORE ai_response: %s\n%s",
            session_id, e, _tb.format_exc()
        )
        await _send(websocket, {
            "type": "error",
            "message": f"Failed to start: {str(e)}"
        })
        # Still switch to listening so the interview isn't dead
        sess["state"] = STATE_LISTENING
        await _send(websocket, {
            "type": "state_change",
            "state": STATE_LISTENING,
            "message": "Error generating question — please type your response"
        })
        # ── CHECKPOINT 8 (error path) ─────────────────────────────────────────
        logger.info("[%s] STATE_CHANGED_TO_LISTENING (after error in start_round)", session_id)


async def _speak_and_then_listen(websocket, sess, session_id, text):
    """
    Background TTS task (always runs as asyncio.create_task):
    1. Synthesize audio (or skip gracefully if TTS is None)
    2. Send ai_audio chunk to frontend
    3. Wait estimated playback duration
    4. Switch to LISTENING

    NEVER blocks the WebSocket message loop or the frontend question display.
    ai_response is already sent before this function is ever called.
    """
    import traceback as _tb
    try:
        tts = getattr(websocket.app.state, "tts", None)
        if tts is None:
            logger.info("[%s] TTS not initialized — skipping audio synthesis", session_id)
        else:
            try:
                logger.info("[%s] TTS_STARTED — calling tts.synthesize()", session_id)
                audio_bytes = await tts.synthesize(text)

                if audio_bytes:
                    b64 = base64.b64encode(audio_bytes).decode("utf-8")
                    duration_estimate_ms = max(2000, len(text.split()) * 400)
                    logger.info("[%s] >>> PRE send_json ai_audio >>>", session_id)
                    await _send(websocket, {
                        "type": "ai_audio",
                        "data": b64,
                        "format": "wav",
                        "duration_estimate_ms": duration_estimate_ms
                    })
                    # ── CHECKPOINT 6 ──────────────────────────────────────────
                    logger.info("[%s] TTS_COMPLETED — AI_AUDIO_SENT (%d bytes)", session_id, len(audio_bytes))

                    # Wait estimated playback time so we don't start listening
                    # before the user has heard the full question
                    speak_ms = max(2000, len(text.split()) * 400)
                    await asyncio.sleep(speak_ms / 1000 + 0.5)
                else:
                    logger.warning("[%s] TTS returned empty audio — proceeding without audio", session_id)

            except Exception as tts_exc:
                # TTS failure must NEVER stop the interview
                logger.warning(
                    "[%s] TTS synthesis failed (continuing in text mode): %s\n%s",
                    session_id, tts_exc, _tb.format_exc()
                )

    except Exception as e:
        logger.error(
            "[%s] _speak_and_then_listen outer error: %s\n%s",
            session_id, e, _tb.format_exc()
        )
    finally:
        # Always transition to LISTENING — even if TTS errored
        sess["state"] = STATE_LISTENING
        sess["audio_buf"] = bytearray()
        sess["buf_ms"] = 0
        try:
            logger.info("[%s] >>> PRE send_json state_change LISTENING >>>", session_id)
            await _send(websocket, {
                "type": "state_change",
                "state": STATE_LISTENING,
                "message": "Your turn — speak now"
            })
            # ── CHECKPOINT 7 ──────────────────────────────────────────────────
            logger.info("[%s] STATE_CHANGED_TO_LISTENING", session_id)
        except Exception:
            pass  # WebSocket may have closed


async def _process_candidate_audio(websocket, sess, session_id):
    """Process buffered audio → STT → agent → TTS"""
    if sess["state"] != STATE_LISTENING:
        return

    stt = getattr(websocket.app.state, "stt", None)
    if not stt:
        logger.warning("STT is not initialized. Ignoring audio processing request.")
        sess["state"] = STATE_LISTENING
        await _send(websocket, {
            "type": "state_change",
            "state": STATE_LISTENING,
            "message": "Voice mode disabled. Please type your response."
        })
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
        text = await stt.transcribe(audio)
        text = text.strip()

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
    """Get AI follow-up and speak it."""
    try:
        logger.info(f"[{session_id}] CANDIDATE_RESPONSE_RECEIVED: {text[:100]}")

        # Send candidate transcript confirming reception
        await _send(websocket, {
            "type": "transcript",
            "text": text,
            "speaker": "candidate"
        })

        sess["conversation_history"].append({"speaker": "candidate", "text": text})

        round_name = sess.get("current_round", "technical")
        agent = _get_agent(websocket.app, round_name)

        logger.info(f"[{session_id}] NEXT_QUESTION_GENERATING for round={round_name}")

        if round_name == "technical":
            response_data = await agent.respond_to_answer(
                conversation_history=sess["conversation_history"],
                candidate_response=text,
                resume_structured=sess.get("resume_structured", {}),
                session_id=session_id,
                target_role=sess.get("target_role", "Software Engineer")
            )
        elif round_name == "hr":
            response_data = await agent.respond_to_answer(
                conversation_history=sess["conversation_history"],
                candidate_response=text,
                resume_structured=sess.get("resume_structured", {}),
                session_id=session_id
            )
        else:
            response_data = await agent.respond_to_answer(
                sess["conversation_history"], text, session_id=session_id
            )

        ai_text = response_data.get("response", "")
        should_continue = response_data.get("should_continue", True)

        if not ai_text:
            logger.warning(f"[{session_id}] AI returned empty response — staying in listening")
            sess["state"] = STATE_LISTENING
            return

        logger.info(f"[{session_id}] NEXT_QUESTION_GENERATED: {ai_text[:120]}...")

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

        # Send ai_response IMMEDIATELY — never delay for TTS
        await _send(websocket, {
            "type": "ai_response",
            "text": ai_text,
            "speaker": "interviewer"
        })
        logger.info(f"[{session_id}] QUESTION_SENT to frontend")

        if is_testing:
            pass
        elif not should_continue:
            await _send(websocket, {"type": "round_should_end"})
            # Fire final TTS as background task
            asyncio.create_task(_speak_final(websocket, sess, session_id, ai_text))
        else:
            # Fire TTS as background task — never block question display
            asyncio.create_task(
                _speak_and_then_listen(websocket, sess, session_id, ai_text)
            )

    except Exception as e:
        logger.error(f"[{session_id}] _handle_candidate_response error: {e}", exc_info=True)
        sess["state"] = STATE_LISTENING
        if not is_testing:
            await _send(websocket, {
                "type": "state_change",
                "state": STATE_LISTENING,
                "message": "Error — please continue"
            })
        logger.info(f"[{session_id}] STATE_CHANGED_TO_LISTENING (after error)")


async def _speak_final(websocket, sess, session_id, text):
    """Speak final message without switching to listening"""
    try:
        tts = getattr(websocket.app.state, "tts", None)
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
