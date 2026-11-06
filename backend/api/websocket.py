"""Real-time interview WebSocket.

Protocol (JSON text frames)

Client → server
    ping
    start_round        {round?}                 open the current round (or re-sync after reconnect)
    audio_chunk        {data: base64, duration_ms}
    silence_detected                            flush buffered audio → STT → agent
    candidate_text / typed_answer {text}        text fallback
    playback_finished  {turn_id}                client finished playing interviewer audio
    end_round                                   finalise the round now
    cancel_interview

Server → client
    connected          {session_id, voice_enabled, state, progress}
    session_history    {round, current_question, history, progress}
    state_change       {state, message?, turn_id?}
    ai_response        {text, speaker, turn_id, question_meta}
    ai_audio           {data: base64, format: "mp3", turn_id}
    transcript         {text, speaker, turn_id}
    answer_evaluated   {turn_id, evaluation (compact), difficulty, progress}
    round_should_end
    round_complete     {round, score, result, next_round}
    interview_complete {session_id, score}
    error              {message, code?}

Interview states: initializing, listening, processing, generating, speaking,
waiting, completed, error.  Every interviewer turn carries a ``turn_id`` so
clients can ignore duplicates and tell the server when playback finished.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.routing import APIRouter
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import Candidate, InterviewSession
from core.timeutil import seconds_between
from agents.orchestrator import InterviewOrchestrator
from agents.dsa_agent import DSAInterviewAgent

router = APIRouter()
logger = logging.getLogger(__name__)

is_testing = "pytest" in sys.modules or os.environ.get("TESTING") == "true"

MAX_AUDIO_CHUNK_SIZE = 100 * 1024
MAX_TEXT_LENGTH = 5000
MAX_PLAYBACK_WAIT_S = 45.0

# ── Interview states ──────────────────────────────────────────────────────────
STATE_INITIALIZING = "initializing"
STATE_LISTENING = "listening"
STATE_PROCESSING = "processing"
STATE_GENERATING = "generating"
STATE_SPEAKING = "speaking"
STATE_WAITING = "waiting"
STATE_COMPLETED = "completed"
STATE_ERROR = "error"
# legacy aliases (older clients)
STATE_IDLE = STATE_INITIALIZING
STATE_AI_SPEAKING = STATE_SPEAKING

# Session store: session_id → live connection state
_sessions: dict = {}
active_sessions = _sessions
_orchestrator = InterviewOrchestrator()
_dsa_agent = DSAInterviewAgent()


def _get_orchestrator() -> InterviewOrchestrator:
    return _orchestrator


# ── Inbound message schemas ───────────────────────────────────────────────────
class WSPingMessage(BaseModel):
    type: str = Field("ping", pattern="^ping$")


class WSPongMessage(BaseModel):
    type: str = Field("pong", pattern="^pong$")


class WSStartRoundMessage(BaseModel):
    type: str = Field("start_round", pattern="^start_round$")
    round: Optional[str] = Field(None, pattern="^(technical|hr|dsa)$")
    target_role: Optional[str] = Field(None, min_length=2, max_length=100, pattern=r"^[A-Za-z0-9.+# -/()]+$")
    resume_context: Optional[str] = Field("", max_length=100000)


class WSAudioChunkMessage(BaseModel):
    type: str = Field("audio_chunk", pattern="^audio_chunk$")
    data: str = Field(..., min_length=1, max_length=1000000)
    duration_ms: int = Field(250, ge=0, le=10000)


class WSSilenceDetectedMessage(BaseModel):
    type: str = Field("silence_detected", pattern="^silence_detected$")


class WSCandidateTextMessage(BaseModel):
    type: str = Field(..., pattern="^(candidate_text|typed_answer)$")
    text: str = Field(..., min_length=1, max_length=MAX_TEXT_LENGTH)


class WSPlaybackFinishedMessage(BaseModel):
    type: str = Field("playback_finished", pattern="^playback_finished$")
    turn_id: Optional[str] = Field(None, max_length=64)


class WSEndRoundMessage(BaseModel):
    type: str = Field("end_round", pattern="^end_round$")


class WSCancelMessage(BaseModel):
    type: str = Field("cancel_interview", pattern="^cancel_interview$")


WS_SCHEMAS = {
    "ping": WSPingMessage,
    "pong": WSPongMessage,
    "start_round": WSStartRoundMessage,
    "audio_chunk": WSAudioChunkMessage,
    "silence_detected": WSSilenceDetectedMessage,
    "candidate_text": WSCandidateTextMessage,
    "typed_answer": WSCandidateTextMessage,
    "playback_finished": WSPlaybackFinishedMessage,
    "end_round": WSEndRoundMessage,
    "cancel_interview": WSCancelMessage,
}


# ── DB helpers ────────────────────────────────────────────────────────────────
async def _load_session(db: AsyncSession, session_id: str):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        return None
    result = await db.execute(select(InterviewSession).where(InterviewSession.id == sid))
    return result.scalar_one_or_none()


async def _load_candidate(db: AsyncSession, candidate_id: str):
    try:
        cid = uuid.UUID(candidate_id)
    except ValueError:
        return None
    result = await db.execute(select(Candidate).where(Candidate.id == cid))
    return result.scalar_one_or_none()


async def _send(websocket: WebSocket, data: dict) -> None:
    try:
        await websocket.send_text(json.dumps(data, default=str))
    except Exception:  # connection may be gone
        raise


async def _set_state(websocket, sess, state: str, message: str | None = None, turn_id: str | None = None) -> None:
    sess["state"] = state
    payload = {"type": "state_change", "state": state}
    if message:
        payload["message"] = message
    if turn_id:
        payload["turn_id"] = turn_id
    try:
        await _send(websocket, payload)
    except Exception:
        pass


def _compact_evaluation(ev: dict | None) -> dict | None:
    if not ev:
        return None
    keys = ("technical_correctness", "conceptual_understanding", "answer_completeness", "communication_clarity",
            "overall_score", "feedback", "next_difficulty", "evaluation_source", "difficulty")
    out = {k: ev.get(k) for k in keys}
    out["policy"] = (ev.get("policy_decision") or {}).get("reason")
    return out


def _question_meta(record: dict | None) -> dict | None:
    if not record:
        return None
    return {
        "index": record.get("index"),
        "category": record.get("category"),
        "difficulty": record.get("difficulty"),
        "is_follow_up": record.get("is_follow_up"),
        "generation_source": record.get("generation_source"),
        "retrieval_sources": record.get("retrieval_sources", []),
    }


# ── Endpoint ──────────────────────────────────────────────────────────────────
@router.websocket("/ws/interview/{session_id}")
async def interview_ws(websocket: WebSocket, session_id: str):
    # Validate session id format first
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        await websocket.accept()
        await _send(websocket, {"type": "error", "message": "Invalid session_id format.", "code": 4000})
        await websocket.close(code=4000)
        return

    if not is_testing:
        token = websocket.query_params.get("token") or websocket.cookies.get("access_token")
        if not token:
            await websocket.accept()
            await _send(websocket, {"type": "error", "message": "Authentication token missing.", "code": 4003})
            await websocket.close(code=4003)
            return
        from core.security import decode_access_token
        from core.database import AsyncSessionLocal

        try:
            user_uuid = uuid.UUID(decode_access_token(token))
        except Exception:
            await websocket.accept()
            await _send(websocket, {"type": "error", "message": "Invalid authentication token.", "code": 4003})
            await websocket.close(code=4003)
            return

        async with AsyncSessionLocal() as db:
            db_session = await _load_session(db, session_id)
            if not db_session:
                await websocket.accept()
                await _send(websocket, {"type": "error", "message": "Interview session not found.", "code": 4004})
                await websocket.close(code=4004)
                return
            candidate = await _load_candidate(db, str(db_session.candidate_id))
            if not candidate or candidate.user_id != user_uuid:
                await websocket.accept()
                await _send(websocket, {"type": "error", "message": "Access denied. You do not own this interview session.", "code": 4003})
                await websocket.close(code=4003)
                return

    await websocket.accept()
    logger.info("WS connected: %s", session_id)
    voice_enabled = getattr(websocket.app.state, "stt", None) is not None

    orch = _get_orchestrator()
    orch_state = None
    try:
        orch_state = await orch.get_state(session_id)
    except Exception as exc:  # session may not exist in tests
        logger.info("[%s] orchestrator state unavailable on connect: %s", session_id, exc)

    if session_id in active_sessions:
        sess = active_sessions[session_id]
        sess.update({"audio_buf": bytearray(), "buf_ms": 0, "ws_generation": sess.get("ws_generation", 0) + 1})
        await _send(websocket, {"type": "connected", "session_id": session_id, "voice_enabled": voice_enabled,
                                "state": sess["state"], "progress": orch.progress(orch_state) if orch_state else None})
        await _send(websocket, {
            "type": "session_history",
            "round": sess.get("current_round"),
            "current_question": sess.get("current_question"),
            "history": sess.get("conversation_history", []),
            "progress": orch.progress(orch_state) if orch_state else None,
        })
        # Re-arm listening if a question is pending and we were mid-turn
        if sess.get("current_question") and sess["state"] in (STATE_SPEAKING, STATE_WAITING, STATE_LISTENING):
            await _set_state(websocket, sess, STATE_LISTENING, "Your turn — speak or type your answer", sess.get("turn_id"))
    else:
        sess = active_sessions[session_id] = {
            "current_round": orch_state.get("current_round") if orch_state else None,
            "target_role": orch_state.get("target_role") if orch_state else "Software Engineer",
            "conversation_history": list(orch_state.get("conversation_history", [])) if orch_state else [],
            "current_question": (orch_state.get("questions") or [{}])[-1].get("question") if orch_state and orch_state.get("questions") else "",
            "audio_buf": bytearray(),
            "buf_ms": 0,
            "state": STATE_INITIALIZING,
            "turn_id": None,
            "turn_seq": 0,
            "playback_event": None,
            "ws_generation": 0,
            "round_started_at": None,
        }
        await _send(websocket, {"type": "connected", "session_id": session_id, "voice_enabled": voice_enabled,
                                "state": STATE_INITIALIZING, "progress": orch.progress(orch_state) if orch_state else None})

    lock = orch.lock_for(session_id)
    keepalive_task = asyncio.create_task(_keepalive(websocket, session_id))

    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=120.0)
            except asyncio.TimeoutError:
                continue
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if not isinstance(msg, dict):
                await _send(websocket, {"type": "error", "message": "Message must be a JSON object."})
                continue

            t = msg.get("type", "")
            schema = WS_SCHEMAS.get(t)
            if not schema:
                await _send(websocket, {"type": "error", "message": f"Unknown message type: {t}"})
                continue
            try:
                validated = schema.model_validate(msg)
            except ValidationError as ve:
                await _send(websocket, {"type": "error", "message": f"Invalid fields for type {t}: {ve.errors()[0].get('msg', 'validation error')}"})
                continue

            if t == "ping":
                await _send(websocket, {"type": "pong"})
            elif t == "pong":
                pass
            elif t == "start_round":
                if lock.locked():
                    continue
                async with lock:
                    await _start_round(websocket, sess, session_id, validated)
            elif t == "audio_chunk":
                if sess["state"] != STATE_LISTENING or not voice_enabled:
                    continue
                if len(validated.data) > MAX_AUDIO_CHUNK_SIZE * 1.4:
                    continue
                try:
                    chunk = base64.b64decode(validated.data)
                    if len(chunk) >= 50:
                        sess["audio_buf"].extend(chunk)
                        sess["buf_ms"] += validated.duration_ms
                        await _send(websocket, {"type": "audio_received", "buf_ms": sess["buf_ms"]})
                except Exception as e:
                    logger.error("Audio chunk error: %s", e)
            elif t == "silence_detected":
                if not voice_enabled or sess["state"] != STATE_LISTENING or len(sess["audio_buf"]) <= 500:
                    continue
                if lock.locked():
                    continue
                async with lock:
                    await _process_candidate_audio(websocket, sess, session_id)
            elif t in ("candidate_text", "typed_answer"):
                text = validated.text.strip()[:MAX_TEXT_LENGTH]
                if not text or sess["state"] != STATE_LISTENING:
                    continue
                if lock.locked():
                    await _send(websocket, {"type": "error", "message": "Still processing your previous answer."})
                    continue
                async with lock:
                    await _handle_candidate_response(websocket, sess, session_id, text)
            elif t == "playback_finished":
                ev = sess.get("playback_event")
                if ev and (validated.turn_id is None or validated.turn_id == sess.get("turn_id")):
                    ev.set()
            elif t == "end_round":
                async with lock:
                    await _end_round(websocket, sess, session_id)
            elif t == "cancel_interview":
                async with lock:
                    await _cancel_interview(websocket, sess, session_id)

    except WebSocketDisconnect:
        logger.info("WS disconnected: %s", session_id)
    except Exception as e:
        logger.error("WS error [%s]: %s", session_id, e, exc_info=True)
    finally:
        keepalive_task.cancel()


async def _keepalive(websocket: WebSocket, session_id: str) -> None:
    try:
        while True:
            await asyncio.sleep(25)
            if session_id not in active_sessions:
                break
            await _send(websocket, {"type": "ping"})
    except Exception:
        return


# ── Round control ─────────────────────────────────────────────────────────────
async def _start_round(websocket, sess, session_id, msg: WSStartRoundMessage):
    orch = _get_orchestrator()
    try:
        state = await orch.get_state(session_id)
    except Exception as exc:
        logger.error("[%s] cannot start round, no orchestrator state: %s", session_id, exc)
        await _send(websocket, {"type": "error", "message": "Interview session is not initialised. Start it from the setup page."})
        await _set_state(websocket, sess, STATE_ERROR, "Session not initialised")
        return

    if state.get("status") in ("complete", "cancelled") or state.get("current_round") == "complete":
        await _set_state(websocket, sess, STATE_COMPLETED, "Interview already complete")
        await _send(websocket, {"type": "interview_complete", "session_id": session_id, "score": state.get("overall_score", 0.0)})
        return

    round_name = state.get("current_round")
    if msg.round and msg.round != round_name:
        logger.info("[%s] client asked for round %s but orchestrator is at %s — using orchestrator", session_id, msg.round, round_name)
    if round_name == "dsa":
        await _send(websocket, {"type": "error", "message": "The DSA round runs in the coding workspace, not the voice room.", "code": "dsa_round"})
        await _send(websocket, {"type": "state_change", "state": STATE_WAITING, "message": "Open the coding workspace for the DSA round",
                                "redirect": "dsa"})
        return

    sess["current_round"] = round_name
    sess["target_role"] = state.get("target_role", "Software Engineer")
    sess["audio_buf"] = bytearray()
    sess["buf_ms"] = 0
    if not sess.get("round_started_at"):
        sess["round_started_at"] = datetime.now(timezone.utc).isoformat()

    await _set_state(websocket, sess, STATE_GENERATING, f"Preparing the {round_name} round…")
    try:
        opened = await orch.open_round(session_id)
    except Exception as exc:
        logger.error("[%s] open_round failed: %s", session_id, exc, exc_info=True)
        await _send(websocket, {"type": "error", "message": f"Failed to start: {exc}"})
        await _set_state(websocket, sess, STATE_LISTENING, "Error generating the question — please type your response")
        return

    question = opened["question"]
    state = await orch.get_state(session_id)
    sess["conversation_history"] = list(state.get("conversation_history", []))
    sess["current_question"] = question
    await _speak_turn(websocket, sess, session_id, question, opened.get("record"), orch.progress(state), final=False)


async def _speak_turn(websocket, sess, session_id, text: str, record: dict | None, progress: dict | None, final: bool):
    """Send the interviewer text immediately, then audio, then move to listening (or completed)."""
    sess["turn_seq"] = sess.get("turn_seq", 0) + 1
    turn_id = f"{session_id[:8]}-{sess['turn_seq']}"
    sess["turn_id"] = turn_id
    await _set_state(websocket, sess, STATE_SPEAKING, None, turn_id)
    await _send(websocket, {"type": "ai_response", "text": text, "speaker": "interviewer", "turn_id": turn_id,
                            "question_meta": _question_meta(record), "progress": progress})
    if is_testing:
        if not final:
            sess["state"] = STATE_LISTENING
        return
    asyncio.create_task(_speak_and_then_listen(websocket, sess, session_id, text, turn_id, final))


async def _speak_and_then_listen(websocket, sess, session_id, text, turn_id, final: bool):
    """Background: synthesise audio, wait for client playback (bounded), then LISTENING."""
    try:
        tts = getattr(websocket.app.state, "tts", None)
        if tts is not None:
            try:
                audio_bytes = await tts.synthesize(text)
                if audio_bytes and sess.get("turn_id") == turn_id:
                    ev = asyncio.Event()
                    sess["playback_event"] = ev
                    await _send(websocket, {"type": "ai_audio", "data": base64.b64encode(audio_bytes).decode("utf-8"),
                                            "format": "mp3", "turn_id": turn_id,
                                            "duration_estimate_ms": max(1500, len(text.split()) * 380)})
                    # Wait for the client to confirm playback (or a bounded estimate as safety net)
                    est = min(MAX_PLAYBACK_WAIT_S, 2.0 + len(text.split()) * 0.45)
                    try:
                        await asyncio.wait_for(ev.wait(), timeout=est + 5.0)
                    except asyncio.TimeoutError:
                        logger.info("[%s] playback_finished not received for %s; continuing", session_id, turn_id)
            except Exception as tts_exc:
                logger.warning("[%s] TTS failed (text mode continues): %s", session_id, tts_exc)
    except Exception as e:
        logger.error("[%s] _speak_and_then_listen error: %s", session_id, e)
    finally:
        if sess.get("turn_id") != turn_id:
            return  # a newer turn superseded this one
        sess["playback_event"] = None
        if final:
            return
        sess["audio_buf"] = bytearray()
        sess["buf_ms"] = 0
        await _set_state(websocket, sess, STATE_LISTENING, "Your turn — speak or type your answer", turn_id)


async def _process_candidate_audio(websocket, sess, session_id):
    stt = getattr(websocket.app.state, "stt", None)
    if not stt or sess["state"] != STATE_LISTENING:
        return
    audio = bytes(sess["audio_buf"])
    sess["audio_buf"] = bytearray()
    sess["buf_ms"] = 0
    await _set_state(websocket, sess, STATE_PROCESSING, "Transcribing…")
    started = datetime.now(timezone.utc)
    try:
        text = (await stt.transcribe(audio) or "").strip()
        latency_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
        if len(text) < 2:
            await _set_state(websocket, sess, STATE_LISTENING, "Didn't catch that — please speak again", sess.get("turn_id"))
            return
        await _send(websocket, {"type": "transcript", "text": text, "speaker": "candidate", "turn_id": sess.get("turn_id"),
                                "stt_latency_ms": latency_ms})
        await _handle_candidate_response(websocket, sess, session_id, text, transcript_already_sent=True)
    except Exception as e:
        logger.error("Audio processing error: %s", e)
        await _set_state(websocket, sess, STATE_LISTENING, "Error — please try again", sess.get("turn_id"))


async def _handle_candidate_response(websocket, sess, session_id, text, transcript_already_sent: bool = False):
    orch = _get_orchestrator()
    try:
        if not transcript_already_sent:
            await _send(websocket, {"type": "transcript", "text": text, "speaker": "candidate", "turn_id": sess.get("turn_id")})
        sess["conversation_history"].append({"speaker": "candidate", "text": text})
        await _set_state(websocket, sess, STATE_PROCESSING, "Evaluating your answer…")

        result = await orch.submit_answer(session_id, text)
        evaluation = result.get("evaluation")
        await _send(websocket, {"type": "answer_evaluated", "turn_id": sess.get("turn_id"),
                                "evaluation": _compact_evaluation(evaluation),
                                "difficulty": result.get("current_difficulty"), "progress": result.get("progress")})

        state = await orch.get_state(session_id)
        sess["conversation_history"] = list(state.get("conversation_history", []))

        if result.get("round_should_end"):
            closing = result.get("closing_message") or "Thank you — that completes this round."
            sess["current_question"] = ""
            await _send(websocket, {"type": "round_should_end"})
            await _speak_turn(websocket, sess, session_id, closing, None, result.get("progress"), final=True)
            # Finalise immediately so the client doesn't depend on a follow-up message
            await _end_round(websocket, sess, session_id)
            return

        await _set_state(websocket, sess, STATE_GENERATING, "Preparing the next question…")
        question = result.get("question") or ""
        if not question:
            await _set_state(websocket, sess, STATE_LISTENING, "Please continue", sess.get("turn_id"))
            return
        sess["current_question"] = question
        await _speak_turn(websocket, sess, session_id, question, result.get("record"), result.get("progress"), final=False)
    except Exception as e:
        logger.error("[%s] _handle_candidate_response error: %s", session_id, e, exc_info=True)
        await _set_state(websocket, sess, STATE_LISTENING, "Error — please continue", sess.get("turn_id"))


async def _end_round(websocket, sess, session_id):
    orch = _get_orchestrator()
    round_name = sess.get("current_round")
    try:
        state = await orch.get_state(session_id)
    except Exception as exc:
        await _send(websocket, {"type": "error", "message": f"Cannot finalise: {exc}"})
        return
    round_name = round_name or state.get("current_round")
    if not round_name or round_name == "complete":
        return
    if sess.get("ending"):
        return
    sess["ending"] = True
    try:
        await _set_state(websocket, sess, STATE_PROCESSING, "Compiling the round evaluation…")
        result = await orch.finalize_round(session_id)
        round_result = result.get("round_result") or {}
        await _persist_round(session_id, round_name, round_result, result, sess)

        await _send(websocket, {
            "type": "round_complete", "round": round_name,
            "score": round_result.get("score"), "feedback": round_result.get("feedback", ""),
            "evaluation": {k: v for k, v in round_result.items() if k not in ("questions", "transcript")},
            "next_round": result.get("next_round"),
        })
        sess["current_question"] = ""
        sess["conversation_history"] = []
        sess["round_started_at"] = None
        if result.get("status") == "complete":
            await _set_state(websocket, sess, STATE_COMPLETED, "Interview complete")
            await _send(websocket, {"type": "interview_complete", "session_id": session_id, "score": result.get("overall_score", 0.0)})
        else:
            sess["current_round"] = result.get("next_round")
            await _set_state(websocket, sess, STATE_WAITING, f"Next round: {result.get('next_round')}")
    except Exception as e:
        logger.error("end_round error: %s", e, exc_info=True)
        await _send(websocket, {"type": "error", "message": "Failed to finalise the round."})
    finally:
        sess["ending"] = False


async def _persist_round(session_id: str, round_name: str, round_result: dict, finalize_result: dict, sess: dict) -> None:
    """Write RoundTranscript + session progress to the database."""
    from core.database import AsyncSessionLocal
    from core.models import RoundTranscript, SessionStatus, RoundName as ModelRoundName, CandidateStatus

    try:
        async with AsyncSessionLocal() as db:
            sid = uuid.UUID(session_id)
            db_session = await db.get(InterviewSession, sid)
            if db_session is None:
                return
            transcript_text = round_result.get("transcript") or "\n".join(
                f"{'Interviewer' if e['speaker'] == 'interviewer' else 'Candidate'}: {e['text']}" for e in sess.get("conversation_history", [])
            )
            db.add(RoundTranscript(
                session_id=sid, round_name=round_name, transcript=transcript_text,
                ai_evaluation={k: v for k, v in round_result.items() if k not in ("questions", "transcript")},
                score=round_result.get("score"),
            ))
            db_session.round_scores = finalize_result.get("round_scores", {})
            db_session.total_questions = (db_session.total_questions or 0) + int(round_result.get("questions_answered") or len(round_result.get("questions") or []))
            if finalize_result.get("status") == "complete":
                db_session.status = SessionStatus.COMPLETED
                db_session.overall_score = finalize_result.get("overall_score", 0.0)
                db_session.ended_at = datetime.now(timezone.utc)
                db_session.duration_seconds = seconds_between(db_session.started_at, db_session.ended_at)
                candidate = await db.get(Candidate, db_session.candidate_id)
                if candidate:
                    candidate.status = CandidateStatus.COMPLETED
            else:
                nxt = finalize_result.get("next_round")
                if nxt in ("dsa", "technical", "hr"):
                    db_session.current_round = ModelRoundName(nxt)
            await db.commit()
    except Exception as exc:
        logger.error("[%s] failed to persist round %s: %s", session_id, round_name, exc, exc_info=True)


async def _cancel_interview(websocket, sess, session_id):
    orch = _get_orchestrator()
    try:
        await orch.cancel_session(session_id)
        from core.database import AsyncSessionLocal
        from core.models import SessionStatus
        async with AsyncSessionLocal() as db:
            db_session = await db.get(InterviewSession, uuid.UUID(session_id))
            if db_session and db_session.status != SessionStatus.COMPLETED:
                db_session.status = SessionStatus.CANCELLED
                db_session.ended_at = datetime.now(timezone.utc)
                await db.commit()
        await _set_state(websocket, sess, STATE_COMPLETED, "Interview cancelled")
        await _send(websocket, {"type": "interview_cancelled", "session_id": session_id})
    except Exception as exc:
        logger.error("[%s] cancel failed: %s", session_id, exc)


def _get_agent(app, round_name: str):
    """Legacy accessor retained for compatibility (persona agents)."""
    if round_name == "technical":
        from agents.tech_agent import TechInterviewAgent
        if not hasattr(app.state, "tech_agent"):
            app.state.tech_agent = TechInterviewAgent()
        return app.state.tech_agent
    if round_name == "hr":
        from agents.hr_agent import HRInterviewAgent
        if not hasattr(app.state, "hr_agent"):
            app.state.hr_agent = HRInterviewAgent()
        return app.state.hr_agent
    raise ValueError(f"Unknown round: {round_name}")


async def _send_tts_audio(websocket, text):  # legacy no-op kept for tests that patch it
    return None
