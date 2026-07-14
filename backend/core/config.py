"""Application configuration using Pydantic BaseSettings."""

import secrets
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    GROQ_API_KEY: str = ""
    LLM_PROVIDER: str = "groq"
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_FALLBACK_MODELS: str = "llama-3.3-70b-versatile,qwen/qwen3-32b,llama3-8b-8192"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    DATABASE_URL: str = "sqlite+aiosqlite:///:memory:"
    CHROMA_PERSIST_DIR: str = "./chroma_db"
    UPLOAD_DIR: str = "./uploads"
    WHISPER_MODEL: str = "base"
    XTTS_MODEL_PATH: str = "./models/xtts"
    VOICE_ENABLED: bool = False
    CORS_ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    JWT_SECRET_KEY: str = Field(default_factory=lambda: secrets.token_hex(32))
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REFRESH_TOKEN_REMEMBER_ME_EXPIRE_DAYS: int = 90

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

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


settings = Settings()
