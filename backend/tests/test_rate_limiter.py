import pytest
import time
import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock

from core.config import settings
from core.database import get_db
from core.models import User
from main import app
from services.rate_limiter import rate_limiter, InMemoryRateLimiter


@pytest.fixture(autouse=True)
def setup_rate_limiter_settings():
    """Fixture to ensure rate limiting is enabled and set to custom limits for tests."""
    old_enabled = settings.RATE_LIMIT_ENABLED
    old_pub_limit = settings.RATE_LIMIT_PUBLIC_LIMIT
    old_pub_window = settings.RATE_LIMIT_PUBLIC_WINDOW
    old_user_limit = settings.RATE_LIMIT_USER_LIMIT
    old_user_window = settings.RATE_LIMIT_USER_WINDOW
    old_auth_ip_limit = settings.RATE_LIMIT_AUTH_IP_LIMIT
    old_auth_ip_window = settings.RATE_LIMIT_AUTH_IP_WINDOW
    old_auth_acc_limit = settings.RATE_LIMIT_AUTH_ACCOUNT_LIMIT
    old_auth_acc_window = settings.RATE_LIMIT_AUTH_ACCOUNT_WINDOW
    old_backoff_base = settings.RATE_LIMIT_AUTH_BACKOFF_BASE
    old_backoff_factor = settings.RATE_LIMIT_AUTH_BACKOFF_FACTOR
    old_backoff_max = settings.RATE_LIMIT_AUTH_BACKOFF_MAX
    old_cooldown = settings.RATE_LIMIT_AUTH_COOLDOWN

    # Setup test-specific small limits
    settings.RATE_LIMIT_ENABLED = True
    settings.RATE_LIMIT_PUBLIC_LIMIT = 2
    settings.RATE_LIMIT_PUBLIC_WINDOW = 60
    settings.RATE_LIMIT_USER_LIMIT = 3
    settings.RATE_LIMIT_USER_WINDOW = 60
    settings.RATE_LIMIT_AUTH_IP_LIMIT = 2
    settings.RATE_LIMIT_AUTH_IP_WINDOW = 60
    settings.RATE_LIMIT_AUTH_ACCOUNT_LIMIT = 2
    settings.RATE_LIMIT_AUTH_ACCOUNT_WINDOW = 60
    settings.RATE_LIMIT_AUTH_BACKOFF_BASE = 1.0
    settings.RATE_LIMIT_AUTH_BACKOFF_FACTOR = 2.0
    settings.RATE_LIMIT_AUTH_BACKOFF_MAX = 10.0
    settings.RATE_LIMIT_AUTH_COOLDOWN = 300.0

    # Clear rate limiter state before each test
    rate_limiter.records.clear()

    yield

    # Restore original settings
    settings.RATE_LIMIT_ENABLED = old_enabled
    settings.RATE_LIMIT_PUBLIC_LIMIT = old_pub_limit
    settings.RATE_LIMIT_PUBLIC_WINDOW = old_pub_window
    settings.RATE_LIMIT_USER_LIMIT = old_user_limit
    settings.RATE_LIMIT_USER_WINDOW = old_user_window
    settings.RATE_LIMIT_AUTH_IP_LIMIT = old_auth_ip_limit
    settings.RATE_LIMIT_AUTH_IP_WINDOW = old_auth_ip_window
    settings.RATE_LIMIT_AUTH_ACCOUNT_LIMIT = old_auth_acc_limit
    settings.RATE_LIMIT_AUTH_ACCOUNT_WINDOW = old_auth_acc_window
    settings.RATE_LIMIT_AUTH_BACKOFF_BASE = old_backoff_base
    settings.RATE_LIMIT_AUTH_BACKOFF_FACTOR = old_backoff_factor
    settings.RATE_LIMIT_AUTH_BACKOFF_MAX = old_backoff_max
    settings.RATE_LIMIT_AUTH_COOLDOWN = old_cooldown


@pytest.fixture(autouse=True)
def db_dependency_override():
    """Fixture to globally override database dependency with a mock AsyncSession."""
    mock_db = MagicMock()
    mock_db.execute = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()
    mock_db.rollback = AsyncMock()
    mock_db.add = MagicMock()
    
    # Default behavior returns None for single-result queries (e.g. user not found)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result
    
    async def _get_db_override():
        yield mock_db
        
    app.dependency_overrides[get_db] = _get_db_override
    yield mock_db
    app.dependency_overrides.clear()


