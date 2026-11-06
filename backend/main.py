"""InterviewAI Backend — FastAPI application entry point."""

import warnings

warnings.filterwarnings("ignore", category=FutureWarning)

import logging
import os
import sys
import tempfile
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException as FastAPIHTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.routes.auth import router as auth_router
from api.routes.candidates import router as candidates_router
from api.routes.dashboard import router as dashboard_router
from api.routes.debrief import router as debrief_router
from api.routes.dsa import router as dsa_router
from api.routes.interviews import router as interviews_router
from api.routes.practice import router as practice_router
from api.routes.reports import router as reports_router
from api.websocket import router as ws_router, _orchestrator
from core.config import settings
from core.database import Base, engine
from services.rate_limiter import RateLimitingMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# PostgreSQL-only idempotent column migrations for databases created before Alembic
# revision 0003.  Each statement runs in its own transaction.  SQLite databases are
# created fresh by ``create_all`` and skip this list.
POSTGRES_MIGRATIONS: list[tuple[str, str]] = [
    ("users.profile_image", "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image VARCHAR(512);"),
    ("users.is_active", "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;"),
    ("users.updated_at", "ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();"),
    ("users.last_login", "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;"),
    ("users.reset_token", "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);"),
    ("users.reset_token_expires_at", "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;"),
    ("users.verification_token", "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);"),
    ("users.verification_token_expires_at", "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ;"),
    ("users.preferences", "ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB;"),
    ("candidates.user_id", "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;"),
    ("candidates.resume_path", "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_path VARCHAR(512);"),
    ("candidates.target_role", "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS target_role VARCHAR(255);"),
    ("candidates.ats_score", "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS ats_score FLOAT;"),
    ("candidates.resume_structured", "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_structured JSONB;"),
    ("candidates.screening_result", "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screening_result JSONB;"),
    ("candidates.resume_filename", "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_filename VARCHAR(255);"),
    ("candidates.resume_pages", "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_pages INTEGER;"),
    ("candidates.resume_word_count", "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_word_count INTEGER;"),
    ("candidates.resume_chunk_count", "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_chunk_count INTEGER;"),
    ("candidates.resume_parsed_at", "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_parsed_at TIMESTAMPTZ;"),
    # candidates are unique per (user, email) — drop the legacy global unique on email
    ("candidates.drop_global_email_unique", "ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_email_key;"),
    ("candidates.uq_user_email", "CREATE UNIQUE INDEX IF NOT EXISTS uq_candidates_user_email ON candidates (user_id, email);"),
    ("interview_sessions.round_scores", "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS round_scores JSONB;"),
    ("interview_sessions.overall_score", "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS overall_score FLOAT;"),
    ("interview_sessions.ended_at", "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;"),
    ("interview_sessions.config", "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS config JSONB;"),
    ("interview_sessions.mode", "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS mode VARCHAR(20);"),
    ("interview_sessions.target_role", "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS target_role VARCHAR(255);"),
    ("interview_sessions.total_questions", "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS total_questions INTEGER;"),
    ("interview_sessions.duration_seconds", "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;"),
    ("interview_sessions.persona", "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS persona JSONB;"),
    ("sessionstatus.cancelled", "ALTER TYPE sessionstatus ADD VALUE IF NOT EXISTS 'CANCELLED';"),
    ("interview_questions.generation_source", "ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS generation_source VARCHAR(20);"),
    ("round_transcripts.ai_evaluation", "ALTER TABLE round_transcripts ADD COLUMN IF NOT EXISTS ai_evaluation JSONB;"),
    ("round_transcripts.score", "ALTER TABLE round_transcripts ADD COLUMN IF NOT EXISTS score FLOAT;"),
    ("refresh_tokens.device_name", "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS device_name VARCHAR(255);"),
    ("refresh_tokens.browser", "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS browser VARCHAR(255);"),
    ("refresh_tokens.ip_address", "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);"),
    ("refresh_tokens.revoked", "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked BOOLEAN NOT NULL DEFAULT FALSE;"),
]


