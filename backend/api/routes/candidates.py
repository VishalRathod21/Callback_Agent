"""Candidate (resume profile) endpoints: upload, screening, profile dashboard, RAG inspection."""

from __future__ import annotations

import asyncio
import io
import logging
import math
import re
import time
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from email_validator import validate_email
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from agents.resume_screener import ResumeScreenerAgent
from api.routes.auth import get_current_user
from core.config import settings
from core.database import get_db
from core.models import Candidate, CandidateStatus, InterviewSession, User
from services import resume_parser
from services.llm_service import LLMUnavailableError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/candidates", tags=["candidates"])

ALLOWED_EXTENSIONS = {".pdf", ".docx"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
NAME_RE = re.compile(r"^[A-Za-zÀ-ɏऀ-ॿ.'\- ]{2,100}$")
ROLE_RE = re.compile(r"^[A-Za-z0-9.+# \-/()]+$")

_screener = ResumeScreenerAgent()


# ── Fallbacks ──────────────────────────────────────────────────────────────────

ROLE_SKILLS = {
    "software engineer": ["python", "java", "c++", "javascript", "git", "sql", "docker", "aws", "kubernetes", "rest"],
    "backend": ["python", "go", "node", "fastapi", "django", "postgresql", "mongodb", "redis", "docker", "api"],
    "frontend": ["javascript", "typescript", "react", "html", "css", "vue", "next.js", "tailwind", "webpack"],
    "fullstack": ["javascript", "react", "node", "python", "sql", "rest", "docker", "git"],
    "ml": ["python", "pytorch", "tensorflow", "scikit-learn", "numpy", "pandas", "mlops", "machine learning", "model"],
    "data scien": ["python", "sql", "pandas", "numpy", "statistics", "machine learning", "visualization", "tableau"],
    "data engineer": ["sql", "python", "spark", "airflow", "etl", "kafka", "warehouse", "pipeline"],
    "ai": ["python", "llm", "langchain", "rag", "embedding", "transformer", "prompt", "pytorch"],
    "nlp": ["nlp", "transformer", "bert", "tokeniz", "spacy", "python", "pytorch", "text"],
    "devops": ["docker", "kubernetes", "aws", "terraform", "ansible", "ci/cd", "jenkins", "linux", "bash"],
    "product manager": ["agile", "scrum", "roadmap", "jira", "analytics", "sql", "a/b", "stakeholder"],
}


def _fallback_screening(resume_text: str, target_role: str) -> dict:
    """Deterministic keyword screening used only when the LLM is unavailable.

    It reports *only* skills that actually occur in the resume text and marks
    itself as a heuristic result; it never invents matched skills.  Because a
    keyword count is not a semantic assessment, it does not reject candidates
    unless the resume shows no relevant content at all.
    """
    from services.resume_chunker import detect_sections

    text = resume_text.lower()
    role = target_role.lower()
    target_skills = next((v for k, v in ROLE_SKILLS.items() if k in role), ROLE_SKILLS["software engineer"])
    matched = [s for s in target_skills if s in text]
    missing = [s for s in target_skills if s not in text]
    ratio = len(matched) / len(target_skills) if target_skills else 0.0
    sections = {name for name, _ in detect_sections(resume_text)}
    coverage = len(sections & {"skills", "projects", "experience", "education"}) / 4.0
    ats_score = round(100.0 * (0.6 * ratio + 0.4 * coverage), 1)
    decision = "pass" if (len(matched) >= 1 and ats_score >= 25) or len(matched) >= 2 else "fail"
    return {
        "ats_score": ats_score,
        "matched_skills": [m.title() for m in matched],
        "missing_skills": [m.title() for m in missing],
        "experience_level": "unknown",
        "decision": decision,
        "reasoning": (
            f"Heuristic keyword screening (AI screener unavailable): {len(matched)} of {len(target_skills)} "
            f"role keywords found; {int(coverage * 4)} of 4 standard resume sections detected. "
            f"This is an informational estimate, not a semantic assessment."
        ),
        "suggested_rounds": ["dsa", "technical", "hr"],
        "screening_source": "heuristic",
    }


def _fallback_structure(resume_text: str, name: str) -> dict:
    """Extract a minimal structure without an LLM using section detection."""
    from services.resume_chunker import detect_sections

    sections = dict(detect_sections(resume_text))
    skills_blob = sections.get("skills", "")
    skills = [s.strip() for s in re.split(r"[,\n|•·;]+", skills_blob) if 1 < len(s.strip()) <= 40][:40]
    projects = []
    for line in sections.get("projects", "").splitlines():
        line = line.strip(" •-–\t")
        if len(line) > 8:
            head, _, desc = line.partition(" – ") if " – " in line else line.partition(": ")
            projects.append({"name": (head or line)[:80], "description": desc[:200], "tech": [], "highlights": []})
    experience = []
    for line in sections.get("experience", "").splitlines():
        line = line.strip(" •-–\t")
        m = re.match(r"^(.+?),\s*(.+?)\s*\((.+?)\)\s*$", line)
        if m:
            experience.append({"role": m.group(1)[:80], "company": m.group(2)[:80], "duration": m.group(3)[:40], "points": []})
    education = [{"degree": l.strip()[:120], "institution": "", "year": ""} for l in sections.get("education", "").splitlines() if l.strip()][:3]
    return {
        "name": name, "skills": skills, "projects": projects[:8], "experience": experience[:5],
        "education": education, "summary": sections.get("summary", "")[:400],
        "certifications": [l.strip() for l in sections.get("certifications", "").splitlines() if l.strip()][:8],
        "extraction_source": "heuristic",
    }


def _is_valid_file_content(contents: bytes, file_ext: str) -> bool:
    if file_ext == ".pdf":
        return contents.startswith(b"%PDF-")
    if file_ext == ".docx":
        if not contents.startswith(b"PK\x03\x04"):
            return False
        try:
            with zipfile.ZipFile(io.BytesIO(contents)) as zf:
                names = zf.namelist()
                return "word/document.xml" in names or "[Content_Types].xml" in names
        except Exception:
            return False
    return False


def _profile_view(candidate: Candidate, chunk_count: int | None = None) -> dict:
    rs = candidate.resume_structured or {}
    sr = candidate.screening_result or {}
    return {
        "id": str(candidate.id),
        "name": candidate.name,
        "email": candidate.email,
        "target_role": candidate.target_role,
        "status": candidate.status.value,
        "ats_score": candidate.ats_score,
        "created_at": candidate.created_at.isoformat() if candidate.created_at else None,
        "resume": {
            "filename": candidate.resume_filename,
            "pages": candidate.resume_pages,
            "word_count": candidate.resume_word_count,
            "chunk_count": chunk_count if chunk_count is not None else candidate.resume_chunk_count,
            "parsed_at": candidate.resume_parsed_at.isoformat() if candidate.resume_parsed_at else None,
            "available": bool(candidate.resume_path),
        },
        "profile": {
            "summary": rs.get("summary", ""),
            "skills": rs.get("skills", []),
            "programming_languages": _programming_languages(rs.get("skills", [])),
            "projects": rs.get("projects", []),
            "experience": rs.get("experience", []),
            "education": rs.get("education", []),
            "certifications": rs.get("certifications", []),
            "extraction_source": rs.get("extraction_source", "llm" if rs else None),
        },
        "screening": {
            "decision": sr.get("decision"),
            "matched_skills": sr.get("matched_skills", []),
            "missing_skills": sr.get("missing_skills", []),
            "experience_level": sr.get("experience_level"),
            "reasoning": sr.get("reasoning"),
            "suggested_rounds": sr.get("suggested_rounds", ["dsa", "technical", "hr"]),
            "source": sr.get("screening_source", "llm" if sr else None),
        },
    }


_LANGS = {"python", "java", "c", "c++", "c#", "javascript", "typescript", "go", "rust", "kotlin", "swift",
          "scala", "r", "sql", "php", "ruby", "matlab", "dart", "bash", "shell"}


def _programming_languages(skills: list[str]) -> list[str]:
    out = []
    for s in skills or []:
        key = str(s).strip().lower()
        if key in _LANGS and s not in out:
            out.append(str(s))
    return out


# ── Upload ─────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_candidate(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    target_role: str = Form(...),
    resume: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a resume: validate → parse → screen → extract structure → index for RAG → persist."""
    from services.rate_limiter import rate_limiter

    retry_after = await rate_limiter.check_standard_limit(
        key=f"upload_user:{current_user.id}", limit=settings.RATE_LIMIT_UPLOAD_LIMIT,
        window=settings.RATE_LIMIT_UPLOAD_WINDOW, current_time=time.time(),
    )
    if retry_after is not None:
        raise HTTPException(status_code=429, detail=(
            f"Upload limit reached. You may upload {settings.RATE_LIMIT_UPLOAD_LIMIT} resumes per hour. "
            f"Please wait {int(math.ceil(retry_after))} seconds."))

    name = name.strip()
    if not (2 <= len(name) <= 100):
        raise HTTPException(status_code=400, detail="Name must be between 2 and 100 characters.")
    if not NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Name contains invalid characters. Only letters, spaces, dots, hyphens, and apostrophes are allowed.")
    email = email.strip().lower()
    if len(email) > 150:
        raise HTTPException(status_code=400, detail="Email must not exceed 150 characters.")
    try:
        validate_email(email, check_deliverability=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid email address format.")
    target_role = target_role.strip()
    if not (2 <= len(target_role) <= 100):
        raise HTTPException(status_code=400, detail="Target role must be between 2 and 100 characters.")
    if not ROLE_RE.match(target_role):
        raise HTTPException(status_code=400, detail="Target role contains invalid characters.")
    if not resume.filename:
        raise HTTPException(status_code=400, detail="Resume file name is missing.")

    file_ext = Path(resume.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{file_ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
    contents = await resume.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large ({len(contents) / 1024 / 1024:.1f} MB). Max allowed: 5 MB.")
    if not _is_valid_file_content(contents, file_ext):
        raise HTTPException(status_code=400, detail=f"Invalid file content for file type '{file_ext}'. The file signature does not match.")

    # One candidate profile per (user, email). Never touch another user's record.
    existing = (await db.execute(
        select(Candidate).where(Candidate.email == email, Candidate.user_id == current_user.id)
        .options(selectinload(Candidate.sessions))
    )).scalar_one_or_none()
    candidate_id = existing.id if existing else uuid.uuid4()

    upload_dir = Path(settings.UPLOAD_DIR) / str(candidate_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"resume{file_ext}"
    file_path.write_bytes(contents)

    try:
        parsed = await resume_parser.parse_resume(str(file_path))
    except Exception as exc:
        logger.error("Resume parsing failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=422, detail="Failed to parse resume. Please ensure the file is not corrupted.")
    resume_text = parsed["raw_text"]
    if not resume_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract any text from the resume. Please upload a readable PDF or DOCX.")

    # ── AI screening + structured extraction (parallel), honest fallbacks ──
    screening_source, extraction_source = "llm", "llm"

    async def _safe(coro_factory):
        try:
            return await coro_factory()
        except Exception as exc:  # noqa: BLE001 (LLMUnavailableError, parse errors, non-awaitable mocks)
            return exc

    ats_result, resume_structure = await asyncio.gather(
        _safe(lambda: _screener.screen(resume_text, target_role)),
        _safe(lambda: _screener.extract_structure(resume_text)),
    )
    if isinstance(ats_result, Exception) or not isinstance(ats_result, dict) or "ats_score" not in ats_result:
        logger.warning("AI screening unavailable (%s) — using heuristic keyword screening.", ats_result)
        ats_result = _fallback_screening(resume_text, target_role)
        screening_source = "heuristic"
    if (isinstance(resume_structure, Exception) or not isinstance(resume_structure, dict)
            or not any(resume_structure.get(k) for k in ("skills", "projects", "experience"))):
        logger.warning("AI structure extraction unavailable (%s) — using heuristic section parsing.", resume_structure)
        resume_structure = _fallback_structure(resume_text, name)
        extraction_source = "heuristic"
    ats_result.setdefault("screening_source", screening_source)
    resume_structure.setdefault("extraction_source", extraction_source)
    if not resume_structure.get("name"):
        resume_structure["name"] = name

    ats_score = float(ats_result.get("ats_score", 0.0) or 0.0)
    decision = ats_result.get("decision", "fail")
    # The screening decision is stored and shown, but a mock-interview tool must not lock the
    # candidate out of practising; the profile is always usable once screened.
    status = CandidateStatus.SCREENED
    now = datetime.now(timezone.utc)

    if existing is not None:
        candidate = existing
        candidate.name = name
        # Re-uploading a resume starts a clean history for this profile.
        candidate.sessions.clear()
    else:
        candidate = Candidate(id=candidate_id, user_id=current_user.id, name=name, email=email)
        db.add(candidate)
    candidate.resume_path = str(file_path)
    candidate.target_role = target_role
    candidate.ats_score = ats_score
    candidate.resume_structured = resume_structure
    candidate.screening_result = ats_result
    candidate.status = status
    candidate.resume_filename = Path(resume.filename).name[:255]
    candidate.resume_pages = parsed.get("pages")
    candidate.resume_word_count = parsed.get("word_count")
    candidate.resume_parsed_at = now
    await db.flush()

    # ── Index for RAG ──
    chunk_count = None
    rag = getattr(request.app.state, "rag", None)
    if rag is not None:
        try:
            chunk_count = await rag.index_resume(str(candidate_id), resume_text, {
                "target_role": target_role, "skills": resume_structure.get("skills", [])[:30], "has_structure": True,
            })
            candidate.resume_chunk_count = chunk_count
        except Exception as exc:  # noqa: BLE001
            logger.error("RAG indexing failed: %s", exc, exc_info=True)
    else:
        faiss_service = getattr(request.app.state, "faiss", None)
        if faiss_service is not None:
            try:
                await faiss_service.add(collection="resumes", doc_id=str(candidate_id), text=resume_text,
                                        metadata={"candidate_id": str(candidate_id), "target_role": target_role})
            except Exception as exc:  # noqa: BLE001
                logger.error("FAISS storage failed: %s", exc)

    logger.info("Candidate %s — ATS: %.1f (%s), decision: %s, chunks: %s", candidate_id, ats_score, screening_source, decision, chunk_count)

    response = {
        "candidate_id": str(candidate_id),
        "decision": decision,
        "ats_score": ats_score,
        "matched_skills": ats_result.get("matched_skills", []),
        "missing_skills": ats_result.get("missing_skills", []),
        "experience_level": ats_result.get("experience_level"),
        "reasoning": ats_result.get("reasoning"),
        "screening_source": screening_source,
        "extraction_source": extraction_source,
        "resume_info": {"word_count": parsed["word_count"], "pages": parsed["pages"], "chunks_indexed": chunk_count,
                        "filename": candidate.resume_filename},
        "profile": _profile_view(candidate, chunk_count)["profile"],
    }
    if decision == "pass":
        response["next_steps"] = {"message": "Resume screening passed. Configure your interview to continue.",
                                  "suggested_rounds": ats_result.get("suggested_rounds", ["dsa", "technical", "hr"])}
    else:
        response["rejection"] = {"message": "Resume did not meet the minimum requirements for this role.",
                                 "missing_skills": ats_result.get("missing_skills", [])}
    return response


# ── Read ───────────────────────────────────────────────────────────────────────

@router.get("/me")
async def my_candidates(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """All candidate profiles owned by the current user (newest first)."""
    rows = (await db.execute(
        select(Candidate).where(Candidate.user_id == current_user.id).order_by(Candidate.created_at.desc())
    )).scalars().all()
    return {"candidates": [_profile_view(c) for c in rows], "latest": _profile_view(rows[0]) if rows else None}


@router.get("/{candidate_id}")
async def get_candidate(
    candidate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Candidate details with interview sessions."""
    candidate = (await db.execute(
        select(Candidate).where(Candidate.id == candidate_id).options(selectinload(Candidate.sessions))
    )).scalar_one_or_none()
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    if candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied. You do not own this candidate record.")
    sessions = [{
        "id": str(s.id), "current_round": s.current_round.value, "round_scores": s.round_scores,
        "overall_score": s.overall_score, "status": s.status.value, "mode": s.mode,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
    } for s in candidate.sessions]
    return {**_profile_view(candidate), "sessions": sessions}


@router.get("/{candidate_id}/profile")
async def get_candidate_profile(
    candidate_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resume analysis dashboard payload (structured profile + screening + RAG stats)."""
    candidate = await db.get(Candidate, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    if candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    chunk_count = candidate.resume_chunk_count
    rag = getattr(request.app.state, "rag", None)
    sections: dict[str, int] = {}
    if rag is not None:
        try:
            chunks = await rag.list_chunks(str(candidate_id))
            chunk_count = len(chunks)
            for c in chunks:
                sections[c["section"]] = sections.get(c["section"], 0) + 1
        except Exception:  # noqa: BLE001
            pass
    view = _profile_view(candidate, chunk_count)
    view["resume"]["sections"] = sections
    view["resume"]["embedding_backend"] = getattr(rag, "backend", None) if rag else None
    return view


@router.get("/{candidate_id}/chunks")
async def get_candidate_chunks(
    candidate_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Indexed resume chunks (for the RAG inspector)."""
    candidate = await db.get(Candidate, candidate_id)
    if candidate is None or candidate.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    rag = getattr(request.app.state, "rag", None)
    if rag is None:
        return {"chunks": [], "backend": None}
    return {"chunks": await rag.list_chunks(str(candidate_id)), "backend": rag.backend}


class RetrieveIn(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)
    k: int = Field(4, ge=1, le=10)


@router.post("/{candidate_id}/retrieve")
async def retrieve_context(
    candidate_id: uuid.UUID,
    body: RetrieveIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run a retrieval query against this candidate's resume chunks (RAG inspector / experiments)."""
    candidate = await db.get(Candidate, candidate_id)
    if candidate is None or candidate.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    rag = getattr(request.app.state, "rag", None)
    if rag is None:
        raise HTTPException(status_code=503, detail="Retrieval service unavailable.")
    started = time.perf_counter()
    chunks = await rag.retrieve(str(candidate_id), body.query, k=body.k)
    return {
        "query": body.query, "backend": rag.backend, "latency_ms": int((time.perf_counter() - started) * 1000),
        "results": [{**c.source_ref(), "text": c.text} for c in chunks],
    }


class CandidateUpdate(BaseModel):
    target_role: Optional[str] = Field(None, min_length=2, max_length=100, pattern=r"^[A-Za-z0-9.+# \-/()]+$")


@router.patch("/{candidate_id}")
async def update_candidate(
    candidate_id: uuid.UUID,
    body: CandidateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidate = await db.get(Candidate, candidate_id)
    if candidate is None or candidate.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    if body.target_role:
        candidate.target_role = body.target_role.strip()
    await db.flush()
    return _profile_view(candidate)


@router.delete("/{candidate_id}")
async def delete_candidate(
    candidate_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a candidate profile with its sessions, files and vectors."""
    import shutil

    candidate = await db.get(Candidate, candidate_id)
    if candidate is None or candidate.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    rag = getattr(request.app.state, "rag", None)
    if rag is not None:
        try:
            await rag.delete_candidate(str(candidate_id))
        except Exception as exc:  # noqa: BLE001
            logger.warning("RAG cleanup failed for %s: %s", candidate_id, exc)
    upload_dir = Path(settings.UPLOAD_DIR) / str(candidate_id)
    if upload_dir.exists():
        shutil.rmtree(upload_dir, ignore_errors=True)
    await db.delete(candidate)
    await db.flush()
    return {"deleted": True, "candidate_id": str(candidate_id)}


# ── Legacy alias ───────────────────────────────────────────────────────────────

@router.post("/{candidate_id}/interview")
async def start_interview_session_alias(
    candidate_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deprecated alias of POST /api/interviews/start/{candidate_id} with default configuration."""
    from api.routes.interviews import start_interview
    return await start_interview(candidate_id, request, None, db, current_user)
