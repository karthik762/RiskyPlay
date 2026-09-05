"""Configuration settings for the AI Risk Analyst Service."""

import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment or .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    AI_SERVICE_PORT: int = 8000
    OMNIROUTE_BASE_URL: str = "http://localhost:20128/v1"
    OMNIROUTE_API_KEY: Optional[str] = None
    OMNIROUTE_MODEL: str = "claude-3-5-sonnet-20241022"
    OMNIROUTE_TIMEOUT_SECONDS: float = 15.0


settings = Settings()
