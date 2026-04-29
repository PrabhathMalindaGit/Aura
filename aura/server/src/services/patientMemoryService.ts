import PatientMemory from "../models/PatientMemory";
import { env } from "../env";
import { toId } from "../utils/ids";
import { logger } from "../utils/logger";
import {
  PatientMemoryVectorUnavailable,
  mirrorPatientMemoryVector,
  retrievePatientMemoryVectors,
} from "./patientMemoryVectorService";

export type PatientMemoryType =
  | "goal"
  | "preference"
  | "barrier"
  | "recent_pattern"
  | "support_need";

export type PatientMemorySourceKind =
  | "low_risk_chat"
  | "checkin_trend"
  | "clinician_seed"
  | "system_derived";

export type PatientMemorySourceQuality = "explicit" | "inferred" | "trend";

export type LowRiskMemoryCandidate = {
  memoryType: PatientMemoryType;
  summary: string;
  sourceQuality: PatientMemorySourceQuality;
};

export type RelevantPatientMemory = {
  id: string;
  memoryType: PatientMemoryType;
  summary: string;
  sourceKind: PatientMemorySourceKind;
  score: number;
};

const MAX_MEMORY_SUMMARY_LENGTH = 240;
const MAX_RETRIEVED_MEMORIES = 3;
const MEMORY_LOOKBACK_LIMIT = 25;
const TOKEN_PATTERN = /[a-z0-9]+/g;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "for",
  "from",
  "i",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

const HIGH_RISK_TEXT_PATTERN =
  /\b(suicid|kill myself|harm myself|end my life|can't go on|cannot go on|unsafe|emergency|urgent help|can't breathe|cannot breathe|chest pain|overdose|faint(?:ed|ing)?|bleeding|fell|fall)\b/i;
const MEDICATION_DOSAGE_PATTERN =
  /\b(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|pills?|tablets?|capsules?|units?)|dose|dosage|prescription|opioid|painkiller)\b/i;
