import { getApiBaseUrl } from './apiClient';
import type { SmokeCheckKey, SmokeCheckResult, SmokeFailureKind, SmokeStatus } from '../types/smoke';

const REQUEST_TIMEOUT_MS = 4_000;

interface SafeFetchSuccess {
  ok: true;
  status: number;
  latencyMs: number;
  json: unknown;
}

interface SafeFetchFailure {
  ok: false;
  status?: number;
  latencyMs: number;
  kind: SmokeFailureKind;
  message: string;
}

type SafeFetchResult = SafeFetchSuccess | SafeFetchFailure;

interface AlertsPayload {
  alerts: Array<{ _id?: string | null }>;
}

interface PatientsPayload {
  patients: Array<{ id?: string | null; patientId?: string | null }>;
}

function ensureBaseUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : getApiBaseUrl();
}

function buildUrl(apiBaseUrl: string, endpointPath: string): URL {
  return new URL(endpointPath, apiBaseUrl);
}

function nowMs(): number {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }

  return Date.now();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toSafeErrorMessage(kind: SmokeFailureKind, status?: number): string {
  if (kind === 'Timeout') {
    return 'Timed out while waiting for response.';
  }

  if (kind === 'Network') {
    return 'CORS blocked — ensure backend sets Access-Control-Allow-Origin.';
  }

  if (kind === 'Parse') {
    return 'Invalid JSON response.';
  }

  if (kind === 'HTTP') {
    if (status === 404) {
      return 'Not found (endpoint missing).';
    }

    if (status && status >= 500) {
      return 'Server error.';
    }

    return 'HTTP error response.';
  }

  return 'Unexpected request failure.';
}

async function safeFetchJson(apiBaseUrl: string, endpointPath: string): Promise<SafeFetchResult> {
  const url = buildUrl(apiBaseUrl, endpointPath);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = nowMs();

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    const latencyMs = Math.round(nowMs() - startedAt);

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      return {
        ok: false,
        status: response.status,
        latencyMs,
        kind: 'Parse',
        message: toSafeErrorMessage('Parse', response.status),
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        latencyMs,
        kind: 'HTTP',
        message: toSafeErrorMessage('HTTP', response.status),
      };
    }

    return {
      ok: true,
      status: response.status,
      latencyMs,
      json,
    };
  } catch (error) {
    const latencyMs = Math.round(nowMs() - startedAt);
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        ok: false,
        latencyMs,
        kind: 'Timeout',
        message: toSafeErrorMessage('Timeout'),
      };
    }

    return {
      ok: false,
      latencyMs,
      kind: 'Network',
      message: toSafeErrorMessage('Network'),
    };
  } finally {
    window.clearTimeout(timer);
  }
}

function toCurlCommand(apiBaseUrl: string, endpointPath: string): string {
  const url = buildUrl(apiBaseUrl, endpointPath);
  return `curl -sS "${url.toString()}"`;
}

function createResult(
  key: SmokeCheckKey,
  name: string,
  endpoint: string,
  status: SmokeStatus,
  message: string,
  latencyMs: number | null,
  httpCode: number | undefined,
  apiBaseUrl: string,
  developerHint?: string,
): SmokeCheckResult {
  return {
    key,
    name,
    endpoint,
    status,
    httpCode,
    latencyMs,
    message,
    developerHint,
    curlCommand: toCurlCommand(apiBaseUrl, endpoint),
  };
}

function parseAlertsPayload(json: unknown): AlertsPayload | null {
  if (!isRecord(json)) {
    return null;
  }

  if (Array.isArray(json.alerts)) {
    return { alerts: json.alerts as Array<{ _id?: string | null }> };
  }

  if (json.ok === true && isRecord(json) && Array.isArray(json.alerts)) {
    return { alerts: json.alerts as Array<{ _id?: string | null }> };
  }

  return null;
}

function parsePatientsPayload(json: unknown): PatientsPayload | null {
  if (!isRecord(json)) {
    return null;
  }

  if (Array.isArray(json.patients)) {
    return {
      patients: json.patients as Array<{ id?: string | null; patientId?: string | null }>,
    };
  }

  if (json.ok === true && Array.isArray(json.patients)) {
    return {
      patients: json.patients as Array<{ id?: string | null; patientId?: string | null }>,
    };
  }

  return null;
}

function isHealthPayloadValid(json: unknown): boolean {
  if (!isRecord(json)) {
    return false;
  }

  if (json.ok === true) {
    return true;
  }

  return json.status === 'ok';
}

function isContextPayloadValid(json: unknown): boolean {
  if (!isRecord(json)) {
    return false;
  }

  return json.ok === true && Object.hasOwn(json, 'alert') && Object.hasOwn(json, 'timeline');
}

