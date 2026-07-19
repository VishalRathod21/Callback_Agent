import os
import sys
import importlib
from unittest.mock import patch
from fastapi.testclient import TestClient
from core.config import settings

def test_root_endpoint():
    import main
    importlib.reload(main)
    client = TestClient(main.app)
    response = client.get("/")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["status"] == "healthy"
    assert "Callback Agent API" in json_data["service"]

def test_docs_endpoints_disabled():
    with patch.dict(os.environ, {"ENABLE_DOCS": "false"}), \
         patch.object(settings, "ENABLE_DOCS", False):
        import main
        importlib.reload(main)
        client = TestClient(main.app)
        
        for endpoint in ("/docs", "/redoc", "/openapi.json"):
            response = client.get(endpoint)
            assert response.status_code == 404
            assert response.json() == {"detail": "Not Found"}

def test_docs_endpoints_enabled():
    with patch.dict(os.environ, {"ENABLE_DOCS": "true"}), \
         patch.object(settings, "ENABLE_DOCS", True):
        import main
        importlib.reload(main)
        client = TestClient(main.app)
        
        for endpoint in ("/docs", "/redoc", "/openapi.json"):
            response = client.get(endpoint)
            assert response.status_code == 200