# ── 1. Unit Tests for Rate Limiter Logic ──────────────────────────────────────

@pytest.mark.anyio
async def test_standard_sliding_window_rate_limiting():
    limiter = InMemoryRateLimiter()
    key = "test_pub_key"
    current_time = time.time()
    
    # Allow 2 requests
    res1 = await limiter.check_standard_limit(key, limit=2, window=60.0, current_time=current_time)
    res2 = await limiter.check_standard_limit(key, limit=2, window=60.0, current_time=current_time)
    assert res1 is None
    assert res2 is None
    
    # 3rd request should be blocked
    res3 = await limiter.check_standard_limit(key, limit=2, window=60.0, current_time=current_time)
    assert res3 is not None
    assert res3 > 0.0
    
    # After window passes, should be allowed again
    res4 = await limiter.check_standard_limit(key, limit=2, window=60.0, current_time=current_time + 61.0)
    assert res4 is None


@pytest.mark.anyio
async def test_auth_exponential_backoff_logic():
    limiter = InMemoryRateLimiter()
    key = "test_auth_key"
    current_time = time.time()
    
    # Limit: 2 attempts
    res1 = await limiter.check_auth_limit(
        key=key, limit=2, window=60.0, base_backoff=1.0, backoff_factor=2.0, max_backoff=10.0, cooldown=100.0, current_time=current_time
    )
    res2 = await limiter.check_auth_limit(
        key=key, limit=2, window=60.0, base_backoff=1.0, backoff_factor=2.0, max_backoff=10.0, cooldown=100.0, current_time=current_time
    )
    assert res1 is None
    assert res2 is None
    
    # 3rd request -> New violation, backoff level 1: base_backoff * (2**0) = 1.0s delay
    res3 = await limiter.check_auth_limit(
        key=key, limit=2, window=60.0, base_backoff=1.0, backoff_factor=2.0, max_backoff=10.0, cooldown=100.0, current_time=current_time
    )
    assert res3 == 1.0
    
    # Request again immediately (during backoff) -> Active violation, backoff level 2: 2.0s delay
    res4 = await limiter.check_auth_limit(
        key=key, limit=2, window=60.0, base_backoff=1.0, backoff_factor=2.0, max_backoff=10.0, cooldown=100.0, current_time=current_time + 0.1
    )
    assert res4 == 2.0
    
    # Request again immediately -> Active violation, backoff level 3: 4.0s delay
    res5 = await limiter.check_auth_limit(
        key=key, limit=2, window=60.0, base_backoff=1.0, backoff_factor=2.0, max_backoff=10.0, cooldown=100.0, current_time=current_time + 0.2
    )
    assert res5 == 4.0
    
    # Reset limits
    await limiter.reset_limits(ip="127.0.0.1")  # shouldn't affect custom key
    # Reset specific key by deleting it or clearing record
    limiter.records.clear()
    
    # Should be allowed now
    res6 = await limiter.check_auth_limit(
        key=key, limit=2, window=60.0, base_backoff=1.0, backoff_factor=2.0, max_backoff=10.0, cooldown=100.0, current_time=current_time
    )
    assert res6 is None


# ── 2. Middleware Integration Tests ──────────────────────────────────────────

def test_public_endpoint_rate_limiting(db_dependency_override):
    client = TestClient(app)
    
    # Limit is 2
    r1 = client.get("/api/candidates/00000000-0000-0000-0000-000000000000")
    r2 = client.get("/api/candidates/00000000-0000-0000-0000-000000000000")
    assert r1.status_code in {404, 401}  # Allowed through middleware (fails downstream in router)
    assert r2.status_code in {404, 401}
    
    # 3rd request should be blocked by rate limiting middleware
    r3 = client.get("/api/candidates/00000000-0000-0000-0000-000000000000")
    assert r3.status_code == 429
    assert "rate limit exceeded" in r3.json()["detail"].lower()
    assert "retry-after" in r3.headers


