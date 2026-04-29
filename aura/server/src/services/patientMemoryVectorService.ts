import { createHash } from "crypto";
import { Pool, type QueryResult } from "pg";

import { env } from "../env";
import type {
  PatientMemorySourceKind,
  PatientMemoryType,
  RelevantPatientMemory,
} from "./patientMemoryService";

const PATIENT_MEMORY_VECTOR_TABLE = "patient_memory_vectors";
const PATIENT_MEMORY_INDEX_VERSION = "patient-memory-v1";
const DEFAULT_DIMENSIONS = 384;
const TOKEN_PATTERN = /[a-z0-9]+/g;
const STOP_WORDS = new Set([
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
const LIKELY_IDENTIFIER_PATTERN =
  /\b(?:with|for|from|called|named|by)\s+[A-Z][a-z]{1,}\b/;
const CAPITALIZED_IDENTIFIER_PATTERN = /\b(?!Patient\b)[A-Z][a-z]{1,}\b/;
const LOWERCASE_POSSESSIVE_IDENTIFIER_PATTERN = /\b[a-z]{2,}'s\b/;

export class PatientMemoryVectorUnavailable extends Error {
  constructor(message = "PGVector patient memory is unavailable") {
    super(message);
    this.name = "PatientMemoryVectorUnavailable";
  }
}

export type PatientMemoryVectorInput = {
  memoryId: string;
  patientId: string;
  memoryType: PatientMemoryType;
  sourceKind: PatientMemorySourceKind;
  status: "active" | "superseded";
  summary: string;
  expiresAt?: Date | null;
};

type PatientMemoryVectorRow = {
  memory_id: string;
  memory_type: PatientMemoryType;
  source_kind: PatientMemorySourceKind;
  summary: string;
  score: string | number | null;
};

let pool: Pool | null = null;
let poolDatabaseUrl = "";

function getPool(): Pool {
  const databaseUrl = env.RAG_PGVECTOR_DATABASE_URL.trim();
  if (!databaseUrl) {
    throw new PatientMemoryVectorUnavailable("RAG_PGVECTOR_DATABASE_URL is not set");
  }

  if (!pool || poolDatabaseUrl !== databaseUrl) {
    pool = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 2000,
      max: 2,
    });
    poolDatabaseUrl = databaseUrl;
  }

  return pool;
}

