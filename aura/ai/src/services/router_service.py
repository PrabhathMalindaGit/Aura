from src.models.schemas import ClassifyRequest, ClassifyResponse
from src.utils.text_utils import normalize_for_matching


_CRISIS_KEYWORDS = [
    "suicide",
    "kill myself",
    "self harm",
    "end my life",
    "feel unsafe",
    "need urgent help",
    "can't breathe",
    "cannot breathe",
    "chest pain",
    "faint",
    "overdose",
    "took too many pills",
]


def classify_risk(req: ClassifyRequest, threshold: int) -> ClassifyResponse:
    reasons: list[str] = []

    if req.pain is not None and req.pain >= threshold:
        reasons.append("PAIN_GE_THRESHOLD")

    normalized_text = normalize_for_matching(req.text)
    normalized_keywords = [normalize_for_matching(term) for term in _CRISIS_KEYWORDS]

    if normalized_text and any(term in normalized_text for term in normalized_keywords):
        reasons.append("CRISIS_LANGUAGE")

    risk = "high" if reasons else "low"

    return ClassifyResponse(
        risk=risk,
        reasons=reasons,
        ruleVersion="v1",
    )
