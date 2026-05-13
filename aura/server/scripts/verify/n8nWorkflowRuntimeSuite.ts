import "dotenv/config";

import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

import Alert from "../../src/models/Alert";
import AlertNotificationJob from "../../src/models/AlertNotificationJob";
import AppointmentRequest from "../../src/models/AppointmentRequest";
import AppointmentSlot from "../../src/models/AppointmentSlot";
import CareEvent from "../../src/models/CareEvent";
import CheckIn from "../../src/models/CheckIn";
import CommunicationReview from "../../src/models/CommunicationReview";
import Patient from "../../src/models/Patient";
import Task from "../../src/models/Task";

export const SAFE_FINAL_REPORT_WORDING =
  "The Aura n8n workflow suite was verified under local/demo conditions using static workflow export validation and safe runtime checks. The verification confirmed that the canonical workflows referenced the expected Aura backend endpoints, authentication keys, Telegram configuration patterns, and callback routes. Runtime checks exercised local backend process paths and recorded redacted evidence. These results demonstrate local/demo workflow integration only and do not represent production notification assurance, clinical deployment validation, real patient validation, or proof that a clinician read or acted on a message.";

export const PROVIDER_SEND_FINAL_REPORT_WORDING =
  "Provider-send mode was explicitly enabled for the Workflow 01 alert path. A synthetic high-risk event triggered a Telegram notification through the configured local/demo n8n workflow and recorded backend delivery/callback evidence.";

export const PROVIDER_SEND_ALL_FINAL_REPORT_WORDING =
  "Under local/demo conditions, Aura verified each Telegram-capable n8n workflow with synthetic data. Workflow 01 was automatically exercised through the high-risk alert path and recorded Telegram delivery/callback evidence. Workflows 03, 04, 06, 07, and 08 were prepared with run-tagged eligible demo data and verified through manual n8n execution plus backend automation-status callback evidence. Workflow 02 was verified separately as an authenticated list-alerts proxy with no Telegram send expected. This evidence demonstrates local/demo provider-send integration only and does not represent production notification reliability, clinical validation, real patient validation, or proof that a clinician read or acted on a message.";

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
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{48,}\b/g;

type WorkflowNode = {
  name?: string;
  type?: string;
  parameters?: Record<string, unknown>;
};

type WorkflowConnection = {
  node?: string;
  type?: string;
  index?: number;
};

type WorkflowExport = {
  name?: string;
  nodes?: WorkflowNode[];
  connections?: Record<string, { main?: WorkflowConnection[][] }>;
  settings?: Record<string, unknown>;
};

export type WorkflowExpectation = {
  id: string;
  name: string;
  filePrefix: string;
  trigger: {
    type: string;
    method?: string;
    path?: string;
    times?: Array<{ hour: number; minute: number }>;
    timezone?: string;
  };
  endpoint: string;
  requiresAuraWebhookKey: boolean;
  requiresN8nWebhookKey: boolean;
  requiresN8nApiKey: boolean;
  requiresTelegram: boolean;
  callbackEndpoint?: string;
  requiredNodes: string[];
};

export type VerificationCheck = {
  label: string;
  passed: boolean;
  detail: string;
};

export type WorkflowValidationResult = {
  workflowId: string;
  workflowName: string;
  passed: boolean;
  filePath?: string;
  checks: VerificationCheck[];
};

type RuntimeMode = "static-only" | "safe-runtime" | "provider-send" | "provider-send-all";

export type WorkflowTriggerStrategy =
  | "automatic-webhook"
  | "manual-execution-required";

type SuiteConfig = {
  mode: RuntimeMode;
  allowNonLocal: boolean;
  cleanupSynthetic: boolean;
  providerSendEnabled: boolean;
  providerSendAllWorkflows: boolean;
  providerAllResetDigestDedupe: boolean;
  providerAllManualWaitSeconds: number;
  providerAllPollSeconds: number;
  apiBaseUrl?: string;
  n8nBaseUrl?: string;
  mongoUrl?: string;
  auraWebhookKey?: string;
  n8nApiKey?: string;
  patientAccessCode?: string;
  clinicianEmail?: string;
  clinicianPassword?: string;
};

type EvidenceState = {
  status: "PASS" | "FAIL";
  mode: RuntimeMode;
  timestamp: string;
  runId: string;
  command: string;
  providerSendEnabled: boolean;
  providerSendAllWorkflows?: boolean;
  providerAllResetDigestDedupe?: boolean;
  providerAllManualWaitSeconds?: number;
  staticResults: WorkflowValidationResult[];
  runtimeChecks: VerificationCheck[];
  workflowSummaries: VerificationCheck[];
  capturedIds: Record<string, string | string[] | undefined>;
  failureDiagnostics: string[];
};

type HttpResult<T> = {
  status: number;
  data: T;
};

type HealthResponse = {
  status?: string;
  ok?: boolean;
};

type ProcessResponse = {
  ok?: boolean;
  workflow?: string;
  generatedAt?: string;
  items?: Array<Record<string, unknown>>;
  messageText?: string;
  summary?: Record<string, unknown>;
};

type PreflightResult = {
  workflowId: string;
  workflowName: string;
  workflow: string;
  path: string;
  itemCount: number;
  expectedDedupeKeys: string[];
};

type ManualWorkflowObservation = {
  workflowId: string;
  workflowName: string;
  workflow: string;
  expectedDedupeKeys: string[];
  observedEventKeys: string[];
  providerMessageId: string;
};

