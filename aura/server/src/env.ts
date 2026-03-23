function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const nodeEnv = process.env.NODE_ENV || "development";

export const env = {
  NODE_ENV: nodeEnv,
  PORT: toInt(process.env.PORT, 3000),
  LOG_LEVEL: toLogLevel(process.env.LOG_LEVEL),
  MONGO_URL: process.env.MONGO_URL || "mongodb://localhost:27017/aura",
  AI_BASE_URL: process.env.AI_BASE_URL || "http://localhost:8001",
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
  CORS_ALLOWED_ORIGINS: toStringArray(process.env.CORS_ALLOWED_ORIGINS),
  PAIN_HIGH_THRESHOLD: toInt(process.env.PAIN_HIGH_THRESHOLD, 7),
} as const;

type RuntimeEnv = {
  CORS_ALLOWED_ORIGINS: readonly string[];
  NODE_ENV: string;
  ALLOW_UNAUTH_CLINICIAN_BODY_IDS: boolean;
};

export function assertRuntimeEnvSafety(value: RuntimeEnv): void {
  if (value.ALLOW_UNAUTH_CLINICIAN_BODY_IDS && value.NODE_ENV !== "test") {
    throw new Error("ALLOW_UNAUTH_CLINICIAN_BODY_IDS is allowed only when NODE_ENV=test");
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
}
