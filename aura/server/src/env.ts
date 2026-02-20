function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  PORT: toInt(process.env.PORT, 3000),
  MONGO_URL: process.env.MONGO_URL || "mongodb://localhost:27017/aura",
  AI_BASE_URL: process.env.AI_BASE_URL || "http://localhost:8001",
  N8N_WEBHOOK_ALERT:
    process.env.N8N_WEBHOOK_ALERT || "http://localhost:5678/webhook/alert-created",
  PAIN_HIGH_THRESHOLD: toInt(process.env.PAIN_HIGH_THRESHOLD, 7),
} as const;
