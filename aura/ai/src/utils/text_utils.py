import re


_APOSTROPHE_VARIANTS = ("’", "`", "´", "ʼ", "ʹ")


def normalize_for_matching(text: str | None) -> str:
    if not text:
        return ""

    normalized = text.lower()

    for mark in _APOSTROPHE_VARIANTS:
        normalized = normalized.replace(mark, "'")

    # Make "can't" and "cant" equivalent.
    normalized = normalized.replace("'", "")

    # Keep words/numbers only, then collapse repeated whitespace.
    normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized
