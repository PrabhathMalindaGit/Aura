import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel


# Safe if .env is missing; defaults remain in effect.
load_dotenv()


class Settings(BaseModel):
    environment: str = "development"
    host: str = "127.0.0.1"
    port: int = 8001
    pain_high_threshold: int = 7
    log_level: str = "INFO"
    aura_ai_service_key: str = "dev_aura_ai_key"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    environment = (
        os.getenv("ENV")
        or os.getenv("NODE_ENV")
        or "development"
    ).strip().lower()
    default_ai_service_key = "" if environment == "production" else "dev_aura_ai_key"

    return Settings(
        environment=environment,
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8001")),
        pain_high_threshold=int(os.getenv("PAIN_HIGH_THRESHOLD", "7")),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        aura_ai_service_key=os.getenv(
            "AURA_AI_SERVICE_KEY", default_ai_service_key
        ),
    )
