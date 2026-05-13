import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  SAFE_FINAL_REPORT_WORDING,
  WorkflowExpectation,
  buildEvidenceMarkdown,
  checkProviderSendEnabled,
  loadSuiteConfig,
  redactSecrets,
  validateWorkflowExport,
  writeEvidenceFile,
} from "../scripts/verify/n8nWorkflowRuntimeSuite";

const baseExpectation: WorkflowExpectation = {
  id: "99",
  name: "99 - Test Workflow",
  filePrefix: "99 - Test Workflow",
  trigger: { type: "n8n-nodes-base.webhook", method: "GET", path: "test" },
  endpoint: "/internal/n8n/test",
  requiresAuraWebhookKey: true,
  requiresN8nWebhookKey: false,
  requiresN8nApiKey: true,
  requiresTelegram: true,
  callbackEndpoint: "/events/automation-status",
  requiredNodes: ["Webhook", "Normalize Request", "Authorized?", "Telegram Send Message"],
};

function workflow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "99 - Test Workflow",
    nodes: [
      {
        name: "Webhook",
        type: "n8n-nodes-base.webhook",
        parameters: { httpMethod: "GET", path: "test" },
      },
      {
        name: "Normalize Request",
        type: "n8n-nodes-base.code",
        parameters: {
          jsCode:
            "const key = $env.AURA_N8N_API_KEY; return [{ json: { authOk: key.length > 0 } }];",
        },
      },
      {
        name: "Authorized?",
        type: "n8n-nodes-base.if",
        parameters: {},
      },
      {
        name: "Build Unauthorized Response",
        type: "n8n-nodes-base.code",
        parameters: { jsCode: "return [{ json: { ok: false, error: 'UNAUTHORIZED' } }];" },
      },
      {
        name: "Respond Unauthorized",
        type: "n8n-nodes-base.respondToWebhook",
        parameters: { options: { responseCode: 401 } },
      },
      {
        name: "HTTP Request",
        type: "n8n-nodes-base.httpRequest",
        parameters: {
          method: "GET",
          url: "={{ $env.AURA_API_BASE + '/internal/n8n/test' }}",
          headerParameters: {
            parameters: [{ name: "x-aura-webhook-key", value: "={{$env.AURA_WEBHOOK_KEY}}" }],
          },
        },
      },
      {
        name: "Telegram Send Message",
        type: "n8n-nodes-base.telegram",
        parameters: { chatId: "={{$env.TELEGRAM_CLINICIAN_CHAT_ID}}" },
      },
      {
        name: "Telegram configured?",
        type: "n8n-nodes-base.if",
        parameters: {},
      },
      {
        name: "Build Skipped Callback Payload",
        type: "n8n-nodes-base.code",
        parameters: { jsCode: "return [{ json: { status: 'skipped' } }];" },
      },
      {
        name: "Post Automation Status",
        type: "n8n-nodes-base.httpRequest",
        parameters: {
          method: "POST",
          url: "={{ $env.AURA_API_BASE + '/events/automation-status' }}",
          headerParameters: {
            parameters: [{ name: "x-aura-webhook-key", value: "={{$env.AURA_WEBHOOK_KEY}}" }],
          },
        },
      },
    ],
    connections: {
      Webhook: { main: [[{ node: "Normalize Request" }]] },
      "Normalize Request": { main: [[{ node: "Authorized?" }]] },
      "Authorized?": { main: [[{ node: "HTTP Request" }], [{ node: "Build Unauthorized Response" }]] },
    },
    settings: {},
    ...overrides,
  };
}

