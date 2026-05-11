import { describe, expect, it } from "vitest";

import { assertRuntimeEnvSafety, env } from "../src/env";

function buildRuntimeEnv(
  overrides: Partial<{
    NODE_ENV: string;
    ALLOW_UNAUTH_CLINICIAN_BODY_IDS: boolean;
    AURA_PRESENTATION_SEED_ENABLED: boolean;
    CORS_ALLOWED_ORIGINS: string[];
    AI_BASE_URL: string;
    AURA_AI_SERVICE_KEY: string;
    AURA_N8N_WEBHOOK_KEY: string;
    AI_REQUEST_TIMEOUT_MS: number;
    N8N_WEBHOOK_ALERT: string;
    OPENAI_API_KEY: string;
    AURA_VOICE_AGENT_ENABLED: boolean;
    AURA_VOICE_AGENT_CLIENT_SECRET_TTL_SECONDS: number;
    AURA_VOICE_AGENT_REQUEST_TIMEOUT_MS: number;
    AURA_VOICE_AGENT_RATE_LIMIT_WINDOW_MS: number;
    AURA_VOICE_AGENT_RATE_LIMIT_MAX: number;
    RAG_PGVECTOR_DIMENSIONS: number;
    RAG_PGVECTOR_PATIENT_MEMORY_TOP_K: number;
  }> = {}
) {
  return {
    NODE_ENV: "production",
    ALLOW_UNAUTH_CLINICIAN_BODY_IDS: false,
    AURA_PRESENTATION_SEED_ENABLED: false,
    CORS_ALLOWED_ORIGINS: ["https://app.example.com"],
    AI_BASE_URL: "https://ai.example.com",
    AURA_AI_SERVICE_KEY: "prod-ai-key",
    AURA_N8N_WEBHOOK_KEY: "prod-n8n-webhook-key",
    AI_REQUEST_TIMEOUT_MS: 4000,
    N8N_WEBHOOK_ALERT: "https://n8n.example.com/webhook/alert-created",
    OPENAI_API_KEY: "prod-openai-key",
    AURA_VOICE_AGENT_ENABLED: false,
    AURA_VOICE_AGENT_CLIENT_SECRET_TTL_SECONDS: 60,
    AURA_VOICE_AGENT_REQUEST_TIMEOUT_MS: 4000,
    AURA_VOICE_AGENT_RATE_LIMIT_WINDOW_MS: 60_000,
    AURA_VOICE_AGENT_RATE_LIMIT_MAX: 5,
    RAG_PGVECTOR_DIMENSIONS: 384,
    RAG_PGVECTOR_PATIENT_MEMORY_TOP_K: 3,
    ...overrides,
  };
}

