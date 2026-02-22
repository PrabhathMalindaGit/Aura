import { env } from "../src/env";

const mutableEnv = env as unknown as {
  JWT_SECRET: string;
  ALLOW_UNAUTH_CLINICIAN_BODY_IDS: boolean;
  AURA_WEBHOOK_KEY: string;
};

mutableEnv.JWT_SECRET = "test-jwt-secret";
mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS = true;
mutableEnv.AURA_WEBHOOK_KEY = "test-webhook-key";
