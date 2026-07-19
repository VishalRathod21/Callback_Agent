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
is_localhost = "localhost" in settings.async_database_url or "127.0.0.1" in settings.async_database_url

if "postgresql" in settings.async_database_url or "postgres" in settings.async_database_url:
    if (not is_testing and not is_localhost) or "sslmode" in settings.DATABASE_URL:
        connect_args["ssl"] = True
elif "mysql" in settings.async_database_url:
    connect_args["ssl"] = True

is_sqlite = "sqlite" in settings.async_database_url

engine_kwargs = {
    "echo": False,
    "future": True,
    "connect_args": connect_args if connect_args else {},
}

if not is_sqlite:
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 10,
        "pool_timeout": 30,
        "pool_recycle": 1800,
        "pool_pre_ping": True,
    })

engine = create_async_engine(
    settings.async_database_url,
    **engine_kwargs
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
