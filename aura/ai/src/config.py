import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel


# Safe if .env is missing; defaults remain in effect.
load_dotenv()


class Settings(BaseModel):
    host: str = "127.0.0.1"
    port: int = 8001
    pain_high_threshold: int = 7
    log_level: str = "INFO"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8001")),
        pain_high_threshold=int(os.getenv("PAIN_HIGH_THRESHOLD", "7")),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )
