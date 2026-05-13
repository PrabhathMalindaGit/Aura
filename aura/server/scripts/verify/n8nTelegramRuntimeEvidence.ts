import "dotenv/config";

import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

import AlertNotificationJob from "../../src/models/AlertNotificationJob";
import CareEvent from "../../src/models/CareEvent";

export const REQUIRED_ENV_NAMES = [
  "AURA_VERIFY_API_BASE_URL",
  "AURA_VERIFY_N8N_BASE_URL",
  "MONGO_URL",
  "AURA_VERIFY_PATIENT_ACCESS_CODE",
  "AURA_VERIFY_CLINICIAN_EMAIL",
  "AURA_VERIFY_CLINICIAN_PASSWORD",
] as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const TELEGRAM_BOT_TOKEN_PATTERN = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g;
const TELEGRAM_BOT_URL_PATTERN =
  /api\.telegram\.org\/bot\d{6,}:[A-Za-z0-9_-]{20,}/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const AUTHORIZATION_HEADER_PATTERN =
  /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const SECRET_FIELD_PATTERN =
  /\b(password|token|api[_-]?key|webhook[_-]?key|secret)(\s*[:=]\s*|["']\s*:\s*["']?)([^"'\s,}]+)/gi;

type RequiredEnvName = (typeof REQUIRED_ENV_NAMES)[number];

export type RuntimeConfig = Record<RequiredEnvName, string> & {
  AURA_VERIFY_ALLOW_NON_LOCAL: boolean;
};

type HttpResult<T> = {
  status: number;
  data: T;
};

type PatientLoginResponse = {
  ok?: boolean;
  token?: string;
  patient?: {
    id?: string;
  };
};

type ClinicianLoginResponse = {
  ok?: boolean;
  token?: string;
};

type HealthResponse = {
  status?: string;
  ok?: boolean;
};

type PatientChatResponse = {
  ok?: boolean;
  risk?: {
    level?: string;
    reasonCodes?: string[];
  };
  alertId?: string;
};

type ClinicianAlert = {
  _id?: string;
  id?: string;
  patientId?: string;
  risk?: string;
  status?: string;
  source?: {
    type?: string;
    sourceId?: string;
  };
  notification?: {
    status?: string;
    messageId?: string;
  };
};

type ClinicianAlertsResponse = {
  ok?: boolean;
  alerts?: ClinicianAlert[];
};

type WorkflowCheck = {
  label: string;
  passed: boolean;
  detail: string;
};

export type VerificationCheck = {
  label: string;
  passed: boolean;
  detail: string;
};

type EvidenceState = {
  status: "PASS" | "FAIL";
  timestamp: string;
  runId: string;
  command: string;
  scenarioSummary: string;
  safeMarker: string;
  checks: VerificationCheck[];
  backendHealth?: string;
  n8nReachability?: string;
  alertId?: string;
  patientId?: string;
  notificationJobSummary?: string;
  careEventSummary?: string;
  workflowChecks: WorkflowCheck[];
  failure?: string;
};

type NotificationJobSummary = {
  state?: string;
  channel?: string;
  dispatchKind?: string;
  attemptCount?: number;
  lastCallbackStatus?: string;
  messageId?: string;
  currentAttemptKey?: string;
};

type CareEventSummary = {
  type?: string;
  channel?: string;
  status?: string;
  messageId?: string;
  workflow?: string;
  executionId?: string;
  createdAt?: string;
};

export const SAFE_FINAL_REPORT_WORDING =
  "Live Telegram notification delivery was verified in the local Aura prototype. A synthetic high-risk event triggered the backend alert path, the n8n workflow executed, a Telegram notification was delivered through the configured bot, and the alert was visible through the clinician dashboard data source. This demonstrates local/demo runtime integration only and does not represent production notification assurance, clinical deployment validation, real patient validation, or proof that a clinician read the message.";

export function isTelegramBotTokenLike(value: string): boolean {
  TELEGRAM_BOT_TOKEN_PATTERN.lastIndex = 0;
  return TELEGRAM_BOT_TOKEN_PATTERN.test(value);
}

