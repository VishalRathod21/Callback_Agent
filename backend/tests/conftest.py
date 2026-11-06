"""Shared pytest configuration.

Forces an isolated in-memory SQLite database and test mode *before* any
application module is imported, so tests never touch a developer database or
require external API keys.
"""

import os
import sys
import asyncio
from pathlib import Path

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("EMBEDDING_BACKEND", "hashing")
os.environ.setdefault("LLM_PROVIDER", "none")
os.environ.setdefault("VOICE_ENABLED", "false")
os.environ.setdefault("FAISS_PERSIST_DIR", str(Path(__file__).parent / "_faiss_test_store"))
os.environ.setdefault("UPLOAD_DIR", str(Path(__file__).parent / "_uploads_test"))
os.environ.setdefault("RATE_LIMIT_ENABLED", "true")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    """Create all tables once in the in-memory database used by the app."""
    from core.database import engine, Base
    import core.models  # noqa: F401

    async def _create():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_create())
    yield


@pytest.fixture(autouse=True)
def _clean_faiss_store():
    """Give every test an empty FAISS store so retrieval tests are deterministic."""
    import shutil
    store = Path(os.environ["FAISS_PERSIST_DIR"])
    shutil.rmtree(store, ignore_errors=True)
    store.mkdir(parents=True, exist_ok=True)
    yield
    shutil.rmtree(store, ignore_errors=True)
