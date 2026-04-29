import hashlib
import math
import re
from collections import Counter


DEFAULT_HASHING_VECTOR_DIMENSIONS = 384
_TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "can",
    "for",
    "from",
    "how",
    "i",
    "if",
    "in",
    "is",
    "it",
    "me",
    "my",
    "of",
    "on",
    "or",
    "the",
    "to",
    "today",
    "what",
    "when",
    "with",
    "you",
    "your",
}


def tokenize(value: str) -> list[str]:
    return [
        token
        for token in _TOKEN_PATTERN.findall(value.lower())
        if token not in _STOP_WORDS and len(token) > 1
    ]


def lexical_score(query: str, document: str) -> float:
    query_terms = Counter(tokenize(query))
    document_terms = Counter(tokenize(document))
    if not query_terms or not document_terms:
        return 0.0

    overlap = 0.0
    for term, query_count in query_terms.items():
        if term in document_terms:
            overlap += min(query_count, document_terms[term])

    if overlap == 0:
        return 0.0

    # Normalize so longer documents do not win purely by size.
    return overlap / (sum(query_terms.values()) ** 0.5 * sum(document_terms.values()) ** 0.5)


def deterministic_hashing_vector(
    value: str,
    *,
    dimensions: int = DEFAULT_HASHING_VECTOR_DIMENSIONS,
) -> list[float]:
    if dimensions <= 0:
        raise ValueError("dimensions must be positive")

    vector = [0.0] * dimensions
    tokens = tokenize(value)
    if not tokens:
        return vector

    for token in tokens:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=16).digest()
        index = int.from_bytes(digest[:8], "big") % dimensions
        sign = -1.0 if digest[8] & 1 else 1.0
        vector[index] += sign

    norm = math.sqrt(sum(component * component for component in vector))
    if norm == 0:
        return [0.0] * dimensions

    return [component / norm for component in vector]