def _validate_startup(is_testing: bool) -> list[str]:
    """Validate configuration. Returns warnings; raises only in strict mode."""
    problems: list[str] = []
    if not settings.llm_configured:
        problems.append(
            f"LLM provider '{settings.LLM_PROVIDER}' has no API key — question generation falls back to the "
            f"question bank and answers are scored heuristically (flagged as such)."
        )
    if settings.JWT_SECRET_IS_FALLBACK:
        problems.append("JWT_SECRET_KEY is not set — a random secret is used; all sessions are invalidated on restart.")
    if settings.is_sqlite:
        problems.append(f"Using SQLite ({settings.DATABASE_URL}) — fine for development; use PostgreSQL in production.")
    if settings.embedding_backend == "hashing":
        problems.append("Embeddings use the local hashing backend (lexical). Set GEMINI_API_KEY for semantic embeddings.")
    if settings.VOICE_ENABLED and not (settings.DEEPGRAM_API_KEY and settings.ELEVENLABS_API_KEY):
        problems.append("VOICE_ENABLED=true but Deepgram/ElevenLabs keys are missing — voice falls back where possible.")

    if not is_testing and settings.strict_startup:
        fatal = []
        if not settings.llm_configured:
            fatal.append("LLM API key missing")
        if settings.JWT_SECRET_IS_FALLBACK:
            fatal.append("JWT_SECRET_KEY missing")
        if settings.is_sqlite and settings.is_production:
            fatal.append("SQLite is not allowed in production")
        if fatal:
            raise ValueError("Strict startup failed: " + "; ".join(fatal))
    return problems


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting InterviewAI backend (env=%s)…", settings.ENVIRONMENT)
    is_testing = "pytest" in sys.modules or os.environ.get("TESTING") == "true"

    for warning in _validate_startup(is_testing):
        logger.warning("CONFIG: %s", warning)

    # 1. Schema
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Base table structure verified.")

    if not settings.is_sqlite:
        applied = skipped = failed = 0
        for label, sql in POSTGRES_MIGRATIONS:
            try:
                async with engine.begin() as conn:
                    await conn.execute(text(sql))
                applied += 1
            except Exception as exc:  # noqa: BLE001
                err = str(exc).lower()
                if "already exists" in err or "duplicate" in err:
                    skipped += 1
                else:
                    failed += 1
                    logger.warning("Migration WARNING — could not apply [%s]: %s", label, exc)
        logger.info("Schema migrations complete — applied: %d, skipped: %d, warnings: %d.", applied, skipped, failed)

    # 2. Services
    from services.faiss_service import FAISSService
    from services.rag_service import RAGService

    app.state.faiss = FAISSService()
    app.state.rag = RAGService(app.state.faiss)
    _orchestrator.attach_rag(app.state.rag)
    app.state.orchestrator = _orchestrator
    logger.info("Vector store ready: %s", app.state.faiss.get_stats())

    from services.llm_service import llm_service
    app.state.llm_available = llm_service.available
    logger.info("LLM provider: %s (available=%s)", llm_service.provider_name, llm_service.available)

    app.state.stt = None
    app.state.tts = None
    if is_testing:
        logger.info("Test environment — voice services disabled.")
    elif not settings.VOICE_ENABLED:
        logger.info("VOICE_ENABLED=false — text-only mode.")
    else:
        from services.stt.deepgram_service import DeepgramSTT
        from services.tts.elevenlabs_service import ElevenLabsTTS

        if settings.DEEPGRAM_API_KEY:
            app.state.stt = DeepgramSTT()
            logger.info("Deepgram STT ready.")
        else:
            logger.warning("DEEPGRAM_API_KEY missing — speech-to-text disabled, voice mode unavailable.")
        app.state.tts = ElevenLabsTTS()  # has Google TTS fallback when the key is missing
        logger.info("TTS ready (ElevenLabs key %s).", "set" if settings.ELEVENLABS_API_KEY else "missing → Google fallback")

    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    logger.info("Application startup complete.")
    yield

    logger.info("Shutting down InterviewAI backend…")
    removed = 0
    for p in Path(tempfile.gettempdir()).glob("interviewai_*.wav"):
        try:
            p.unlink(missing_ok=True)
            removed += 1
        except Exception:  # noqa: BLE001
            pass
    logger.info("Cleanup complete (%d temp files removed).", removed)


is_docs_enabled = os.environ.get("ENABLE_DOCS", "").lower() == "true" or settings.ENABLE_DOCS

app = FastAPI(
    title="Callback Rehearsal · InterviewAI API",
    description="AI-powered personalised mock interview and adaptive candidate evaluation system.",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs" if is_docs_enabled else None,
    redoc_url="/redoc" if is_docs_enabled else None,
    openapi_url="/openapi.json" if is_docs_enabled else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    else:
        # keep header present for parity/tests but without forcing HTTPS on localhost
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path in ("/docs", "/redoc"):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' cdn.jsdelivr.net; img-src 'self' data: cdn.jsdelivr.net fastapi.tiangolo.com;"
        )
    else:
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'"
    return response


app.add_middleware(RateLimitingMiddleware)


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    correlation_id = str(uuid.uuid4())
    logger.error("Database error [%s] at %s: %s", correlation_id, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "A database error occurred. Please try again later.",
                                                  "correlation_id": correlation_id})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, (FastAPIHTTPException, StarletteHTTPException, RequestValidationError)):
        raise exc
    correlation_id = str(uuid.uuid4())
    logger.error("Unhandled exception [%s] at %s: %s", correlation_id, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "An internal server error occurred. Please contact support.",
                                                  "correlation_id": correlation_id})


app.include_router(candidates_router, prefix="/api")
app.include_router(interviews_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(dsa_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(debrief_router)
app.include_router(dashboard_router)
app.include_router(practice_router)
app.include_router(ws_router)


@app.get("/", tags=["Health"])
async def root():
    return {"status": "healthy", "service": "Callback Agent API", "docs": "/docs" if is_docs_enabled else None}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/system/status", tags=["Health"])
async def system_status(request: Request):
    """Capability flags the frontend uses to explain degraded modes honestly."""
    from services.llm_service import llm_service

    faiss = getattr(request.app.state, "faiss", None)
    return {
        "environment": settings.ENVIRONMENT,
        "llm": {"provider": llm_service.provider_name, "available": llm_service.available},
        "embeddings": {"backend": getattr(faiss, "backend_name", None), "dim": settings.EMBEDDING_DIM},
        "voice": {"enabled": settings.VOICE_ENABLED, "stt": getattr(request.app.state, "stt", None) is not None,
                  "tts": getattr(request.app.state, "tts", None) is not None},
        "database": "sqlite" if settings.is_sqlite else "postgresql",
        "adaptive_policy": {"enabled": settings.ADAPTIVE_ENABLED, "decrease_max": settings.ADAPTIVE_DECREASE_MAX,
                            "increase_min": settings.ADAPTIVE_INCREASE_MIN},
        "rubric_weights": settings.rubric_weights,
        "version": app.version,
    }
