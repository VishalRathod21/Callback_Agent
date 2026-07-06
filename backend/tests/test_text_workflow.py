import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from main import app
from api.websocket import active_sessions

def test_text_workflow_and_session_persistence():
    client = TestClient(app)
    
    # Mock objects for Candidate and InterviewSession
    mock_candidate = MagicMock()
    mock_candidate.id = "11111111-1111-1111-1111-111111111111"
    mock_candidate.name = "Test Candidate"
    mock_candidate.target_role = "QA Engineer"
    mock_candidate.status.value = "screened"
    
    mock_session = MagicMock()
    mock_session.id = "22222222-2222-2222-2222-222222222222"
    mock_session.candidate_id = mock_candidate.id
    mock_session.current_round.value = "technical"
    mock_session.status.value = "active"
    mock_session.round_scores = {}
    mock_session.overall_score = 0.0

    session_id = "22222222-2222-2222-2222-222222222222"
    
    # Ensure active_sessions is empty for this session_id initially
    active_sessions.pop(session_id, None)

    # Mock agent for technical round
    mock_agent = MagicMock()
    mock_agent.get_opening_question = AsyncMock(return_value="Hello! Welcome to the technical round.")
    mock_agent.respond_to_answer = AsyncMock(return_value={
        "response": "What are your thoughts on horizontal scaling?",
        "should_continue": True
    })

    # Mock orchestrator
    mock_orch = MagicMock()
    mock_orch.get_state = AsyncMock(return_value={
        "resume_text": "Sample resume context",
        "persona": "Standard",
        "current_round": "technical",
        "status": "active"
    })
    mock_orch.start_session = AsyncMock(return_value={
        "resume_text": "Sample resume context",
        "persona": "Standard"
    })

    with patch("api.websocket._load_session", return_value=mock_session), \
         patch("api.websocket._load_candidate", return_value=mock_candidate), \
         patch("api.websocket._get_orchestrator", return_value=mock_orch), \
         patch("api.websocket._get_agent", return_value=mock_agent), \
         patch("api.websocket._send_tts_audio", new_callable=AsyncMock):
         
        # Connect to websocket
        with client.websocket_connect(f"/ws/interview/{session_id}") as websocket:
            conn_msg = websocket.receive_json()
            assert conn_msg["type"] == "connected"

            # Start round first
            websocket.send_json({
                "type": "start_round",
                "round": "technical",
                "target_role": "QA Engineer"
            })

            # Consume start_round output: ai_response opening question
            start_round_msg = websocket.receive_json()
            assert start_round_msg["type"] == "ai_response"
            assert start_round_msg["text"] == "Hello! Welcome to the technical round."

            # Send typed answer message
            websocket.send_json({
                "type": "typed_answer",
                "text": "I prefer using postgres for structured data."
            })
            
            # Expect transcript confirmation
            transcript_msg = websocket.receive_json()
            assert transcript_msg["type"] == "transcript"
            assert transcript_msg["text"] == "I prefer using postgres for structured data."
            assert transcript_msg["speaker"] == "candidate"

            # Expect ai_response next question
            ai_msg = websocket.receive_json()
            assert ai_msg["type"] == "ai_response"
            assert ai_msg["text"] == "What are your thoughts on horizontal scaling?"
            assert ai_msg["speaker"] == "interviewer"

        # The session should still be in active_sessions since we didn't mark it complete
        assert session_id in active_sessions
        assert active_sessions[session_id]["current_round"] == "technical"
        assert len(active_sessions[session_id]["conversation_history"]) == 3

        # Test Reconnection/Persistence
        with client.websocket_connect(f"/ws/interview/{session_id}") as ws_reconnect:
            # Reconnection should first receive connection message
            conn_msg = ws_reconnect.receive_json()
            assert conn_msg["type"] == "connected"

            # Reconnection should then receive session history message restoring context
            history_msg = ws_reconnect.receive_json()
            assert history_msg["type"] == "session_history"
            assert history_msg["round"] == "technical"
            assert history_msg["current_question"] == "What are your thoughts on horizontal scaling?"
            assert len(history_msg["history"]) == 3
            assert history_msg["history"][0]["text"] == "Hello! Welcome to the technical round."
            assert history_msg["history"][1]["text"] == "I prefer using postgres for structured data."
            assert history_msg["history"][2]["text"] == "What are your thoughts on horizontal scaling?"

    # Clean up
    active_sessions.pop(session_id, None)