def test_auth_endpoints_ip_and_account_rate_limiting(db_dependency_override):
    client = TestClient(app)
    
    # Attempt 1: allowed through middleware
    client.post("/api/auth/login", json={"email": "attacker@example.com", "password": "Password123!"})
    # Attempt 2: allowed through middleware
    client.post("/api/auth/login", json={"email": "attacker@example.com", "password": "Password123!"})
    
    # Attempt 3: blocked by IP or Account auth rate limits
    r3 = client.post("/api/auth/login", json={"email": "attacker@example.com", "password": "Password123!"})
    assert r3.status_code == 429
    assert "too many authentication attempts" in r3.json()["detail"].lower()
    
    # Attempt 4 (immediate request during backoff) -> Should be blocked and backoff delay increases
    r4 = client.post("/api/auth/login", json={"email": "attacker@example.com", "password": "Password123!"})
    assert r4.status_code == 429
    
    # Checking account isolation:
    # A request for a DIFFERENT account from the SAME IP should still be blocked if IP limit is violated.
    # Since we hit /api/auth/login twice from the same IP (127.0.0.1 in TestClient), the IP limit is also breached.
    r5 = client.post("/api/auth/login", json={"email": "different@example.com", "password": "Password123!"})
    assert r5.status_code == 429
    assert "from this ip" in r5.json()["detail"].lower()


@patch("services.rate_limiter.get_user_id_from_token")
def test_authenticated_user_actions_rate_limiting(mock_get_user_id, db_dependency_override):
    # Mocking authenticated user with token
    mock_get_user_id.return_value = "user-12345"
    client = TestClient(app)
    
    headers = {"Authorization": "Bearer fake-token-123"}
    
    # Authenticated user limit is 3 requests
    r1 = client.get("/api/candidates/00000000-0000-0000-0000-000000000000", headers=headers)
    r2 = client.get("/api/candidates/00000000-0000-0000-0000-000000000000", headers=headers)
    r3 = client.get("/api/candidates/00000000-0000-0000-0000-000000000000", headers=headers)
    assert r1.status_code in {404, 401}
    assert r2.status_code in {404, 401}
    assert r3.status_code in {404, 401}
    
    # 4th request should get 429
    r4 = client.get("/api/candidates/00000000-0000-0000-0000-000000000000", headers=headers)
    assert r4.status_code == 429
    assert "rate limit exceeded" in r4.json()["detail"].lower()


def test_auth_reset_on_success(db_dependency_override):
    # Instantiate a real User database model object
    user = User(
        id=uuid.uuid4(),
        full_name="Success User",
        email="success@example.com",
        password_hash="hashed_pw",
        is_verified=True,
        is_active=True,
        profile_image=None,
        created_at=datetime.now(timezone.utc),
        last_login=None
    )
    
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    db_dependency_override.execute.return_value = mock_result
    
    client = TestClient(app)
    
    # Patch verify_password to return True and create_access_token/refresh to return dummy strings
    with patch("api.routes.auth.verify_password", return_value=True), \
         patch("api.routes.auth.create_access_token", return_value="access_tok"), \
         patch("api.routes.auth.create_refresh_token", return_value="refresh_tok"), \
         patch("api.routes.auth._set_refresh_cookie"):
         
        # Attempt 1: successful login, should not trigger rate limit block
        r1 = client.post("/api/auth/login", json={"email": "success@example.com", "password": "Password123!"})
        assert r1.status_code == 200
        
        # Attempt 2: successful login again
        r2 = client.post("/api/auth/login", json={"email": "success@example.com", "password": "Password123!"})
        assert r2.status_code == 200
        
        # Checking that the middleware DID reset limits:
        # Since r1 and r2 were successful, they shouldn't build up to exceed limit on attempt 3.
        # So attempt 3 is also allowed (returns 200)!
        r3 = client.post("/api/auth/login", json={"email": "success@example.com", "password": "Password123!"})
        assert r3.status_code == 200


def test_password_reset_rate_limiting(db_dependency_override):
    client = TestClient(app)
    rate_limiter.records.clear()
    
    # 3 attempts are allowed
    r1 = client.post("/api/auth/forgot-password", json={"email": "pwd-reset@example.com"})
    r2 = client.post("/api/auth/forgot-password", json={"email": "pwd-reset@example.com"})
    r3 = client.post("/api/auth/forgot-password", json={"email": "pwd-reset@example.com"})
    
    assert r1.status_code != 429
    assert r2.status_code != 429
    assert r3.status_code != 429
    
    # 4th attempt should be blocked with 429
    r4 = client.post("/api/auth/forgot-password", json={"email": "pwd-reset@example.com"})
    assert r4.status_code == 429
    assert "too many password reset attempts" in r4.json()["detail"].lower()

