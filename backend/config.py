from pathlib import Path
from pydantic_settings import BaseSettings

# .env lives at the project root (one level above this backend/ directory)
_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://agent:agent@localhost:5433/agentdb"
    sync_database_url: str = "postgresql://agent:agent@localhost:5433/agentdb"
    redis_url: str = "redis://localhost:6379/0"
    telegram_bot_token: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    langchain_tracing_v2: str = ""
    langchain_api_key: str = ""
    langchain_project: str = "agentplatform"

    class Config:
        env_file = str(_ENV_FILE)
        extra = "ignore"


settings = Settings()

AVAILABLE_MODELS = [
    "gpt-5.4-mini-2026-03-17",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "claude-opus-4-7",
    "claude-sonnet-4-6",
]

AVAILABLE_CHANNELS = ["telegram", "whatsapp"]
