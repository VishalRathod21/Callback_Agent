import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from datetime import timedelta

from core.security import hash_password, verify_password, create_access_token, decode_access_token
from main import app

# ── 1. Security Helpers Tests ────────────────────────────────────────────────

def test_password_hashing():
    password = "SuperSecurePassword123!"
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword123!", hashed) is False

def test_jwt_tokens():
    user_id = "test-user-id"
    token = create_access_token(user_id)
    assert isinstance(token, str)
    
    decoded_user_id = decode_access_token(token)
    assert decoded_user_id == user_id

def test_expired_jwt_token():
    from core.config import settings
    import jwt
    from datetime import datetime, timezone, timedelta
    from fastapi import HTTPException
    
    # Manually build an expired token payload
    expire = datetime.now(timezone.utc) - timedelta(seconds=10)
    payload = {
        "sub": "expired-user-id",
        "exp": int(expire.timestamp()),
        "type": "access",
        "iat": int(datetime.now(timezone.utc).timestamp())
    }
    expired_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    
    with pytest.raises(HTTPException) as exc_info:
        decode_access_token(expired_token)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()

# ── 2. Router Mock DB Tests ──────────────────────────────────────────────────

@patch("api.routes.auth.get_db")
def test_signup_endpoint_validation_error(mock_get_db):
    client = TestClient(app)
    # password too weak (no number, too short)
    response = client.post("/api/auth/signup", json={
        "full_name": "Test User",
        "email": "test@example.com",
        "password": "weak",
        "password_confirm": "weak"
    })
    assert response.status_code == 422
    assert "password" in response.text.lower()

@patch("api.routes.auth.get_db")
def test_login_invalid_credentials(mock_get_db):
    # Mock DB query to return None (no user found)
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
    mock_get_db.return_value = mock_db
    
    client = TestClient(app)
    response = client.post("/api/auth/login", json={
        "email": "nonexistent@example.com",
        "password": "SomePassword123!"
    })
    
    assert response.status_code == 401
    assert "invalid" in response.json()["detail"].lower()
