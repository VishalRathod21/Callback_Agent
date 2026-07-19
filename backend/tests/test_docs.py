import os
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app
from core.config import settings

def test_root_endpoint():
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["status"] == "healthy"
    assert "Callback Agent API" in json_data["service"]

def test_docs_endpoints_disabled_by_default_without_auth():
    # Force ENABLE_DOCS to False (or verify behavior when False)
    with patch.dict(os.environ, {"ENABLE_DOCS": "false"}), \
         patch.object(settings, "ENABLE_DOCS", False):
        client = TestClient(app)
        
        # Unauthorized access should return 404
        for endpoint in ("/docs", "/redoc", "/openapi.json"):
            response = client.get(endpoint)
            assert response.status_code == 404
            assert response.json() == {"detail": "Not Found"}

def test_docs_endpoints_disabled_but_with_basic_auth():
    # Force ENABLE_DOCS to False, but provide correct basic auth
    with patch.dict(os.environ, {"ENABLE_DOCS": "false", "DOCS_USERNAME": "admin", "DOCS_PASSWORD": "secret_password"}), \
         patch.object(settings, "ENABLE_DOCS", False):
        client = TestClient(app)
        
        # Access with correct basic auth credentials
        response = client.get("/docs", auth=("admin", "secret_password"))
        # Should bypass 404 (and because of HTTP Basic Auth verification, return 200)
        assert response.status_code == 200

        # Access with incorrect credentials should return 404
        response_bad = client.get("/docs", auth=("admin", "wrong_password"))
        assert response_bad.status_code == 404
        assert response_bad.json() == {"detail": "Not Found"}

def test_docs_endpoints_enabled_publicly():
    # Force ENABLE_DOCS to True
    with patch.dict(os.environ, {"ENABLE_DOCS": "true"}), \
         patch.object(settings, "ENABLE_DOCS", True):
        client = TestClient(app)
        
        # Should be publicly available (status code 200)
        for endpoint in ("/docs", "/redoc", "/openapi.json"):
            response = client.get(endpoint)
            assert response.status_code == 200
