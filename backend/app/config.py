from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://nethelper:nethelper@localhost:5432/nethelper"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Celery (uses Redis by default)
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # JWT / Auth
    SECRET_KEY: str = "changeme-replace-with-a-secure-random-secret-key-of-at-least-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Encryption key for AES-256: 32 bytes expressed as 64-character hex string.
    # Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    ENCRYPTION_KEY: str = "0000000000000000000000000000000000000000000000000000000000000000"

    # App metadata
    APP_NAME: str = "NetHelper"
    DEBUG: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Module-level singleton for convenience imports
settings = get_settings()
