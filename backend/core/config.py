"""Application configuration using Pydantic BaseSettings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    GROQ_API_KEY: str = "your_key_here"
    LLM_PROVIDER: str = "groq"
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_FALLBACK_MODELS: str = "llama-3.3-70b-versatile,qwen/qwen3-32b,llama3-8b-8192"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5433/interviewai"
    CHROMA_PERSIST_DIR: str = "./chroma_db"
    UPLOAD_DIR: str = "./uploads"
    WHISPER_MODEL: str = "base"
    XTTS_MODEL_PATH: str = "./models/xtts"
    VOICE_ENABLED: bool = False

    JWT_SECRET_KEY: str = "729d380e2fe9a3a985e5b8d28a1c9b3d0bf857dcd5a89473b185b3c545de2ef5"  # change in prod
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REFRESH_TOKEN_REMEMBER_ME_EXPIRE_DAYS: int = 90

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


settings = Settings()
