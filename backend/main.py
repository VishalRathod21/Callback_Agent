"""InterviewAI Backend - FastAPI Application."""

import warnings
# Suppress the deprecation warning from google.generativeai
warnings.filterwarnings("ignore", category=FutureWarning)


import asyncio
import logging
import tempfile

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
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

    # Validate GROQ_API_KEY
    import sys
    import os
    is_testing = "pytest" in sys.modules or os.environ.get("TESTING") == "true"
    if not settings.GROQ_API_KEY or settings.GROQ_API_KEY == "your_key_here":
        if is_testing:
            logger.warning("GROQ_API_KEY is not configured (ignored in testing environment).")
        else:
            logger.error("CRITICAL: GROQ_API_KEY is not configured. Please set it in your .env file.")
            raise ValueError("GROQ_API_KEY is not configured. Please set it in your .env file.")
    else:
        logger.info("GROQ LLM Provider configuration validated successfully.")

    # 1. Create DB tables
    logger.info("Creating database tables if not exist...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        from sqlalchemy import text
        try:
            await conn.execute(text("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;"))
            logger.info("Database schema migrations verified.")
        except Exception as exc:
            logger.warning("Could not execute candidates table schema migration: %s", exc)
    logger.info("Database tables verified.")

    # 2. Initialize app states
    app.state.orchestrator = InterviewOrchestrator()

    import sys
    import os
    is_testing = "pytest" in sys.modules or os.environ.get("TESTING") == "true"

    if is_testing:
        logger.info("Test environment detected. Skipping ML loaders.")
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
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    """Health check endpoint."""
    return {"status": "ok", "service": "InterviewAI"}