type AutomationCallbackResponse = {
  ok?: boolean;
  writtenEvents?: string[];
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

type PatientChatResponse = {
  ok?: boolean;
  risk?: {
    level?: string;
    reasonCodes?: string[];
  };
  alertId?: string;
};

type AlertJobSummary = {
  jobId?: string;
  state?: string;
  channel?: string;
  dispatchKind?: string;
  attemptCount?: number;
  lastCallbackStatus?: string;
  messageId?: string;
};

const SYNTHETIC_ALERT_REASON = "AURA_N8N_WORKFLOW_SUITE_SYNTHETIC";

const DEFAULT_PROVIDER_ALL_MANUAL_WAIT_SECONDS = 300;
const DEFAULT_PROVIDER_ALL_POLL_SECONDS = 5;
const PROVIDER_ALL_RESET_DIGEST_DEDUPE_ENV =
  "AURA_VERIFY_N8N_PROVIDER_ALL_RESET_DIGEST_DEDUPE";
const DAILY_DIGEST_WORKFLOW = "daily_clinician_digest";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COMMUNICATION_PROVIDER_ALL_SORT_ANCHOR_MS = Date.UTC(2000, 0, 1);

const PROVIDER_ALL_MANUAL_WORKFLOW_IDS = new Set(["03", "04", "06", "07", "08"]);

const AUTOMATION_CHECKS: Array<{
  id: string;
  label: string;
  path: string;
  workflow: string;
}> = [
  {
    id: "03",
    label: "Workflow 03 missed check-in",
    path: "/internal/n8n/follow-through/missed-checkins/process",
    workflow: "missed_checkin_reminder",
  },
  {
    id: "04",
    label: "Workflow 04 task reminder",
    path: "/internal/n8n/follow-through/tasks/process",
    workflow: "task_reminder_timing",
  },
  {
    id: "06",
    label: "Workflow 06 appointment",
    path: "/internal/n8n/follow-through/appointments/process",
    workflow: "appointment_follow_through",
  },
  {
    id: "07",
    label: "Workflow 07 daily digest",
    path: "/internal/n8n/follow-through/digest/process",
    workflow: "daily_clinician_digest",
  },
  {
    id: "08",
    label: "Workflow 08 communication",
    path: "/internal/n8n/follow-through/communications/process",
    workflow: "communication_no_response_escalation",
  },
];

export function buildSyntheticAlertFixture(params: {
  patientId: string;
  checkInId: string;
  marker: string;
}): Record<string, unknown> {
  return {
    patientId: params.patientId,
    reason: SYNTHETIC_ALERT_REASON,
    risk: "high",
    riskAuto: "high",
    riskFinal: "high",
    reasonsAuto: [SYNTHETIC_ALERT_REASON],
    source: {
      type: "checkin",
      sourceId: params.checkInId,
    },
    status: "open",
    demoTag: params.marker,
  };
}

export function buildSyntheticCommunicationReviewFixture(params: {
  patientId: string;
  messageId: string;
  marker: string;
  runId: string;
  now: Date;
  providerSendAll?: boolean;
}): Record<string, unknown> {
  const messageCreatedAt = params.providerSendAll
    ? new Date(COMMUNICATION_PROVIDER_ALL_SORT_ANCHOR_MS - params.now.getTime())
    : new Date(params.now.getTime() - 10 * MS_PER_DAY);
  return {
    patientId: params.patientId,
    messageId: params.messageId,
    source: "chat",
    needsResponse: true,
    flaggedBySafety: true,
    followUpRequested: true,
    lastClinicianReplyAt: null,
    lastReviewedAt: null,
    resolvedAt: null,
    messageCreatedAt,
    messagePreview: params.providerSendAll
      ? `${params.marker} communication no-response evidence`
      : "Synthetic n8n workflow suite message needing response",
    demoTag: params.marker,
  };
}

export const WORKFLOW_EXPECTATIONS: WorkflowExpectation[] = [
  {
    id: "01",
    name: "01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond)",
    filePrefix: "01 - Alert Created Webhook",
    trigger: {
      type: "n8n-nodes-base.webhook",
      method: "POST",
      path: "alert-created",
    },
    endpoint: "/events/notification-status",
    requiresAuraWebhookKey: true,
    requiresN8nWebhookKey: true,
    requiresN8nApiKey: false,
    requiresTelegram: true,
    callbackEndpoint: "/events/notification-status",
    requiredNodes: [
      "Webhook",
      "Validate Inbound Webhook Key",
      "Authorized?",
      "Get existing alert",
      "Insert row",
      "Telegram Send Alert",
      "Post Notification Status",
    ],
  },
  {
    id: "02",
    name: "02 - List Alerts Proxy (GET → Aura API → Respond)",
    filePrefix: "02 - List Alerts Proxy",
    trigger: {
      type: "n8n-nodes-base.webhook",
      method: "GET",
      path: "alerts",
    },
    endpoint: "/internal/n8n/alerts",
    requiresAuraWebhookKey: true,
    requiresN8nWebhookKey: false,
    requiresN8nApiKey: true,
    requiresTelegram: false,
    requiredNodes: [
      "Webhook",
      "Normalize Request",
      "Authorized?",
      "HTTP Request",
      "Respond Success",
      "Respond Backend Error",
    ],
  },
  {
    id: "03",
    name: "03 - Missed Check-in Follow-through (Cron → Aura Process → Telegram → Callback)",
    filePrefix: "03 - Missed Check-in Follow-through",
    trigger: {
      type: "n8n-nodes-base.cron",
      times: [{ hour: 8, minute: 0 }],
    },
    endpoint: "/internal/n8n/follow-through/missed-checkins/process",
    requiresAuraWebhookKey: true,
    requiresN8nWebhookKey: false,
    requiresN8nApiKey: false,
    requiresTelegram: true,
    callbackEndpoint: "/events/automation-status",
    requiredNodes: [
      "Cron",
      "HTTP Process",
      "Build Batch Message",
      "Telegram configured?",
      "Telegram Send Message",
      "Build Skipped Callback Payload",
      "Post Automation Status",
      "Post Skipped Automation Status",
    ],
  },
  {
    id: "04",
    name: "04 - Task Reminder Timing (Cron → Aura Process → Telegram → Callback)",
    filePrefix: "04 - Task Reminder Timing",
    trigger: {
      type: "n8n-nodes-base.cron",
      times: [
        { hour: 8, minute: 30 },
        { hour: 12, minute: 30 },
        { hour: 16, minute: 30 },
        { hour: 20, minute: 30 },
      ],
    },
    endpoint: "/internal/n8n/follow-through/tasks/process",
    requiresAuraWebhookKey: true,
    requiresN8nWebhookKey: false,
    requiresN8nApiKey: false,
    requiresTelegram: true,
    callbackEndpoint: "/events/automation-status",
    requiredNodes: [
      "Cron",
      "HTTP Process",
      "Build Batch Message",
      "Telegram configured?",
      "Telegram Send Message",
      "Build Skipped Callback Payload",
      "Post Automation Status",
      "Post Skipped Automation Status",
    ],
  },
  {
    id: "06",
    name: "06 - Appointment Reminder and Status Follow-up (Cron → Aura Process → Telegram → Callback)",
    filePrefix: "06 - Appointment Reminder and Status Follow-up",
    trigger: {
      type: "n8n-nodes-base.cron",
      times: [
        { hour: 6, minute: 0 },
        { hour: 12, minute: 0 },
        { hour: 18, minute: 0 },
      ],
    },
    endpoint: "/internal/n8n/follow-through/appointments/process",
    requiresAuraWebhookKey: true,
    requiresN8nWebhookKey: false,
    requiresN8nApiKey: false,
    requiresTelegram: true,
    callbackEndpoint: "/events/automation-status",
    requiredNodes: [
      "Cron",
      "HTTP Process",
      "Build Batch Message",
      "Telegram configured?",
      "Telegram Send Message",
      "Build Skipped Callback Payload",
      "Post Automation Status",
      "Post Skipped Automation Status",
    ],
  },
  {
    id: "07",
    name: "07 - Daily Digest (Cron 09:00 → Aura Digest → Telegram → Callback)",
    filePrefix: "07 - Daily Digest",
    trigger: {
      type: "n8n-nodes-base.cron",
      times: [{ hour: 9, minute: 0 }],
      timezone: "Asia/Colombo",
    },
    endpoint: "/internal/n8n/follow-through/digest/process",
    requiresAuraWebhookKey: true,
    requiresN8nWebhookKey: false,
    requiresN8nApiKey: false,
    requiresTelegram: true,
    callbackEndpoint: "/events/automation-status",
    requiredNodes: [
      "Cron",
      "HTTP Process",
      "Build Batch Message",
      "Telegram configured?",
      "Telegram Send Message",
      "Build Skipped Callback Payload",
      "Post Automation Status",
      "Post Skipped Automation Status",
    ],
  },
  {
    id: "08",
    name: "08 - Communication No-Response Escalation (Cron → Aura Process → Telegram → Callback)",
    filePrefix: "08 - Communication No-Response Escalation",
    trigger: {
      type: "n8n-nodes-base.cron",
      times: [{ hour: 10, minute: 0 }],
    },
    endpoint: "/internal/n8n/follow-through/communications/process",
    requiresAuraWebhookKey: true,
    requiresN8nWebhookKey: false,
    requiresN8nApiKey: false,
    requiresTelegram: true,
    callbackEndpoint: "/events/automation-status",
    requiredNodes: [
      "Cron",
      "HTTP Process",
      "Build Batch Message",
      "Telegram configured?",
      "Telegram Send Message",
      "Build Skipped Callback Payload",
      "Post Automation Status",
      "Post Skipped Automation Status",
    ],
  },
];

export const PROVIDER_SEND_ALL_MANUAL_WORKFLOWS = WORKFLOW_EXPECTATIONS.filter(
  (workflow) => PROVIDER_ALL_MANUAL_WORKFLOW_IDS.has(workflow.id)
).map((workflow) => ({
  id: workflow.id,
  name: workflow.name,
}));

function parseBoolean(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function checkProviderSendEnabled(
  rawEnv: Record<string, string | undefined>
): { enabled: boolean; detail: string } {
  const enabled = parseBoolean(rawEnv.AURA_VERIFY_ALLOW_PROVIDER_SEND);
  return {
    enabled,
    detail: enabled
      ? "AURA_VERIFY_ALLOW_PROVIDER_SEND=true; provider-send checks may trigger Telegram in local/demo n8n."
      : "AURA_VERIFY_ALLOW_PROVIDER_SEND is not true; provider-send checks are disabled.",
  };
}

export function checkProviderSendAllEnabled(
  rawEnv: Record<string, string | undefined>
): { requested: boolean; enabled: boolean; detail: string } {
  const requested = parseBoolean(rawEnv.AURA_VERIFY_N8N_PROVIDER_ALL_WORKFLOWS);
  const providerSend = checkProviderSendEnabled(rawEnv).enabled;
  const enabled = providerSend && requested;
  return {
    requested,
    enabled,
    detail: enabled
      ? "AURA_VERIFY_ALLOW_PROVIDER_SEND=true and AURA_VERIFY_N8N_PROVIDER_ALL_WORKFLOWS=true; all-workflow provider-send checks may send Telegram in local/demo n8n."
      : requested
        ? "AURA_VERIFY_N8N_PROVIDER_ALL_WORKFLOWS=true but AURA_VERIFY_ALLOW_PROVIDER_SEND is not true; provider-send-all is disabled."
        : "AURA_VERIFY_N8N_PROVIDER_ALL_WORKFLOWS is not true; provider-send-all checks are disabled.",
  };
}

function parsePositiveIntEnv(
  rawEnv: Record<string, string | undefined>,
  name: string,
  fallback: number
): number {
  const raw = rawEnv[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer number of seconds`);
  }
  return parsed;
}

export function buildSyntheticRunMarker(
  runId: string,
  providerSendAll = false
): string {
  return providerSendAll
    ? `aura-n8n-provider-send-all:${runId}`
    : `aura-n8n-workflow-suite:${runId}`;
}

export function dailyDigestDedupeKeyForDate(date: Date): string {
  return `daily-digest:${date.toISOString().slice(0, 10)}`;
}

export function buildWorkflow07DigestDedupeBlockedMessage(params: {
  workflowName: string;
  dedupeKey: string;
  resetEnabled: boolean;
}): string {
  const resetGuidance = params.resetEnabled
    ? "The Workflow 07 dedupe reset flag was enabled, but no eligible digest item was returned after reset. Check that the backend is using the same evidence date window and that demo dashboard data is available."
    : `Workflow 07 Daily Digest uses a global date-level dedupe key (${params.dedupeKey}). A prior local/demo sent or skipped automation-status event for this key can block a second same-day evidence run. To explicitly clear only this local/demo digest dedupe blocker before preflight, rerun provider-send-all with ${PROVIDER_ALL_RESET_DIGEST_DEDUPE_ENV}=true.`;
  return `${params.workflowName} provider-send-all preflight returned no eligible synthetic/demo dedupe keys. ${resetGuidance}`;
}

export function buildWorkflow08NoEligibleMessage(params: {
  workflowName: string;
  messageId?: string;
  communicationReviewId?: string;
}): string {
  const ids = [
    params.messageId ? `messageId=${params.messageId}` : undefined,
    params.communicationReviewId ? `communicationReviewId=${params.communicationReviewId}` : undefined,
  ]
    .filter(Boolean)
    .join("; ");
  return `${params.workflowName} provider-send-all preflight returned no eligible synthetic/demo dedupe keys. Workflow 08 Communication No-Response Escalation requires a synthetic CommunicationReview with needsResponse=true, source=chat, no clinician response/resolution, a valid messageCreatedAt, and a message old enough to be delayed beyond the configured response threshold. The backend scans the oldest needs-response reviews first, so the verifier fixture must be old enough to appear in that process window. ${ids ? `Synthetic identifiers: ${ids}.` : ""}`;
}

export function workflowTriggerStrategy(
  expectation: WorkflowExpectation
): WorkflowTriggerStrategy {
  return expectation.trigger.type === "n8n-nodes-base.webhook"
    ? "automatic-webhook"
    : "manual-execution-required";
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
    })
    .replace(LONG_TOKEN_PATTERN, "[REDACTED_TOKEN_LIKE_VALUE]");
}

function assertLocalHttpUrl(
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

function requireEnv(rawEnv: NodeJS.ProcessEnv, name: string): string {
  const value = rawEnv[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadSuiteConfig(rawEnv: NodeJS.ProcessEnv): SuiteConfig {
  const providerSend = checkProviderSendEnabled(rawEnv);
  const providerSendAll = checkProviderSendAllEnabled(rawEnv);
  const staticOnly = parseBoolean(rawEnv.AURA_VERIFY_N8N_STATIC_ONLY);
  const allowNonLocal = parseBoolean(rawEnv.AURA_VERIFY_ALLOW_NON_LOCAL);
  const providerAllResetDigestDedupe = parseBoolean(
    rawEnv[PROVIDER_ALL_RESET_DIGEST_DEDUPE_ENV]
  );
  const providerAllManualWaitSeconds = parsePositiveIntEnv(
    rawEnv,
    "AURA_VERIFY_N8N_PROVIDER_ALL_MANUAL_WAIT_SECONDS",
    DEFAULT_PROVIDER_ALL_MANUAL_WAIT_SECONDS
  );
  const providerAllPollSeconds = parsePositiveIntEnv(
    rawEnv,
    "AURA_VERIFY_N8N_PROVIDER_ALL_POLL_SECONDS",
    DEFAULT_PROVIDER_ALL_POLL_SECONDS
  );

  if (providerSendAll.requested && !providerSend.enabled) {
    throw new Error(
      "AURA_VERIFY_N8N_PROVIDER_ALL_WORKFLOWS=true requires AURA_VERIFY_ALLOW_PROVIDER_SEND=true. Provider-send-all is explicitly gated because it can send Telegram messages in local/demo n8n."
    );
  }
  if (providerAllResetDigestDedupe && !providerSendAll.enabled) {
    throw new Error(
      `${PROVIDER_ALL_RESET_DIGEST_DEDUPE_ENV}=true requires provider-send-all mode with AURA_VERIFY_ALLOW_PROVIDER_SEND=true and AURA_VERIFY_N8N_PROVIDER_ALL_WORKFLOWS=true. The reset is local/demo-only and can remove Daily Digest automation-status dedupe evidence.`
    );
  }
  if (providerAllResetDigestDedupe && allowNonLocal) {
    throw new Error(
      `${PROVIDER_ALL_RESET_DIGEST_DEDUPE_ENV}=true cannot be used with AURA_VERIFY_ALLOW_NON_LOCAL=true. Daily Digest dedupe reset is restricted to local/demo evidence windows.`
    );
  }

  if (staticOnly) {
    return {
      mode: "static-only",
      allowNonLocal,
      cleanupSynthetic: parseBoolean(rawEnv.AURA_VERIFY_CLEANUP_SYNTHETIC),
      providerSendEnabled: false,
      providerSendAllWorkflows: false,
      providerAllResetDigestDedupe: false,
      providerAllManualWaitSeconds,
      providerAllPollSeconds,
    };
  }

  const apiBaseUrl = assertLocalHttpUrl(
    "AURA_VERIFY_API_BASE_URL",
    requireEnv(rawEnv, "AURA_VERIFY_API_BASE_URL"),
    allowNonLocal
  );
  const n8nBaseUrl = assertLocalHttpUrl(
    "AURA_VERIFY_N8N_BASE_URL",
    requireEnv(rawEnv, "AURA_VERIFY_N8N_BASE_URL"),
    allowNonLocal
  );

  const config: SuiteConfig = {
    mode: providerSendAll.enabled
      ? "provider-send-all"
      : providerSend.enabled
        ? "provider-send"
        : "safe-runtime",
    allowNonLocal,
    cleanupSynthetic: parseBoolean(rawEnv.AURA_VERIFY_CLEANUP_SYNTHETIC),
    providerSendEnabled: providerSend.enabled,
    providerSendAllWorkflows: providerSendAll.enabled,
    providerAllResetDigestDedupe,
    providerAllManualWaitSeconds,
    providerAllPollSeconds,
    apiBaseUrl,
    n8nBaseUrl,
    mongoUrl: requireEnv(rawEnv, "MONGO_URL"),
    auraWebhookKey: requireEnv(rawEnv, "AURA_WEBHOOK_KEY"),
    n8nApiKey: requireEnv(rawEnv, "AURA_N8N_API_KEY"),
    patientAccessCode: rawEnv.AURA_VERIFY_PATIENT_ACCESS_CODE?.trim(),
    clinicianEmail: rawEnv.AURA_VERIFY_CLINICIAN_EMAIL?.trim(),
    clinicianPassword: rawEnv.AURA_VERIFY_CLINICIAN_PASSWORD,
  };

  const valuesToInspect = [
    config.apiBaseUrl,
    config.n8nBaseUrl,
    config.mongoUrl,
    config.patientAccessCode,
    config.clinicianEmail,
    config.clinicianPassword,
  ];
  for (const value of valuesToInspect) {
    if (!value) {
      continue;
    }
    TELEGRAM_BOT_TOKEN_PATTERN.lastIndex = 0;
    if (TELEGRAM_BOT_TOKEN_PATTERN.test(value) || /api\.telegram\.org\/bot/i.test(value)) {
      throw new Error(
        "Verifier environment appears to contain a raw Telegram bot token or bot URL; keep provider credentials in n8n credentials/local secret storage."
      );
    }
  }

  return config;
}

function pushCheck(
  checks: VerificationCheck[],
  label: string,
  passed: boolean,
  detail: string
): void {
  checks.push({ label, passed, detail: redactSecrets(detail) });
}

function flattenWorkflowText(workflow: WorkflowExport): string {
  return JSON.stringify(workflow);
}

function findNode(workflow: WorkflowExport, name: string): WorkflowNode | undefined {
  return (workflow.nodes ?? []).find((node) => node.name === name);
}

function workflowHasNodeType(workflow: WorkflowExport, type: string): boolean {
  return (workflow.nodes ?? []).some((node) => node.type === type);
}

function workflowHasWebhookTrigger(
  workflow: WorkflowExport,
  method: string,
  webhookPath: string
): boolean {
  return (workflow.nodes ?? []).some((node) => {
    if (node.type !== "n8n-nodes-base.webhook") {
      return false;
    }
    const parameters = node.parameters ?? {};
    return (
      String(parameters.httpMethod ?? "").toUpperCase() === method.toUpperCase() &&
      String(parameters.path ?? "") === webhookPath
    );
  });
}

function workflowCronTimes(workflow: WorkflowExport): Array<{ hour: number; minute: number }> {
  const cron = (workflow.nodes ?? []).find((node) => node.type === "n8n-nodes-base.cron");
  const item = ((cron?.parameters?.triggerTimes as Record<string, unknown> | undefined)?.item ??
    []) as Array<Record<string, unknown>>;
  return item
    .map((entry) => ({
      hour: Number(entry.hour),
      minute: Number(entry.minute),
    }))
    .filter((entry) => Number.isFinite(entry.hour) && Number.isFinite(entry.minute));
}

function hasCronTime(
  workflow: WorkflowExport,
  expected: { hour: number; minute: number }
): boolean {
  return workflowCronTimes(workflow).some(
    (entry) => entry.hour === expected.hour && entry.minute === expected.minute
  );
}

function headerUsesAuraWebhookKey(workflow: WorkflowExport): boolean {
  return (workflow.nodes ?? []).some((node) => {
    const headers =
      ((node.parameters?.headerParameters as Record<string, unknown> | undefined)
        ?.parameters as Array<Record<string, unknown>> | undefined) ?? [];
    return headers.some(
      (header) =>
        String(header.name ?? "").toLowerCase() === "x-aura-webhook-key" &&
        String(header.value ?? "").includes("AURA_WEBHOOK_KEY")
    );
  });
}

function hasHardcodedSecretLikeWorkflowValue(workflow: WorkflowExport): boolean {
  for (const node of workflow.nodes ?? []) {
    const params = node.parameters ?? {};
    const headers =
      ((params.headerParameters as Record<string, unknown> | undefined)?.parameters as
        | Array<Record<string, unknown>>
        | undefined) ?? [];
    for (const header of headers) {
      const headerName = String(header.name ?? "").toLowerCase();
      const value = String(header.value ?? "");
      if (headerName === "authorization" && value && !value.includes("$env")) {
        return true;
      }
      if (
        (headerName === "x-aura-webhook-key" || headerName === "x-api-key") &&
        value &&
        !value.includes("$env")
      ) {
        return true;
      }
    }
  }

  const text = flattenWorkflowText(workflow);
  return /dev_aura_webhook_key|devpass123|password\s*[:=]\s*[^"',\s}]+/i.test(text);
}

export function validateWorkflowExport(
  expectation: WorkflowExpectation,
  contents: string,
  filePath?: string
): WorkflowValidationResult {
  const checks: VerificationCheck[] = [];
  let workflow: WorkflowExport | undefined;

  try {
    workflow = JSON.parse(contents) as WorkflowExport;
    pushCheck(checks, "Workflow JSON parses", true, filePath ?? expectation.filePrefix);
  } catch (error) {
    pushCheck(
      checks,
      "Workflow JSON parses",
      false,
      error instanceof Error ? error.message : String(error)
    );
    return {
      workflowId: expectation.id,
      workflowName: expectation.name,
      passed: false,
      filePath,
      checks,
    };
  }

  const text = flattenWorkflowText(workflow);
  pushCheck(checks, "Expected workflow name exists", workflow.name === expectation.name, workflow.name ?? "missing");

  if (expectation.trigger.type === "n8n-nodes-base.webhook") {
    pushCheck(
      checks,
      `Expected ${expectation.trigger.method} webhook path exists`,
      Boolean(
        expectation.trigger.method &&
          expectation.trigger.path &&
          workflowHasWebhookTrigger(
            workflow,
            expectation.trigger.method,
            expectation.trigger.path
          )
      ),
      expectation.trigger.path ?? "missing"
    );
  } else {
    pushCheck(
      checks,
      "Expected cron trigger exists",
      workflowHasNodeType(workflow, expectation.trigger.type),
      expectation.trigger.type
    );
    for (const time of expectation.trigger.times ?? []) {
      pushCheck(
        checks,
        `Cron trigger includes ${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`,
        hasCronTime(workflow, time),
        JSON.stringify(workflowCronTimes(workflow))
      );
    }
    if (expectation.trigger.timezone) {
      const timezone = String(workflow.settings?.timezone ?? "");
      pushCheck(
        checks,
        `Workflow timezone is ${expectation.trigger.timezone} when present`,
        !timezone || timezone === expectation.trigger.timezone,
        timezone || "not set"
      );
    }
  }

  pushCheck(
    checks,
    "Expected Aura backend endpoint reference exists",
    text.includes(expectation.endpoint),
    expectation.endpoint
  );

  for (const nodeName of expectation.requiredNodes) {
    pushCheck(
      checks,
      `Required node exists: ${nodeName}`,
      Boolean(findNode(workflow, nodeName)),
      nodeName
    );
  }

  if (expectation.requiresAuraWebhookKey) {
    pushCheck(
      checks,
      "Callback/internal request uses AURA_WEBHOOK_KEY",
      text.includes("AURA_WEBHOOK_KEY") && headerUsesAuraWebhookKey(workflow),
      "x-aura-webhook-key must be env-based"
    );
  }
  if (expectation.requiresN8nWebhookKey) {
    pushCheck(
      checks,
      "Inbound validation references AURA_N8N_WEBHOOK_KEY",
      text.includes("AURA_N8N_WEBHOOK_KEY"),
      "backend-to-n8n ingress must fail closed"
    );
  }
  if (expectation.requiresN8nApiKey) {
    pushCheck(
      checks,
      "Proxy validation references AURA_N8N_API_KEY",
      text.includes("AURA_N8N_API_KEY"),
      "list proxy must fail closed"
    );
  }
  if (expectation.requiresN8nWebhookKey || expectation.requiresN8nApiKey) {
    pushCheck(
      checks,
      "Unauthorized/fail-closed branch exists",
      text.includes("Authorized?") &&
        text.includes("Build Unauthorized Response") &&
        text.includes("Respond Unauthorized"),
      "unauthorized branch nodes must exist"
    );
  }
  if (expectation.requiresTelegram) {
    const telegramNodes = (workflow.nodes ?? []).filter(
      (node) => node.type === "n8n-nodes-base.telegram"
    );
    pushCheck(
      checks,
      "Telegram node or branch exists",
      telegramNodes.length > 0 && text.includes("Telegram configured?"),
      `${telegramNodes.length} Telegram node(s)`
    );
    pushCheck(
      checks,
      "Telegram chat ID is env-based through TELEGRAM_CLINICIAN_CHAT_ID",
      telegramNodes.every((node) =>
        String(node.parameters?.chatId ?? "").includes("TELEGRAM_CLINICIAN_CHAT_ID")
      ) && text.includes("TELEGRAM_CLINICIAN_CHAT_ID"),
      "Telegram chat target must not be hardcoded"
    );
    pushCheck(
      checks,
      "Skipped Telegram branch exists",
      text.includes("Build Skipped Callback Payload") || text.includes("Mark Telegram Skipped"),
      "safe no-provider path must exist"
    );
  }
  if (expectation.callbackEndpoint) {
    pushCheck(
      checks,
      `Callback node posts to ${expectation.callbackEndpoint}`,
      text.includes(expectation.callbackEndpoint),
      expectation.callbackEndpoint
    );
  }

  TELEGRAM_BOT_TOKEN_PATTERN.lastIndex = 0;
  pushCheck(
    checks,
    "No Telegram bot token literal is embedded",
    !TELEGRAM_BOT_TOKEN_PATTERN.test(text),
    "workflow export must not include bot-token-shaped values"
  );
  pushCheck(
    checks,
    "No api.telegram.org bot-token URL is embedded",
    !/api\.telegram\.org\/bot/i.test(text),
    "workflow export must not include Telegram bot URLs"
  );
  pushCheck(
    checks,
    "No hardcoded Authorization/header secret literal is embedded",
    !hasHardcodedSecretLikeWorkflowValue(workflow),
    "secret-like header values must come from env/credentials"
  );

  return {
    workflowId: expectation.id,
    workflowName: expectation.name,
    passed: checks.every((check) => check.passed),
    filePath,
    checks,
  };
}

function projectRoot(): string {
  return path.resolve(__dirname, "../../..");
}

function workflowsRoot(): string {
  return path.join(projectRoot(), "n8n", "workflows");
}

function findWorkflowExportPath(expectation: WorkflowExpectation): string | null {
  const root = workflowsRoot();
  if (!fs.existsSync(root)) {
    return null;
  }
  const fileName = fs
    .readdirSync(root)
    .find(
      (entry) =>
        entry.startsWith(expectation.filePrefix) && entry.endsWith(".json")
    );
  return fileName ? path.join(root, fileName) : null;
}

function validateAllWorkflowExports(): WorkflowValidationResult[] {
  return WORKFLOW_EXPECTATIONS.map((expectation) => {
    const filePath = findWorkflowExportPath(expectation);
    if (!filePath) {
      return {
        workflowId: expectation.id,
        workflowName: expectation.name,
        passed: false,
        checks: [
          {
            label: "Workflow export exists",
            passed: false,
            detail: `Missing canonical export with prefix ${expectation.filePrefix}`,
          },
        ],
      };
    }

    const contents = fs.readFileSync(filePath, "utf8");
    const result = validateWorkflowExport(expectation, contents, filePath);
    result.checks.unshift({
      label: "Workflow export exists",
      passed: true,
      detail: path.relative(projectRoot(), filePath),
    });
    result.passed = result.checks.every((check) => check.passed);
    return result;
  });
}

function formatDateForFile(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 19).replace(/:/g, "")}`;
}

export function providerSendAllEvidenceFileName(date: Date): string {
  return `n8n-provider-send-all-workflows-${formatDateForFile(date)}.md`;
}

function markdownChecks(checks: VerificationCheck[]): string {
  if (checks.length === 0) {
    return "- [ ] No checks were recorded.";
  }
  return checks
    .map(
      (check) =>
        `- [${check.passed ? "x" : " "}] ${check.label}: ${check.detail}`
    )
    .join("\n");
}

function markdownStaticResults(results: WorkflowValidationResult[]): string {
  if (results.length === 0) {
    return "- [ ] Static validation did not run.";
  }
  return results
    .map((result) => {
      const status = result.passed ? "PASS" : "FAIL";
      const checks = result.checks
        .map((check) => `  - [${check.passed ? "x" : " "}] ${check.label}: ${check.detail}`)
        .join("\n");
      return `- ${status}: ${result.workflowName}\n${checks}`;
    })
    .join("\n");
}

function markdownCapturedIds(capturedIds: EvidenceState["capturedIds"]): string {
  const entries = Object.entries(capturedIds).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return "- None captured.";
  }
  return entries
    .map(([key, value]) => {
      const rendered = Array.isArray(value) ? value.join(", ") : value;
      return `- ${key}: ${rendered}`;
    })
    .join("\n");
}

export function buildEvidenceMarkdown(state: EvidenceState): string {
  const modeLabel =
    state.mode === "static-only"
      ? "static-only"
      : state.mode === "provider-send-all"
        ? "provider-send-all"
        : state.mode === "provider-send"
        ? "provider-send"
        : "safe-runtime";
  const requiredServices =
    state.mode === "static-only"
      ? "None. Static-only mode reads local workflow exports only."
      : state.mode === "provider-send-all"
        ? "MongoDB, Aura backend, local n8n, imported/active workflows, AI/Safety Router path for Workflow 01, configured local/demo Telegram credentials/chat ID in n8n, and manual n8n Execute Workflow runs for workflows 03, 04, 06, 07, and 08."
      : state.mode === "provider-send"
        ? "MongoDB, Aura backend, local n8n, imported/active workflows, AI/Safety Router path for Workflow 01, and configured local/demo Telegram credentials/chat ID in n8n."
        : "MongoDB, Aura backend, and local n8n. Telegram/provider sending remains disabled.";
  const title = state.mode === "provider-send-all"
    ? `n8n Provider-Send All Workflows - ${state.timestamp.slice(0, 10)}`
    : `n8n Workflow Runtime Suite - ${state.timestamp.slice(0, 10)}`;
  const marker = buildSyntheticRunMarker(
    state.runId,
    state.providerSendAllWorkflows === true
  );
  const providerAllSection = state.providerSendAllWorkflows
    ? `
- Provider-send-all gate status: enabled
- Manual wait seconds: ${state.providerAllManualWaitSeconds ?? DEFAULT_PROVIDER_ALL_MANUAL_WAIT_SECONDS}
- Workflow 07 digest dedupe reset flag: ${state.providerAllResetDigestDedupe ? "enabled" : "disabled"}
`
    : "- Provider-send-all gate status: disabled";
  const screenshotChecklist = state.providerSendAllWorkflows
    ? `- Telegram chat/group showing synthetic messages for workflows 01, 03, 04, 06, 07, and 08.
- n8n executions list showing successful executions for workflows 01, 02, 03, 04, 06, 07, and 08.
- n8n execution detail screenshots for workflows 03, 04, 06, 07, and 08 showing process node, Telegram node, and callback node.
- Dashboard alert/worklist/digest surfaces where relevant.
- Crop or redact personal names, unrelated chats, and secrets.`
    : `- n8n workflows list showing the seven Aura workflows imported/published for the local demo.
- Workflow 02 n8n execution or response screenshot if the proxy check was run through n8n.
- Backend terminal or this evidence file with secrets hidden.
- For workflows 03, 04, 06, 07, and 08, manual Execute Workflow screenshots when full n8n execution is needed: process node, Telegram or skipped branch, callback node, and success output.
- In provider-send mode only: Telegram chat/group showing the synthetic Aura alert, n8n Workflow 01 execution success view, and clinician dashboard alert visibility.
- Crop or redact personal names, unrelated chats, and any secrets.`;
  const finalReportWording = state.providerSendAllWorkflows
    ? PROVIDER_SEND_ALL_FINAL_REPORT_WORDING
    : `${SAFE_FINAL_REPORT_WORDING}${state.providerSendEnabled ? `\n\n${PROVIDER_SEND_FINAL_REPORT_WORDING}` : ""}`;

  return redactSecrets(`# ${title}

## Purpose

This evidence records local/demo runtime verification for the Aura n8n workflow suite. It uses synthetic/demo data only and is intended for final report evidence.

This is local/demo ${state.providerSendAllWorkflows ? "provider-send" : "runtime"} verification only. It is not production readiness evidence, production notification reliability evidence, clinical validation, real patient validation, or proof that a clinician read or acted on a message.

## Run Metadata

- Status: ${state.status}
- Timestamp: ${state.timestamp}
- Run ID: ${state.runId}
- Synthetic marker: \`${marker}\`
- Command used: \`${state.command}\`
- Mode: ${modeLabel}
- Required services: ${requiredServices}
- Provider-send gate status: ${state.providerSendEnabled ? "enabled" : "disabled"}
${providerAllSection}

## Static Workflow Validation Summary

${markdownStaticResults(state.staticResults)}

## Runtime Readiness Summary

${markdownChecks(state.runtimeChecks)}

## Workflow-by-Workflow Runtime Checklist

${markdownChecks(state.workflowSummaries)}

${state.providerSendAllWorkflows ? `## Provider-Send-All Manual Observation Results

Workflow 01 is automatic through the synthetic high-risk alert path. Workflow 02 is automatic and is expected not to send Telegram. Workflows 03, 04, 06, 07, and 08 require manual n8n Execute Workflow runs; provider message ids for those workflows are recorded as "manual screenshot only if visible" when n8n callback payloads do not include Telegram message ids.

Workflow 07 Daily Digest uses a date-level dedupe key. If the explicit local/demo reset flag was enabled, this verifier removed only same-day Workflow 07 Daily Digest AUTOMATION_STATUS sent/skipped records before preflight and recorded that action in captured IDs.
` : ""}

## IDs Captured

${markdownCapturedIds(state.capturedIds)}

## Failure Diagnostics

${state.failureDiagnostics.length > 0 ? state.failureDiagnostics.map((item) => `- ${item}`).join("\n") : "- No failure recorded."}

## Redaction Statement

This file was generated with secret redaction. JWTs, passwords, webhook keys, API keys, Telegram bot-token-shaped values, Authorization headers, HTTP auth credentials, secret-like fields, and long token-like strings are redacted before printing or writing evidence. Raw .env contents are not read or written by this verifier.

## Manual Screenshot Checklist

${screenshotChecklist}

## Limitations

- This verifies local/demo workflow integration only.
- It does not prove production notification reliability.
- It does not prove clinical safety or clinical deployment readiness.
- It does not use real patient data.
- It does not prove that a clinician read, understood, or acted on a message.
- Safe runtime mode verifies cron workflows through Aura backend internal process endpoints instead of forcing n8n cron execution.
- Manual n8n and Telegram screenshots are still recommended for appendix evidence.
- Provider-send-all mode still requires manual n8n execution screenshots for cron-triggered workflows 03, 04, 06, 07, and 08.

## Safe Final Report Wording

${finalReportWording}
`);
}

export function writeEvidenceFile(
  state: EvidenceState,
  date: Date,
  outputRoot = path.join(projectRoot(), "docs", "evidence")
): string {
  fs.mkdirSync(outputRoot, { recursive: true });
  const outputPath = path.join(
    outputRoot,
    state.providerSendAllWorkflows
      ? providerSendAllEvidenceFileName(date)
      : `n8n-workflow-runtime-suite-${formatDateForFile(date)}.md`
  );
  fs.writeFileSync(outputPath, buildEvidenceMarkdown(state), "utf8");
  return outputPath;
}

async function getJson<T>(
  baseUrl: string,
  routePath: string,
  headers?: Record<string, string>
): Promise<HttpResult<T>> {
  const response = await axios.get<T>(`${baseUrl}${routePath}`, {
    timeout: 10_000,
    validateStatus: () => true,
    headers,
  });
  return { status: response.status, data: response.data };
}

async function postJson<T>(
  baseUrl: string,
  routePath: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<HttpResult<T>> {
  const response = await axios.post<T>(`${baseUrl}${routePath}`, body, {
    timeout: 20_000,
    validateStatus: () => true,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
  });
  return { status: response.status, data: response.data };
}

async function probeN8n(baseUrl: string): Promise<number> {
  const response = await axios.get(baseUrl, {
    timeout: 8_000,
    validateStatus: () => true,
  });
  return response.status;
}

async function createSyntheticFixtures(
  runId: string,
  providerSendAll = false
): Promise<Record<string, string | string[]>> {
  const marker = buildSyntheticRunMarker(runId, providerSendAll);
  const shortId = runId.slice(0, 8);
  const patientId = `verify-${shortId}`;
  const now = new Date();
  const oldDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  await Patient.findOneAndUpdate(
    { patientId },
    {
      patientId,
      displayName: providerSendAll
        ? `Aura n8n Provider-Send Synthetic ${shortId} ${marker}`
        : "Aura n8n Synthetic Patient",
      accessCode: `VERIFY-${shortId}`,
      clinicianId: "clinician-verify",
      status: "active",
      demoTag: marker,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const checkIn = await CheckIn.create({
    patientId,
    date: oldDate.toISOString().slice(0, 10),
    mood: 2,
    pain: 8,
    adherence: { exercises: 0.1, medication: false },
    notes: marker,
    risk: { level: "high", reasons: [SYNTHETIC_ALERT_REASON] },
    demoTag: marker,
  });

  const alert = await Alert.create(buildSyntheticAlertFixture({
    patientId,
    checkInId: String(checkIn._id),
    marker,
  }));

  const task = await Task.create({
    patientId,
    title: providerSendAll
      ? `Synthetic provider-send task ${shortId}`
      : "Synthetic n8n workflow suite task",
    description: providerSendAll ? `${marker} due task reminder evidence` : marker,
    type: "follow_up",
    priority: "high",
    status: "open",
    dueAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    createdBy: "automation:n8n-verifier",
    source: {
      type: "automation",
      entityType: "n8n_workflow_suite",
      entityId: runId,
      label: "n8n workflow suite verifier",
    },
    meta: {
      patientAction: { kind: "checkin", label: "Open check-in" },
      verifier: { marker, runId },
    },
    demoTag: marker,
  });

  const slot = await AppointmentSlot.create({
    clinicianId: "clinician-verify",
    startsAt: new Date(yesterday.getTime() - 60 * 60 * 1000),
    endsAt: new Date(yesterday.getTime() - 30 * 60 * 1000),
    modality: "video",
    status: "available",
    demoTag: marker,
  });
  const appointment = await AppointmentRequest.create({
    slotId: slot._id,
    patientId,
    status: "pending",
    note: providerSendAll ? `${marker} appointment reminder/status evidence` : marker,
    demoTag: marker,
  });

  const communicationMessageId = new mongoose.Types.ObjectId().toString();
  const communicationFixture = buildSyntheticCommunicationReviewFixture({
    patientId,
    messageId: communicationMessageId,
    marker,
    runId,
    now,
    providerSendAll,
  });
  const communication = await CommunicationReview.create(communicationFixture);

  return {
    syntheticMarker: marker,
    syntheticPatientId: patientId,
    syntheticAlertId: String(alert._id),
    syntheticTaskId: String(task._id),
    syntheticAppointmentRequestId: String(appointment._id),
    syntheticCommunicationReviewId: String(communication._id),
    syntheticCommunicationMessageId: communicationMessageId,
    syntheticCommunicationMessageCreatedAt: (communicationFixture.messageCreatedAt as Date).toISOString(),
  };
}

async function cleanupSynthetic(marker: string): Promise<void> {
  await Promise.all([
    Alert.deleteMany({ demoTag: marker }),
    AppointmentRequest.deleteMany({ demoTag: marker }),
    AppointmentSlot.deleteMany({ demoTag: marker }),
    CareEvent.deleteMany({ "payload.verifierMarker": marker }),
    CheckIn.deleteMany({ demoTag: marker }),
    CommunicationReview.deleteMany({ demoTag: marker }),
    Patient.deleteMany({ demoTag: marker }),
    Task.deleteMany({ demoTag: marker }),
  ]);
}

async function runAutomationEndpoint(params: {
  config: SuiteConfig;
  path: string;
  workflow: string;
  runId: string;
  marker: string;
  now: Date;
}): Promise<{ itemCount: number; writtenEvents: string[]; firstDedupeKey?: string }> {
  const processResponse = await postJson<ProcessResponse>(
    params.config.apiBaseUrl ?? "",
    params.path,
    { limit: 25, force: true, now: params.now.toISOString() },
    { "x-aura-webhook-key": params.config.auraWebhookKey ?? "" }
  );
  if (processResponse.status !== 200 || processResponse.data.ok !== true) {
    throw new Error(
      `${params.path} failed with HTTP ${processResponse.status}: ${redactSecrets(processResponse.data)}`
    );
  }

  const items = Array.isArray(processResponse.data.items)
    ? processResponse.data.items
    : [];
  if (items.length === 0) {
    throw new Error(`${params.path} returned no synthetic/demo items`);
  }

  const callbackItems = items.map((item) => ({
    dedupeKey: String(item.dedupeKey ?? ""),
    patientId: typeof item.patientId === "string" ? item.patientId : undefined,
    taskId: typeof item.taskId === "string" ? item.taskId : undefined,
    appointmentRequestId:
      typeof item.appointmentRequestId === "string"
        ? item.appointmentRequestId
        : undefined,
    communicationReviewId:
      typeof item.communicationReviewId === "string"
        ? item.communicationReviewId
        : undefined,
    linkedEntityType:
      typeof item.linkedEntityType === "string" ? item.linkedEntityType : undefined,
    linkedEntityId:
      typeof item.linkedEntityId === "string" ? item.linkedEntityId : undefined,
    title: typeof item.title === "string" ? item.title : undefined,
  }));

  const callbackResponse = await postJson<AutomationCallbackResponse>(
    params.config.apiBaseUrl ?? "",
    "/events/automation-status",
    {
      workflow: params.workflow,
      status: "skipped",
      channel: "internal_demo",
      timestamp: params.now.toISOString(),
      error: "AURA_N8N_WORKFLOW_SUITE_PROVIDER_SEND_DISABLED",
      items: callbackItems,
      meta: {
        workflowId: params.workflow,
        executionId: `internal-demo:${params.runId}`,
      },
    },
    { "x-aura-webhook-key": params.config.auraWebhookKey ?? "" }
  );
  if (callbackResponse.status !== 200 || callbackResponse.data.ok !== true) {
    throw new Error(
      `/events/automation-status failed for ${params.workflow} with HTTP ${callbackResponse.status}: ${redactSecrets(callbackResponse.data)}`
    );
  }

  await CareEvent.updateMany(
    {
      type: "AUTOMATION_STATUS",
      "payload.eventKey": { $in: callbackResponse.data.writtenEvents ?? [] },
    },
    { $set: { "payload.verifierMarker": params.marker } }
  );

  return {
    itemCount: items.length,
    writtenEvents: callbackResponse.data.writtenEvents ?? [],
    firstDedupeKey: callbackItems[0]?.dedupeKey,
  };
}

function syntheticDedupeKeysForWorkflow(params: {
  workflowId: string;
  items: Array<Record<string, unknown>>;
  fixtureIds: Record<string, string | string[]>;
}): string[] {
  const marker = String(params.fixtureIds.syntheticMarker ?? "");
  const patientId = String(params.fixtureIds.syntheticPatientId ?? "");
  const taskId = String(params.fixtureIds.syntheticTaskId ?? "");
  const appointmentRequestId = String(params.fixtureIds.syntheticAppointmentRequestId ?? "");
  const communicationReviewId = String(params.fixtureIds.syntheticCommunicationReviewId ?? "");
  const communicationMessageId = String(params.fixtureIds.syntheticCommunicationMessageId ?? "");

  const matches = params.items.filter((item) => {
    const text = JSON.stringify(item);
    if (marker && text.includes(marker)) {
      return true;
    }
    if (params.workflowId === "03") {
      return patientId && text.includes(patientId);
    }
    if (params.workflowId === "04") {
      return taskId && text.includes(taskId);
    }
    if (params.workflowId === "06") {
      return appointmentRequestId && text.includes(appointmentRequestId);
    }
    if (params.workflowId === "08") {
      return (
        (communicationReviewId && text.includes(communicationReviewId)) ||
        (communicationMessageId && text.includes(communicationMessageId))
      );
    }
    if (params.workflowId === "07") {
      return true;
    }
    return false;
  });

  return [
    ...new Set(
      matches
        .map((item) => String(item.dedupeKey ?? ""))
        .filter((dedupeKey) => dedupeKey.length > 0)
    ),
  ];
}

async function resetWorkflow07DigestDedupeForLocalDemo(params: {
  state: EvidenceState;
  config: SuiteConfig;
  now: Date;
}): Promise<void> {
  if (!params.config.providerAllResetDigestDedupe) {
    return;
  }
  if (!params.config.providerSendAllWorkflows || params.config.allowNonLocal) {
    throw new Error(
      `${PROVIDER_ALL_RESET_DIGEST_DEDUPE_ENV}=true is restricted to provider-send-all mode against local/demo URLs.`
    );
  }

  const dedupeKey = dailyDigestDedupeKeyForDate(params.now);
  const filter = {
    type: "AUTOMATION_STATUS",
    "payload.workflow": DAILY_DIGEST_WORKFLOW,
    "payload.dedupeKey": dedupeKey,
    "payload.status": { $in: ["sent", "skipped"] },
  };
  const existingRows = await CareEvent.find(filter).select({ _id: 1, payload: 1 }).lean();
  const eventKeys = existingRows
    .map((row) => summarizeAutomationEvent(row as Record<string, unknown>).eventKey)
    .filter((eventKey): eventKey is string => Boolean(eventKey));
  const existingIds = existingRows.map((row) => row._id);
  const deleteResult = existingIds.length > 0
    ? await CareEvent.deleteMany({ _id: { $in: existingIds } })
    : { deletedCount: 0 };
  const deletedCount = Number(deleteResult.deletedCount ?? 0);

  params.state.capturedIds.workflow07DigestDedupeKey = dedupeKey;
  params.state.capturedIds.workflow07DigestDedupeResetCount = String(deletedCount);
  params.state.capturedIds.workflow07DigestDedupeResetEventKeys = eventKeys;
  pushCheck(
    params.state.workflowSummaries,
    "Workflow 07 local/demo digest dedupe reset",
    true,
    `${PROVIDER_ALL_RESET_DIGEST_DEDUPE_ENV}=true; removed ${deletedCount} local/demo ${DAILY_DIGEST_WORKFLOW} AUTOMATION_STATUS sent/skipped record(s) for dedupeKey=${dedupeKey}.`
  );
}

async function preflightProviderAllAutomationEndpoint(params: {
  config: SuiteConfig;
  path: string;
  workflowId: string;
  workflowName: string;
  workflow: string;
  fixtureIds: Record<string, string | string[]>;
  now: Date;
}): Promise<PreflightResult> {
  const processResponse = await postJson<ProcessResponse>(
    params.config.apiBaseUrl ?? "",
    params.path,
    { limit: 25, force: false, now: params.now.toISOString() },
    { "x-aura-webhook-key": params.config.auraWebhookKey ?? "" }
  );
  if (processResponse.status !== 200 || processResponse.data.ok !== true) {
    throw new Error(
      `${params.path} provider-send-all preflight failed with HTTP ${processResponse.status}: ${redactSecrets(processResponse.data)}`
    );
  }

  const items = Array.isArray(processResponse.data.items)
    ? processResponse.data.items
    : [];
  const expectedDedupeKeys = syntheticDedupeKeysForWorkflow({
    workflowId: params.workflowId,
    items,
    fixtureIds: params.fixtureIds,
  });

  if (items.length === 0 || expectedDedupeKeys.length === 0) {
    if (params.workflowId === "07") {
      throw new Error(
        buildWorkflow07DigestDedupeBlockedMessage({
          workflowName: params.workflowName,
          dedupeKey: dailyDigestDedupeKeyForDate(params.now),
          resetEnabled: params.config.providerAllResetDigestDedupe,
        })
      );
    }
    if (params.workflowId === "08") {
      throw new Error(
        buildWorkflow08NoEligibleMessage({
          workflowName: params.workflowName,
          messageId: String(params.fixtureIds.syntheticCommunicationMessageId ?? ""),
          communicationReviewId: String(params.fixtureIds.syntheticCommunicationReviewId ?? ""),
        })
      );
    }
    throw new Error(
      `${params.workflowName} provider-send-all preflight returned no eligible synthetic/demo dedupe keys. This can happen if today's dedupe key was already sent/skipped or the synthetic fixture no longer matches the process criteria.`
    );
  }

  return {
    workflowId: params.workflowId,
    workflowName: params.workflowName,
    workflow: params.workflow,
    path: params.path,
    itemCount: items.length,
    expectedDedupeKeys,
  };
}

function printProviderSendAllManualInstructions(waitSeconds: number): void {
  console.log("");
  console.log("Provider-send-all mode is enabled. This can send real Telegram messages through the configured local/demo bot.");
  console.log("The verifier has prepared synthetic run-tagged data.");
  console.log("Now manually execute the following n8n workflows from the n8n UI:");
  for (const [index, workflow] of PROVIDER_SEND_ALL_MANUAL_WORKFLOWS.entries()) {
    console.log(`${index + 1}. ${workflow.name}`);
  }
  console.log("After executing them, keep this terminal running. The verifier will poll backend callback evidence.");
  console.log(`Manual wait timeout: ${waitSeconds} seconds.`);
  console.log("");
}

function summarizeAutomationEvent(rawEvent: Record<string, unknown>): {
  eventKey?: string;
  dedupeKey?: string;
  workflow?: string;
  status?: string;
  channel?: string;
} {
  const payload =
    rawEvent.payload && typeof rawEvent.payload === "object" && !Array.isArray(rawEvent.payload)
      ? (rawEvent.payload as Record<string, unknown>)
      : {};
  return {
    eventKey: typeof payload.eventKey === "string" ? payload.eventKey : undefined,
    dedupeKey: typeof payload.dedupeKey === "string" ? payload.dedupeKey : undefined,
    workflow: typeof payload.workflow === "string" ? payload.workflow : undefined,
    status: typeof payload.status === "string" ? payload.status : undefined,
    channel: typeof payload.channel === "string" ? payload.channel : undefined,
  };
}

async function findProviderAllObservation(
  preflight: PreflightResult,
  startedAt: Date
): Promise<ManualWorkflowObservation | null> {
  const events = await CareEvent.find({
    type: "AUTOMATION_STATUS",
    createdAt: { $gte: startedAt },
    "payload.workflow": preflight.workflow,
    "payload.status": "sent",
    "payload.channel": "telegram",
    "payload.dedupeKey": { $in: preflight.expectedDedupeKeys },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (events.length === 0) {
    return null;
  }

  const summaries = events.map((event) =>
    summarizeAutomationEvent(event as Record<string, unknown>)
  );
  const observedEventKeys = summaries
    .map((summary) => summary.eventKey)
    .filter((eventKey): eventKey is string => Boolean(eventKey));

  await CareEvent.updateMany(
    {
      type: "AUTOMATION_STATUS",
      "payload.eventKey": { $in: observedEventKeys },
    },
    { $set: { "payload.verifierMarker": `provider-send-all:${preflight.workflowId}` } }
  );

  return {
    workflowId: preflight.workflowId,
    workflowName: preflight.workflowName,
    workflow: preflight.workflow,
    expectedDedupeKeys: preflight.expectedDedupeKeys,
    observedEventKeys,
    providerMessageId: "manual screenshot only if visible",
  };
}

async function pollProviderAllManualObservations(params: {
  preflights: PreflightResult[];
  startedAt: Date;
  waitSeconds: number;
  pollSeconds: number;
}): Promise<ManualWorkflowObservation[]> {
  const deadline = Date.now() + params.waitSeconds * 1000;
  const observed = new Map<string, ManualWorkflowObservation>();

  while (Date.now() <= deadline) {
    for (const preflight of params.preflights) {
      if (observed.has(preflight.workflowId)) {
        continue;
      }
      const observation = await findProviderAllObservation(preflight, params.startedAt);
      if (observation) {
        observed.set(preflight.workflowId, observation);
      }
    }

    if (observed.size === params.preflights.length) {
      break;
    }

    await sleep(params.pollSeconds * 1000);
  }

  return params.preflights
    .map((preflight) => observed.get(preflight.workflowId))
    .filter((value): value is ManualWorkflowObservation => Boolean(value));
}

function summarizeJob(rawJob: Record<string, unknown>): AlertJobSummary {
  return {
    jobId: rawJob._id ? String(rawJob._id) : undefined,
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
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollDeliveredJob(alertId: string): Promise<AlertJobSummary> {
  const deadline = Date.now() + 30_000;
  let latest: AlertJobSummary | null = null;
  while (Date.now() <= deadline) {
    const job = await AlertNotificationJob.findOne({ alertId, channel: "telegram" }).lean();
    if (job) {
      latest = summarizeJob(job as Record<string, unknown>);
      if (
        latest.state === "delivered" &&
        latest.lastCallbackStatus === "sent" &&
        Boolean(latest.messageId)
      ) {
        return latest;
      }
    }
    await sleep(500);
  }
  throw new Error(`AlertNotificationJob for ${alertId} did not reach delivered/sent. Latest: ${redactSecrets(latest)}`);
}

async function runProviderSendWorkflow01(
  state: EvidenceState,
  config: SuiteConfig
): Promise<void> {
  if (!config.providerSendEnabled) {
    pushCheck(
      state.workflowSummaries,
      "Workflow 01 provider-send path",
      true,
      "Skipped because provider-send gate is disabled."
    );
    return;
  }
  if (!config.patientAccessCode) {
    throw new Error("AURA_VERIFY_PATIENT_ACCESS_CODE is required for provider-send Workflow 01 proof");
  }

  const patientLogin = await postJson<PatientLoginResponse>(
    config.apiBaseUrl ?? "",
    "/patient/auth/login",
    { accessCode: config.patientAccessCode }
  );
  if (patientLogin.status !== 200 || patientLogin.data.ok !== true || !patientLogin.data.token) {
    throw new Error(`Patient login failed for provider-send proof with HTTP ${patientLogin.status}`);
  }

  const syntheticMessage = `[${buildSyntheticRunMarker(state.runId, state.providerSendAllWorkflows === true)}] I cant breathe and need urgent help. Synthetic demo verification only.`;
  const chatResponse = await postJson<PatientChatResponse>(
    config.apiBaseUrl ?? "",
    "/patient/chat/send",
    { message: syntheticMessage },
    { Authorization: `Bearer ${patientLogin.data.token}` }
  );
  if (
    chatResponse.status !== 200 ||
    chatResponse.data.ok !== true ||
    chatResponse.data.risk?.level !== "high" ||
    !chatResponse.data.alertId
  ) {
    throw new Error(`Provider-send synthetic chat did not create high-risk alert: ${redactSecrets(chatResponse.data)}`);
  }

  const alertId = chatResponse.data.alertId;
  state.capturedIds.providerSendAlertId = alertId;
  const job = await pollDeliveredJob(alertId);
  state.capturedIds.providerSendNotificationJob = JSON.stringify(job);
  state.capturedIds.providerSendNotificationJobId = job.jobId;
  state.capturedIds.providerSendProviderMessageId = job.messageId;

  const event = await CareEvent.findOne({
    alertId,
    type: "NOTIFICATION_SENT",
  }).lean();
  if (!event) {
    throw new Error(`No NOTIFICATION_SENT CareEvent found for alert ${alertId}`);
  }
  state.capturedIds.providerSendNotificationEventId = String(event._id);

  pushCheck(
    state.workflowSummaries,
    "Workflow 01 provider-send path",
    true,
    `Synthetic high-risk alert ${alertId} reached delivered/sent callback evidence.`
  );
}

async function runProviderSendAllWorkflowChecks(
  state: EvidenceState,
  config: SuiteConfig,
  startedAt: Date
): Promise<void> {
  if (!config.providerSendAllWorkflows) {
    return;
  }

  await runProviderSendWorkflow01(state, config);

  pushCheck(
    state.workflowSummaries,
    "Workflow 02 n8n proxy no Telegram expected",
    true,
    "Workflow 02 is a list-alerts proxy; no Telegram send expected."
  );

  const fixtureIds = await createSyntheticFixtures(state.runId, true);
  Object.assign(state.capturedIds, fixtureIds);
  const now = new Date();

  const preflights: PreflightResult[] = [];
  for (const check of AUTOMATION_CHECKS) {
    if (check.id === "07") {
      await resetWorkflow07DigestDedupeForLocalDemo({ state, config, now });
    }
    const expectation = WORKFLOW_EXPECTATIONS.find((workflow) => workflow.id === check.id);
    const preflight = await preflightProviderAllAutomationEndpoint({
      config,
      path: check.path,
      workflowId: check.id,
      workflowName: expectation?.name ?? check.label,
      workflow: check.workflow,
      fixtureIds,
      now,
    });
    preflights.push(preflight);
    state.capturedIds[`workflow${check.id}ExpectedDedupeKeys`] = preflight.expectedDedupeKeys;
    pushCheck(
      state.workflowSummaries,
      `${check.label} provider-send-all backend preflight`,
      true,
      `items=${preflight.itemCount}; expectedSyntheticDedupeKeys=${preflight.expectedDedupeKeys.join(", ")}`
    );
  }

  printProviderSendAllManualInstructions(config.providerAllManualWaitSeconds);

  const observations = await pollProviderAllManualObservations({
    preflights,
    startedAt,
    waitSeconds: config.providerAllManualWaitSeconds,
    pollSeconds: config.providerAllPollSeconds,
  });
  const observedByWorkflow = new Map(
    observations.map((observation) => [observation.workflowId, observation])
  );

  for (const preflight of preflights) {
    const observation = observedByWorkflow.get(preflight.workflowId);
    if (observation) {
      state.capturedIds[`workflow${preflight.workflowId}ProviderMessageId`] =
        observation.providerMessageId;
      state.capturedIds[`workflow${preflight.workflowId}ObservedAutomationEvents`] =
        observation.observedEventKeys;
      pushCheck(
        state.workflowSummaries,
        `Workflow ${preflight.workflowId} manual n8n provider-send observation`,
        true,
        `Observed sent telegram callback for ${observation.workflow}; provider message id: ${observation.providerMessageId}.`
      );
      continue;
    }

    pushCheck(
      state.workflowSummaries,
      `Workflow ${preflight.workflowId} manual n8n provider-send observation`,
      false,
      `Not observed before timeout. Expected workflow=${preflight.workflow}; expectedDedupeKeys=${preflight.expectedDedupeKeys.join(", ")}`
    );
  }

  const missing = preflights.filter(
    (preflight) => !observedByWorkflow.has(preflight.workflowId)
  );
  if (missing.length > 0) {
    throw new Error(
      `Provider-send-all manual n8n evidence incomplete for workflow(s): ${missing
        .map((workflow) => workflow.workflowId)
        .join(", ")}`
    );
  }
}

async function runRuntimeChecks(
  state: EvidenceState,
  config: SuiteConfig,
  startedAt: Date
): Promise<void> {
  const backendHealth = await getJson<HealthResponse>(config.apiBaseUrl ?? "", "/health");
  const backendOk = backendHealth.status >= 200 && backendHealth.status < 300;
  pushCheck(state.runtimeChecks, "Backend health reachable", backendOk, `HTTP ${backendHealth.status}`);
  if (!backendOk) {
    throw new Error(`Backend health failed with HTTP ${backendHealth.status}`);
  }

  const n8nStatus = await probeN8n(config.n8nBaseUrl ?? "");
  const n8nOk = n8nStatus >= 200 && n8nStatus < 500;
  pushCheck(state.runtimeChecks, "n8n base URL reachable", n8nOk, `HTTP ${n8nStatus}`);
  if (!n8nOk) {
    throw new Error(`n8n base URL did not look reachable; HTTP ${n8nStatus}`);
  }

  mongoose.set("autoCreate", false);
  mongoose.set("autoIndex", false);
  await mongoose.connect(config.mongoUrl ?? "");
  pushCheck(state.runtimeChecks, "MongoDB reachable", true, "Connected for local/demo evidence checks.");

  if (config.patientAccessCode) {
    const patientLogin = await postJson<PatientLoginResponse>(
      config.apiBaseUrl ?? "",
      "/patient/auth/login",
      { accessCode: config.patientAccessCode }
    );
    pushCheck(
      state.runtimeChecks,
      "Optional demo patient login works",
      patientLogin.status === 200 && patientLogin.data.ok === true,
      `HTTP ${patientLogin.status}; patientId=${patientLogin.data.patient?.id ?? "unknown"}`
    );
  }

  if (config.clinicianEmail && config.clinicianPassword) {
    const clinicianLogin = await postJson<ClinicianLoginResponse>(
      config.apiBaseUrl ?? "",
      "/auth/clinician/login",
      { email: config.clinicianEmail, password: config.clinicianPassword }
    );
    pushCheck(
      state.runtimeChecks,
      "Optional demo clinician login works",
      clinicianLogin.status === 200 && clinicianLogin.data.ok === true,
      `HTTP ${clinicianLogin.status}`
    );
  }

  const unauthorizedProxy = await getJson<unknown>(
    config.n8nBaseUrl ?? "",
    "/webhook/alerts?status=open&limit=1"
  );
  const unauthorizedOk = unauthorizedProxy.status === 401 || unauthorizedProxy.status === 403;
  pushCheck(
    state.workflowSummaries,
    "Workflow 02 n8n proxy unauthorized request fails closed",
    unauthorizedOk,
    `HTTP ${unauthorizedProxy.status}`
  );

  const authorizedProxy = await getJson<{ ok?: boolean; alerts?: unknown[] }>(
    config.n8nBaseUrl ?? "",
    "/webhook/alerts?status=open&limit=5",
    { "x-api-key": config.n8nApiKey ?? "" }
  );
  const authorizedOk =
    authorizedProxy.status === 200 &&
    authorizedProxy.data &&
    (authorizedProxy.data.ok === true || Array.isArray(authorizedProxy.data.alerts));
  pushCheck(
    state.workflowSummaries,
    "Workflow 02 n8n proxy authorized request returns alert-list response",
    authorizedOk,
    `HTTP ${authorizedProxy.status}; hasAlertsArray=${Array.isArray(authorizedProxy.data?.alerts)}`
  );
  if (!unauthorizedOk || !authorizedOk) {
    throw new Error("Workflow 02 n8n proxy runtime checks failed");
  }

  if (config.providerSendAllWorkflows) {
    await runProviderSendAllWorkflowChecks(state, config, startedAt);
    return;
  }

  const fixtureIds = await createSyntheticFixtures(state.runId);
  Object.assign(state.capturedIds, fixtureIds);
  const marker = String(fixtureIds.syntheticMarker);
  const now = new Date();

  for (const check of AUTOMATION_CHECKS) {
    const result = await runAutomationEndpoint({
      config,
      path: check.path,
      workflow: check.workflow,
      runId: state.runId,
      marker,
      now,
    });
    state.capturedIds[`workflow${check.id}FirstDedupeKey`] = result.firstDedupeKey;
    state.capturedIds[`workflow${check.id}AutomationEvents`] = result.writtenEvents;
    pushCheck(
      state.workflowSummaries,
      `${check.label} backend process and internal-demo callback`,
      result.itemCount > 0 && result.writtenEvents.length > 0,
      `items=${result.itemCount}; writtenEvents=${result.writtenEvents.length}`
    );
  }

  await runProviderSendWorkflow01(state, config);

  if (config.cleanupSynthetic) {
    await cleanupSynthetic(marker);
    pushCheck(
      state.runtimeChecks,
      "Synthetic cleanup completed",
      true,
      "Only records tagged with this verifier marker were removed."
    );
  }
}

function createInitialState(params: {
  runId: string;
  timestamp: string;
  mode: RuntimeMode;
  providerSendEnabled: boolean;
  providerSendAllWorkflows?: boolean;
  providerAllResetDigestDedupe?: boolean;
  providerAllManualWaitSeconds?: number;
}): EvidenceState {
  return {
    status: "FAIL",
    mode: params.mode,
    timestamp: params.timestamp,
    runId: params.runId,
    command: "npm run verify:n8n:workflows",
    providerSendEnabled: params.providerSendEnabled,
    providerSendAllWorkflows: params.providerSendAllWorkflows,
    providerAllResetDigestDedupe: params.providerAllResetDigestDedupe,
    providerAllManualWaitSeconds: params.providerAllManualWaitSeconds,
    staticResults: [],
    runtimeChecks: [],
    workflowSummaries: [],
    capturedIds: {},
    failureDiagnostics: [],
  };
}

async function runSuite(): Promise<{ evidencePath: string; state: EvidenceState }> {
  const startedAt = new Date();
  const runId = randomUUID();
  const providerAllRequested = parseBoolean(process.env.AURA_VERIFY_N8N_PROVIDER_ALL_WORKFLOWS);
  const providerSendRequested = parseBoolean(process.env.AURA_VERIFY_ALLOW_PROVIDER_SEND);
  let state = createInitialState({
    runId,
    timestamp: startedAt.toISOString(),
    mode: providerAllRequested ? "provider-send-all" : "static-only",
    providerSendEnabled: providerSendRequested,
    providerSendAllWorkflows: providerAllRequested,
    providerAllResetDigestDedupe: parseBoolean(
      process.env[PROVIDER_ALL_RESET_DIGEST_DEDUPE_ENV]
    ),
    providerAllManualWaitSeconds: DEFAULT_PROVIDER_ALL_MANUAL_WAIT_SECONDS,
  });
  let config: SuiteConfig | undefined;

  try {
    config = loadSuiteConfig(process.env);
    state = createInitialState({
      runId,
      timestamp: startedAt.toISOString(),
      mode: config.mode,
      providerSendEnabled: config.providerSendEnabled,
      providerSendAllWorkflows: config.providerSendAllWorkflows,
      providerAllResetDigestDedupe: config.providerAllResetDigestDedupe,
      providerAllManualWaitSeconds: config.providerAllManualWaitSeconds,
    });
    state.staticResults = validateAllWorkflowExports();
    const staticOk = state.staticResults.every((result) => result.passed);
    if (!staticOk) {
      throw new Error("Static workflow export validation failed");
    }

    if (config.mode !== "static-only") {
      await runRuntimeChecks(state, config, startedAt);
    } else {
      pushCheck(
        state.runtimeChecks,
        "Static-only mode skipped live services",
        true,
        "No backend, MongoDB, n8n, or Telegram/provider calls were made."
      );
      pushCheck(
        state.workflowSummaries,
        "Runtime workflow execution skipped in static-only mode",
        true,
        "Workflow-by-workflow runtime checks require safe runtime or provider-send mode."
      );
    }

    state.status =
      state.staticResults.every((result) => result.passed) &&
      state.runtimeChecks.every((check) => check.passed) &&
      state.workflowSummaries.every((check) => check.passed)
        ? "PASS"
        : "FAIL";
  } catch (error) {
    state.status = "FAIL";
    state.failureDiagnostics.push(redactSecrets(error instanceof Error ? error.message : String(error)));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }

  const evidencePath = writeEvidenceFile(state, startedAt);
  return { evidencePath, state };
}

if (require.main === module) {
  runSuite()
    .then(({ evidencePath, state }) => {
      console.log(`Evidence written to ${evidencePath}`);
      console.log(`Mode: ${state.mode}; provider-send: ${state.providerSendEnabled ? "enabled" : "disabled"}`);
      if (state.status !== "PASS") {
        console.error(`Verification failed. See redacted evidence at ${evidencePath}`);
        process.exit(1);
      }
      console.log("Aura n8n workflow suite verification passed for the selected local/demo mode.");
    })
    .catch((error) => {
      console.error(`Verifier crashed before evidence could be finalized: ${redactSecrets(error)}`);
      process.exit(1);
    });
}
