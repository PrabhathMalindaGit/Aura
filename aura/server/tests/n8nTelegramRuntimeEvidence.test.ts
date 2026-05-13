import { describe, expect, it } from "vitest";

import {
  SAFE_FINAL_REPORT_WORDING,
  buildEvidenceMarkdown,
  checkWorkflowExport,
  formatFailureResult,
  isTelegramBotTokenLike,
  loadRuntimeConfig,
  redactSecrets,
} from "../scripts/verify/n8nTelegramRuntimeEvidence";

function baseEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    AURA_VERIFY_API_BASE_URL: "http://127.0.0.1:3000",
    AURA_VERIFY_N8N_BASE_URL: "http://127.0.0.1:5678",
    MONGO_URL: "mongodb://127.0.0.1:27017/aura",
    AURA_VERIFY_PATIENT_ACCESS_CODE: "P1-DEMO",
    AURA_VERIFY_CLINICIAN_EMAIL: "clinician1@example.com",
    AURA_VERIFY_CLINICIAN_PASSWORD: "devpass123",
    ...overrides,
  };
}

function baseEvidenceState(
  overrides: Partial<Parameters<typeof buildEvidenceMarkdown>[0]> = {}
): Parameters<typeof buildEvidenceMarkdown>[0] {
  return {
    status: "FAIL",
    timestamp: "2026-05-13T06:30:00.000Z",
    runId: "run-1",
    command: "npm run verify:n8n:telegram-runtime",
    scenarioSummary:
      "Synthetic high-risk patient chat through the existing patient chat API.",
    safeMarker: "[AURA_N8N_TELEGRAM_RUNTIME:run-1]",
    checks: [
      {
        label: "Synthetic check",
        passed: false,
        detail: "Missing delivered callback",
      },
    ],
    workflowChecks: [
      {
        label: "No Telegram bot-token-shaped literal is present",
        passed: true,
        detail: "Workflow exports must not contain Telegram bot tokens.",
      },
    ],
    failure: "Telegram callback did not reach sent",
    ...overrides,
  };
}

describe("n8n Telegram runtime evidence verifier safety helpers", () => {
  it("fails closed when required environment variables are missing", () => {
    expect(() =>
      loadRuntimeConfig(baseEnv({ AURA_VERIFY_CLINICIAN_PASSWORD: undefined }))
    ).toThrow(/Missing required environment variables: AURA_VERIFY_CLINICIAN_PASSWORD/);
  });

  it("accepts local API and n8n URLs by default", () => {
    const config = loadRuntimeConfig(baseEnv());

    expect(config.AURA_VERIFY_API_BASE_URL).toBe("http://127.0.0.1:3000");
    expect(config.AURA_VERIFY_N8N_BASE_URL).toBe("http://127.0.0.1:5678");
    expect(config.AURA_VERIFY_ALLOW_NON_LOCAL).toBe(false);
  });

  it("refuses non-local URLs unless the explicit override is set", () => {
    expect(() =>
      loadRuntimeConfig(
        baseEnv({
          AURA_VERIFY_API_BASE_URL: "https://example.com",
        })
      )
    ).toThrow(/must point to localhost or 127\.0\.0\.1/);

    const config = loadRuntimeConfig(
      baseEnv({
        AURA_VERIFY_API_BASE_URL: "https://example.com",
        AURA_VERIFY_ALLOW_NON_LOCAL: "true",
      })
    );

    expect(config.AURA_VERIFY_API_BASE_URL).toBe("https://example.com");
    expect(config.AURA_VERIFY_ALLOW_NON_LOCAL).toBe(true);
  });

  it("redacts secret and token-like values before evidence formatting", () => {
    const raw =
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def password=devpass123 x-aura-webhook-key: secret-value https://api.telegram.org/bot123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef/sendMessage";

    const redacted = redactSecrets(raw);

    expect(redacted).toContain("Bearer [REDACTED_TOKEN]");
    expect(redacted).toContain("password=[REDACTED_SECRET]");
    expect(redacted).toContain("webhook-key: [REDACTED_SECRET]");
    expect(redacted).toContain("api.telegram.org/bot[REDACTED_TELEGRAM_BOT_TOKEN]");
    expect(redacted).not.toContain("devpass123");
    expect(redacted).not.toContain("secret-value");
    expect(redacted).not.toContain("123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef");
  });

  it("detects and refuses Telegram bot-token-shaped verifier inputs", () => {
    const token = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";

    expect(isTelegramBotTokenLike(token)).toBe(true);
    expect(() =>
      loadRuntimeConfig(
        baseEnv({
          AURA_VERIFY_PATIENT_ACCESS_CODE: token,
        })
      )
    ).toThrow(/raw Telegram bot token/);
  });

  it("formats failure diagnostics with redaction", () => {
    const failure = formatFailureResult(
      new Error(
        "Telegram failed with token 123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef and Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def"
      )
    );

    expect(failure).toContain("[REDACTED_TELEGRAM_BOT_TOKEN]");
    expect(failure).toContain("Bearer [REDACTED_TOKEN]");
    expect(failure).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef");
  });

  it("builds markdown with local-demo boundaries and no success overclaim", () => {
    const markdown = buildEvidenceMarkdown(baseEvidenceState());

    expect(markdown).toContain("local/demo runtime verification");
    expect(markdown).toContain("not production readiness evidence");
    expect(markdown).toContain("does not represent production notification assurance");
    expect(markdown).toContain("not proof that a clinician read");
    expect(markdown).toContain("Manual Screenshot Checklist");
    expect(markdown).toContain(SAFE_FINAL_REPORT_WORDING);
    expect(markdown).not.toMatch(/\bproduction-ready\b/i);
    expect(markdown).not.toMatch(/\bclinically validated\b/i);
    expect(markdown).toContain("does not use real patient data");
  });

  it("redacts secrets embedded in markdown state", () => {
    const markdown = buildEvidenceMarkdown(
      baseEvidenceState({
        failure:
          "password=devpass123 token=eyJhbGciOiJIUzI1NiJ9.abc.def bot=123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef",
      })
    );

    expect(markdown).not.toContain("devpass123");
    expect(markdown).not.toContain("eyJhbGciOiJIUzI1NiJ9.abc.def");
    expect(markdown).not.toContain("123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef");
  });

  it("checks workflow export security expectations without calling n8n", () => {
    const checks = checkWorkflowExport(`
      AURA_N8N_WEBHOOK_KEY
      TELEGRAM_CLINICIAN_CHAT_ID
      /events/notification-status
      AURA_WEBHOOK_KEY
    `);

    expect(checks.every((check) => check.passed)).toBe(true);

    const failed = checkWorkflowExport("https://api.telegram.org/bot123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef/sendMessage");
    expect(failed.some((check) => !check.passed)).toBe(true);
  });
});
