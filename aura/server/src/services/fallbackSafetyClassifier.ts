import type { ClassifyInput, ClassifyOutput } from "./ai";

const PAIN_GE_THRESHOLD = "PAIN_GE_THRESHOLD" as const;
const CRISIS_LANGUAGE = "CRISIS_LANGUAGE" as const;

const APOSTROPHE_VARIANTS = ["’", "`", "´", "ʼ", "ʹ"] as const;

const ALWAYS_CRISIS_PHRASES = [
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
] as const;

const URGENT_HELP_PHRASE = "need urgent help" as const;

const URGENT_HELP_CLINICAL_TERMS = [
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
] as const;

const URGENT_HELP_APP_TERMS = [
  "settings button",
  "settings",
  "login",
  "app",
  "screen",
  "password",
  "page",
  "button",
] as const;

function normalizeForMatching(text: string | undefined): string {
  if (!text) {
    return "";
  }

  let normalized = text.toLowerCase();
  for (const mark of APOSTROPHE_VARIANTS) {
    normalized = normalized.split(mark).join("'");
  }

  normalized = normalized.split("'").join("");
  normalized = normalized.replace(/[^a-z0-9\s]/g, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

const NORMALIZED_ALWAYS_CRISIS_PHRASES = ALWAYS_CRISIS_PHRASES.map((term) =>
  normalizeForMatching(term)
);
const NORMALIZED_URGENT_HELP_PHRASE = normalizeForMatching(URGENT_HELP_PHRASE);
const NORMALIZED_URGENT_HELP_CLINICAL_TERMS = URGENT_HELP_CLINICAL_TERMS.map((term) =>
  normalizeForMatching(term)
);
const NORMALIZED_URGENT_HELP_APP_TERMS = URGENT_HELP_APP_TERMS.map((term) =>
  normalizeForMatching(term)
);

function containsAny(normalizedText: string, terms: readonly string[]): boolean {
  return terms.some((term) => normalizedText.includes(term));
}

function containsCrisisLanguage(normalizedText: string): boolean {
  if (!normalizedText) {
    return false;
  }

  if (containsAny(normalizedText, NORMALIZED_ALWAYS_CRISIS_PHRASES)) {
    return true;
  }

  if (!normalizedText.includes(NORMALIZED_URGENT_HELP_PHRASE)) {
    return false;
  }

  const hasClinicalContext = containsAny(
    normalizedText,
    NORMALIZED_URGENT_HELP_CLINICAL_TERMS
  );
  const hasAppContext = containsAny(normalizedText, NORMALIZED_URGENT_HELP_APP_TERMS);

  return hasClinicalContext || !hasAppContext;
}

export function fallbackSafetyClassify(
  input: ClassifyInput,
  painHighThreshold: number
): ClassifyOutput {
  const reasons = new Set<ClassifyOutput["reasons"][number]>();

  if (typeof input.pain === "number" && input.pain >= painHighThreshold) {
    reasons.add(PAIN_GE_THRESHOLD);
  }

  const normalizedText = normalizeForMatching(input.text);
  if (containsCrisisLanguage(normalizedText)) {
    reasons.add(CRISIS_LANGUAGE);
  }

  return {
    risk: reasons.size > 0 ? "high" : "low",
    reasons: Array.from(reasons),
  };
}
