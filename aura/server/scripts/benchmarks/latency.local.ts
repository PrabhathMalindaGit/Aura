import "dotenv/config";

import axios from "axios";
import { randomUUID } from "crypto";
import { performance } from "perf_hooks";

import { connectMongo, disconnectMongo } from "../../src/db/mongo";
import AlertNotificationJob from "../../src/models/AlertNotificationJob";

type MetricSummary = {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
};

type BenchmarkOptions = {
  samples: number;
  warmups: number;
  json: boolean;
  apiBaseUrl: string;
  aiBaseUrl: string;
  allowNonLocal: boolean;
};

type HttpResult<T> = {
  status: number;
  data: T;
  latencyMs: number;
};

type PatientLoginResponse = {
  ok?: boolean;
  token?: string;
};

type ClinicianLoginResponse = {
  ok?: boolean;
  token?: string;
};

type ChatResponse = {
  ok?: boolean;
  risk?: {
    level?: "low" | "high";
    reasonCodes?: string[];
  };
  alertId?: string;
};

type AlertRow = {
  _id?: string;
  id?: string;
};

type AlertsResponse = {
  ok?: boolean;
  alerts?: AlertRow[];
};

type HighRiskSample = {
  roundTripMs: number;
  backendCommitUpperBoundMs: number;
  alertVisibleFromRequestStartMs: number;
  clinicianAlertRetrievalMs: number;
  jobVerifiedFromRequestStartMs: number;
  alertId: string;
};

const ENDPOINTS = {
  backendHealth: "GET /health",
  aiHealth: "GET /health",
  patientLogin: "POST /patient/auth/login",
  clinicianLogin: "POST /auth/clinician/login",
  patientChatSend: "POST /patient/chat/send",
  clinicianAlerts: "GET /clinician/alerts?status=open",
  alertNotificationJob: "Mongo AlertNotificationJob.findOne({ alertId })",
} as const;

const LOCAL_SERVICE_HINT = [
  'cd "/Users/University/Final Project/aura"',
  "docker compose up -d mongo",
  "",
  'cd "/Users/University/Final Project/aura/ai"',
  "source .venv/bin/activate",
  "uvicorn src.main:app --reload --host 127.0.0.1 --port 8001",
  "",
  'cd "/Users/University/Final Project/aura/server"',
  "npm run seed:reset",
  "npm run dev",
].join("\n");

function parsePositiveInt(name: string, rawValue: string | undefined, fallback: number): number {
  if (rawValue === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }

  if (name === "samples" && parsed < 1) {
    throw new Error("--samples must be at least 1");
  }

  return parsed;
}

function parseArgs(argv: string[]): BenchmarkOptions {
  const options: BenchmarkOptions = {
    samples: 15,
    warmups: 2,
    json: false,
    apiBaseUrl: "http://127.0.0.1:3000",
    aiBaseUrl: "http://127.0.0.1:8001",
    allowNonLocal: false,
  };

  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--allow-non-local") {
      options.allowNonLocal = true;
      continue;
    }

    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (!match) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const [, key, value] = match;
    if (key === "samples") {
      options.samples = parsePositiveInt("samples", value, options.samples);
    } else if (key === "warmups") {
      options.warmups = parsePositiveInt("warmups", value, options.warmups);
    } else if (key === "apiBaseUrl") {
      options.apiBaseUrl = normalizeBaseUrl(value);
    } else if (key === "aiBaseUrl") {
      options.aiBaseUrl = normalizeBaseUrl(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl);
  options.aiBaseUrl = normalizeBaseUrl(options.aiBaseUrl);
  return options;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Base URL cannot be empty");
  }
  return trimmed.replace(/\/+$/, "");
}

function assertLocalUrl(label: string, rawUrl: string, allowNonLocal: boolean): void {
  if (allowNonLocal) {
    return;
  }

  const parsed = new URL(rawUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      `${label} must point to localhost or 127.0.0.1 unless --allow-non-local is passed`
    );
  }
}