describe("n8n workflow runtime suite helpers", () => {
  it("validates a representative workflow export without live services", () => {
    const result = validateWorkflowExport(baseExpectation, JSON.stringify(workflow()));

    expect(result.passed).toBe(true);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("fails static validation when a required auth env reference is missing", () => {
    const raw = JSON.stringify(workflow()).replace("AURA_N8N_API_KEY", "MISSING_KEY");

    const result = validateWorkflowExport(baseExpectation, raw);

    expect(result.passed).toBe(false);
    expect(result.checks.some((check) => !check.passed && check.label.includes("AURA_N8N_API_KEY"))).toBe(true);
  });

  it("fails static validation when a Telegram token literal is embedded", () => {
    const bad = workflow({
      nodes: [
        ...workflow().nodes,
        {
          name: "Bad Secret",
          type: "n8n-nodes-base.httpRequest",
          parameters: {
            token: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef",
          },
        },
      ],
    });

    const result = validateWorkflowExport(baseExpectation, JSON.stringify(bad));

    expect(result.passed).toBe(false);
    expect(result.checks.some((check) => !check.passed && check.label.includes("Telegram bot token"))).toBe(true);
  });

  it("fails static validation when Telegram chat ID is hardcoded", () => {
    const bad = workflow({
      nodes: workflow().nodes.map((node) =>
        node.name === "Telegram Send Message"
          ? { ...node, parameters: { chatId: "-1001234567890" } }
          : node
      ),
    });

    const result = validateWorkflowExport(baseExpectation, JSON.stringify(bad));

    expect(result.passed).toBe(false);
    expect(result.checks.some((check) => !check.passed && check.label.includes("Telegram chat ID"))).toBe(true);
  });

  it("gates provider-send mode unless explicitly enabled", () => {
    expect(checkProviderSendEnabled({}).enabled).toBe(false);
    expect(checkProviderSendEnabled({ AURA_VERIFY_ALLOW_PROVIDER_SEND: "false" }).enabled).toBe(false);
    expect(checkProviderSendEnabled({ AURA_VERIFY_ALLOW_PROVIDER_SEND: "true" }).enabled).toBe(true);
  });

  it("refuses non-local URLs unless override is set", () => {
    expect(() =>
      loadSuiteConfig({
        AURA_VERIFY_API_BASE_URL: "https://example.com",
        AURA_VERIFY_N8N_BASE_URL: "http://127.0.0.1:5678",
        MONGO_URL: "mongodb://127.0.0.1:27017/aura",
        AURA_WEBHOOK_KEY: "local-webhook-key",
        AURA_N8N_API_KEY: "local-n8n-api-key",
      })
    ).toThrow(/must point to localhost or 127\.0\.0\.1/);

    const config = loadSuiteConfig({
      AURA_VERIFY_API_BASE_URL: "https://example.com",
      AURA_VERIFY_N8N_BASE_URL: "http://127.0.0.1:5678",
      MONGO_URL: "mongodb://127.0.0.1:27017/aura",
      AURA_WEBHOOK_KEY: "local-webhook-key",
      AURA_N8N_API_KEY: "local-n8n-api-key",
      AURA_VERIFY_ALLOW_NON_LOCAL: "true",
    });

    expect(config.apiBaseUrl).toBe("https://example.com");
  });

  it("redacts webhook keys, Telegram tokens, Authorization headers, JWTs, and passwords", () => {
    const raw =
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def password=devpass x-aura-webhook-key: secret-value https://api.telegram.org/bot123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef/sendMessage apiKey=abc123";

    const redacted = redactSecrets(raw);

    expect(redacted).toContain("Authorization: Bearer [REDACTED_TOKEN]");
    expect(redacted).toContain("password=[REDACTED_SECRET]");
    expect(redacted).toContain("webhook-key: [REDACTED_SECRET]");
    expect(redacted).toContain("api.telegram.org/bot[REDACTED_TELEGRAM_BOT_TOKEN]");
    expect(redacted).toContain("apiKey=[REDACTED_SECRET]");
    expect(redacted).not.toContain("devpass");
    expect(redacted).not.toContain("secret-value");
    expect(redacted).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef");
  });

  it("builds evidence markdown with local/demo caveats and no production overclaim", () => {
    const markdown = buildEvidenceMarkdown({
      status: "PASS",
      mode: "static-only",
      timestamp: "2026-05-13T08:00:00.000Z",
      runId: "run-1",
      command: "npm run verify:n8n:workflows",
      providerSendEnabled: false,
      staticResults: [
        {
          workflowId: "99",
          workflowName: "99 - Test Workflow",
          passed: true,
          checks: [{ label: "Static check", passed: true, detail: "ok" }],
        },
      ],
      runtimeChecks: [],
      workflowSummaries: [],
      capturedIds: {},
      failureDiagnostics: [],
    });

    expect(markdown).toContain("local/demo runtime verification");
    expect(markdown).toContain(SAFE_FINAL_REPORT_WORDING);
    expect(markdown).toContain("Provider-send gate status: disabled");
    expect(markdown).not.toMatch(/\bproduction-ready\b/i);
    expect(markdown).not.toMatch(/\bclinically validated\b/i);
  });

  it("formats and writes failure evidence with redacted diagnostics", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aura-n8n-suite-"));
    const evidencePath = writeEvidenceFile(
      {
        status: "FAIL",
        mode: "safe-runtime",
        timestamp: "2026-05-13T08:00:00.000Z",
        runId: "run-2",
        command: "npm run verify:n8n:workflows",
        providerSendEnabled: false,
        staticResults: [],
        runtimeChecks: [],
        workflowSummaries: [],
        capturedIds: {},
        failureDiagnostics: [
          "https://api.telegram.org/bot123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef/sendMessage password=devpass",
        ],
      },
      new Date("2026-05-13T08:00:00.000Z"),
      dir
    );

    const markdown = fs.readFileSync(evidencePath, "utf8");
    expect(markdown).toContain("Status: FAIL");
    expect(markdown).toContain("[REDACTED_TELEGRAM_BOT_TOKEN]");
    expect(markdown).not.toContain("devpass");
  });

  it("allows static-only config without runtime environment variables", () => {
    const config = loadSuiteConfig({ AURA_VERIFY_N8N_STATIC_ONLY: "true" });

    expect(config.mode).toBe("static-only");
    expect(config.apiBaseUrl).toBeUndefined();
    expect(config.mongoUrl).toBeUndefined();
  });
});
