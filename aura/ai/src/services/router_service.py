from src.models.schemas import ClassifyRequest, ClassifyResponse
from src.utils.text_utils import normalize_for_matching


PAIN_GE_THRESHOLD = "PAIN_GE_THRESHOLD"
CRISIS_LANGUAGE = "CRISIS_LANGUAGE"

_ALWAYS_CRISIS_PHRASES = [
    "suicide",
    "kill myself",
    "self harm",
    "end my life",
    "feel unsafe",
    "can't breathe",
    "cant breathe",
    "cannot breathe",
    "chest pain",
    "faint",
    "overdose",
    "took too many pills",
    "do not want to wake up",
    "don't want to wake up",
    "dont want to wake up",
    "wish I would not wake up",
    "wish I wouldn't wake up",
    "wish i wouldnt wake up",
    "better off dead",
    "no reason to live",
    "can't go on",
    "cant go on",
]

_URGENT_HELP_PHRASE = "need urgent help"

_URGENT_HELP_CLINICAL_TERMS = [
    "breathe",
    "breathing",
    "breath",
    "chest pain",
    "pain",
    "unsafe",
    "overdose",
    "pills",
    "faint",
    "fall",
    "bleeding",
    "emergency",
]

_URGENT_HELP_APP_TERMS = [
    "settings button",
    "settings",
    "login",
    "app",
    "screen",
    "password",
    "page",
    "button",
]

_NORMALIZED_ALWAYS_CRISIS_PHRASES = [
    normalize_for_matching(term) for term in _ALWAYS_CRISIS_PHRASES
]
_NORMALIZED_URGENT_HELP_PHRASE = normalize_for_matching(_URGENT_HELP_PHRASE)
_NORMALIZED_URGENT_HELP_CLINICAL_TERMS = [
    normalize_for_matching(term) for term in _URGENT_HELP_CLINICAL_TERMS
]
_NORMALIZED_URGENT_HELP_APP_TERMS = [
    normalize_for_matching(term) for term in _URGENT_HELP_APP_TERMS
]


def _contains_any(normalized_text: str, terms: list[str]) -> bool:
    return any(term in normalized_text for term in terms)


def _contains_crisis_language(normalized_text: str) -> bool:
    if not normalized_text:
        return False

    if _contains_any(normalized_text, _NORMALIZED_ALWAYS_CRISIS_PHRASES):
        return True

    if _NORMALIZED_URGENT_HELP_PHRASE not in normalized_text:
        return False

    has_clinical_context = _contains_any(
        normalized_text, _NORMALIZED_URGENT_HELP_CLINICAL_TERMS
    )
    has_app_context = _contains_any(normalized_text, _NORMALIZED_URGENT_HELP_APP_TERMS)

    return has_clinical_context or not has_app_context


def classify_risk(req: ClassifyRequest, threshold: int) -> ClassifyResponse:
    reasons: list[str] = []

    if req.pain is not None and req.pain >= threshold:
        reasons.append(PAIN_GE_THRESHOLD)

    normalized_text = normalize_for_matching(req.text)
    if _contains_crisis_language(normalized_text):
        reasons.append(CRISIS_LANGUAGE)

    risk = "high" if reasons else "low"

    return ClassifyResponse(
        risk=risk,
        reasons=reasons,
        ruleVersion="v1",
    )