function nowMs(): number {
  return performance.now();
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function summarize(values: number[]): MetricSummary {
  if (values.length === 0) {
    throw new Error("Cannot summarize an empty metric set");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const middle = sorted.length / 2;
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[Math.floor(middle)];
  const p95Index = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);

  return {
    min: roundMs(sorted[0]),
    max: roundMs(sorted[sorted.length - 1]),
    mean: roundMs(sum / sorted.length),
    median: roundMs(median),
    p95: roundMs(sorted[p95Index]),
  };
}

async function getJson<T>(
  baseUrl: string,
  path: string,
  token?: string
): Promise<HttpResult<T>> {
  const startedAt = nowMs();
  const response = await axios.get<T>(`${baseUrl}${path}`, {
    timeout: 15_000,
    validateStatus: () => true,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  return {
    status: response.status,
    data: response.data,
    latencyMs: nowMs() - startedAt,
  };
}

async function postJson<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  token?: string
): Promise<HttpResult<T>> {
  const startedAt = nowMs();
  const response = await axios.post<T>(`${baseUrl}${path}`, body, {
    timeout: 15_000,
    validateStatus: () => true,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  return {
    status: response.status,
    data: response.data,
    latencyMs: nowMs() - startedAt,
  };
}

function assertOkHealth(label: string, result: HttpResult<unknown>): void {
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${label} health failed with HTTP ${result.status}`);
  }
}

async function loginPatient(apiBaseUrl: string): Promise<string> {
  const response = await postJson<PatientLoginResponse>(
    apiBaseUrl,
    "/patient/auth/login",
    { accessCode: "P1-DEMO" }
  );

  if (response.status !== 200 || response.data.ok !== true || !response.data.token) {
    throw new Error(
      "Patient demo login failed. Run npm run seed:reset before benchmarking."
    );
  }

  return response.data.token;
}

async function loginClinician(apiBaseUrl: string): Promise<string> {
  const response = await postJson<ClinicianLoginResponse>(
    apiBaseUrl,
    "/auth/clinician/login",
    {
      email: "clinician1@example.com",
      password: "devpass123",
    }
  );

  if (response.status !== 200 || response.data.ok !== true || !response.data.token) {
    throw new Error(
      "Clinician demo login failed. Run npm run seed:reset before benchmarking."
    );
  }

  return response.data.token;
}

function alertMatches(alert: AlertRow, alertId: string): boolean {
  return alert._id === alertId || alert.id === alertId;
}

async function pollAlertVisible(params: {
  apiBaseUrl: string;
  clinicianToken: string;
  alertId: string;
  requestStartedAt: number;
}): Promise<{
  alertVisibleFromRequestStartMs: number;
  clinicianAlertRetrievalMs: number;
}> {
  const deadline = Date.now() + 10_000;
  let lastStatus = 0;

  while (Date.now() <= deadline) {
    const response = await getJson<AlertsResponse>(
      params.apiBaseUrl,
      "/clinician/alerts?status=open",
      params.clinicianToken
    );
    lastStatus = response.status;

    if (
      response.status === 200 &&
      response.data.ok === true &&
      Array.isArray(response.data.alerts) &&
      response.data.alerts.some((alert) => alertMatches(alert, params.alertId))
    ) {
      return {
        alertVisibleFromRequestStartMs: nowMs() - params.requestStartedAt,
        clinicianAlertRetrievalMs: response.latencyMs,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Alert ${params.alertId} was not visible through clinician alerts before timeout; last HTTP status ${lastStatus}`
  );
}

async function pollNotificationJob(params: {
  alertId: string;
  requestStartedAt: number;
}): Promise<number> {
  const deadline = Date.now() + 10_000;

  while (Date.now() <= deadline) {
    const job = await AlertNotificationJob.findOne({ alertId: params.alertId }).lean();
    if (job) {
      return nowMs() - params.requestStartedAt;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`AlertNotificationJob was not created for alert ${params.alertId}`);
}

async function runLowRiskSample(params: {
  apiBaseUrl: string;
  patientToken: string;
  runId: string;
  index: number;
}): Promise<number> {
  const response = await postJson<ChatResponse>(
    params.apiBaseUrl,
    "/patient/chat/send",
    {
      message: `[AURA_LATENCY_BENCH:${params.runId}] Knee feels mildly tight after exercises today. Sample ${params.index}.`,
    },
    params.patientToken
  );

  if (
    response.status !== 200 ||
    response.data.ok !== true ||
    response.data.risk?.level !== "low"
  ) {
    throw new Error(`Low-risk chat sample ${params.index} failed or was not low-risk`);
  }

  return response.latencyMs;
}

async function runHighRiskSample(params: {
  apiBaseUrl: string;
  patientToken: string;
  clinicianToken: string;
  runId: string;
  index: number;
}): Promise<HighRiskSample> {
  const requestStartedAt = nowMs();
  const response = await postJson<ChatResponse>(
    params.apiBaseUrl,
    "/patient/chat/send",
    {
      message: `[AURA_LATENCY_BENCH:${params.runId}] I cant breathe and need help. Sample ${params.index}.`,
    },
    params.patientToken
  );

  if (
    response.status !== 200 ||
    response.data.ok !== true ||
    response.data.risk?.level !== "high" ||
    !response.data.alertId
  ) {
    throw new Error(`High-risk chat sample ${params.index} failed or did not create an alert`);
  }

  const [alertVisibility, jobVerifiedFromRequestStartMs] = await Promise.all([
    pollAlertVisible({
      apiBaseUrl: params.apiBaseUrl,
      clinicianToken: params.clinicianToken,
      alertId: response.data.alertId,
      requestStartedAt,
    }),
    pollNotificationJob({
      alertId: response.data.alertId,
      requestStartedAt,
    }),
  ]);

  return {
    roundTripMs: response.latencyMs,
    backendCommitUpperBoundMs: response.latencyMs,
    alertVisibleFromRequestStartMs: alertVisibility.alertVisibleFromRequestStartMs,
    clinicianAlertRetrievalMs: alertVisibility.clinicianAlertRetrievalMs,
    jobVerifiedFromRequestStartMs,
    alertId: response.data.alertId,
  };
}

async function runMeasuredSamples<T>(
  label: string,
  total: number,
  sample: (index: number) => Promise<T>
): Promise<{ results: T[]; failures: number }> {
  const results: T[] = [];
  let failures = 0;

  for (let index = 1; index <= total; index += 1) {
    try {
      results.push(await sample(index));
      process.stdout.write(".");
    } catch (error) {
      failures += 1;
      process.stdout.write("x");
      console.error(
        `\n${label} sample ${index} failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  process.stdout.write("\n");
  return { results, failures };
}

function printTable(rows: Array<[string, MetricSummary | null]>): void {
  console.log("\nMetric                                      min      max     mean   median      p95");
  console.log("--------------------------------------------------------------------------------");
  for (const [name, summary] of rows) {
    if (!summary) {
      console.log(`${name.padEnd(42)} no successful samples`);
      continue;
    }
    console.log(
      `${name.padEnd(42)} ${summary.min.toFixed(2).padStart(8)} ${summary.max
        .toFixed(2)
        .padStart(8)} ${summary.mean.toFixed(2).padStart(8)} ${summary.median
        .toFixed(2)
        .padStart(8)} ${summary.p95.toFixed(2).padStart(8)}`
    );
  }
}

function optionalSummary(values: number[]): MetricSummary | null {
  return values.length > 0 ? summarize(values) : null;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  assertLocalUrl("--apiBaseUrl", options.apiBaseUrl, options.allowNonLocal);
  assertLocalUrl("--aiBaseUrl", options.aiBaseUrl, options.allowNonLocal);

  const timestamp = new Date().toISOString();
  const runId = randomUUID();

  console.log("Aura local latency benchmark");
  console.log(`Timestamp: ${timestamp}`);
  console.log(`Run ID: ${runId}`);
  console.log(`Samples: ${options.samples} measured, ${options.warmups} warmups per flow`);
  console.log(`Backend: ${options.apiBaseUrl}`);
  console.log(`AI: ${options.aiBaseUrl}`);
  console.log("\nExpected local services:\n" + LOCAL_SERVICE_HINT + "\n");
  console.log("Dashboard is not required. n8n is not required for the v1 benchmark claim.\n");
  console.log("Note: existing backend n8n webhook behavior may affect high-risk response time.\n");

  try {
    console.log("Preflight: backend health");
    assertOkHealth("Backend", await getJson(options.apiBaseUrl, "/health"));
  } catch (error) {
    throw new Error(
      `Backend health unavailable at ${options.apiBaseUrl}/health. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  try {
    console.log("Preflight: AI health");
    assertOkHealth("AI", await getJson(options.aiBaseUrl, "/health"));
  } catch (error) {
    throw new Error(
      `AI health unavailable at ${options.aiBaseUrl}/health. This benchmark refuses to continue so fallback behavior is not reported as AI-backed latency. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const patientToken = await loginPatient(options.apiBaseUrl);
  const clinicianToken = await loginClinician(options.apiBaseUrl);
  const createdAlertIds: string[] = [];

  await connectMongo();
  try {
    if (options.warmups > 0) {
      console.log("Running warmups...");
      for (let index = 1; index <= options.warmups; index += 1) {
        await runLowRiskSample({
          apiBaseUrl: options.apiBaseUrl,
          patientToken,
          runId,
          index: -index,
        });
        const warmupHighRisk = await runHighRiskSample({
          apiBaseUrl: options.apiBaseUrl,
          patientToken,
          clinicianToken,
          runId,
          index: -index,
        });
        createdAlertIds.push(warmupHighRisk.alertId);
      }
    }

    console.log("Running measured low-risk chat samples:");
    const lowRisk = await runMeasuredSamples("Low-risk chat", options.samples, (index) =>
      runLowRiskSample({
        apiBaseUrl: options.apiBaseUrl,
        patientToken,
        runId,
        index,
      })
    );

    console.log("Running measured high-risk chat escalation samples:");
    const highRisk = await runMeasuredSamples("High-risk chat", options.samples, (index) =>
      runHighRiskSample({
        apiBaseUrl: options.apiBaseUrl,
        patientToken,
        clinicianToken,
        runId,
        index,
      })
    );

    createdAlertIds.push(...highRisk.results.map((sample) => sample.alertId));
    const metricSummaries = {
      lowRiskChat: {
        roundTripMs: optionalSummary(lowRisk.results),
      },
      highRiskChat: {
        roundTripMs: optionalSummary(highRisk.results.map((sample) => sample.roundTripMs)),
      },
      highRisk: {
        backendCommitUpperBoundMs: optionalSummary(
          highRisk.results.map((sample) => sample.backendCommitUpperBoundMs)
        ),
      },
      alertVisibleFromRequestStartMs: optionalSummary(
        highRisk.results.map((sample) => sample.alertVisibleFromRequestStartMs)
      ),
      clinicianAlertRetrievalMs: optionalSummary(
        highRisk.results.map((sample) => sample.clinicianAlertRetrievalMs)
      ),
      jobVerifiedFromRequestStartMs: optionalSummary(
        highRisk.results.map((sample) => sample.jobVerifiedFromRequestStartMs)
      ),
    };

    printTable([
      ["lowRiskChat.roundTripMs", metricSummaries.lowRiskChat.roundTripMs],
      ["highRiskChat.roundTripMs", metricSummaries.highRiskChat.roundTripMs],
      [
        "highRisk.backendCommitUpperBoundMs",
        metricSummaries.highRisk.backendCommitUpperBoundMs,
      ],
      [
        "alertVisibleFromRequestStartMs",
        metricSummaries.alertVisibleFromRequestStartMs,
      ],
      ["clinicianAlertRetrievalMs", metricSummaries.clinicianAlertRetrievalMs],
      [
        "jobVerifiedFromRequestStartMs",
        metricSummaries.jobVerifiedFromRequestStartMs,
      ],
    ]);

    const failureCount = lowRisk.failures + highRisk.failures;
    console.log(`\nFailures: ${failureCount}`);
    console.log(`Created alertIds: ${createdAlertIds.length}`);
    console.log(
      "Note: highRisk.backendCommitUpperBoundMs is the high-risk response time; the route creates Alert and AlertNotificationJob before responding."
    );

    if (options.json) {
      console.log("\nJSON:");
      console.log(
        JSON.stringify(
          {
            timestamp,
            runId,
            sampleCount: options.samples,
            warmupCount: options.warmups,
            apiBaseUrl: options.apiBaseUrl,
            aiBaseUrl: options.aiBaseUrl,
            endpoints: ENDPOINTS,
            metrics: metricSummaries,
            failureCount,
            createdAlertIdsCount: createdAlertIds.length,
          },
          null,
          2
        )
      );
    }
  } finally {
    await disconnectMongo();
  }
}

main().catch((error) => {
  console.error("\nBenchmark failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
