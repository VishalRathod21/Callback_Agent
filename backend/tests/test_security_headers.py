import pytest
from fastapi.testclient import TestClient
from main import app

def test_security_headers_present():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert "max-age=31536000" in response.headers.get("Strict-Transport-Security", "")
    assert "default-src 'self'" in response.headers.get("Content-Security-Policy", "")
