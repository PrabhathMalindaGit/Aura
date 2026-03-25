import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel


# Safe if .env is missing; defaults remain in effect.
load_dotenv()

_LOCAL_ENVIRONMENTS = {"development", "dev", "local", "test"}
_LOG_LEVELS = {
    "DEBUG": "DEBUG",
    "INFO": "INFO",
    "WARN": "WARNING",
    "WARNING": "WARNING",
    "ERROR": "ERROR",
    "CRITICAL": "CRITICAL",
}


class ConfigurationError(ValueError):
    pass


class Settings(BaseModel):
    environment: str = "development"
    host: str = "127.0.0.1"
    port: int = 8001
    pain_high_threshold: int = 7
    log_level: str = "INFO"
    aura_ai_service_key: str = "dev_aura_ai_key"


def _normalize_environment() -> str:
    raw_environment = (
        os.getenv("ENV")
        or os.getenv("NODE_ENV")
        or "development"
    ).strip().lower()
    if raw_environment in {"dev", "local"}:
        return "development"
    if raw_environment == "testing":
        return "test"
    return raw_environment or "development"


def is_local_environment(environment: str) -> bool:
    return environment in _LOCAL_ENVIRONMENTS


def _parse_int_env(name: str, default: str, *, minimum: int, maximum: int) -> int:
    raw_value = os.getenv(name, default).strip()
    try:
        parsed = int(raw_value)
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be a valid integer") from exc

    if parsed < minimum or parsed > maximum:
        raise ConfigurationError(
            f"{name} must be between {minimum} and {maximum}"
        )

    return parsed


def _parse_log_level() -> str:
    raw_level = os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO"
    normalized = _LOG_LEVELS.get(raw_level)
    if normalized is None:
        raise ConfigurationError("LOG_LEVEL must be one of DEBUG, INFO, WARNING, ERROR, CRITICAL")
    return normalized


def _parse_ai_service_key(environment: str) -> str:
    default_ai_service_key = (
        "" if not is_local_environment(environment) else "dev_aura_ai_key"
    )
    key = os.getenv("AURA_AI_SERVICE_KEY", default_ai_service_key).strip()
    if not key and not is_local_environment(environment):
        raise ConfigurationError(
            "AURA_AI_SERVICE_KEY is required outside development and test environments"
        )
    return key


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    environment = _normalize_environment()

    return Settings(
        environment=environment,
        host=os.getenv("HOST", "127.0.0.1"),
        port=_parse_int_env("PORT", "8001", minimum=1, maximum=65535),
        pain_high_threshold=_parse_int_env(
            "PAIN_HIGH_THRESHOLD", "7", minimum=0, maximum=10
        ),
        log_level=_parse_log_level(),
        aura_ai_service_key=_parse_ai_service_key(environment),
    )
