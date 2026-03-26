import type { ClassifyInput, ClassifyOutput } from "./ai";

const PAIN_GE_THRESHOLD = "PAIN_GE_THRESHOLD" as const;
const CRISIS_LANGUAGE = "CRISIS_LANGUAGE" as const;

const APOSTROPHE_VARIANTS = ["’", "`", "´", "ʼ", "ʹ"] as const;

const CRISIS_KEYWORDS = [
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
] as const;

function normalizeForMatching(text: string | undefined): string {
  if (!text) {
    return "";
  }

  let normalized = text.toLowerCase();
  for (const mark of APOSTROPHE_VARIANTS) {
    normalized = normalized.replaceAll(mark, "'");
  }

  normalized = normalized.replaceAll("'", "");
  normalized = normalized.replace(/[^a-z0-9\s]/g, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

const NORMALIZED_CRISIS_KEYWORDS = CRISIS_KEYWORDS.map((term) =>
  normalizeForMatching(term)
);

export function fallbackSafetyClassify(
  input: ClassifyInput,
  painHighThreshold: number
): ClassifyOutput {
  const reasons = new Set<ClassifyOutput["reasons"][number]>();

  if (typeof input.pain === "number" && input.pain >= painHighThreshold) {
    reasons.add(PAIN_GE_THRESHOLD);
  }

  const normalizedText = normalizeForMatching(input.text);
  if (
    normalizedText &&
    NORMALIZED_CRISIS_KEYWORDS.some((term) => normalizedText.includes(term))
  ) {
    reasons.add(CRISIS_LANGUAGE);
  }

  return {
    risk: reasons.size > 0 ? "high" : "low",
    reasons: Array.from(reasons),
  };
}
