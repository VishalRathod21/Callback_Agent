import pytest
from fastapi.testclient import TestClient
from main import app
from sqlalchemy.exc import OperationalError

# Define temporary endpoints on the app for error testing
@app.get("/test-internal-error-leak")
async def trigger_internal_error():
    raise ValueError("Sensitive internal error details about directories /home/user/secret")

@app.get("/test-db-error-leak")
async def trigger_db_error():
    # Raise a SQLAlchemy operational error
    raise OperationalError("SELECT * FROM users", {}, Exception("Database connection refused"))

def test_unhandled_exception_returns_generic_message_and_correlation_id():
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/test-internal-error-leak")
    assert response.status_code == 500
    data = response.json()
    assert data["detail"] == "An internal server error occurred. Please contact support."
    assert "correlation_id" in data
    assert len(data["correlation_id"]) > 0

def test_database_exception_returns_generic_message_and_correlation_id():
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/test-db-error-leak")
    assert response.status_code == 500
    data = response.json()
    assert data["detail"] == "A database error occurred. Please try again later."
    assert "correlation_id" in data
    assert len(data["correlation_id"]) > 0