export function redactSecrets(input: unknown): string {
  const raw =
    typeof input === "string" ? input : JSON.stringify(input, null, 2) ?? "";

  TELEGRAM_BOT_TOKEN_PATTERN.lastIndex = 0;
  return raw
    .replace(TELEGRAM_BOT_URL_PATTERN, "api.telegram.org/bot[REDACTED_TELEGRAM_BOT_TOKEN]")
    .replace(TELEGRAM_BOT_TOKEN_PATTERN, "[REDACTED_TELEGRAM_BOT_TOKEN]")
    .replace(AUTHORIZATION_HEADER_PATTERN, "Authorization: Bearer [REDACTED_TOKEN]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED_TOKEN]")
    .replace(JWT_PATTERN, "[REDACTED_JWT]")
    .replace(SECRET_FIELD_PATTERN, (_match, key: string, separator: string) => {
      return `${key}${separator}[REDACTED_SECRET]`;
    });
}

export function assertLocalHttpUrl(
  name: string,
  rawValue: string,
  allowNonLocal: boolean
): string {
  const normalized = rawValue.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error(`${name} must not be empty`);
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }

  if (!allowNonLocal && !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `${name} must point to localhost or 127.0.0.1 unless AURA_VERIFY_ALLOW_NON_LOCAL=true`
    );
  }

  return normalized;
}

