import asyncio
import base64
import json
import logging
import os
import tempfile
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.routing import APIRouter

router = APIRouter()
logger = logging.getLogger(__name__)

from agents.orchestrator import InterviewOrchestrator
from agents.dsa_agent import DSAInterviewAgent
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from core.models import Candidate, InterviewSession

_orchestrator = InterviewOrchestrator()
_dsa_agent = DSAInterviewAgent()

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

class CompatDict(dict):
    _ALIASES = {
        "audio_buf": "audio_buffer",
        "audio_buffer": "audio_buf",
        "buf_ms": "buffer_duration_ms",
        "buffer_duration_ms": "buf_ms",
        "processing": "is_processing",
        "is_processing": "processing",
        "history": "conversation_history",
        "conversation_history": "history",
        "round": "current_round",
        "current_round": "round",
        "started": "round_started",
        "round_started": "started",
    }
    
    def __getitem__(self, key):
        if key in self:
            return super().__getitem__(key)
        alias = self._ALIASES.get(key)
        if alias and alias in self:
            return super().__getitem__(alias)
        raise KeyError(key)

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        alias = self._ALIASES.get(key)
        if alias:
            super().__setitem__(alias, value)

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def __contains__(self, key):
        if super().__contains__(key):
            return True
        alias = self._ALIASES.get(key)
        if alias and super().__contains__(alias):
            return True
        return False

# In-memory session state
_sessions: dict = {}
active_sessions = _sessions


