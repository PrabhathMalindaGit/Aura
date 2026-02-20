import logging


def redact_text(text: str) -> str:
    if text is None:
        return ""

    safe = text.replace("\n", " ").replace("\r", " ")
    if len(safe) <= 40:
        return safe

    return f"{safe[:40]}…"


def setup_logging(log_level: str = "INFO") -> None:
    level = getattr(logging, (log_level or "INFO").upper(), logging.INFO)

    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )
