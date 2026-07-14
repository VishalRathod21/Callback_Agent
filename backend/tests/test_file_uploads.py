import io
import uuid
import zipfile
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from main import app
from api.routes.auth import get_current_user
from core.database import get_db
from core.models import User

def create_mock_docx() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", "<w:document></w:document>")
    return buf.getvalue()

@patch("api.routes.candidates._screener")
@patch("api.routes.candidates.resume_parser")
def test_file_upload_validation(mock_resume_parser, mock_screener):
    # Mock FAISS service on app state to prevent model loading and DB calls
    app.state.faiss = AsyncMock()

    # Setup mock user
    mock_user = User(
        id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        full_name="Test User",
        email="test@example.com",
        is_verified=True,
        is_active=True
    )
    
    # Setup mock DB session to bypass actual DB writing and prevent FK violations
    mock_db_session = MagicMock()
    mock_db_session.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=lambda: None))
    mock_db_session.commit = AsyncMock()
    mock_db_session.flush = AsyncMock()
    mock_db_session.refresh = AsyncMock()
    mock_db_session.add = MagicMock()

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = lambda: mock_db_session

    # Mock resume_parser.parse_resume response with required keys
    mock_resume_parser.parse_resume = AsyncMock(return_value={
        "raw_text": "Mock parsed resume text",
        "word_count": 100,
        "pages": 1
    })

    # Mock screen result
    mock_screener.screen = AsyncMock(return_value={
        "ats_score": 80.0,
        "decision": "pass",
        "matched_skills": ["Python"],
        "missing_skills": []
    })

    try:
        client = TestClient(app)

        # 1. Valid PDF file (starts with %PDF-)
        response = client.post("/api/candidates/upload", data={
            "name": "John Doe",
            "email": "john@example.com",
            "target_role": "Software Engineer"
        }, files={"resume": ("resume.pdf", b"%PDF-1.4 mock pdf content", "application/pdf")})
        assert response.status_code == 200
        assert response.json()["ats_score"] == 80.0

        # 2. Valid DOCX file (ZIP with word/document.xml)
        docx_data = create_mock_docx()
        response = client.post("/api/candidates/upload", data={
            "name": "Jane Smith",
            "email": "jane@example.com",
            "target_role": "Software Engineer"
        }, files={"resume": ("resume.docx", docx_data, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
        assert response.status_code == 200

        # 3. Invalid PDF file (renamed text file, missing %PDF- header)
        response = client.post("/api/candidates/upload", data={
            "name": "Bad PDF Candidate",
            "email": "bad_pdf@example.com",
            "target_role": "Software Engineer"
        }, files={"resume": ("resume.pdf", b"this is plain text and not a pdf", "application/pdf")})
        assert response.status_code == 400
        assert "invalid file content" in response.json()["detail"].lower()

        # 4. Invalid DOCX file (renamed generic zip without docx structure)
        generic_zip = io.BytesIO()
        with zipfile.ZipFile(generic_zip, "w") as z:
            z.writestr("malicious_script.sh", "echo 'hello'")
        
        response = client.post("/api/candidates/upload", data={
            "name": "Bad DOCX Candidate",
            "email": "bad_docx@example.com",
            "target_role": "Software Engineer"
        }, files={"resume": ("resume.docx", generic_zip.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
        assert response.status_code == 400
        assert "invalid file content" in response.json()["detail"].lower()

        # 5. Dangerous double extension renamed to .pdf (executable file signature)
        response = client.post("/api/candidates/upload", data={
            "name": "Spoofed Candidate",
            "email": "spoof@example.com",
            "target_role": "Software Engineer"
        }, files={"resume": ("exploit.php.pdf", b"<?php phpinfo(); ?>", "application/pdf")})
        assert response.status_code == 400
        assert "invalid file content" in response.json()["detail"].lower()

    finally:
        app.dependency_overrides.clear()