export function isPatientMemoryVectorConfigured(): boolean {
  return (
    env.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED &&
    env.RAG_PGVECTOR_DIMENSIONS === DEFAULT_DIMENSIONS &&
    Boolean(env.RAG_PGVECTOR_DATABASE_URL.trim())
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isUnsafeVectorSummary(value: string): boolean {
  return (
    HIGH_RISK_TEXT_PATTERN.test(value) ||
    MEDICATION_DOSAGE_PATTERN.test(value) ||
    CONTACT_DETAIL_PATTERN.test(value) ||
    SECRET_PATTERN.test(value) ||
    THIRD_PARTY_PATTERN.test(value) ||
    LIKELY_IDENTIFIER_PATTERN.test(value) ||
    CAPITALIZED_IDENTIFIER_PATTERN.test(value) ||
    LOWERCASE_POSSESSIVE_IDENTIFIER_PATTERN.test(value)
  );
}

function tokenize(value: string): string[] {
  const matches = value.toLowerCase().match(TOKEN_PATTERN);
  if (!matches) {
    return [];
  }
  return matches.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function deterministicPatientMemoryVector(
  value: string,
  dimensions = DEFAULT_DIMENSIONS
): number[] {
  if (dimensions !== DEFAULT_DIMENSIONS) {
    throw new Error("patient memory vectors must use 384 dimensions");
  }

  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = tokenize(value);
  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const digest = createHash("sha256").update(token).digest();
    const index = Number(digest.readBigUInt64BE(0) % BigInt(dimensions));
    const sign = digest[8] & 1 ? -1 : 1;
    vector[index] += sign;
  }

  const norm = Math.sqrt(vector.reduce((sum, component) => sum + component * component, 0));
  if (norm === 0) {
    return Array.from({ length: dimensions }, () => 0);
  }

  return vector.map((component) => component / norm);
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((component) => Number(component).toPrecision(12)).join(",")}]`;
}

function assertConfigured(): void {
  if (!env.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED) {
    throw new PatientMemoryVectorUnavailable("PGVector patient memory is disabled");
  }

  if (env.RAG_PGVECTOR_DIMENSIONS !== DEFAULT_DIMENSIONS) {
    throw new PatientMemoryVectorUnavailable("PGVector patient memory requires 384 dimensions");
  }

  if (!env.RAG_PGVECTOR_DATABASE_URL.trim()) {
    throw new PatientMemoryVectorUnavailable("RAG_PGVECTOR_DATABASE_URL is not set");
  }
}

export async function ensurePatientMemoryVectorSchema(): Promise<void> {
  if (env.RAG_PGVECTOR_DIMENSIONS !== DEFAULT_DIMENSIONS) {
    throw new PatientMemoryVectorUnavailable("PGVector patient memory requires 384 dimensions");
  }

  const client = getPool();
  await client.query("create extension if not exists vector");
  await client.query(`
    create table if not exists ${PATIENT_MEMORY_VECTOR_TABLE} (
      memory_id text primary key,
      patient_id text not null,
      memory_type text not null,
      source_kind text not null,
      status text not null default 'active',
      summary text not null,
      embedding vector(${DEFAULT_DIMENSIONS}) not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      expires_at timestamptz,
      index_version text not null
    )
  `);
  await client.query(`
    create index if not exists ${PATIENT_MEMORY_VECTOR_TABLE}_patient_status_updated_idx
    on ${PATIENT_MEMORY_VECTOR_TABLE} (patient_id, status, updated_at desc)
  `);
  await client.query(`
    create index if not exists ${PATIENT_MEMORY_VECTOR_TABLE}_patient_type_status_idx
    on ${PATIENT_MEMORY_VECTOR_TABLE} (patient_id, memory_type, status)
  `);
  await client.query(`
    create index if not exists ${PATIENT_MEMORY_VECTOR_TABLE}_embedding_idx
    on ${PATIENT_MEMORY_VECTOR_TABLE}
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 1)
  `);
}

export async function mirrorPatientMemoryVector(
  input: PatientMemoryVectorInput
): Promise<{ mirrored: boolean; reason?: string }> {
  if (!env.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED) {
    return { mirrored: false, reason: "disabled" };
  }

  assertConfigured();

  const patientId = input.patientId.trim();
  const memoryId = input.memoryId.trim();
  const summary = normalizeText(input.summary);
  if (!patientId || !memoryId || !summary) {
    return { mirrored: false, reason: "invalid_input" };
  }

  if (summary.length > 240 || isUnsafeVectorSummary(summary)) {
    return { mirrored: false, reason: "unsafe_summary" };
  }

  const embeddingText = `${input.memoryType} ${summary}`;
  const embedding = deterministicPatientMemoryVector(
    embeddingText,
    env.RAG_PGVECTOR_DIMENSIONS
  );

  await getPool().query(
    `
    insert into ${PATIENT_MEMORY_VECTOR_TABLE} (
      memory_id,
      patient_id,
      memory_type,
      source_kind,
      status,
      summary,
      embedding,
      expires_at,
      index_version
    )
    values ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9)
    on conflict (memory_id) do update set
      patient_id = excluded.patient_id,
      memory_type = excluded.memory_type,
      source_kind = excluded.source_kind,
      status = excluded.status,
      summary = excluded.summary,
      embedding = excluded.embedding,
      expires_at = excluded.expires_at,
      index_version = excluded.index_version,
      updated_at = now()
    `,
    [
      memoryId,
      patientId,
      input.memoryType,
      input.sourceKind,
      input.status,
      summary,
      toVectorLiteral(embedding),
      input.expiresAt ?? null,
      PATIENT_MEMORY_INDEX_VERSION,
    ]
  );

  return { mirrored: true };
}

export async function retrievePatientMemoryVectors(input: {
  patientId: string;
  query: string;
  limit?: number;
}): Promise<RelevantPatientMemory[]> {
  const patientId = input.patientId.trim();
  if (!patientId) {
    return [];
  }

  assertConfigured();

  const normalizedQuery = normalizeText(input.query);
  if (!normalizedQuery) {
    return [];
  }

  const limit = Math.min(
    input.limit ?? env.RAG_PGVECTOR_PATIENT_MEMORY_TOP_K,
    env.RAG_PGVECTOR_PATIENT_MEMORY_TOP_K,
    3
  );
  const queryEmbedding = deterministicPatientMemoryVector(
    normalizedQuery,
    env.RAG_PGVECTOR_DIMENSIONS
  );
  const queryEmbeddingLiteral = toVectorLiteral(queryEmbedding);

  let result: QueryResult<PatientMemoryVectorRow>;
  try {
    result = await getPool().query<PatientMemoryVectorRow>(
      `
      select
        memory_id,
        memory_type,
        source_kind,
        summary,
        greatest(0, 1 - (embedding <=> $2::vector)) as score
      from ${PATIENT_MEMORY_VECTOR_TABLE}
      where patient_id = $1
        and status = 'active'
        and (expires_at is null or expires_at > now())
      order by embedding <=> $2::vector, updated_at desc
      limit $3
      `,
      [patientId, queryEmbeddingLiteral, limit]
    );
  } catch (error) {
    throw new PatientMemoryVectorUnavailable(
      error instanceof Error ? error.message : "PGVector patient memory retrieval failed"
    );
  }

  return result.rows.slice(0, limit).map((row) => ({
    id: row.memory_id,
    memoryType: row.memory_type,
    summary: row.summary,
    sourceKind: row.source_kind,
    score: typeof row.score === "number" ? row.score : Number(row.score ?? 0),
  }));
}