const CONTACT_DETAIL_PATTERN =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:\+?\d[\s().-]*){8,}\d\b|\b\d{1,5}\s+[a-z0-9.'-]+\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr)\b)/i;
const SECRET_PATTERN =
  /\b(password|passcode|secret|token|api key|apikey|otp|one-time code|recovery code)\b/i;
const THIRD_PARTY_PATTERN =
  /\b(my|his|her|their)\s+(wife|husband|partner|mother|father|sister|brother|daughter|son|friend|neighbor|neighbour|coworker|colleague)\b/i;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceCase(value: string): string {
  const normalized = normalizeText(value).replace(/^["'`]+|["'`]+$/g, "");
  if (!normalized) {
    return "";
  }
  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

function boundedSummary(value: string): string | null {
  const normalized = normalizeText(value);
  if (!normalized || normalized.length > MAX_MEMORY_SUMMARY_LENGTH) {
    return null;
  }
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function isSensitiveMemoryText(value: string): boolean {
  return (
    HIGH_RISK_TEXT_PATTERN.test(value) ||
    MEDICATION_DOSAGE_PATTERN.test(value) ||
    CONTACT_DETAIL_PATTERN.test(value) ||
    SECRET_PATTERN.test(value) ||
    THIRD_PARTY_PATTERN.test(value)
  );
}

function makeCandidate(
  memoryType: PatientMemoryType,
  summary: string,
  sourceQuality: PatientMemorySourceQuality = "explicit"
): LowRiskMemoryCandidate | null {
  const bounded = boundedSummary(summary);
  if (!bounded || isSensitiveMemoryText(bounded)) {
    return null;
  }
  return {
    memoryType,
    summary: bounded,
    sourceQuality,
  };
}

function toBarrierVerb(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "miss") {
    return "misses";
  }
  if (normalized === "skip") {
    return "skips";
  }
  if (normalized === "struggle with") {
    return "struggles with";
  }
  if (normalized === "have difficulty with") {
    return "has difficulty with";
  }
  return normalized;
}

export function extractLowRiskMemoryCandidate(
  text: string
): LowRiskMemoryCandidate | null {
  const normalized = normalizeText(text);
  if (!normalized || isSensitiveMemoryText(normalized)) {
    return null;
  }

  const goalMatch = normalized.match(/\bmy goal is to ([^.!?]+)/i);
  if (goalMatch?.[1]) {
    return makeCandidate(
      "goal",
      `Patient's current goal is to ${sentenceCase(goalMatch[1])}`
    );
  }

  const preferenceMatch = normalized.match(/\bi prefer ([^.!?]+)/i);
  if (preferenceMatch?.[1]) {
    return makeCandidate(
      "preference",
      `Patient prefers ${sentenceCase(preferenceMatch[1])}`
    );
  }

  const barrierMatch = normalized.match(
    /\bi often (miss|skip|struggle with|have difficulty with) ([^.!?]+)/i
  );
  if (barrierMatch?.[1] && barrierMatch[2]) {
    return makeCandidate(
      "barrier",
      `Patient often ${toBarrierVerb(barrierMatch[1])} ${sentenceCase(
        barrierMatch[2]
      )}`
    );
  }

  const supportMatch = normalized.match(/\bremind me to ([^.!?]+)/i);
  if (supportMatch?.[1]) {
    return makeCandidate(
      "support_need",
      `Patient benefits from reminders to ${sentenceCase(supportMatch[1])}`
    );
  }

  return null;
}

export async function saveLowRiskMemory(input: {
  patientId: string;
  text: string;
  sourceRefId?: string;
  riskLevel: "low" | "high";
  reasonCodes?: string[];
}): Promise<RelevantPatientMemory | null> {
  const patientId = input.patientId.trim();
  if (
    !patientId ||
    input.riskLevel !== "low" ||
    (input.reasonCodes?.length ?? 0) > 0
  ) {
    return null;
  }

  const candidate = extractLowRiskMemoryCandidate(input.text);
  if (!candidate) {
    return null;
  }

  try {
    const doc = await PatientMemory.findOneAndUpdate(
      {
        patientId,
        memoryType: candidate.memoryType,
        summary: candidate.summary,
      },
      {
        $set: {
          status: "active",
          sourceKind: "low_risk_chat",
          sourceRefId: input.sourceRefId,
          sourceQuality: candidate.sourceQuality,
          metadata: {
            version: "phase2a",
            extractor: "deterministic_v1",
          },
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    try {
      await mirrorPatientMemoryVector({
        memoryId: toId(doc._id),
        patientId: doc.patientId,
        memoryType: doc.memoryType as PatientMemoryType,
        sourceKind: doc.sourceKind as PatientMemorySourceKind,
        status: doc.status as "active" | "superseded",
        summary: doc.summary,
        expiresAt: doc.expiresAt instanceof Date ? doc.expiresAt : null,
      });
    } catch (error) {
      logger.warn("patient_memory.pgvector_mirror_failed", {
        patientId,
        memoryId: toId(doc._id),
        reason:
          error instanceof PatientMemoryVectorUnavailable
            ? "unavailable"
            : "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      id: toId(doc._id),
      memoryType: doc.memoryType as PatientMemoryType,
      summary: doc.summary,
      sourceKind: doc.sourceKind as PatientMemorySourceKind,
      score: 1,
    };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const maybeCode = (error as { code?: unknown }).code;
      if (maybeCode === 11000) {
        return null;
      }
    }
    throw error;
  }
}

function tokenize(value: string): string[] {
  const matches = value.toLowerCase().match(TOKEN_PATTERN);
  if (!matches) {
    return [];
  }
  return matches.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function lexicalScore(query: string, document: string): number {
  const queryTerms = tokenize(query);
  const documentTerms = tokenize(document);
  if (queryTerms.length === 0 || documentTerms.length === 0) {
    return 0;
  }

  const documentSet = new Set(documentTerms);
  const overlap = queryTerms.filter((term) => documentSet.has(term)).length;
  if (overlap === 0) {
    return 0;
  }

  return overlap / Math.sqrt(queryTerms.length * documentTerms.length);
}

async function getRelevantPatientMemoriesFromMongo(input: {
  patientId: string;
  query: string;
  limit?: number;
}): Promise<RelevantPatientMemory[]> {
  const patientId = input.patientId.trim();
  if (!patientId) {
    return [];
  }

  const now = new Date();
  const docs = await PatientMemory.find({
    patientId,
    status: "active",
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
  })
    .sort({ updatedAt: -1 })
    .limit(MEMORY_LOOKBACK_LIMIT)
    .lean();

  const limit = Math.min(input.limit ?? MAX_RETRIEVED_MEMORIES, MAX_RETRIEVED_MEMORIES);

  return docs
    .map((doc) => ({
      id: toId(doc._id),
      memoryType: doc.memoryType as PatientMemoryType,
      summary: doc.summary,
      sourceKind: doc.sourceKind as PatientMemorySourceKind,
      score: lexicalScore(input.query, `${doc.memoryType} ${doc.summary}`),
      updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : 0,
    }))
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map(({ updatedAt: _updatedAt, ...memory }) => memory);
}

export async function getRelevantPatientMemories(input: {
  patientId: string;
  query: string;
  limit?: number;
}): Promise<RelevantPatientMemory[]> {
  const patientId = input.patientId.trim();
  if (!patientId) {
    return [];
  }

  if (env.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED) {
    try {
      const vectorMemories = await retrievePatientMemoryVectors({
        patientId,
        query: input.query,
        limit: input.limit,
      });

      if (
        vectorMemories.length > 0 ||
        !env.RAG_PGVECTOR_PATIENT_MEMORY_FALLBACK_ENABLED
      ) {
        return vectorMemories;
      }
    } catch (error) {
      if (!env.RAG_PGVECTOR_PATIENT_MEMORY_FALLBACK_ENABLED) {
        throw error;
      }

      logger.warn("patient_memory.pgvector_retrieval_fallback_used", {
        patientId,
        reason:
          error instanceof PatientMemoryVectorUnavailable
            ? "unavailable"
            : "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return getRelevantPatientMemoriesFromMongo({
    patientId,
    query: input.query,
    limit: input.limit,
  });
}
