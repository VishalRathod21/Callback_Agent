"""InterviewAI Backend - FastAPI Application."""

import warnings
# Suppress the deprecation warning from google.generativeai
warnings.filterwarnings("ignore", category=FutureWarning)


import asyncio
import logging
import os
import tempfile

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from api.routes.candidates import router as candidates_router
from api.routes.interviews import router as interviews_router
from api.routes.reports import router as reports_router
from api.routes.dsa import router as dsa_router
from api.routes.auth import router as auth_router
from api.websocket import router as ws_router
from core.config import settings
from core.database import engine, Base
from services.stt_service import WhisperSTT
from services.tts_service import TTSService
from services.rate_limiter import RateLimitingMiddleware
from agents.orchestrator import InterviewOrchestrator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown events."""
    # Startup
    logger.info("Starting InterviewAI backend...")

    # Validate environment variables on startup
    import sys
    import os
    is_testing = "pytest" in sys.modules or os.environ.get("TESTING") == "true"
    
    # 1. Validate API Keys based on LLM Provider
    if settings.LLM_PROVIDER == "gemini":
        if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY in ("", "your_key_here"):
            if is_testing:
                logger.warning("GEMINI_API_KEY is not configured (ignored in testing environment).")
            else:
                logger.error("CRITICAL: GEMINI_API_KEY is not configured. Please set it in your .env file.")
                raise ValueError("GEMINI_API_KEY is not configured. Please set it in your .env file.")
    else:  # groq
        if not settings.GROQ_API_KEY or settings.GROQ_API_KEY in ("", "your_key_here"):
            if is_testing:
                logger.warning("GROQ_API_KEY is not configured (ignored in testing environment).")
            else:
                logger.error("CRITICAL: GROQ_API_KEY is not configured. Please set it in your .env file.")
                raise ValueError("GROQ_API_KEY is not configured. Please set it in your .env file.")
        else:
            logger.info("GROQ LLM Provider configuration validated successfully.")

    # 2. Validate JWT_SECRET_KEY in production/non-testing environment
    if not is_testing:
        if not os.environ.get("JWT_SECRET_KEY") and settings.JWT_SECRET_KEY in ("", None):
            logger.error("CRITICAL: JWT_SECRET_KEY is not configured. Please set a static token secret in your .env file.")
            raise ValueError("JWT_SECRET_KEY is not configured. Please set it in your .env file.")

        # 3. Validate DATABASE_URL (refuse memory DB in production/non-testing)
        if "sqlite" in settings.DATABASE_URL and ":memory:" in settings.DATABASE_URL:
            logger.error("CRITICAL: DATABASE_URL is set to in-memory SQLite. A real database is required for production.")
            raise ValueError("DATABASE_URL is set to in-memory SQLite, which is invalid for production.")
        if "postgresql" in settings.DATABASE_URL and not any(k in settings.DATABASE_URL for k in ("ssl=", "sslmode=")):
            logger.warning("SECURITY WARNING: DATABASE_URL for PostgreSQL does not explicitly configure SSL/TLS. Please ensure sslmode=require is appended to the connection string in production.")

    # 1. Create DB tables
    logger.info("Creating database tables if not exist...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        from sqlalchemy import text
        try:
            await conn.execute(text("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMP;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMP;"))
            logger.info("Database schema migrations verified.")
        except Exception as exc:
            logger.warning("Could not execute candidates/users table schema migration: %s", exc)
    logger.info("Database tables verified.")

    # 2. Initialize app states
    app.state.orchestrator = InterviewOrchestrator()

    if is_testing:
        logger.info("Test environment detected. Skipping ML loaders.")
        app.state.stt = None
        app.state.tts = None
    elif not settings.VOICE_ENABLED:
        logger.info("VOICE_ENABLED=false — skipping STT/TTS model loading (text-only mode).")
        app.state.stt = None
        app.state.tts = None
    else:
        logger.info("Loading Whisper STT (this may take 30-60s first time)...")
        app.state.stt = WhisperSTT(model_size="base")

        logger.info("Loading TTS model (tacotron2-DDC, CPU-fast)...")
        app.state.tts = TTSService()

    logger.info("Application startup complete. Services initialized.")
    yield

    # Shutdown
    logger.info("Shutting down InterviewAI backend...")
    
    # Clean up temp WAV files
    logger.info("Cleaning up temporary WAV audio files...")
    temp_dir = Path(tempfile.gettempdir())
    deleted_count = 0
    for p in temp_dir.glob("*.wav"):
        try:
            p.unlink(missing_ok=True)
            deleted_count += 1
        except Exception as exc:
            logger.warning("Failed to delete temp file %s: %s", p, exc)
    logger.info("Cleanup complete. Removed %d files.", deleted_count)
    logger.info("Application shutdown complete.")


app = FastAPI(
    title="InterviewAI",
    description="AI-powered interview preparation platform",
    version="0.1.0",
    lifespan=lifespan,
    # Disable public API docs to prevent endpoint enumeration by attackers.
    # Re-enable by setting ENABLE_DOCS=true in .env (development only).
    docs_url="/docs" if os.environ.get("ENABLE_DOCS", "").lower() == "true" else None,
    redoc_url="/redoc" if os.environ.get("ENABLE_DOCS", "").lower() == "true" else None,
    openapi_url="/openapi.json" if os.environ.get("ENABLE_DOCS", "").lower() == "true" else None,
)

# CORS configuration
allowed_origins = [origin.strip() for origin in settings.CORS_ALLOWED_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'"
    return response

# Rate Limiting configuration
app.add_middleware(RateLimitingMiddleware)


# ── Global Exception Handlers ──────────────────────────────────────────────────
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException as FastAPIHTTPException, RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import SQLAlchemyError
import uuid

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    correlation_id = str(uuid.uuid4())
    logger.error("Database error occurred [Correlation ID: %s] at path %s: %s", correlation_id, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "A database error occurred. Please try again later.",
            "correlation_id": correlation_id
        }
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, (FastAPIHTTPException, StarletteHTTPException, RequestValidationError)):
        raise exc
    correlation_id = str(uuid.uuid4())
    logger.error("Unhandled server exception [Correlation ID: %s] at path %s: %s", correlation_id, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal server error occurred. Please contact support.",
            "correlation_id": correlation_id
        }
    )



# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(candidates_router, prefix="/api")
app.include_router(interviews_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(dsa_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(ws_router)


@app.get("/health")
async def health_check():
    """Health check endpoint — returns minimal status only."""
    return {"status": "ok"}

