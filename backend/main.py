"""InterviewAI Backend - FastAPI Application."""

import warnings
# Suppress the deprecation warning from google.generativeai
warnings.filterwarnings("ignore", category=FutureWarning)

# Apply compatibility patches for Coqui TTS and transformers under PyTorch/Python 3.13
try:
    import torch
    import transformers.pytorch_utils
    if not hasattr(transformers.pytorch_utils, "isin_mps_friendly"):
        transformers.pytorch_utils.isin_mps_friendly = torch.isin
except Exception:
    pass

try:
    import transformers.utils.import_utils as imp
    if hasattr(imp, "is_torch_greater_or_equal"):
        orig_check = imp.is_torch_greater_or_equal
        def wrapped_check(version, *args, **kwargs):
            if version == "2.9":
                return False
            return orig_check(version, *args, **kwargs)
        imp.is_torch_greater_or_equal = wrapped_check
except Exception:
    pass


import asyncio
import logging
import os
import tempfile

from contextlib import asynccontextmanager
from pathlib import Path

import base64
import secrets
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from api.routes.candidates import router as candidates_router
from api.routes.interviews import router as interviews_router
from api.routes.reports import router as reports_router
from api.routes.dsa import router as dsa_router
from api.routes.auth import router as auth_router
from api.routes.debrief import router as debrief_router
from api.routes.dashboard import router as dashboard_router
from api.routes.practice import router as practice_router
from api.websocket import router as ws_router
from core.config import settings
from core.database import engine, Base
from services.stt.deepgram_service import DeepgramSTT
from services.tts.elevenlabs_service import ElevenLabsTTS
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
        if settings.JWT_SECRET_IS_FALLBACK or not settings.JWT_SECRET_KEY or settings.JWT_SECRET_KEY.strip() in ("", "your_secret_here"):
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

    from services.faiss_service import FAISSService
    logger.info("Initializing FAISS vector store...")
    logger.info("FAISS_PERSIST_DIR: %s", settings.FAISS_PERSIST_DIR)
    app.state.faiss = FAISSService()
    logger.info("FAISS ready. Stats: %s", app.state.faiss.get_stats())

    if is_testing:
        logger.info("Test environment detected. Skipping ML loaders.")
        app.state.stt = None
        app.state.tts = None
    elif not settings.VOICE_ENABLED:
        logger.info("VOICE_ENABLED=false — skipping STT/TTS model loading (text-only mode).")
        app.state.stt = None
        app.state.tts = None
    else:
        logger.info("Loading Deepgram STT...")
        app.state.stt = DeepgramSTT()

        logger.info("Loading ElevenLabs TTS...")
        app.state.tts = ElevenLabsTTS()

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
    title="Callback Agent API",
    description="AI-powered interview preparation platform",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Secure documentation route middleware (protects Swagger UI and schemas in production)
@app.middleware("http")
async def secure_docs_middleware(request: Request, call_next):
    path = request.url.path
    if path in ("/docs", "/redoc", "/openapi.json"):
        # Check if docs are explicitly public (ENABLE_DOCS=true)
        if not (os.environ.get("ENABLE_DOCS", "").lower() == "true" or settings.ENABLE_DOCS):
            auth_header = request.headers.get("Authorization")
            if not auth_header or not auth_header.startswith("Basic "):
                return Response(
                    content="Unauthorized",
                    status_code=401,
                    headers={"WWW-Authenticate": 'Basic realm="Secure API Docs"'},
                )
            try:
                auth_decoded = base64.b64decode(auth_header.split(" ")[1]).decode("utf-8")
                username, password = auth_decoded.split(":", 1)
            except Exception:
                return Response(
                    content="Unauthorized",
                    status_code=401,
                    headers={"WWW-Authenticate": 'Basic realm="Secure API Docs"'},
                )
            
            expected_username = os.environ.get("DOCS_USERNAME", "admin")
            expected_password = os.environ.get("DOCS_PASSWORD", settings.JWT_SECRET_KEY or "callback-secure-docs")
            
            if not (secrets.compare_digest(username, expected_username) and 
                    secrets.compare_digest(password, expected_password)):
                return Response(
                    content="Unauthorized",
                    status_code=401,
                    headers={"WWW-Authenticate": 'Basic realm="Secure API Docs"'},
                )
    return await call_next(request)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    
    # Relax CSP dynamically for docs to load assets from CDN (e.g. jsdelivr)
    if request.url.path in ("/docs", "/redoc"):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
            "img-src 'self' data: cdn.jsdelivr.net fastapi.tiangolo.com;"
        )
    else:
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
app.include_router(debrief_router)
app.include_router(dashboard_router)
app.include_router(practice_router)
app.include_router(ws_router)


@app.get("/", tags=["Health"])
async def root():
    return {
        "status": "healthy",
        "service": "Callback Agent API",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint — returns minimal status only."""
    return {"status": "ok"}

