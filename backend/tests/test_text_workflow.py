"""End-to-end text interview over the WebSocket using the real orchestrator with the LLM unavailable.

Verifies: question delivery with turn ids, evaluation events, adaptive difficulty,
round conclusion after the configured number of questions, persistence of
questions and round transcripts, and reconnection history replay.
"""

import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient

from main import app
from api.websocket import active_sessions, _orchestrator
from core.database import AsyncSessionLocal
from core.models import User, Candidate, InterviewSession, SessionStatus, RoundName, InterviewQuestion, RoundTranscript


STRUCT = {"skills": ["Python", "FastAPI", "LangGraph"], "projects": [{"name": "Callback Rehearsal", "description": "AI mock interviews", "tech": ["LangGraph"]}],
          "experience": [], "education": [], "summary": "ML student"}


async def _seed_session(questions_per_round: int = 2, rounds=("technical",)):
    async with AsyncSessionLocal() as db:
        user = User(full_name="WS Tester", email=f"ws-{uuid.uuid4().hex[:6]}@example.com", password_hash="x")
        db.add(user)
        await db.flush()
        cand = Candidate(user_id=user.id, name="WS Tester", email=user.email, target_role="ML Engineer", resume_structured=STRUCT)
        db.add(cand)
        await db.flush()
        cfg = {"rounds": list(rounds), "questions_per_round": questions_per_round, "difficulty": "medium", "mode": "text"}
        sess = InterviewSession(candidate_id=cand.id, status=SessionStatus.ACTIVE, current_round=RoundName(rounds[0]),
                                config=cfg, target_role="ML Engineer", mode="text")
        db.add(sess)
        await db.commit()
        return str(cand.id), str(sess.id), cfg


def test_text_workflow_and_session_persistence():
    client = TestClient(app)
    cid, sid, cfg = asyncio.run(_seed_session(questions_per_round=2))
    active_sessions.pop(sid, None)
    asyncio.run(_orchestrator.start_session(cid, sid, target_role="ML Engineer", resume_structured=STRUCT, config=cfg))

    with client as c:
        with c.websocket_connect(f"/ws/interview/{sid}") as ws:
            assert ws.receive_json()["type"] == "connected"

            ws.send_json({"type": "start_round", "round": "technical"})
            msgs = [ws.receive_json() for _ in range(2)]            # state_change(generating), state_change(speaking) ...
            # drain until the first ai_response
            while msgs[-1]["type"] != "ai_response":
                msgs.append(ws.receive_json())
            first = msgs[-1]
            assert first["speaker"] == "interviewer"
            assert first["turn_id"]
            assert first["question_meta"]["difficulty"] == "medium"
            assert first["question_meta"]["index"] == 0
            assert first["progress"]["questions_per_round"] == 2

            # Answer 1 → transcript, evaluation, next question
            ws.send_json({"type": "typed_answer", "text": "LangGraph lets me model the interview as a state graph with conditional edges between agents."})
            seen = {}
            while "ai_response" not in seen:
                m = ws.receive_json()
                seen[m["type"]] = m
            assert seen["transcript"]["speaker"] == "candidate"
            ev = seen["answer_evaluated"]["evaluation"]
            assert ev["evaluation_source"] in ("heuristic", "llm")
            assert 0 <= ev["overall_score"] <= 10
            assert seen["ai_response"]["question_meta"]["index"] == 1
            # policy acted: weak heuristic score lowers difficulty or keeps it
            assert seen["ai_response"]["question_meta"]["difficulty"] in ("easy", "medium")

            # Answer 2 → round concludes automatically
            ws.send_json({"type": "typed_answer", "text": "I don't know"})
            types = []
            while "round_complete" not in types:
                m = ws.receive_json()
                types.append(m["type"])
                if m["type"] == "round_complete":
                    rc = m
            assert "round_should_end" in types
            assert rc["round"] == "technical"
            assert rc["evaluation"]["questions_answered"] == 2
            assert rc["next_round"] == "complete"
            # single-round config → interview completes
            while True:
                m = ws.receive_json()
                if m["type"] == "interview_complete":
                    break

        # Reconnect replays history
        with c.websocket_connect(f"/ws/interview/{sid}") as ws2:
            assert ws2.receive_json()["type"] == "connected"
            hist = ws2.receive_json()
            assert hist["type"] == "session_history"

    async def _check():
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select
            qs = (await db.execute(select(InterviewQuestion).where(InterviewQuestion.session_id == uuid.UUID(sid)))).scalars().all()
            ts = (await db.execute(select(RoundTranscript).where(RoundTranscript.session_id == uuid.UUID(sid)))).scalars().all()
            s = await db.get(InterviewSession, uuid.UUID(sid))
            return qs, ts, s

    qs, ts, s = asyncio.run(_check())
    assert len(qs) == 2 and all(q.answer_text for q in qs)
    assert {q.evaluation_source for q in qs} <= {"heuristic", "unavailable", "llm"}
    assert len(ts) == 1 and ts[0].round_name == "technical"
    assert s.status == SessionStatus.COMPLETED
    assert s.overall_score is not None
    active_sessions.pop(sid, None)
