"""Async SQLAlchemy database setup.

PostgreSQL is the production target.  SQLite (via aiosqlite) is supported for
local development and automated tests so the application can run without a
database server.
"""

import sys
import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from core.config import settings

connect_args: dict = {}
is_testing = "pytest" in sys.modules or os.environ.get("TESTING") == "true"
_url = settings.async_database_url
is_localhost = "localhost" in _url or "127.0.0.1" in _url
is_sqlite = "sqlite" in _url

if "postgresql" in _url or "postgres" in _url:
    if (not is_testing and not is_localhost) or "sslmode" in settings.DATABASE_URL:
        connect_args["ssl"] = True
elif "mysql" in _url:
    connect_args["ssl"] = True

engine_kwargs: dict = {
    "echo": False,
    "future": True,
    "connect_args": connect_args,
}

if not is_sqlite:
    engine_kwargs.update(
        {
            "pool_size": 20,
            "max_overflow": 10,
            "pool_timeout": 30,
            "pool_recycle": 1800,
            "pool_pre_ping": True,
        }
    )

engine = create_async_engine(_url, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that provides an async database session.

    Commits on success, rolls back on any exception raised by the route.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
