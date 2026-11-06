"""Application configuration using Pydantic BaseSettings."""

import secrets
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    # ── Runtime ────────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"          # development | production | test
    # When true, missing LLM / JWT configuration aborts startup instead of
    # degrading gracefully.  Defaults to true in production.
    STRICT_STARTUP: bool | None = None

    # ── LLM providers ──────────────────────────────────────────────────────
    GROQ_API_KEY: str = ""
    LLM_PROVIDER: str = "groq"               # groq | gemini | none
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    GROQ_FALLBACK_MODELS: str = "openai/gpt-oss-20b,qwen/qwen3.8-27b"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    LLM_TIMEOUT_SECONDS: float = 30.0

    # ── Embeddings / RAG ───────────────────────────────────────────────────
    # gemini  → Gemini text-embedding-004 (requires GEMINI_API_KEY)
    # hashing → deterministic local feature-hashing embeddings (no network)
    # auto    → gemini when a key is configured, otherwise hashing
    EMBEDDING_BACKEND: str = "auto"
    EMBEDDING_DIM: int = 768
    GEMINI_EMBEDDING_MODEL: str = "gemini-embedding-001"
    RAG_CHUNK_SIZE: int = 600                 # characters
    RAG_CHUNK_OVERLAP: int = 120
    RAG_TOP_K: int = 4
    RAG_MIN_SCORE: float = 0.05               # drop near-zero similarity hits

    # ── Voice ──────────────────────────────────────────────────────────────
    DEEPGRAM_API_KEY: str = ""
    DEEPGRAM_MODEL: str = "nova-2"
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = "21m00Tcm4TlvDq8ikWAM"
    VOICE_ENABLED: bool = False

    # ── Storage ────────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./interviewai_dev.db"
    FAISS_PERSIST_DIR: str = "./faiss_store"
    FAISS_INDEX_PATH: str = ""                # alias of FAISS_PERSIST_DIR
    UPLOAD_DIR: str = "./uploads"

    # ── HTTP ───────────────────────────────────────────────────────────────
    CORS_ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    FRONTEND_URL: str = ""
    PORT: int = 8002
    ENABLE_DOCS: bool = False

    # ── Auth ───────────────────────────────────────────────────────────────
    SECRET_KEY: str = ""
    JWT_SECRET_KEY: str = ""
    JWT_SECRET_IS_FALLBACK: bool = False
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REFRESH_TOKEN_REMEMBER_ME_EXPIRE_DAYS: int = 90
    # Set true behind TLS; derived from ENVIRONMENT when None.
    COOKIE_SECURE: bool | None = None

    # ── Interview engine ───────────────────────────────────────────────────
    # Adaptive difficulty policy thresholds on the 0-10 overall answer score.
    ADAPTIVE_DECREASE_MAX: float = 4.0        # score <= this → decrease difficulty
    ADAPTIVE_INCREASE_MIN: float = 8.0        # score >= this → increase difficulty
    ADAPTIVE_ENABLED: bool = True
    DEFAULT_QUESTIONS_PER_ROUND: int = 5
    MAX_QUESTIONS_PER_ROUND: int = 12
    DEFAULT_DSA_PROBLEMS: int = 2
    # Rubric weights (must sum to 1.0)
    RUBRIC_WEIGHT_TECHNICAL: float = 0.40
    RUBRIC_WEIGHT_CONCEPTUAL: float = 0.25
    RUBRIC_WEIGHT_COMPLETENESS: float = 0.20
    RUBRIC_WEIGHT_COMMUNICATION: float = 0.15

    # ── Rate limiting ──────────────────────────────────────────────────────
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
    RATE_LIMIT_UPLOAD_LIMIT: int = 10
    RATE_LIMIT_UPLOAD_WINDOW: int = 3600
    TRUSTED_PROXY: bool = False

    # ── Derived helpers ────────────────────────────────────────────────────

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def strict_startup(self) -> bool:
        if self.STRICT_STARTUP is not None:
            return self.STRICT_STARTUP
        return self.is_production

    @property
    def cookie_secure(self) -> bool:
        if self.COOKIE_SECURE is not None:
            return self.COOKIE_SECURE
        return self.is_production

    @property
    def llm_configured(self) -> bool:
        provider = self.LLM_PROVIDER.lower()
        if provider == "gemini":
            return bool(self.GEMINI_API_KEY) and self.GEMINI_API_KEY != "your_key_here"
        if provider == "groq":
            return bool(self.GROQ_API_KEY) and not self.GROQ_API_KEY.startswith("gsk_your_")
        return False

    @property
    def embedding_backend(self) -> str:
        backend = self.EMBEDDING_BACKEND.lower()
        if backend == "auto":
            return "gemini" if self.GEMINI_API_KEY else "hashing"
        return backend

    @property
    def rubric_weights(self) -> dict[str, float]:
        return {
            "technical_correctness": self.RUBRIC_WEIGHT_TECHNICAL,
            "conceptual_understanding": self.RUBRIC_WEIGHT_CONCEPTUAL,
            "answer_completeness": self.RUBRIC_WEIGHT_COMPLETENESS,
            "communication_clarity": self.RUBRIC_WEIGHT_COMMUNICATION,
        }

    @property
    def get_jwt_secret(self) -> str:
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
            return url.replace("sqlite://", "sqlite+aiosqlite://", 1)
        else:
            return url

        if "postgresql+asyncpg" in url:
            parsed = urlparse(url)
            params = dict(parse_qsl(parsed.query))
            params.pop("channel_binding", None)
            params.pop("sslmode", None)
            new_query = urlencode(params) if params else ""
            url = urlunparse(parsed._replace(query=new_query))
        return url

    @property
    def is_sqlite(self) -> bool:
        return "sqlite" in self.async_database_url

    @property
    def faiss_dir(self) -> str:
        return self.FAISS_INDEX_PATH or self.FAISS_PERSIST_DIR or "./faiss_store"

    @property
    def allowed_origins(self) -> list[str]:
        origins = [o.strip() for o in self.CORS_ALLOWED_ORIGINS.split(",") if o.strip()]
        if self.FRONTEND_URL:
            trimmed = self.FRONTEND_URL.strip().rstrip("/")
            if trimmed not in origins:
                origins.append(trimmed)
        return origins

    @model_validator(mode="after")
    def resolve_placeholders(self) -> "Settings":
        placeholder_secrets = ("", "your_secret_here", "your_jwt_secret_key_here",
                               "generate_a_secure_jwt_hex_secret_here")
        if self.JWT_SECRET_KEY in placeholder_secrets:
            if self.SECRET_KEY not in placeholder_secrets:
                self.JWT_SECRET_KEY = self.SECRET_KEY
            else:
                self.JWT_SECRET_KEY = secrets.token_hex(32)
                self.JWT_SECRET_IS_FALLBACK = True
        if self.FAISS_INDEX_PATH:
            self.FAISS_PERSIST_DIR = self.FAISS_INDEX_PATH
        else:
            self.FAISS_INDEX_PATH = self.FAISS_PERSIST_DIR
        total = (self.RUBRIC_WEIGHT_TECHNICAL + self.RUBRIC_WEIGHT_CONCEPTUAL
                 + self.RUBRIC_WEIGHT_COMPLETENESS + self.RUBRIC_WEIGHT_COMMUNICATION)
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f"Rubric weights must sum to 1.0 (got {total:.3f})")
        if self.ADAPTIVE_DECREASE_MAX >= self.ADAPTIVE_INCREASE_MIN:
            raise ValueError("ADAPTIVE_DECREASE_MAX must be lower than ADAPTIVE_INCREASE_MIN")
        return self

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
