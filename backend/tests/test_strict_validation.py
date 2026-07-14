import pytest
import uuid
import re
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from main import app
from api.routes.auth import get_current_user
from core.database import get_db
from core.models import User, InterviewSession, Candidate

# ── 1. Signup / User Schema Strict Validation Tests ──────────────────────────────

@patch("api.routes.auth.get_db")
def test_signup_invalid_name(mock_get_db):
    client = TestClient(app)
    # name containing numbers should fail
    response = client.post("/api/auth/signup", json={
        "full_name": "Alice123",
        "email": "alice@example.com",
        "password": "Password123!",
        "password_confirm": "Password123!"
    })
    assert response.status_code == 422
    assert "full name contains invalid characters" in response.text.lower()

    # name with leading/trailing spaces should fail
    response = client.post("/api/auth/signup", json={
        "full_name": " Alice ",
        "email": "alice@example.com",
        "password": "Password123!",
        "password_confirm": "Password123!"
    })
    assert response.status_code == 422
    assert "cannot have leading or trailing spaces" in response.text.lower()


# ── 2. Candidate Upload Strict Validation Tests ───────────────────────────────────

@patch("api.routes.candidates.get_db")
def test_candidate_upload_invalid_inputs(mock_get_db):
    # Setup dependency override for auth
    mock_user = User(
        id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        full_name="Test User",
        email="test@example.com",
        is_verified=True,
        is_active=True
    )
    app.dependency_overrides[get_current_user] = lambda: mock_user

    try:
        client = TestClient(app)
        
        # 1. Invalid name
        response = client.post("/api/candidates/upload", data={
            "name": "InvalidName456",
            "email": "bob@example.com",
            "target_role": "Software Engineer"
        }, files={"resume": ("resume.pdf", b"%PDF-pdf_content", "application/pdf")})
        assert response.status_code == 400
        assert "name contains invalid characters" in response.json()["detail"].lower()

        # 2. Invalid email
        response = client.post("/api/candidates/upload", data={
            "name": "Bob Smith",
            "email": "not-an-email",
            "target_role": "Software Engineer"
        }, files={"resume": ("resume.pdf", b"%PDF-pdf_content", "application/pdf")})
        assert response.status_code == 400
        assert "invalid email address format" in response.json()["detail"].lower()

        # 3. Invalid target role
        response = client.post("/api/candidates/upload", data={
            "name": "Bob Smith",
            "email": "bob@example.com",
            "target_role": "Invalid_Role_$"
        }, files={"resume": ("resume.pdf", b"%PDF-pdf_content", "application/pdf")})
        assert response.status_code == 400
        assert "target role contains invalid characters" in response.json()["detail"].lower()

    finally:
        app.dependency_overrides.clear()


# ── 3. DSA Endpoints Validation Tests ─────────────────────────────────────────────

def test_dsa_invalid_language():
    mock_user = User(
        id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        full_name="Test User",
        email="test@example.com",
        is_verified=True,
        is_active=True
    )
    
    mock_session = MagicMock()
    mock_session.candidate_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    
    mock_candidate = MagicMock()
    mock_candidate.user_id = mock_user.id

    async_db = AsyncMock()
    async_db.get = AsyncMock(side_effect=lambda model, ident: mock_session if model == InterviewSession else mock_candidate)

    async def get_db_override():
        yield async_db

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = get_db_override

    try:
        client = TestClient(app)
        session_id = "00000000-0000-0000-0000-000000000000"
        
        # Invalid language in HintRequest
        response = client.post(f"/api/interviews/{session_id}/dsa/hint", json={
            "current_code": "print('hello')",
            "language": "cobol"
        })
        assert response.status_code == 422
        assert "unsupported language" in response.text.lower()

        # Invalid language in SubmitRequest
        response = client.post(f"/api/interviews/{session_id}/dsa/submit", json={
            "code": "print('hello')",
            "language": "fortran",
            "problem_index": 0
        })
        assert response.status_code == 422
        assert "unsupported language" in response.text.lower()

        # Invalid problem index (out of range)
        response = client.post(f"/api/interviews/{session_id}/dsa/submit", json={
            "code": "print('hello')",
            "language": "python",
            "problem_index": -1
        })
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


# ── 4. WebSocket UUID and Field Validation Tests ──────────────────────────────────

def test_websocket_invalid_uuid():
    client = TestClient(app)
    # Connection with invalid UUID format should return error message and close
    with client.websocket_connect("/ws/interview/invalid-uuid-format") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "invalid session_id format" in msg["message"].lower()


def test_websocket_invalid_messages():
    client = TestClient(app)
    session_id = "11111111-2222-3333-4444-555555555555"

    mock_candidate = MagicMock()
    mock_candidate.id = "11111111-1111-1111-1111-111111111111"
    mock_candidate.name = "Test Candidate"
    mock_candidate.target_role = "QA Engineer"
    mock_candidate.status.value = "screened"

    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.candidate_id = mock_candidate.id
    mock_session.current_round.value = "technical"
    mock_session.status.value = "active"
    mock_session.round_scores = {}
    mock_session.overall_score = 0.0

    with patch("api.websocket._load_session", return_value=mock_session), \
         patch("api.websocket._load_candidate", return_value=mock_candidate):
         
        with client.websocket_connect(f"/ws/interview/{session_id}") as websocket:
            conn_msg = websocket.receive_json()
            assert conn_msg["type"] == "connected"

            # Send message with unknown type
            websocket.send_json({"type": "unknown_type"})
            err_msg = websocket.receive_json()
            assert err_msg["type"] == "error"
            assert "unknown message type" in err_msg["message"].lower()

            # Send start_round with invalid round parameter
            websocket.send_json({
                "type": "start_round",
                "round": "invalid_round"
            })
            err_msg = websocket.receive_json()
            assert err_msg["type"] == "error"
            assert "validation" in err_msg["message"].lower() or "invalid fields" in err_msg["message"].lower()

            # Send start_round with invalid target_role containing invalid characters
            websocket.send_json({
                "type": "start_round",
                "round": "technical",
                "target_role": "Engineer_@_Company"
            })
            err_msg = websocket.receive_json()
            assert err_msg["type"] == "error"
            assert "validation" in err_msg["message"].lower() or "invalid fields" in err_msg["message"].lower()
