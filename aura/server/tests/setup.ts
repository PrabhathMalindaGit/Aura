import { env } from "../src/env";

const mutableEnv = env as unknown as {
  JWT_SECRET: string;
  PATIENT_JWT_SECRET: string;
  PATIENT_TOKEN_TTL: string;
  DEMO_PATIENT_LOGIN: boolean;
  ALLOW_UNAUTH_CLINICIAN_BODY_IDS: boolean;
  AURA_PRESENTATION_SEED_ENABLED: boolean;
  AURA_WEBHOOK_KEY: string;
};

mutableEnv.JWT_SECRET = "test-jwt-secret";
mutableEnv.PATIENT_JWT_SECRET = "test-patient-jwt-secret";
mutableEnv.PATIENT_TOKEN_TTL = "30d";
mutableEnv.DEMO_PATIENT_LOGIN = true;
mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS = true;
mutableEnv.AURA_PRESENTATION_SEED_ENABLED = false;
mutableEnv.AURA_WEBHOOK_KEY = "test-webhook-key";
