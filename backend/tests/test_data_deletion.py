import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
import uuid
from main import app
from core.models import User, Candidate
from core.database import get_db
from api.routes.auth import get_current_user

def test_delete_account_endpoint():
    # Set up mock user and candidate
    user_id = uuid.uuid4()
    candidate_id = uuid.uuid4()
    
    mock_user = User(
        id=user_id,
        full_name="Alice User",
        email="alice@example.com",
        password_hash="some-argon2-hash",
        is_verified=True,
        is_active=True
    )
    
    mock_candidate = Candidate(
        id=candidate_id,
        user_id=user_id,
        name="Alice User",
        email="alice@example.com"
    )
    
    # Mock DB session and queries
    mock_db = AsyncMock()
    
    mock_result_candidates = MagicMock()
    mock_result_candidates.scalars.return_value.all.return_value = [mock_candidate]
    mock_db.execute.return_value = mock_result_candidates
    
    # Configure dependency overrides
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = lambda: mock_db
    
    # Mock FAISSService on app state
    mock_faiss = AsyncMock()
    app.state.faiss = mock_faiss
    
    client = TestClient(app)
    
    try:
        # Mock Path checks to avoid actually touching disk
        with patch("pathlib.Path.exists", return_value=True), \
             patch("pathlib.Path.is_dir", return_value=True), \
             patch("shutil.rmtree") as mock_rmtree:
            
            response = client.delete(
                "/api/auth/me",
                headers={"Authorization": "Bearer dummy-token"}
            )
            
            assert response.status_code == 200
            assert response.json()["status"] == "success"
            
            # Verify db.delete was called on current_user
            mock_db.delete.assert_called_with(mock_user)
            # Verify db.commit was called
            assert mock_db.commit.call_count == 1
            
            # Verify FAISS deletion was triggered
            mock_faiss.delete.assert_called_with(collection="resumes", doc_id=str(candidate_id))
            
            # Verify filesystem cleanup was called
            mock_rmtree.assert_called_once()
            
    finally:
        app.dependency_overrides.clear()
