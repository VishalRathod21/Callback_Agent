"""Application configuration using Pydantic BaseSettings."""

import secrets
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    GROQ_API_KEY: str = ""
    LLM_PROVIDER: str = "groq"
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_FALLBACK_MODELS: str = "llama-3.3-70b-versatile,qwen/qwen3-32b,llama3-8b-8192"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    DEEPGRAM_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = "21m00Tcm4TlvDq8ikWAM"
    DATABASE_URL: str = "sqlite+aiosqlite:///:memory:"
    FAISS_PERSIST_DIR: str = "./faiss_store"
    FAISS_INDEX_PATH: str = "" # Fallback/alias to FAISS_PERSIST_DIR
    UPLOAD_DIR: str = "./uploads"
    VOICE_ENABLED: bool = False
    CORS_ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    FRONTEND_URL: str = "" # Injected from production frontend domains
    PORT: int = 8002

    SECRET_KEY: str = "" # Alternative env variable name for JWT secret
    JWT_SECRET_KEY: str = ""
    JWT_SECRET_IS_FALLBACK: bool = False
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REFRESH_TOKEN_REMEMBER_ME_EXPIRE_DAYS: int = 90

    @property
    def get_jwt_secret(self) -> str:
        """Resolve JWT secret from JWT_SECRET_KEY or fallback SECRET_KEY."""
        return self.JWT_SECRET_KEY

    @property
    def async_database_url(self) -> str:
        """Ensure database URL scheme is async-compatible for SQLAlchemy/Alembic."""
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("sqlite://") and "+aiosqlite" not in url:
            url = url.replace("sqlite://", "sqlite+aiosqlite://", 1)
            return url
        else:
            return url

        # asyncpg compatible parameters mapping
        if "postgresql+asyncpg" in url:
            parsed = urlparse(url)
            params = dict(parse_qsl(parsed.query))
            params.pop("channel_binding", None)
            params.pop("sslmode", None)
            new_query = urlencode(params) if params else ""
            url = urlunparse(parsed._replace(query=new_query))

        return url

    @property
    def faiss_dir(self) -> str:
        """Resolve FAISS persistence folder."""
        return self.FAISS_INDEX_PATH or self.FAISS_PERSIST_DIR or "./faiss_store"

    @property
    def allowed_origins(self) -> list[str]:
        """Parse allowed CORS origins including FRONTEND_URL if provided."""
        origins = [o.strip() for o in self.CORS_ALLOWED_ORIGINS.split(",") if o.strip()]
        if self.FRONTEND_URL:
            trimmed = self.FRONTEND_URL.strip()
            if trimmed not in origins:
                origins.append(trimmed)
        return origins

    # Rate Limiting Configurations
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PUBLIC_LIMIT: int = 30
    RATE_LIMIT_PUBLIC_WINDOW: int = 60
    RATE_LIMIT_USER_LIMIT: int = 100
    RATE_LIMIT_USER_WINDOW: int = 60
    RATE_LIMIT_AUTH_IP_LIMIT: int = 5
    RATE_LIMIT_AUTH_IP_WINDOW: int = 60
    RATE_LIMIT_AUTH_ACCOUNT_LIMIT: int = 5
    RATE_LIMIT_AUTH_ACCOUNT_WINDOW: int = 60
    RATE_LIMIT_AUTH_BACKOFF_BASE: float = 2.0
    RATE_LIMIT_AUTH_BACKOFF_FACTOR: float = 2.0
    RATE_LIMIT_AUTH_BACKOFF_MAX: float = 300.0
    RATE_LIMIT_AUTH_COOLDOWN: float = 3600.0
    # Upload rate limit: prevent storage fill abuse (default: 10 per hour per user)
    RATE_LIMIT_UPLOAD_LIMIT: int = 10
    RATE_LIMIT_UPLOAD_WINDOW: int = 3600
    # Set to true ONLY when behind a trusted reverse proxy (nginx, AWS ALB, etc.)
    # Enables X-Forwarded-For header trust for real IP extraction.
    TRUSTED_PROXY: bool = False

    @model_validator(mode="after")
    def resolve_placeholders(self) -> "Settings":
        # Resolve secrets
        if not self.JWT_SECRET_KEY or self.JWT_SECRET_KEY in ("your_secret_here", ""):
            if self.SECRET_KEY and self.SECRET_KEY not in ("your_secret_here", ""):
                self.JWT_SECRET_KEY = self.SECRET_KEY
            else:
                self.JWT_SECRET_KEY = secrets.token_hex(32)
                self.JWT_SECRET_IS_FALLBACK = True
        # Resolve FAISS paths
        if self.FAISS_INDEX_PATH:
            self.FAISS_PERSIST_DIR = self.FAISS_INDEX_PATH
        else:
            self.FAISS_INDEX_PATH = self.FAISS_PERSIST_DIR
        return self

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


settings = Settings()
