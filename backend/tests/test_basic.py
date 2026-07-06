import os
import tempfile
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import fitz  # PyMuPDF
from fastapi.testclient import TestClient

from services import resume_parser
from agents.resume_screener import ResumeScreenerAgent
from main import app

# ── 1. Test Resume Parser with a real PDF ──────────────────────────────────────

@pytest.mark.asyncio
async def test_resume_parser_pdf():
    # Create a temporary PDF file dynamically using PyMuPDF
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_name = tmp.name
        
    try:
        # Initialize PyMuPDF document
        doc = fitz.open()
        page = doc.new_page()
        # Add sample candidate content
        page.insert_text((50, 100), "Alice Developer\nSenior Backend Engineer\nSkills: Python, Go, Docker, PostgreSQL")
        doc.save(tmp_name)
        doc.close()
        
        # Parse using our service
        parsed = await resume_parser.parse_resume(tmp_name)
        
        assert "Alice Developer" in parsed["raw_text"]
        assert "Go" in parsed["raw_text"]
        assert parsed["pages"] == 1
        assert parsed["word_count"] > 5
        
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


# ── 2. Test ResumeScreenerAgent with Mock LLM ───────────────────────────────

@pytest.mark.asyncio
async def test_resume_screener_agent():
    mock_llm_service = AsyncMock()
    mock_llm_service.generate_json = AsyncMock(return_value={
      "ats_score": 85.0,
      "matched_skills": ["Python", "Docker", "PostgreSQL"],
      "missing_skills": ["Rust"],
      "experience_level": "senior",
      "decision": "pass",
      "reasoning": "Strong match with excellent cloud and backend patterns.",
      "suggested_rounds": ["dsa", "technical", "hr"]
    })
    
    agent = ResumeScreenerAgent(llm_service=mock_llm_service)
    result = await agent.screen("Mock resume text", "Backend Engineer")
    
    assert result["ats_score"] == 85.0
    assert "Python" in result["matched_skills"]
    assert result["decision"] == "pass"
    mock_llm_service.generate_json.assert_called_once()


# ── 3. Test WebSocket Connection with mocked DB checks ──────────────────────────

def test_websocket_ping():
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
    mock_session.current_round.value = "dsa"
    mock_session.status.value = "active"
    mock_session.round_scores = {}
    mock_session.overall_score = 0.0
    
    # Patch database loading functions in api.websocket
    with patch("api.websocket._load_session", return_value=mock_session), \
         patch("api.websocket._load_candidate", return_value=mock_candidate):
         
        # Connect to websocket using dummy session ID
        with client.websocket_connect("/ws/interview/22222222-2222-2222-2222-222222222222") as websocket:
            # Consume the connection confirmation message first
            conn_msg = websocket.receive_json()
            assert conn_msg["type"] == "connected"

            # Send standard ping event
            websocket.send_json({"type": "ping"})
            
            # Expect a pong response
            response = websocket.receive_json()
            assert response == {"type": "pong"}