function isTrendsPayloadValid(json: unknown): boolean {
  if (!isRecord(json)) {
    return false;
  }

  return json.ok === true && Array.isArray(json.trends);
}

function toNotReadyResult(
  key: SmokeCheckKey,
  name: string,
  endpoint: string,
  latencyMs: number,
  apiBaseUrl: string,
  developerHintEndpoint?: string,
): SmokeCheckResult {
  const hintEndpoint = developerHintEndpoint ?? endpoint;
  return createResult(
    key,
    name,
    endpoint,
    'NOT_READY',
    `ENDPOINT NOT READY: ${endpoint}`,
    latencyMs,
    404,
    apiBaseUrl,
    `Implement GET ${hintEndpoint}`,
  );
}

function toFailedResult(
  key: SmokeCheckKey,
  name: string,
  endpoint: string,
  fetchResult: SafeFetchFailure,
  apiBaseUrl: string,
): SmokeCheckResult {
  return createResult(
    key,
    name,
    endpoint,
    'FAIL',
    fetchResult.message,
    fetchResult.latencyMs,
    fetchResult.status,
    apiBaseUrl,
  );
}

export async function runSmokeChecks(apiBaseUrlInput: string): Promise<SmokeCheckResult[]> {
  const apiBaseUrl = ensureBaseUrl(apiBaseUrlInput);
  const results: SmokeCheckResult[] = [];

  const healthEndpoint = '/health';
  const healthResponse = await safeFetchJson(apiBaseUrl, healthEndpoint);
  if (!healthResponse.ok) {
    if (healthResponse.status === 404) {
      results.push(toNotReadyResult('health', 'Health', healthEndpoint, healthResponse.latencyMs, apiBaseUrl));
    } else {
      results.push(toFailedResult('health', 'Health', healthEndpoint, healthResponse, apiBaseUrl));
    }
  } else if (!isHealthPayloadValid(healthResponse.json)) {
    results.push(
      createResult(
        'health',
        'Health',
        healthEndpoint,
        'FAIL',
        'Unexpected payload shape.',
        healthResponse.latencyMs,
        healthResponse.status,
        apiBaseUrl,
      ),
    );
  } else {
    results.push(
      createResult(
        'health',
        'Health',
        healthEndpoint,
        'PASS',
        'Service health returned OK.',
        healthResponse.latencyMs,
        healthResponse.status,
        apiBaseUrl,
      ),
    );
  }

  const alertsEndpoint = '/clinician/alerts?status=open';
  const alertsResponse = await safeFetchJson(apiBaseUrl, alertsEndpoint);
  let firstAlertId: string | null = null;
  if (!alertsResponse.ok) {
    if (alertsResponse.status === 404) {
      results.push(toNotReadyResult('alerts', 'Open alerts', '/clinician/alerts', alertsResponse.latencyMs, apiBaseUrl));
    } else {
      results.push(toFailedResult('alerts', 'Open alerts', '/clinician/alerts', alertsResponse, apiBaseUrl));
    }
  } else {
    const payload = parseAlertsPayload(alertsResponse.json);
    if (!payload) {
      results.push(
        createResult(
          'alerts',
          'Open alerts',
          '/clinician/alerts',
          'FAIL',
          'Unexpected payload shape.',
          alertsResponse.latencyMs,
          alertsResponse.status,
          apiBaseUrl,
        ),
      );
    } else if (payload.alerts.length === 0) {
      results.push(
        createResult(
          'alerts',
          'Open alerts',
          '/clinician/alerts',
          'EMPTY',
          'OK but empty: no open alerts.',
          alertsResponse.latencyMs,
          alertsResponse.status,
          apiBaseUrl,
        ),
      );
    } else {
      const first = payload.alerts[0];
      firstAlertId = typeof first?._id === 'string' && first._id.length > 0 ? first._id : null;
      results.push(
        createResult(
          'alerts',
          'Open alerts',
          '/clinician/alerts',
          'PASS',
          `${payload.alerts.length} open alert(s).`,
          alertsResponse.latencyMs,
          alertsResponse.status,
          apiBaseUrl,
        ),
      );
    }
  }

  if (!firstAlertId) {
    results.push(
      createResult(
        'context',
        'Alert context',
        '/clinician/alerts/:id/context',
        'EMPTY',
        'Skipped: no alert id available.',
        null,
        undefined,
        apiBaseUrl,
      ),
    );
  } else {
    const contextEndpoint = `/clinician/alerts/${encodeURIComponent(firstAlertId)}/context`;
    const contextResponse = await safeFetchJson(apiBaseUrl, contextEndpoint);
    if (!contextResponse.ok) {
      if (contextResponse.status === 404) {
        results.push(
          toNotReadyResult(
            'context',
            'Alert context',
            contextEndpoint,
            contextResponse.latencyMs,
            apiBaseUrl,
            '/clinician/alerts/:id/context',
          ),
        );
      } else {
        results.push(toFailedResult('context', 'Alert context', contextEndpoint, contextResponse, apiBaseUrl));
      }
    } else if (!isContextPayloadValid(contextResponse.json)) {
      results.push(
        createResult(
          'context',
          'Alert context',
          contextEndpoint,
          'FAIL',
          'Unexpected payload shape.',
          contextResponse.latencyMs,
          contextResponse.status,
          apiBaseUrl,
        ),
      );
    } else {
      results.push(
        createResult(
          'context',
          'Alert context',
          contextEndpoint,
          'PASS',
          `Loaded context for alert id ${firstAlertId}.`,
          contextResponse.latencyMs,
          contextResponse.status,
          apiBaseUrl,
        ),
      );
    }
  }

  const patientsEndpoint = '/clinician/patients';
  const patientsResponse = await safeFetchJson(apiBaseUrl, patientsEndpoint);
  let firstPatientId: string | null = null;
  if (!patientsResponse.ok) {
    if (patientsResponse.status === 404) {
      results.push(toNotReadyResult('patients', 'Patients list', patientsEndpoint, patientsResponse.latencyMs, apiBaseUrl));
    } else {
      results.push(toFailedResult('patients', 'Patients list', patientsEndpoint, patientsResponse, apiBaseUrl));
    }
  } else {
    const payload = parsePatientsPayload(patientsResponse.json);
    if (!payload) {
      results.push(
        createResult(
          'patients',
          'Patients list',
          patientsEndpoint,
          'FAIL',
          'Unexpected payload shape.',
          patientsResponse.latencyMs,
          patientsResponse.status,
          apiBaseUrl,
        ),
      );
    } else if (payload.patients.length === 0) {
      results.push(
        createResult(
          'patients',
          'Patients list',
          patientsEndpoint,
          'EMPTY',
          'OK but empty: no patients.',
          patientsResponse.latencyMs,
          patientsResponse.status,
          apiBaseUrl,
        ),
      );
    } else {
      const first = payload.patients[0];
      const candidateId =
        (typeof first?.id === 'string' && first.id.length > 0 ? first.id : null) ??
        (typeof first?.patientId === 'string' && first.patientId.length > 0 ? first.patientId : null);
      firstPatientId = candidateId;
      results.push(
        createResult(
          'patients',
          'Patients list',
          patientsEndpoint,
          'PASS',
          `${payload.patients.length} patient record(s).`,
          patientsResponse.latencyMs,
          patientsResponse.status,
          apiBaseUrl,
        ),
      );
    }
  }

  if (!firstPatientId) {
    results.push(
      createResult(
        'trends',
        'Patient trends (14d)',
        '/clinician/patients/:patientId/trends?days=14',
        'EMPTY',
        'Skipped: no patient id available.',
        null,
        undefined,
        apiBaseUrl,
      ),
    );
  } else {
    const trendsEndpoint = `/clinician/patients/${encodeURIComponent(firstPatientId)}/trends?days=14`;
    const trendsResponse = await safeFetchJson(apiBaseUrl, trendsEndpoint);
    if (!trendsResponse.ok) {
      if (trendsResponse.status === 404) {
        results.push(
          toNotReadyResult(
            'trends',
            'Patient trends (14d)',
            trendsEndpoint,
            trendsResponse.latencyMs,
            apiBaseUrl,
            '/clinician/patients/:patientId/trends?days=14',
          ),
        );
      } else {
        results.push(toFailedResult('trends', 'Patient trends (14d)', trendsEndpoint, trendsResponse, apiBaseUrl));
      }
    } else if (!isTrendsPayloadValid(trendsResponse.json)) {
      results.push(
        createResult(
          'trends',
          'Patient trends (14d)',
          trendsEndpoint,
          'FAIL',
          'Unexpected payload shape.',
          trendsResponse.latencyMs,
          trendsResponse.status,
          apiBaseUrl,
        ),
      );
    } else {
      const trendsCount = Array.isArray((trendsResponse.json as { trends?: unknown[] }).trends)
        ? ((trendsResponse.json as { trends: unknown[] }).trends.length ?? 0)
        : 0;

      const nextStatus: SmokeStatus = trendsCount === 0 ? 'EMPTY' : 'PASS';
      const nextMessage =
        trendsCount === 0
          ? `OK but empty: no trends for patient id ${firstPatientId}.`
          : `${trendsCount} trend point(s) for patient id ${firstPatientId}.`;

      results.push(
        createResult(
          'trends',
          'Patient trends (14d)',
          trendsEndpoint,
          nextStatus,
          nextMessage,
          trendsResponse.latencyMs,
          trendsResponse.status,
          apiBaseUrl,
        ),
      );
    }
  }

  return results;
}
