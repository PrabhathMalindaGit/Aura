function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIntEnv(name: string, value: string | undefined, fallback: number): number {
  if (!value || !value.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid integer`);
  }

  return parsed;
}

function parseBoundedIntEnv(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = parseIntEnv(name, value, fallback);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return fallback;
}

function toStringArray(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toLogLevel(
  value: string | undefined
): "debug" | "info" | "warn" | "error" {
  const normalized = (value ?? "info").trim().toLowerCase();
  if (
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error"
  ) {
    return normalized;
  }

  return "info";
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const MIN_AI_REQUEST_TIMEOUT_MS = 250;
const MAX_AI_REQUEST_TIMEOUT_MS = 10_000;

const nodeEnv = process.env.NODE_ENV || "development";

export const env = {
  NODE_ENV: nodeEnv,
  PORT: toInt(process.env.PORT, 3000),
  LOG_LEVEL: toLogLevel(process.env.LOG_LEVEL),
  MONGO_URL: process.env.MONGO_URL || "mongodb://localhost:27017/aura",
  AI_BASE_URL: process.env.AI_BASE_URL || "http://localhost:8001",
  AI_REQUEST_TIMEOUT_MS: parseIntEnv(
    "AI_REQUEST_TIMEOUT_MS",
    process.env.AI_REQUEST_TIMEOUT_MS,
    4000
  ),
  N8N_WEBHOOK_ALERT:
    process.env.N8N_WEBHOOK_ALERT || "http://localhost:5678/webhook/alert-created",
  N8N_RETRY_WEBHOOK_URL: process.env.N8N_RETRY_WEBHOOK_URL || "",
  AURA_WEBHOOK_KEY:
    process.env.AURA_WEBHOOK_KEY ||
    (nodeEnv === "production" ? "" : "dev_aura_webhook_key"),
  AURA_INTERNAL_KEY: process.env.AURA_INTERNAL_KEY || "",
  AURA_AI_SERVICE_KEY:
    process.env.AURA_AI_SERVICE_KEY ||
    (nodeEnv === "production" ? "" : "dev_aura_ai_key"),
  JWT_SECRET:
    process.env.JWT_SECRET ||
    (nodeEnv === "production" ? "" : "dev_jwt_secret"),
  PATIENT_JWT_SECRET:
    process.env.PATIENT_JWT_SECRET ||
    process.env.JWT_SECRET ||
    (nodeEnv === "production" ? "" : "dev_patient_jwt_secret"),
  PATIENT_TOKEN_TTL: process.env.PATIENT_TOKEN_TTL || "30d",
  CAREGIVER_JWT_SECRET:
    process.env.CAREGIVER_JWT_SECRET ||
    (nodeEnv === "production" ? "" : "dev_caregiver_jwt_secret"),
  CAREGIVER_TOKEN_TTL: process.env.CAREGIVER_TOKEN_TTL || "7d",
  DEMO_PATIENT_LOGIN: toBool(process.env.DEMO_PATIENT_LOGIN, false),
  LEGACY_PUBLIC_ENDPOINTS_ENABLED: toBool(
    process.env.LEGACY_PUBLIC_ENDPOINTS_ENABLED,
    false
  ),
  ALLOW_UNAUTH_CLINICIAN_BODY_IDS: toBool(
    process.env.ALLOW_UNAUTH_CLINICIAN_BODY_IDS,
    false
  ),
  AURA_PRESENTATION_SEED_ENABLED: toBool(
    process.env.AURA_PRESENTATION_SEED_ENABLED,
    false
  ),
  CORS_ALLOWED_ORIGINS: toStringArray(process.env.CORS_ALLOWED_ORIGINS),
  PAIN_HIGH_THRESHOLD: toInt(process.env.PAIN_HIGH_THRESHOLD, 7),
  RAG_PGVECTOR_DATABASE_URL: process.env.RAG_PGVECTOR_DATABASE_URL || "",
  RAG_PGVECTOR_DIMENSIONS: parseBoundedIntEnv(
    "RAG_PGVECTOR_DIMENSIONS",
    process.env.RAG_PGVECTOR_DIMENSIONS,
    384,
    384,
    384
  ),
  RAG_PGVECTOR_PATIENT_MEMORY_ENABLED: toBool(
    process.env.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED,
    false
  ),
  RAG_PGVECTOR_PATIENT_MEMORY_FALLBACK_ENABLED: toBool(
    process.env.RAG_PGVECTOR_PATIENT_MEMORY_FALLBACK_ENABLED,
    true
  ),
  RAG_PGVECTOR_PATIENT_MEMORY_TOP_K: parseBoundedIntEnv(
    "RAG_PGVECTOR_PATIENT_MEMORY_TOP_K",
    process.env.RAG_PGVECTOR_PATIENT_MEMORY_TOP_K,
    3,
    1,
    3
  ),
} as const;

type RuntimeEnv = {
  CORS_ALLOWED_ORIGINS: readonly string[];
  NODE_ENV: string;
  ALLOW_UNAUTH_CLINICIAN_BODY_IDS: boolean;
  AURA_PRESENTATION_SEED_ENABLED: boolean;
  AI_BASE_URL: string;
  AURA_AI_SERVICE_KEY: string;
  AI_REQUEST_TIMEOUT_MS: number;
  RAG_PGVECTOR_DIMENSIONS: number;
  RAG_PGVECTOR_PATIENT_MEMORY_TOP_K: number;
};

export function assertRuntimeEnvSafety(value: RuntimeEnv): void {
  if (value.ALLOW_UNAUTH_CLINICIAN_BODY_IDS && value.NODE_ENV !== "test") {
    throw new Error("ALLOW_UNAUTH_CLINICIAN_BODY_IDS is allowed only when NODE_ENV=test");
  }

  if (value.AURA_PRESENTATION_SEED_ENABLED && value.NODE_ENV === "production") {
    throw new Error("AURA_PRESENTATION_SEED_ENABLED is not allowed in production");
  }

  if (
    value.NODE_ENV !== "development" &&
    value.NODE_ENV !== "test" &&
    value.CORS_ALLOWED_ORIGINS.length === 0
  ) {
    throw new Error(
      "CORS_ALLOWED_ORIGINS must be set for non-local environments"
    );
  }

  if (!isValidHttpUrl(value.AI_BASE_URL)) {
    throw new Error("AI_BASE_URL must be a valid http or https URL");
  }

  if (
    value.AI_REQUEST_TIMEOUT_MS < MIN_AI_REQUEST_TIMEOUT_MS ||
    value.AI_REQUEST_TIMEOUT_MS > MAX_AI_REQUEST_TIMEOUT_MS
  ) {
    throw new Error(
      `AI_REQUEST_TIMEOUT_MS must be between ${MIN_AI_REQUEST_TIMEOUT_MS} and ${MAX_AI_REQUEST_TIMEOUT_MS}`
    );
  }

  if (value.RAG_PGVECTOR_DIMENSIONS !== 384) {
    throw new Error("RAG_PGVECTOR_DIMENSIONS must be 384");
  }

  if (
    value.RAG_PGVECTOR_PATIENT_MEMORY_TOP_K < 1 ||
    value.RAG_PGVECTOR_PATIENT_MEMORY_TOP_K > 3
  ) {
    throw new Error("RAG_PGVECTOR_PATIENT_MEMORY_TOP_K must be between 1 and 3");
  }

  if (
    value.NODE_ENV !== "development" &&
    value.NODE_ENV !== "test" &&
    !value.AURA_AI_SERVICE_KEY.trim()
  ) {
    throw new Error(
      "AURA_AI_SERVICE_KEY must be set for non-local environments"
    );
  }
}