describe("runtime env safety checks", () => {
  it("defaults the voice agent feature off with bounded broker settings", () => {
    expect(env.AURA_VOICE_AGENT_ENABLED).toBe(false);
    expect(env.AURA_VOICE_AGENT_MODEL).toBe("gpt-realtime-2");
    expect(env.AURA_VOICE_AGENT_CLIENT_SECRET_TTL_SECONDS).toBe(60);
    expect(env.AURA_VOICE_AGENT_REQUEST_TIMEOUT_MS).toBe(4000);
    expect(env.AURA_VOICE_AGENT_RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(env.AURA_VOICE_AGENT_RATE_LIMIT_MAX).toBe(5);
  });

  it("throws when clinician auth bypass is enabled outside tests", () => {
    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          ALLOW_UNAUTH_CLINICIAN_BODY_IDS: true,
        })
      )
    ).toThrow(/NODE_ENV=test/);
  });

  it("allows clinician auth bypass only in tests", () => {
    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          NODE_ENV: "test",
          ALLOW_UNAUTH_CLINICIAN_BODY_IDS: true,
          CORS_ALLOWED_ORIGINS: [],
        })
      )
    ).not.toThrow();
  });

  it("allows normal production mode when bypass is disabled", () => {
    expect(() => assertRuntimeEnvSafety(buildRuntimeEnv())).not.toThrow();
  });

  it("throws when presentation seed is enabled in production", () => {
    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          AURA_PRESENTATION_SEED_ENABLED: true,
        })
      )
    ).toThrow(/AURA_PRESENTATION_SEED_ENABLED/);
  });

  it("throws when AI_BASE_URL is invalid", () => {
    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          AI_BASE_URL: "not-a-url",
        })
      )
    ).toThrow(/AI_BASE_URL/);
  });

  it("throws when AURA_AI_SERVICE_KEY is missing in production", () => {
    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          AURA_AI_SERVICE_KEY: "",
        })
      )
    ).toThrow(/AURA_AI_SERVICE_KEY/);
  });

  it("requires n8n ingress key when alert webhook emission is configured outside local environments", () => {
    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          AURA_N8N_WEBHOOK_KEY: "",
        })
      )
    ).toThrow(/AURA_N8N_WEBHOOK_KEY/);

    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          N8N_WEBHOOK_ALERT: "",
          AURA_N8N_WEBHOOK_KEY: "",
        })
      )
    ).not.toThrow();

    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          NODE_ENV: "test",
          CORS_ALLOWED_ORIGINS: [],
          AURA_N8N_WEBHOOK_KEY: "",
        })
      )
    ).not.toThrow();
  });

  it("throws when AI_REQUEST_TIMEOUT_MS is out of bounds", () => {
    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          AI_REQUEST_TIMEOUT_MS: 100,
        })
      )
    ).toThrow(/AI_REQUEST_TIMEOUT_MS/);
  });

  it("requires OPENAI_API_KEY when the voice agent is enabled outside local environments", () => {
    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          AURA_VOICE_AGENT_ENABLED: true,
          OPENAI_API_KEY: "",
        })
      )
    ).toThrow(/OPENAI_API_KEY/);

    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          NODE_ENV: "test",
          AURA_VOICE_AGENT_ENABLED: true,
          OPENAI_API_KEY: "",
          CORS_ALLOWED_ORIGINS: [],
        })
      )
    ).not.toThrow();
  });

  it("throws when voice agent TTL or timeout settings are out of bounds", () => {
    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          AURA_VOICE_AGENT_CLIENT_SECRET_TTL_SECONDS: 9,
        })
      )
    ).toThrow(/AURA_VOICE_AGENT_CLIENT_SECRET_TTL_SECONDS/);

    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          AURA_VOICE_AGENT_CLIENT_SECRET_TTL_SECONDS: 7201,
        })
      )
    ).toThrow(/AURA_VOICE_AGENT_CLIENT_SECRET_TTL_SECONDS/);

    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          AURA_VOICE_AGENT_REQUEST_TIMEOUT_MS: 100,
        })
      )
    ).toThrow(/AURA_VOICE_AGENT_REQUEST_TIMEOUT_MS/);
  });

  it("throws when voice agent rate-limit settings are out of bounds", () => {
    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          AURA_VOICE_AGENT_RATE_LIMIT_WINDOW_MS: 999,
        })
      )
    ).toThrow(/AURA_VOICE_AGENT_RATE_LIMIT_WINDOW_MS/);

    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          AURA_VOICE_AGENT_RATE_LIMIT_MAX: 0,
        })
      )
    ).toThrow(/AURA_VOICE_AGENT_RATE_LIMIT_MAX/);
  });

  it("throws when patient memory PGVector settings are out of bounds", () => {
    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          RAG_PGVECTOR_DIMENSIONS: 128,
        })
      )
    ).toThrow(/RAG_PGVECTOR_DIMENSIONS/);

    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          RAG_PGVECTOR_PATIENT_MEMORY_TOP_K: 4,
        })
      )
    ).toThrow(/RAG_PGVECTOR_PATIENT_MEMORY_TOP_K/);
  });
});
