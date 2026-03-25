import { describe, expect, it } from "vitest";

import { assertRuntimeEnvSafety } from "../src/env";

function buildRuntimeEnv(
  overrides: Partial<{
    NODE_ENV: string;
    ALLOW_UNAUTH_CLINICIAN_BODY_IDS: boolean;
    CORS_ALLOWED_ORIGINS: string[];
    AI_BASE_URL: string;
    AURA_AI_SERVICE_KEY: string;
    AI_REQUEST_TIMEOUT_MS: number;
  }> = {}
) {
  return {
    NODE_ENV: "production",
    ALLOW_UNAUTH_CLINICIAN_BODY_IDS: false,
    CORS_ALLOWED_ORIGINS: ["https://app.example.com"],
    AI_BASE_URL: "https://ai.example.com",
    AURA_AI_SERVICE_KEY: "prod-ai-key",
    AI_REQUEST_TIMEOUT_MS: 4000,
    ...overrides,
  };
}

describe("runtime env safety checks", () => {
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

  it("throws when AI_REQUEST_TIMEOUT_MS is out of bounds", () => {
    expect(() =>
      assertRuntimeEnvSafety(
        buildRuntimeEnv({
          AI_REQUEST_TIMEOUT_MS: 100,
        })
      )
    ).toThrow(/AI_REQUEST_TIMEOUT_MS/);
  });
});
