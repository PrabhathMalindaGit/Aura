import json
import logging
from datetime import datetime, timezone


_STANDARD_RECORD_KEYS = set(logging.makeLogRecord({}).__dict__.keys()) | {"message", "asctime"}


def redact_text(text: str) -> str:
    if text is None:
        return ""

    safe = text.replace("\n", " ").replace("\r", " ")
    if len(safe) <= 40:
        return safe

    return f"{safe[:40]}…"


def setup_logging(log_level: str = "INFO") -> None:
    level = getattr(logging, (log_level or "INFO").upper(), logging.INFO)

    class JsonFormatter(logging.Formatter):
        def format(self, record: logging.LogRecord) -> str:
            payload = {
                "ts": datetime.now(timezone.utc).isoformat(),
                "level": record.levelname.lower(),
                "event": record.getMessage(),
            }

            for key, value in record.__dict__.items():
                if key in _STANDARD_RECORD_KEYS or key.startswith("_"):
                    continue
                if value is None:
                    continue
                payload[key] = value

            if record.exc_info:
                error_type = record.exc_info[0]
                payload["errorType"] = (
                    error_type.__name__ if hasattr(error_type, "__name__") else str(error_type)
                )

            return json.dumps(payload, default=str)

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())

    logging.basicConfig(
        level=level,
        handlers=[handler],
        force=True,
    )
