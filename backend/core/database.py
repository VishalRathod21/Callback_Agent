"""Async SQLAlchemy database setup."""

import sys
import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from core.config import settings

# Async engine with SSL/TLS configuration for production databases (PostgreSQL/MySQL)
connect_args = {}
is_testing = "pytest" in sys.modules or os.environ.get("TESTING") == "true"
is_localhost = "localhost" in settings.DATABASE_URL or "127.0.0.1" in settings.DATABASE_URL

if not is_testing and not is_localhost:
    if settings.DATABASE_URL.startswith("postgresql"):
        connect_args["ssl"] = "require"
    elif settings.DATABASE_URL.startswith("mysql"):
        connect_args["ssl"] = True

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    connect_args=connect_args if connect_args else {},
)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""

    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that provides an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