function parseBoolean(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function loadRuntimeConfig(rawEnv: NodeJS.ProcessEnv): RuntimeConfig {
  const missing = REQUIRED_ENV_NAMES.filter((name) => !rawEnv[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  const allowNonLocal = parseBoolean(rawEnv.AURA_VERIFY_ALLOW_NON_LOCAL);
  const config = {
    AURA_VERIFY_API_BASE_URL: assertLocalHttpUrl(
      "AURA_VERIFY_API_BASE_URL",
      rawEnv.AURA_VERIFY_API_BASE_URL ?? "",
      allowNonLocal
    ),
    AURA_VERIFY_N8N_BASE_URL: assertLocalHttpUrl(
      "AURA_VERIFY_N8N_BASE_URL",
      rawEnv.AURA_VERIFY_N8N_BASE_URL ?? "",
      allowNonLocal
    ),
    MONGO_URL: rawEnv.MONGO_URL?.trim() ?? "",
    AURA_VERIFY_PATIENT_ACCESS_CODE:
      rawEnv.AURA_VERIFY_PATIENT_ACCESS_CODE?.trim() ?? "",
    AURA_VERIFY_CLINICIAN_EMAIL:
      rawEnv.AURA_VERIFY_CLINICIAN_EMAIL?.trim() ?? "",
    AURA_VERIFY_CLINICIAN_PASSWORD:
      rawEnv.AURA_VERIFY_CLINICIAN_PASSWORD ?? "",
    AURA_VERIFY_ALLOW_NON_LOCAL: allowNonLocal,
  };

  for (const name of REQUIRED_ENV_NAMES) {
    const value = config[name];
    TELEGRAM_BOT_TOKEN_PATTERN.lastIndex = 0;
    if (TELEGRAM_BOT_TOKEN_PATTERN.test(value) || /api\.telegram\.org\/bot/i.test(value)) {
      throw new Error(
        `${name} appears to contain a raw Telegram bot token or bot URL; configure Telegram only in n8n credentials/local secret storage`
      );
    }
  }

  return config;
}

export function buildSyntheticMarker(runId: string): string {
  return `[AURA_N8N_TELEGRAM_RUNTIME:${runId}]`;
}

function buildSyntheticMessage(runId: string): string {
  return `${buildSyntheticMarker(runId)} I cant breathe and need urgent help. Synthetic demo verification only.`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson<T>(
  baseUrl: string,
  routePath: string,
  token?: string
): Promise<HttpResult<T>> {
  const response = await axios.get<T>(`${baseUrl}${routePath}`, {
    timeout: 15_000,
    validateStatus: () => true,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return {
    status: response.status,
    data: response.data,
  };
}

async function postJson<T>(
  baseUrl: string,
  routePath: string,
  body: unknown,
  token?: string
): Promise<HttpResult<T>> {
  const response = await axios.post<T>(`${baseUrl}${routePath}`, body, {
    timeout: 20_000,
    validateStatus: () => true,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return {
    status: response.status,
    data: response.data,
  };
}

async function probeN8n(baseUrl: string): Promise<number> {
  const response = await axios.get(baseUrl, {
    timeout: 8_000,
    validateStatus: () => true,
  });
  return response.status;
}

function addCheck(
  state: EvidenceState,
  label: string,
  passed: boolean,
  detail: string
): void {
  state.checks.push({
    label,
    passed,
    detail: redactSecrets(detail),
  });
}

function findWorkflowExportPath(): string {
  const workflowsRoot = path.resolve(__dirname, "../../../n8n/workflows");
  const match = fs
    .readdirSync(workflowsRoot)
    .find(
      (entry) =>
        entry.startsWith("01 - Alert Created Webhook") &&
        entry.endsWith(".json")
    );

  if (!match) {
    throw new Error(`Missing canonical workflow 01 export in ${workflowsRoot}`);
  }

  return path.join(workflowsRoot, match);
}

export function checkWorkflowExport(contents: string): WorkflowCheck[] {
  return [
    {
      label: "Inbound webhook key validation references AURA_N8N_WEBHOOK_KEY",
      passed: contents.includes("AURA_N8N_WEBHOOK_KEY"),
      detail: "Workflow 01 must fail closed on backend-to-n8n ingress.",
    },
    {
      label: "Telegram chat ID is environment-based",
      passed: contents.includes("TELEGRAM_CLINICIAN_CHAT_ID"),
      detail: "Workflow 01 must not hard-code the clinician Telegram chat target.",
    },
    {
      label: "Notification callback posts to Aura status endpoint",
      passed: contents.includes("/events/notification-status"),
      detail: "Workflow 01 must post truthful delivery status back to Aura.",
    },
    {
      label: "Callback uses AURA_WEBHOOK_KEY",
      passed: contents.includes("AURA_WEBHOOK_KEY"),
      detail: "n8n-to-Aura callback must use the shared webhook key from environment.",
    },
    {
      label: "No Telegram bot-token-shaped literal is present",
      passed: !/\d{6,}:[A-Za-z0-9_-]{20,}/.test(contents),
      detail: "Workflow exports must not contain Telegram bot tokens.",
    },
    {
      label: "No api.telegram.org bot-token URL is present",
      passed: !/api\.telegram\.org\/bot/i.test(contents),
      detail: "Workflow exports must not embed Telegram bot-token URLs.",
    },
  ];
}

function summarizeWorkflowChecks(checks: WorkflowCheck[]): string {
  return checks
    .map((check) => `${check.passed ? "PASS" : "FAIL"}: ${check.label}`)
    .join("; ");
}

function alertMatches(alert: ClinicianAlert, alertId: string): boolean {
  return alert._id === alertId || alert.id === alertId;
}

async function pollClinicianAlert(params: {
  apiBaseUrl: string;
  clinicianToken: string;
  alertId: string;
}): Promise<ClinicianAlert> {
  const deadline = Date.now() + 15_000;
  let lastStatus = 0;

  while (Date.now() <= deadline) {
    const response = await getJson<ClinicianAlertsResponse>(
      params.apiBaseUrl,
      "/clinician/alerts?status=open",
      params.clinicianToken
    );
    lastStatus = response.status;

    if (
      response.status === 200 &&
      response.data.ok === true &&
      Array.isArray(response.data.alerts)
    ) {
      const alert = response.data.alerts.find((candidate) =>
        alertMatches(candidate, params.alertId)
      );
      if (alert) {
        return alert;
      }
    }

    await sleep(500);
  }

  throw new Error(
    `Alert ${params.alertId} was not visible through clinician alerts before timeout; last HTTP status ${lastStatus}`
  );
}

function summarizeJob(rawJob: Record<string, unknown>): NotificationJobSummary {
  return {
    state: typeof rawJob.state === "string" ? rawJob.state : undefined,
    channel: typeof rawJob.channel === "string" ? rawJob.channel : undefined,
    dispatchKind:
      typeof rawJob.dispatchKind === "string" ? rawJob.dispatchKind : undefined,
    attemptCount:
      typeof rawJob.attemptCount === "number" ? rawJob.attemptCount : undefined,
    lastCallbackStatus:
      typeof rawJob.lastCallbackStatus === "string"
        ? rawJob.lastCallbackStatus
        : undefined,
    messageId: typeof rawJob.messageId === "string" ? rawJob.messageId : undefined,
    currentAttemptKey:
      typeof rawJob.currentAttemptKey === "string"
        ? rawJob.currentAttemptKey
        : undefined,
  };
}

async function pollDeliveredJob(alertId: string): Promise<NotificationJobSummary> {
  const deadline = Date.now() + 30_000;
  let latest: NotificationJobSummary | null = null;

  while (Date.now() <= deadline) {
    const job = await AlertNotificationJob.findOne({ alertId, channel: "telegram" }).lean();
    if (job) {
      latest = summarizeJob(job as Record<string, unknown>);
      if (
        latest.channel === "telegram" &&
        latest.dispatchKind === "initial" &&
        typeof latest.attemptCount === "number" &&
        latest.attemptCount >= 1 &&
        latest.state === "delivered" &&
        latest.lastCallbackStatus === "sent" &&
        Boolean(latest.messageId)
      ) {
        return latest;
      }
    }

    await sleep(500);
  }

  throw new Error(
    `AlertNotificationJob for ${alertId} did not reach delivered/sent with messageId before timeout. Latest: ${redactSecrets(latest)}`
  );
}

function summarizeCareEvent(rawEvent: Record<string, unknown>): CareEventSummary {
  const payload =
    rawEvent.payload && typeof rawEvent.payload === "object"
      ? (rawEvent.payload as Record<string, unknown>)
      : {};
  const meta =
    payload.meta && typeof payload.meta === "object"
      ? (payload.meta as Record<string, unknown>)
      : {};
  const createdAt = rawEvent.createdAt instanceof Date
    ? rawEvent.createdAt.toISOString()
    : typeof rawEvent.createdAt === "string"
      ? rawEvent.createdAt
      : undefined;

  return {
    type: typeof rawEvent.type === "string" ? rawEvent.type : undefined,
    channel: typeof payload.channel === "string" ? payload.channel : undefined,
    status: typeof payload.status === "string" ? payload.status : undefined,
    messageId:
      typeof payload.messageId === "string" ? payload.messageId : undefined,
    workflow: typeof meta.workflow === "string" ? meta.workflow : undefined,
    executionId:
      typeof meta.executionId === "string" ? meta.executionId : undefined,
    createdAt,
  };
}

async function pollNotificationSentEvent(alertId: string): Promise<CareEventSummary> {
  const deadline = Date.now() + 30_000;
  let latest: CareEventSummary | null = null;

  while (Date.now() <= deadline) {
    const event = await CareEvent.findOne({
      alertId,
      type: "NOTIFICATION_SENT",
    })
      .sort({ createdAt: -1 })
      .lean();

    if (event) {
      latest = summarizeCareEvent(event as Record<string, unknown>);
      if (
        latest.type === "NOTIFICATION_SENT" &&
        latest.channel === "telegram" &&
        latest.status === "sent" &&
        Boolean(latest.messageId) &&
        (!latest.workflow || latest.workflow === "01")
      ) {
        return latest;
      }
    }

    await sleep(500);
  }

  throw new Error(
    `Matching NOTIFICATION_SENT CareEvent for ${alertId} was not found before timeout. Latest: ${redactSecrets(latest)}`
  );
}

function formatObjectSummary(value: unknown): string {
  return redactSecrets(JSON.stringify(value, null, 2));
}

function formatDateForFile(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 19).replace(/:/g, "")}`;
}

function evidencePathFor(date: Date): string {
  const projectRoot = path.resolve(__dirname, "../../..");
  return path.join(
    projectRoot,
    "docs",
    "evidence",
    `n8n-telegram-runtime-verification-${formatDateForFile(date)}.md`
  );
}

function markdownChecklist(checks: VerificationCheck[]): string {
  if (checks.length === 0) {
    return "- [ ] No checks completed.";
  }

  return checks
    .map(
      (check) =>
        `- [${check.passed ? "x" : " "}] ${check.label}: ${check.detail}`
    )
    .join("\n");
}

function markdownWorkflowChecks(checks: WorkflowCheck[]): string {
  if (checks.length === 0) {
    return "- [ ] Workflow export checks did not run.";
  }

  return checks
    .map(
      (check) =>
        `- [${check.passed ? "x" : " "}] ${check.label}: ${check.detail}`
    )
    .join("\n");
}

export function formatFailureResult(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(message);
}

export function buildEvidenceMarkdown(state: EvidenceState): string {
  const generatedAtDate = state.timestamp.slice(0, 10);
  return redactSecrets(`# n8n Telegram Runtime Verification - ${generatedAtDate}

## Purpose

This evidence records local/demo runtime verification for the Aura high-risk alert notification chain. It uses synthetic data only and is intended for PUSL3190 final report evidence.

This is not production readiness evidence, clinical validation, real patient validation, and not proof that a clinician read the Telegram message.

## Run Metadata

- Status: ${state.status}
- Timestamp: ${state.timestamp}
- Run ID: ${state.runId}
- Command used: \`${state.command}\`
- Required services: MongoDB, Aura backend, AI/Safety Router path, local n8n workflow 01, and configured Telegram credentials/chat ID in n8n.
- Synthetic marker: \`${state.safeMarker}\`

## Scenario

${state.scenarioSummary}

The full patient message text is intentionally not recorded here beyond the synthetic marker and safe scenario summary.

## Pass/Fail Checklist

${markdownChecklist(state.checks)}

## Runtime Results

- Backend health: ${state.backendHealth ?? "not checked"}
- n8n reachability: ${state.n8nReachability ?? "not checked"}
- Alert ID: ${state.alertId ?? "not created"}
- Patient ID: ${state.patientId ?? "not available"}
- Notification job status: ${state.notificationJobSummary ?? "not verified"}
- Care event summary: ${state.careEventSummary ?? "not verified"}

## Workflow Export Security Checks

${markdownWorkflowChecks(state.workflowChecks)}

Workflow check summary: ${summarizeWorkflowChecks(state.workflowChecks)}

## Failure Diagnostics

${state.failure ? state.failure : "No failure recorded."}

## Redaction Statement

This file was generated with secret redaction. JWTs, passwords, webhook keys, API keys, Telegram bot-token-shaped values, Authorization headers, and secret-like fields are redacted before being written. Telegram bot tokens and raw chat IDs are not required by this verifier and should remain in n8n credentials or local secret storage only.

## Manual Screenshot Checklist

- Capture the Telegram chat/group showing the Aura Rehab alerts message for this synthetic run.
- Include the synthetic run marker or alert ID where possible.
- Crop or redact personal account names and unrelated chat content.
- Suggested path: \`docs/evidence/screenshots/n8n-telegram-runtime-${generatedAtDate}/telegram-chat-alert-${state.runId}.png\`

## Limitations

- This verifies local/demo runtime integration only.
- It does not prove production notification reliability.
- It does not prove clinical safety or clinical deployment readiness.
- It does not use real patient data.
- It does not prove that a clinician read, understood, or acted on the Telegram message.
- It depends on the currently running local backend, MongoDB, n8n import/activation state, and Telegram credential configuration.
- The generated alert/chat/job evidence is intentionally left in the local demo database for traceability.

## Safe Final Report Wording

${SAFE_FINAL_REPORT_WORDING}
`);
}

function writeEvidenceFile(state: EvidenceState, date: Date): string {
  const outputPath = evidencePathFor(date);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buildEvidenceMarkdown(state), "utf8");
  return outputPath;
}

function createInitialEvidenceState(runId: string, timestamp: string): EvidenceState {
  return {
    status: "FAIL",
    timestamp,
    runId,
    command: "npm run verify:n8n:telegram-runtime",
    scenarioSummary:
      "Synthetic high-risk patient chat through the existing patient chat API, using crisis-language wording to exercise the normal Safety Router, backend alert, n8n workflow, Telegram callback, and clinician alert visibility path.",
    safeMarker: buildSyntheticMarker(runId),
    checks: [],
    workflowChecks: [],
  };
}

async function runVerification(): Promise<{ evidencePath: string; state: EvidenceState }> {
  const runStartedAt = new Date();
  const runId = randomUUID();
  const state = createInitialEvidenceState(runId, runStartedAt.toISOString());
  let config: RuntimeConfig | undefined;

  try {
    config = loadRuntimeConfig(process.env);
    addCheck(state, "Required environment is present and local-safe", true, "All required verifier env vars are set.");

    const workflowPath = findWorkflowExportPath();
    const workflowContents = fs.readFileSync(workflowPath, "utf8");
    state.workflowChecks = checkWorkflowExport(workflowContents);
    const workflowOk = state.workflowChecks.every((check) => check.passed);
    addCheck(
      state,
      "Canonical n8n workflow 01 export checks pass",
      workflowOk,
      summarizeWorkflowChecks(state.workflowChecks)
    );
    if (!workflowOk) {
      throw new Error("Canonical workflow 01 export did not pass security/configuration checks.");
    }

    const backendHealth = await getJson<HealthResponse>(
      config.AURA_VERIFY_API_BASE_URL,
      "/health"
    );
    const backendHealthOk =
      backendHealth.status >= 200 && backendHealth.status < 300;
    state.backendHealth = `HTTP ${backendHealth.status}`;
    addCheck(
      state,
      "Backend health endpoint succeeds",
      backendHealthOk,
      state.backendHealth
    );
    if (!backendHealthOk) {
      throw new Error(`Backend health failed with HTTP ${backendHealth.status}`);
    }

    const n8nStatus = await probeN8n(config.AURA_VERIFY_N8N_BASE_URL);
    const n8nReachable = n8nStatus >= 200 && n8nStatus < 500;
    state.n8nReachability = `HTTP ${n8nStatus}`;
    addCheck(
      state,
      "n8n base URL is reachable",
      n8nReachable,
      state.n8nReachability
    );
    if (!n8nReachable) {
      throw new Error(`n8n base URL did not look reachable; HTTP ${n8nStatus}`);
    }

    const patientLogin = await postJson<PatientLoginResponse>(
      config.AURA_VERIFY_API_BASE_URL,
      "/patient/auth/login",
      { accessCode: config.AURA_VERIFY_PATIENT_ACCESS_CODE }
    );
    const patientLoginOk =
      patientLogin.status === 200 &&
      patientLogin.data.ok === true &&
      Boolean(patientLogin.data.token);
    state.patientId = patientLogin.data.patient?.id;
    addCheck(
      state,
      "Patient demo login succeeds",
      patientLoginOk,
      `HTTP ${patientLogin.status}; patientId=${state.patientId ?? "unknown"}`
    );
    if (!patientLoginOk || !patientLogin.data.token) {
      throw new Error(`Patient login failed with HTTP ${patientLogin.status}`);
    }

    const clinicianLogin = await postJson<ClinicianLoginResponse>(
      config.AURA_VERIFY_API_BASE_URL,
      "/auth/clinician/login",
      {
        email: config.AURA_VERIFY_CLINICIAN_EMAIL,
        password: config.AURA_VERIFY_CLINICIAN_PASSWORD,
      }
    );
    const clinicianLoginOk =
      clinicianLogin.status === 200 &&
      clinicianLogin.data.ok === true &&
      Boolean(clinicianLogin.data.token);
    addCheck(
      state,
      "Clinician demo login succeeds",
      clinicianLoginOk,
      `HTTP ${clinicianLogin.status}`
    );
    if (!clinicianLoginOk || !clinicianLogin.data.token) {
      throw new Error(`Clinician login failed with HTTP ${clinicianLogin.status}`);
    }

    mongoose.set("autoCreate", false);
    mongoose.set("autoIndex", false);
    await mongoose.connect(config.MONGO_URL);
    addCheck(state, "MongoDB read connection succeeds", true, "Connected for read-only evidence checks.");

    const chatResponse = await postJson<PatientChatResponse>(
      config.AURA_VERIFY_API_BASE_URL,
      "/patient/chat/send",
      { message: buildSyntheticMessage(runId) },
      patientLogin.data.token
    );
    const chatHighRiskOk =
      chatResponse.status === 200 &&
      chatResponse.data.ok === true &&
      chatResponse.data.risk?.level === "high" &&
      Boolean(chatResponse.data.alertId);
    state.alertId = chatResponse.data.alertId;
    addCheck(
      state,
      "Synthetic patient chat creates a high-risk alert",
      chatHighRiskOk,
      `HTTP ${chatResponse.status}; alertId=${state.alertId ?? "missing"}; risk=${chatResponse.data.risk?.level ?? "missing"}`
    );
    if (!chatHighRiskOk || !state.alertId) {
      throw new Error(
        `Synthetic chat did not create a high-risk alert. Response: ${formatObjectSummary({
          status: chatResponse.status,
          ok: chatResponse.data.ok,
          risk: chatResponse.data.risk,
          hasAlertId: Boolean(chatResponse.data.alertId),
        })}`
      );
    }

    const alert = await pollClinicianAlert({
      apiBaseUrl: config.AURA_VERIFY_API_BASE_URL,
      clinicianToken: clinicianLogin.data.token,
      alertId: state.alertId,
    });
    const alertShapeOk =
      alert.risk === "high" &&
      alert.status === "open" &&
      alert.source?.type === "chat";
    addCheck(
      state,
      "Clinician alert API contains created high-risk chat alert",
      alertShapeOk,
      `alertId=${state.alertId}; risk=${alert.risk ?? "missing"}; status=${alert.status ?? "missing"}; source=${alert.source?.type ?? "missing"}`
    );
    if (!alertShapeOk) {
      throw new Error(
        `Clinician alert did not have expected high-risk/open/chat shape: ${formatObjectSummary(alert)}`
      );
    }

    const job = await pollDeliveredJob(state.alertId);
    state.notificationJobSummary = formatObjectSummary(job);
    addCheck(
      state,
      "AlertNotificationJob reached delivered/sent Telegram state",
      true,
      state.notificationJobSummary
    );

    const careEvent = await pollNotificationSentEvent(state.alertId);
    state.careEventSummary = formatObjectSummary(careEvent);
    addCheck(
      state,
      "NOTIFICATION_SENT CareEvent confirms Telegram sent callback",
      true,
      state.careEventSummary
    );

    state.status = "PASS";
    addCheck(
      state,
      "Evidence file captures local/demo-only limitations",
      true,
      "Safe wording included; no production, clinical, real-patient, or read-receipt claim is made."
    );
  } catch (error) {
    state.status = "FAIL";
    state.failure = formatFailureResult(error);
    addCheck(state, "Verifier completed without missing evidence", false, state.failure);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }

  const evidencePath = writeEvidenceFile(state, runStartedAt);
  return { evidencePath, state };
}

if (require.main === module) {
  runVerification()
    .then(({ evidencePath, state }) => {
      console.log(`Evidence written to ${evidencePath}`);
      if (state.status !== "PASS") {
        console.error(`Verification failed: ${state.failure ?? "missing evidence"}`);
        process.exit(1);
      }
      console.log("Local n8n Telegram runtime verification passed.");
    })
    .catch((error) => {
      console.error(`Verifier crashed before evidence could be finalized: ${formatFailureResult(error)}`);
      process.exit(1);
    });
}
