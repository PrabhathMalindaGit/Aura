import re
from collections import Counter


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
