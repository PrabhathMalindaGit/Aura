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

const nodeEnv = process.env.NODE_ENV || "development";

export const env = {
  NODE_ENV: nodeEnv,
  PORT: toInt(process.env.PORT, 3000),
  MONGO_URL: process.env.MONGO_URL || "mongodb://localhost:27017/aura",
  AI_BASE_URL: process.env.AI_BASE_URL || "http://localhost:8001",
  N8N_WEBHOOK_ALERT:
    process.env.N8N_WEBHOOK_ALERT || "http://localhost:5678/webhook/alert-created",
  N8N_RETRY_WEBHOOK_URL: process.env.N8N_RETRY_WEBHOOK_URL || "",
  AURA_WEBHOOK_KEY: process.env.AURA_WEBHOOK_KEY || "",
  JWT_SECRET:
    process.env.JWT_SECRET ||
    (nodeEnv === "production" ? "" : "dev_jwt_secret"),
  ALLOW_UNAUTH_CLINICIAN_BODY_IDS: toBool(
    process.env.ALLOW_UNAUTH_CLINICIAN_BODY_IDS,
    false
  ),
  PAIN_HIGH_THRESHOLD: toInt(process.env.PAIN_HIGH_THRESHOLD, 7),
} as const;