@router.websocket("/ws/interview/{session_id}")
async def interview_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    logger.info(f"WS connected: {session_id}")

    # If the session already exists (reconnect), preserve state; otherwise init fresh
    is_reconnect = session_id in _sessions and _sessions[session_id].get("history")
    if not is_reconnect:
        _sessions[session_id] = CompatDict({
            "audio_buf": bytearray(),
            "buf_ms": 0,
            "processing": False,
            "history": [],
            "round": None,
            "started": False,
        })
    sess = _sessions[session_id]

    try:
        # Confirm connection immediately
        await _send(websocket, {
            "type": "connected",
            "session_id": session_id
        })

        # On reconnect, restore frontend state from in-memory history
        if is_reconnect and sess.get("history"):
            from datetime import datetime, timezone
            history_entries = sess["history"]
            history_to_send = []
            last_ai_question = None
            for entry in history_entries:
                role = entry.get("role", "")
                # Support both {role, content} and {role, parts} formats
                text = entry.get("content") or (entry.get("parts", [""])[0] if entry.get("parts") else "")
                speaker = "interviewer" if role in ("interviewer", "model") else "candidate"
                history_to_send.append({
                    "speaker": speaker,
                    "text": text,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
                if speaker == "interviewer":
                    last_ai_question = text
            await _send(websocket, {
                "type": "session_history",
                "round": sess.get("round") or sess.get("current_round"),
                "history": history_to_send,
                "current_question": last_ai_question
            })

        # Keepalive ping loop
        async def ping_loop():
            while True:
                await asyncio.sleep(60)
                try:
                    await _send(websocket, {"type": "ping"})
                except Exception:
                    break

        import sys
        if "pytest" not in sys.modules:
            asyncio.create_task(ping_loop())

        while True:
            try:
                raw = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=120.0
                )
            except asyncio.TimeoutError:
                await _send(websocket, {"type": "ping"})
                continue

            msg = json.loads(raw)
            t = msg.get("type", "")

            if t == "pong":
                continue

            elif t == "ping":
                await _send(websocket, {"type": "pong"})

            elif t == "start_round":
                await _handle_start_round(websocket, sess, session_id, msg)

            elif t == "typed_answer":
                if not sess["started"] or sess["processing"]:
                    continue
                text = msg.get("text", "")
                if text:
                    sess["processing"] = True
                    asyncio.create_task(
                        _process_text(websocket, sess, session_id, text)
                    )

            elif t == "audio_chunk":
                if not sess["started"] or sess["processing"]:
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
                except Exception as e:
                    logger.error(f"Audio chunk error: {e}")

            elif t == "audio_flush":
                # Candidate stopped speaking — process remaining buffer
                if len(sess["audio_buf"]) > 500 and not sess["processing"]:
                    audio = bytes(sess["audio_buf"])
                    sess["audio_buf"] = bytearray()
                    sess["buf_ms"] = 0
                    sess["processing"] = True
                    asyncio.create_task(
                        _process(websocket, sess, session_id, audio)
                    )

            elif t == "end_round":
                await _handle_end_round(websocket, sess, session_id)

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: {session_id}")
    except Exception as e:
        logger.error(f"WS error [{session_id}]: {e}")
    finally:
        if session_id in _sessions:
            if _sessions[session_id].get("status") == "complete":
                _sessions.pop(session_id, None)


async def _handle_start_round(websocket, sess, session_id, msg):
    round_name = msg.get("round", "technical")
    target_role = msg.get("target_role", "Software Engineer")
    resume_ctx = msg.get("resume_context", "")

    sess["round"] = round_name
    sess["started"] = True
    sess["history"] = []
    sess["audio_buf"] = bytearray()
    sess["buf_ms"] = 0
    sess["target_role"] = target_role
    sess["resume_context"] = resume_ctx

    logger.info(f"Starting round '{round_name}' for {session_id}")

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

        sess["history"].append({"role": "interviewer", "content": question})

        # Send text first (instant feedback)
        await _send(websocket, {
            "type": "ai_response",
            "text": question,
            "speaker": "interviewer"
        })

        # Then synthesize and send audio
        await _send_tts(websocket, question)

    except Exception as e:
        logger.error(f"start_round error: {e}")
        await _send(websocket, {
            "type": "error",
            "message": f"Could not start round: {str(e)}"
        })


async def _process(websocket, sess, session_id, audio_bytes):
    """Core pipeline: audio → STT → agent → TTS → send back"""
    try:
        app = websocket.app
        stt = getattr(app.state, "stt", None)
        if stt is None:
            logger.warning("STT service is not initialized.")
            sess["processing"] = False
            return

        # Step 1: Transcribe
        result = await stt.transcribe_bytes(audio_bytes)
        text = result.get("text", "").strip()

        if not text or len(text) < 2:
            logger.info("Empty transcription — skipping")
            sess["processing"] = False
            return

        logger.info(f"Transcribed: '{text}'")

        # Step 2: Send candidate transcript to frontend
        await _send(websocket, {
            "type": "transcript",
            "text": text,
            "speaker": "candidate"
        })

        # Step 3: Get AI response
        sess["history"].append({"role": "candidate", "content": text})

        round_name = sess.get("round", "technical")
        agent = _get_agent(websocket.app, round_name)

        if round_name == "technical":
            response_data = await agent.respond_to_answer(
                sess["history"], text, sess.get("resume_context", ""), session_id=session_id
            )
        else:
            response_data = await agent.respond_to_answer(
                sess["history"], text, session_id=session_id
            )
        ai_text = response_data.get("response", "")
        should_continue = response_data.get("should_continue", True)

        if not ai_text:
            sess["processing"] = False
            return

        sess["history"].append({"role": "interviewer", "content": ai_text})

        # Step 4: Send AI text
        await _send(websocket, {
            "type": "ai_response",
            "text": ai_text,
            "speaker": "interviewer"
        })

        # Step 5: Send TTS audio
        await _send_tts(websocket, ai_text)

        # Step 6: Signal if round should end
        if not should_continue:
            await _send(websocket, {
                "type": "round_should_end",
                "message": "Round is complete when you're ready."
            })

    except Exception as e:
        logger.error(f"Processing error [{session_id}]: {e}")
        await _send(websocket, {
            "type": "error",
            "message": "Processing error — please speak again"
        })
    finally:
        sess["processing"] = False


async def _process_text(websocket, sess, session_id, text):
    """Pipeline for typed user replies: text -> agent -> TTS -> send back"""
    try:
        # Step 1: Send candidate transcript to frontend
        await _send(websocket, {
            "type": "transcript",
            "text": text,
            "speaker": "candidate"
        })

        # Step 2: Get AI response
        sess["history"].append({"role": "candidate", "content": text})

        round_name = sess.get("round", "technical")
        agent = _get_agent(websocket.app, round_name)

        if round_name == "technical":
            response_data = await agent.respond_to_answer(
                sess["history"], text, sess.get("resume_context", ""), session_id=session_id
            )
        else:
            response_data = await agent.respond_to_answer(
                sess["history"], text, session_id=session_id
            )
        ai_text = response_data.get("response", "")
        should_continue = response_data.get("should_continue", True)

        if not ai_text:
            sess["processing"] = False
            return

        sess["history"].append({"role": "interviewer", "content": ai_text})

        # Step 3: Send AI text
        await _send(websocket, {
            "type": "ai_response",
            "text": ai_text,
            "speaker": "interviewer"
        })

        # Step 4: Send TTS audio
        await _send_tts(websocket, ai_text)

        # Step 5: Signal if round should end
        if not should_continue:
            await _send(websocket, {
                "type": "round_should_end",
                "message": "Round is complete when you're ready."
            })

    except Exception as e:
        logger.error(f"Processing text error [{session_id}]: {e}")
        await _send(websocket, {
            "type": "error",
            "message": "Processing error — please type again"
        })
    finally:
        sess["processing"] = False


async def _handle_end_round(websocket, sess, session_id):
    round_name = sess.get("round")
    if not round_name:
        return
    try:
        agent = _get_agent(websocket.app, round_name)
        transcript = "\n".join(
            f"{'Interviewer' if e['role'] == 'interviewer' else 'Candidate'}: {e['content']}"
            for e in sess["history"]
        )
        if round_name == "technical":
            evaluation = await agent.evaluate_round(
                transcript, sess.get("target_role", "Software Engineer"), session_id=session_id
            )
        else:
            evaluation = await agent.evaluate_round(transcript, session_id=session_id)
        await _send(websocket, {
            "type": "round_complete",
            "round": round_name,
            "score": evaluation.get("score", 0),
            "feedback": evaluation.get("feedback", ""),
            "evaluation": evaluation
        })
        sess["started"] = False
    except Exception as e:
        logger.error(f"end_round error: {e}")


async def _send_tts(websocket, text: str):
    """Synthesize TTS and send audio over WebSocket."""
    try:
        tts = getattr(websocket.app.state, "tts", None)
        if tts is None:
            logger.warning("TTS service is not initialized.")
            return
        audio_bytes = await tts.synthesize(text)
        if audio_bytes:
            b64 = base64.b64encode(audio_bytes).decode("utf-8")
            await _send(websocket, {
                "type": "audio",
                "data": b64,
                "format": "wav"
            })
    except Exception as e:
        logger.error(f"TTS send error: {e}")


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


def _get_orchestrator(app=None):
    global _orchestrator
    if app and hasattr(app.state, "orchestrator"):
        return app.state.orchestrator
    return _orchestrator


async def _send_tts_audio(websocket, app, text: str):
    await _send_tts(websocket, text)

