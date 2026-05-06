export type GuidedCheckinParseConfidence = "exact" | "normalized";

export type GuidedCheckinParseSuccess<T> = {
  ok: true;
  value: T;
  confidence: GuidedCheckinParseConfidence;
};

export type GuidedCheckinParseFailure = {
  ok: false;
  reason: string;
};

export type GuidedCheckinParseResult<T> =
  | GuidedCheckinParseSuccess<T>
  | GuidedCheckinParseFailure;

export type GuidedCheckinMedicationStatus = "taken" | "missed" | "not_applicable";

const MAX_NOTES_LENGTH = 1200;

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const MOOD_LABELS: Record<string, number> = {
  "very low": 1,
  low: 2,
  okay: 3,
  strong: 4,
  "very strong": 5,
};

function success<T>(
  value: T,
  confidence: GuidedCheckinParseConfidence,
): GuidedCheckinParseSuccess<T> {
  return { ok: true, value, confidence };
}

function failure(reason: string): GuidedCheckinParseFailure {
  return { ok: false, reason };
}

function hasNegativeNumber(input: string): boolean {
  return /-\s*\d/.test(input);
}

function normalizeTranscript(input: string): string {
  return input
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/-/g, " ")
    .replace(/[.,!?;:()[\]{}"]/g, " ")
    .replace(/[^a-z0-9/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSingleNumberOrWord(
  normalized: string,
): { value: number; confidence: GuidedCheckinParseConfidence } | null {
  if (/^\d+$/.test(normalized)) {
    return {
      value: Number.parseInt(normalized, 10),
      confidence: "exact",
    };
  }

  const wordValue = NUMBER_WORDS[normalized];
  if (wordValue !== undefined) {
    return {
      value: wordValue,
      confidence: "normalized",
    };
  }

  return null;
}

function parseBoundedNumber(
  input: string,
  min: number,
  max: number,
  reason: string,
): GuidedCheckinParseResult<number> {
  if (hasNegativeNumber(input)) {
    return failure(reason);
  }

  const normalized = normalizeTranscript(input);
  const parsed = parseSingleNumberOrWord(normalized);
  if (!parsed || parsed.value < min || parsed.value > max) {
    return failure(reason);
  }

  return success(parsed.value, parsed.confidence);
}

function parseOutOfTen(
  normalized: string,
): { value: number; confidence: GuidedCheckinParseConfidence } | null {
  const slashMatch = normalized.match(/^(\d+)\/10$/);
  if (slashMatch) {
    return {
      value: Number.parseInt(slashMatch[1], 10),
      confidence: "exact",
    };
  }

  const outOfTenMatch = normalized.match(/^([a-z]+|\d+) out of (?:ten|10)$/);
  if (!outOfTenMatch) {
    return null;
  }

  const parsed = parseSingleNumberOrWord(outOfTenMatch[1]);
  if (!parsed) {
    return null;
  }

  return {
    value: parsed.value,
    confidence: "normalized",
  };
}

function parseMoodLikeScore(
  input: string,
  reason: string,
): GuidedCheckinParseResult<number> {
  if (hasNegativeNumber(input)) {
    return failure(reason);
  }

  const normalized = normalizeTranscript(input);
  const labelValue = MOOD_LABELS[normalized];
  if (labelValue !== undefined) {
    return success(labelValue, "normalized");
  }

  return parseBoundedNumber(input, 1, 5, reason);
}

export function parseGuidedCheckinPainScore(
  transcript: string,
): GuidedCheckinParseResult<number> {
  const reason = "Use a clear pain score from 0 to 10.";
  if (hasNegativeNumber(transcript)) {
    return failure(reason);
  }

  const normalized = normalizeTranscript(transcript);
  if (normalized === "no pain") {
    return success(0, "normalized");
  }

  const outOfTen = parseOutOfTen(normalized);
  if (outOfTen) {
    if (outOfTen.value < 0 || outOfTen.value > 10) {
      return failure(reason);
    }
    return success(outOfTen.value, outOfTen.confidence);
  }

  return parseBoundedNumber(transcript, 0, 10, reason);
}

export function parseGuidedCheckinMoodScore(
  transcript: string,
): GuidedCheckinParseResult<number> {
  return parseMoodLikeScore(transcript, "Use a clear mood score from 1 to 5.");
}

export function parseGuidedCheckinExerciseAdherence(
  transcript: string,
): GuidedCheckinParseResult<number> {
  const reason = "Use a clear exercise completion percent from 0 to 100.";
  if (hasNegativeNumber(transcript)) {
    return failure(reason);
  }

  const normalized = normalizeTranscript(transcript);
  if (normalized === "none") {
    return success(0, "normalized");
  }
  if (normalized === "all" || normalized === "completed") {
    return success(100, "normalized");
  }
  if (normalized === "half") {
    return success(50, "normalized");
  }

  const percentMatch = normalized.match(/^(\d+) percent$/);
  if (percentMatch) {
    const value = Number.parseInt(percentMatch[1], 10);
    if (value < 0 || value > 100) {
      return failure(reason);
    }
    return success(value, "exact");
  }

  const outOfTen = parseOutOfTen(normalized);
  if (outOfTen) {
    if (outOfTen.value < 0 || outOfTen.value > 10) {
      return failure(reason);
    }
    return success(outOfTen.value * 10, "normalized");
  }

  return failure(reason);
}

export function parseGuidedCheckinMedicationStatus(
  transcript: string,
): GuidedCheckinParseResult<GuidedCheckinMedicationStatus> {
  const normalized = normalizeTranscript(transcript);
  const reason = "Use a clear medication status: taken, missed, or not applicable.";

  if (
    normalized === "taken" ||
    normalized === "yes" ||
    normalized === "i took it"
  ) {
    return success("taken", normalized === "taken" ? "exact" : "normalized");
  }

  if (
    normalized === "missed" ||
    normalized === "no" ||
    normalized === "not taken" ||
    normalized === "skipped"
  ) {
    return success("missed", normalized === "missed" ? "exact" : "normalized");
  }

  if (
    normalized === "not applicable" ||
    normalized === "none prescribed" ||
    normalized === "not needed today"
  ) {
    return success(
      "not_applicable",
      normalized === "not applicable" ? "exact" : "normalized",
    );
  }

  return failure(reason);
}

export function parseGuidedCheckinNotesTranscript(
  transcript: string,
): GuidedCheckinParseResult<string> {
  const value = transcript.trim();
  if (!value) {
    return failure("Add a non-empty note transcript.");
  }

  if (value.length > MAX_NOTES_LENGTH) {
    return failure("Keep notes at or below 1200 characters.");
  }

  return success(value, "exact");
}

export function parseGuidedCheckinSleepHours(
  transcript: string,
): GuidedCheckinParseResult<number> {
  const reason = "Use clear sleep hours from 0 to 16.";
  if (hasNegativeNumber(transcript)) {
    return failure(reason);
  }

  const normalized = normalizeTranscript(transcript);
  if (normalized === "seven and a half") {
    return success(7.5, "normalized");
  }

  const hoursMatch = normalized.match(/^(\d+)(?: hours?)?$/);
  if (hoursMatch) {
    const value = Number.parseInt(hoursMatch[1], 10);
    if (value < 0 || value > 16) {
      return failure(reason);
    }
    return success(value, "exact");
  }

  return parseBoundedNumber(transcript, 0, 16, reason);
}

export function parseGuidedCheckinSleepQuality(
  transcript: string,
): GuidedCheckinParseResult<number> {
  return parseMoodLikeScore(transcript, "Use a clear sleep quality score from 1 to 5.");
}
