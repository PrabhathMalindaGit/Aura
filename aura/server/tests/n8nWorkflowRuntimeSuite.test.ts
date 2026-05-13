import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PROVIDER_SEND_ALL_FINAL_REPORT_WORDING,
  PROVIDER_SEND_ALL_MANUAL_WORKFLOWS,
  SAFE_FINAL_REPORT_WORDING,
  WorkflowExpectation,
  buildEvidenceMarkdown,
  buildSyntheticAlertFixture,
  buildSyntheticRunMarker,
  buildWorkflow07DigestDedupeBlockedMessage,
  checkProviderSendEnabled,
  checkProviderSendAllEnabled,
  dailyDigestDedupeKeyForDate,
  loadSuiteConfig,
  providerSendAllEvidenceFileName,
  redactSecrets,
  validateWorkflowExport,
  workflowTriggerStrategy,
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

  it("gates provider-send-all mode behind both explicit flags", () => {
    expect(checkProviderSendAllEnabled({}).enabled).toBe(false);
    expect(
      checkProviderSendAllEnabled({
        AURA_VERIFY_ALLOW_PROVIDER_SEND: "true",
      }).enabled
    ).toBe(false);
    expect(
      checkProviderSendAllEnabled({
        AURA_VERIFY_N8N_PROVIDER_ALL_WORKFLOWS: "true",
      }).enabled
    ).toBe(false);
    expect(
      checkProviderSendAllEnabled({
        AURA_VERIFY_ALLOW_PROVIDER_SEND: "true",
        AURA_VERIFY_N8N_PROVIDER_ALL_WORKFLOWS: "true",
      }).enabled
    ).toBe(true);

    expect(() =>
      loadSuiteConfig({
        AURA_VERIFY_API_BASE_URL: "http://127.0.0.1:3000",
        AURA_VERIFY_N8N_BASE_URL: "http://127.0.0.1:5678",
        MONGO_URL: "mongodb://127.0.0.1:27017/aura",
        AURA_WEBHOOK_KEY: "local-webhook-key",
        AURA_N8N_API_KEY: "local-n8n-api-key",
        AURA_VERIFY_N8N_PROVIDER_ALL_WORKFLOWS: "true",
      })
    ).toThrow(/AURA_VERIFY_ALLOW_PROVIDER_SEND=true/);

    const config = loadSuiteConfig({
      AURA_VERIFY_API_BASE_URL: "http://127.0.0.1:3000",
      AURA_VERIFY_N8N_BASE_URL: "http://127.0.0.1:5678",
      MONGO_URL: "mongodb://127.0.0.1:27017/aura",
      AURA_WEBHOOK_KEY: "local-webhook-key",
      AURA_N8N_API_KEY: "local-n8n-api-key",
      AURA_VERIFY_ALLOW_PROVIDER_SEND: "true",
      AURA_VERIFY_N8N_PROVIDER_ALL_WORKFLOWS: "true",
    });

    expect(config.mode).toBe("provider-send-all");
    expect(config.providerSendAllWorkflows).toBe(true);
    expect(config.providerAllResetDigestDedupe).toBe(false);
    expect(config.providerAllManualWaitSeconds).toBe(300);
  });

  it("keeps Workflow 07 digest dedupe reset disabled by default and explicitly gated", () => {
    const providerAllEnv = {
      AURA_VERIFY_API_BASE_URL: "http://127.0.0.1:3000",
      AURA_VERIFY_N8N_BASE_URL: "http://127.0.0.1:5678",
      MONGO_URL: "mongodb://127.0.0.1:27017/aura",
      AURA_WEBHOOK_KEY: "local-webhook-key",
      AURA_N8N_API_KEY: "local-n8n-api-key",
      AURA_VERIFY_ALLOW_PROVIDER_SEND: "true",
      AURA_VERIFY_N8N_PROVIDER_ALL_WORKFLOWS: "true",
    };

    expect(loadSuiteConfig(providerAllEnv).providerAllResetDigestDedupe).toBe(false);
    expect(
      loadSuiteConfig({
        ...providerAllEnv,
        AURA_VERIFY_N8N_PROVIDER_ALL_RESET_DIGEST_DEDUPE: "true",
      }).providerAllResetDigestDedupe
    ).toBe(true);
    expect(() =>
      loadSuiteConfig({
        ...providerAllEnv,
        AURA_VERIFY_N8N_PROVIDER_ALL_WORKFLOWS: undefined,
        AURA_VERIFY_N8N_PROVIDER_ALL_RESET_DIGEST_DEDUPE: "true",
      })
    ).toThrow(/RESET_DIGEST_DEDUPE=true requires provider-send-all mode/);
    expect(() =>
      loadSuiteConfig({
        ...providerAllEnv,
        AURA_VERIFY_ALLOW_NON_LOCAL: "true",
        AURA_VERIFY_N8N_PROVIDER_ALL_RESET_DIGEST_DEDUPE: "true",
      })
    ).toThrow(/cannot be used with AURA_VERIFY_ALLOW_NON_LOCAL=true/);
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
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def password=devpass x-aura-webhook-key: secret-value https://api.telegram.org/bot123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef/sendMessage apiKey=abc123 AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

    const redacted = redactSecrets(raw);

    expect(redacted).toContain("Authorization: Bearer [REDACTED_TOKEN]");
    expect(redacted).toContain("password=[REDACTED_SECRET]");
    expect(redacted).toContain("webhook-key: [REDACTED_SECRET]");
    expect(redacted).toContain("api.telegram.org/bot[REDACTED_TELEGRAM_BOT_TOKEN]");
    expect(redacted).toContain("apiKey=[REDACTED_SECRET]");
    expect(redacted).not.toContain("devpass");
    expect(redacted).not.toContain("secret-value");
    expect(redacted).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef");
    expect(redacted).not.toContain("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  });

  it("explains Workflow 07 date-level digest dedupe blocks without hiding failures", () => {
    const dedupeKey = dailyDigestDedupeKeyForDate(new Date("2026-05-13T18:50:03.000Z"));
    const message = buildWorkflow07DigestDedupeBlockedMessage({
      workflowName: "07 - Daily Digest (Cron 09:00 → Aura Digest → Telegram → Callback)",
      dedupeKey,
      resetEnabled: false,
    });

    expect(dedupeKey).toBe("daily-digest:2026-05-13");
    expect(message).toContain("provider-send-all preflight returned no eligible synthetic/demo dedupe keys");
    expect(message).toContain("global date-level dedupe key");
    expect(message).toContain("daily-digest:2026-05-13");
    expect(message).toContain("AURA_VERIFY_N8N_PROVIDER_ALL_RESET_DIGEST_DEDUPE=true");
    expect(message).not.toMatch(/\bpassed\b/i);
  });

  it("explains when Workflow 07 reset was enabled but eligibility is still missing", () => {
    const message = buildWorkflow07DigestDedupeBlockedMessage({
      workflowName: "07 - Daily Digest",
      dedupeKey: "daily-digest:2026-05-13",
      resetEnabled: true,
    });

    expect(message).toContain("dedupe reset flag was enabled");
    expect(message).toContain("no eligible digest item was returned after reset");
    expect(message).not.toMatch(/\bproduction\b/i);
    expect(message).not.toMatch(/\bclinical validation\b/i);
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

  it("builds provider-send-all evidence with manual wait details and safe wording", () => {
    const markdown = buildEvidenceMarkdown({
      status: "PASS",
      mode: "provider-send-all",
      timestamp: "2026-05-13T08:00:00.000Z",
      runId: "run-1",
      command: "npm run verify:n8n:workflows",
      providerSendEnabled: true,
      providerSendAllWorkflows: true,
      providerAllResetDigestDedupe: true,
      providerAllManualWaitSeconds: 120,
      staticResults: [],
      runtimeChecks: [],
      workflowSummaries: [
        {
          label: "Workflow 02 n8n proxy no Telegram expected",
          passed: true,
          detail: "Workflow 02 is a list-alerts proxy; no Telegram send expected.",
        },
        {
          label: "Workflow 03 manual n8n provider-send observation",
          passed: true,
          detail: "Observed sent telegram callback; provider message id: manual screenshot only if visible.",
        },
      ],
      capturedIds: {
        syntheticMarker: "aura-n8n-provider-send-all:run-1",
        workflow03ExpectedDedupeKeys: ["missed-checkin:verify-run:9:2026-05-13"],
        workflow07DigestDedupeKey: "daily-digest:2026-05-13",
        workflow07DigestDedupeResetCount: "1",
        workflow07DigestDedupeResetEventKeys: ["daily_clinician_digest:daily-digest:2026-05-13"],
      },
      failureDiagnostics: [],
    });

    expect(markdown).toContain("# n8n Provider-Send All Workflows");
    expect(markdown).toContain("Provider-send-all gate status: enabled");
    expect(markdown).toContain("Manual wait seconds: 120");
    expect(markdown).toContain("Workflow 07 digest dedupe reset flag: enabled");
    expect(markdown).toContain("removed only same-day Workflow 07 Daily Digest AUTOMATION_STATUS sent/skipped records");
    expect(markdown).toContain("workflow07DigestDedupeResetCount: 1");
    expect(markdown).toContain(PROVIDER_SEND_ALL_FINAL_REPORT_WORDING);
    expect(markdown).toContain("manual screenshot only if visible");
    expect(markdown).toContain("Workflow 02 is a list-alerts proxy; no Telegram send expected.");
    expect(markdown).not.toMatch(/\bproduction-ready\b/i);
    expect(markdown).not.toMatch(/\bclinically validated\b/i);
    expect(markdown).not.toMatch(/\bverified real patient validation\b/i);
    expect(markdown).not.toMatch(/\bproof that a clinician read\b(?! or acted)/i);
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

  it("uses a separate provider-send-all evidence filename", () => {
    const date = new Date("2026-05-13T08:00:00.000Z");
    expect(providerSendAllEvidenceFileName(date)).toBe(
      "n8n-provider-send-all-workflows-2026-05-13-080000.md"
    );

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aura-n8n-provider-all-"));
    const evidencePath = writeEvidenceFile(
      {
        status: "FAIL",
        mode: "provider-send-all",
        timestamp: "2026-05-13T08:00:00.000Z",
        runId: "run-2",
        command: "npm run verify:n8n:workflows",
        providerSendEnabled: true,
        providerSendAllWorkflows: true,
        providerAllManualWaitSeconds: 300,
        staticResults: [],
        runtimeChecks: [],
        workflowSummaries: [],
        capturedIds: {},
        failureDiagnostics: [],
      },
      date,
      dir
    );

    expect(path.basename(evidencePath)).toBe(
      "n8n-provider-send-all-workflows-2026-05-13-080000.md"
    );
  });

  it("allows static-only config without runtime environment variables", () => {
    const config = loadSuiteConfig({ AURA_VERIFY_N8N_STATIC_ONLY: "true" });

    expect(config.mode).toBe("static-only");
    expect(config.apiBaseUrl).toBeUndefined();
    expect(config.mongoUrl).toBeUndefined();
  });

  it("builds synthetic Alert fixtures with schema-valid string reason and reason-code metadata", () => {
    const fixture = buildSyntheticAlertFixture({
      patientId: "verify-run",
      checkInId: "checkin-1",
      marker: "aura-n8n-workflow-suite:run-1",
    });

    expect(fixture.reason).toBe("AURA_N8N_WORKFLOW_SUITE_SYNTHETIC");
    expect(Array.isArray(fixture.reason)).toBe(false);
    expect(fixture.reasonsAuto).toEqual(["AURA_N8N_WORKFLOW_SUITE_SYNTHETIC"]);
    expect(fixture.demoTag).toBe("aura-n8n-workflow-suite:run-1");
  });

  it("classifies workflow trigger strategy for automatic and manual evidence", () => {
    const workflow01 = {
      ...baseExpectation,
      id: "01",
      trigger: { type: "n8n-nodes-base.webhook", method: "POST", path: "alert-created" },
    };
    const workflow02 = {
      ...baseExpectation,
      id: "02",
      requiresTelegram: false,
      trigger: { type: "n8n-nodes-base.webhook", method: "GET", path: "alerts" },
    };
    const workflow03 = {
      ...baseExpectation,
      id: "03",
      trigger: { type: "n8n-nodes-base.cron", times: [{ hour: 8, minute: 0 }] },
    };

    expect(workflowTriggerStrategy(workflow01)).toBe("automatic-webhook");
    expect(workflowTriggerStrategy(workflow02)).toBe("automatic-webhook");
    expect(workflowTriggerStrategy(workflow03)).toBe("manual-execution-required");
    expect(PROVIDER_SEND_ALL_MANUAL_WORKFLOWS.map((workflow) => workflow.id)).toEqual([
      "03",
      "04",
      "06",
      "07",
      "08",
    ]);
  });

  it("builds provider-send-all synthetic markers for safe evidence fields", () => {
    const marker = buildSyntheticRunMarker("run-1", true);
    const fixture = buildSyntheticAlertFixture({
      patientId: "verify-run",
      checkInId: "checkin-1",
      marker,
    });

    expect(marker).toBe("aura-n8n-provider-send-all:run-1");
    expect(fixture.demoTag).toBe(marker);
    expect(JSON.stringify(fixture)).toContain(marker);
  });
});
