import {
  type AssignmentRecord,
  removeAssignment,
  setAssignment,
} from './assignmentStore';
import {
  clearRiskOverride,
  setRiskOverride,
  type RiskOverrideRecord,
} from './overrideStore';
import {
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { fetchJson } from './apiClient';
import {
  type AlertContextResponse,
  type AlertContextResult,
  type AlertItem,
  type AlertStatus,
  type CheckinsRangeResponse,
  type HydrationRangeResponse,
  type NutritionRangeResponse,
  type CheckinEvent,
  type ChatEvent,
  type ExercisePlan,
  type ExercisePlanResponse,
  type RehabPayload,
  type RehabResponse,
  type ExerciseSessionDetail,
  type ExerciseSessionResponse,
  type ExerciseSessionsListResponse,
  type ExerciseSessionListItem,
  type ClinicianPatientPromsResponse,
  type ClinicianPromDetailResponse,
  type PromDueCard,
  type PromHistoryRow,
  type PromInstanceDetail,
  type WeeklyReportPayload,
  type ListAlertsResponse,
  type ListPatientsResponse,
  type PatchAlertResponse,
  type PatientSummary,
  type TimelineEvent,
  type TrendPointRaw,
  type TrendsResponse,
} from '../types/models';
import { asAppError, createAppError, isRetryable } from '../utils/errors';
import { formatRiskLabel, isRiskChanged } from '../utils/risk';
import {
  NOTIFICATION_RETRY_ENABLED,
  resolveNotificationStatus,
  toSafeNotificationError,
} from '../utils/notification';
import { getSeenAt } from './seenStore';

const QUERY_STALE_TIME_MS = 7_000;
const PATIENTS_QUERY_STALE_TIME_MS = 30_000;
const DEFAULT_POLLING_INTERVAL_MS = 12_000;
const TRENDS_ENDPOINT_HINT =
  'Trends endpoint not ready. Add GET /clinician/patients/:id/trends?days=14|30';

interface AlertPollingOptions {
  pollingEnabled?: boolean;
  pollingIntervalMs?: number;
}

interface AlertMutationContext {
  previous: Partial<Record<AlertStatus, AlertItem[] | undefined>>;
}

function retryIfAllowed(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && isRetryable(asAppError(error));
}

export const clinicianQueryKeys = {
  alerts: (status: AlertStatus): QueryKey => ['alerts', status],
  patientTrends: (patientId: string, days: 14 | 30): QueryKey => ['patient-trends', patientId, days],
  alertContext: (alertId: string): QueryKey => ['alert-context', alertId],
  patients: (): QueryKey => ['patients'],
} as const;

const ALERT_STATUSES: AlertStatus[] = ['open', 'acknowledged', 'resolved'];
const trendsEndpointAvailability = new Map<string, boolean>();

function getAlertsCache(
  queryClient: ReturnType<typeof useQueryClient>,
): Partial<Record<AlertStatus, AlertItem[] | undefined>> {
  return {
    open: queryClient.getQueryData<AlertItem[]>(clinicianQueryKeys.alerts('open')),
    acknowledged: queryClient.getQueryData<AlertItem[]>(clinicianQueryKeys.alerts('acknowledged')),
    resolved: queryClient.getQueryData<AlertItem[]>(clinicianQueryKeys.alerts('resolved')),
  };
}

function writeAlertsCache(
  queryClient: ReturnType<typeof useQueryClient>,
  data: Partial<Record<AlertStatus, AlertItem[] | undefined>>,
): void {
  ALERT_STATUSES.forEach((status) => {
    const value = data[status];
    if (value) {
      queryClient.setQueryData(clinicianQueryKeys.alerts(status), value);
      return;
    }

    if (value === undefined) {
      return;
    }

    queryClient.setQueryData(clinicianQueryKeys.alerts(status), value);
  });
}

function applyOptimisticStatus(
  cache: Partial<Record<AlertStatus, AlertItem[] | undefined>>,
  id: string,
  status: 'acknowledged' | 'resolved',
): Partial<Record<AlertStatus, AlertItem[] | undefined>> {
  let sourceAlert: AlertItem | undefined;

  ALERT_STATUSES.forEach((key) => {
    const alerts = cache[key] ?? [];
    const matched = alerts.find((item) => item._id === id);
    if (matched) {
      sourceAlert = matched;
    }
  });

  if (!sourceAlert) {
    return cache;
  }

  const now = new Date().toISOString();
  const updatedAlert: AlertItem = {
    ...sourceAlert,
    status,
    updatedAt: now,
    acknowledgedAt: status === 'acknowledged' ? sourceAlert.acknowledgedAt ?? now : sourceAlert.acknowledgedAt,
    resolvedAt: status === 'resolved' ? sourceAlert.resolvedAt ?? now : sourceAlert.resolvedAt,
  };

  const next: Partial<Record<AlertStatus, AlertItem[]>> = {
    open: (cache.open ?? []).filter((item) => item._id !== id),
    acknowledged: (cache.acknowledged ?? []).filter((item) => item._id !== id),
    resolved: (cache.resolved ?? []).filter((item) => item._id !== id),
  };

  if (status === 'acknowledged') {
    next.acknowledged = [updatedAlert, ...(next.acknowledged ?? [])];
  } else {
    next.resolved = [updatedAlert, ...(next.resolved ?? [])];
  }

  return next;
}

function sortTimeline(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function deriveNotificationEvents(alert: AlertItem): TimelineEvent[] {
  const status = resolveNotificationStatus(alert.notificationStatus);
  const attemptedAt = alert.notificationAttemptedAt;
  const sentAt = alert.notificationSentAt;
  const failedAt = alert.notificationFailedAt;
  const fallbackAt = alert.updatedAt || alert.createdAt;
  const safeError = toSafeNotificationError(alert.notificationError, 120);

  const events: TimelineEvent[] = [];

  if (attemptedAt) {
    events.push({
      type: 'NOTIFICATION_ATTEMPTED',
      at: attemptedAt,
      label: 'Notification attempted',
      status: 'ok',
    });
  }

  if (failedAt) {
    events.push({
      type: 'NOTIFICATION_FAILED',
      at: failedAt,
      label: 'Notification failed',
      detail: safeError ? `Error: ${safeError}` : 'Delivery failed. Retry may be needed.',
      status: 'fail',
    });
  }

  if (sentAt) {
    events.push({
      type: 'NOTIFICATION_SENT',
      at: sentAt,
      label: 'Notification sent',
      status: 'ok',
    });
  }

  if (!failedAt && status === 'failed') {
    events.push({
      type: 'NOTIFICATION_FAILED',
      at: attemptedAt ?? fallbackAt,
      label: 'Notification failed',
      detail: safeError ? `Error: ${safeError}` : 'Delivery failed. Retry may be needed.',
      status: 'fail',
    });
  }

  if (!sentAt && status === 'sent') {
    events.push({
      type: 'NOTIFICATION_SENT',
      at: attemptedAt ?? fallbackAt,
      label: 'Notification sent',
      status: 'ok',
    });
  }

  if (!sentAt && !failedAt && status === 'skipped') {
    events.push({
      type: 'NOTIFICATION_SKIPPED',
      at: attemptedAt ?? fallbackAt,
      label: 'Notification skipped',
      status: 'warn',
    });
  }

  return events;
}

export function deriveAlertTimeline(alert: AlertItem): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      type: 'ALERT_CREATED',
      at: alert.createdAt,
      label: 'Alert created',
      status: 'ok',
    },
  ];

  events.push(...deriveNotificationEvents(alert));

  const seenAt = alert.seenAt ?? getSeenAt(alert._id);
  if (seenAt) {
    events.push({
      type: 'SEEN',
      at: seenAt,
      label: 'Viewed by clinician',
      status: 'ok',
    });
  }

  if (alert.acknowledgedAt) {
    events.push({
      type: 'ACKNOWLEDGED',
      at: alert.acknowledgedAt,
      label: 'Acknowledged',
      status: 'ok',
    });
  }

  if (alert.resolvedAt) {
    events.push({
      type: 'RESOLVED',
      at: alert.resolvedAt,
      label: 'Resolved',
      status: 'ok',
    });
  }

  if (isRiskChanged(alert.riskAuto ?? alert.risk, alert.riskFinal)) {
    const overrideAt = alert.overriddenAt ?? alert.updatedAt;
    const clinicianLabel = alert.overriddenByName ?? alert.overriddenBy;
    const reasonText = alert.overrideReason?.trim();
    const detailParts = [
      `Auto: ${formatRiskLabel(alert.riskAuto ?? alert.risk)} -> Final: ${formatRiskLabel(alert.riskFinal)}`,
      clinicianLabel ? `By: ${clinicianLabel}` : null,
      reasonText ? `Reason: ${reasonText}` : null,
    ].filter(Boolean);

    events.push({
      type: 'OVERRIDE_RISK',
      at: overrideAt,
      label: 'Risk overridden',
      detail: detailParts.join(' | '),
      status: 'warn',
    });
  }

  if (alert.assignedTo) {
    events.push({
      type: 'ASSIGNED',
      at: alert.assignedAt ?? alert.updatedAt,
      label: 'Assigned',
      detail: `Assigned to ${alert.assignedToName ?? alert.assignedTo}`,
      status: 'ok',
    });
  }

  return sortTimeline(events);
}

function isContextEndpointUnavailable(error: unknown): boolean {
  const appError = asAppError(error);
  return appError.kind === 'HTTP' && [404, 405, 501].includes(appError.status ?? 0);
}

function trendsEndpointKey(patientId: string, days: 14 | 30): string {
  return `${patientId}:${days}`;
}

async function findAlertById(alertId: string): Promise<AlertItem> {
  const statuses: AlertStatus[] = ['open', 'acknowledged', 'resolved'];

  for (const status of statuses) {
    const list = await listAlerts(status);
    const matched = list.find((item) => item._id === alertId);
    if (matched) {
      return matched;
    }
  }

  throw createAppError('HTTP', 'Requested resource was not found.', { status: 404 });
}

export async function listAlerts(status: AlertStatus): Promise<AlertItem[]> {
  const response = await fetchJson<ListAlertsResponse>('/clinician/alerts', {
    method: 'GET',
    query: { status },
  });

  return response.alerts;
}

export async function updateAlertStatus(
  id: string,
  status: 'acknowledged' | 'resolved',
): Promise<AlertItem> {
  const response = await fetchJson<PatchAlertResponse>(`/clinician/alerts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: { status },
  });

  return response.alert;
}

export async function markAlertSeen(_id: string): Promise<void> {
  // TODO(server): replace local seen-store semantics with PATCH /clinician/alerts/:id/seen
  // when backend alert documents provide seenAt/seenBy fields for clinician-scoped tracking.
}

export async function assignAlert(
  alertId: string,
  assignedTo: string,
  assignedToName?: string,
  force: boolean = false,
): Promise<AssignmentRecord> {
  // TODO(server): replace local adapter with:
  // PATCH /clinician/alerts/:id/assignment
  // body: { assignedTo: string, assignedToName?: string, force?: boolean }
  // If assigned to another clinician and force=false, backend should return 409 conflict.
  void force;

  const assignment: AssignmentRecord = {
    assignedTo,
    assignedToName,
    assignedAtISO: new Date().toISOString(),
  };

  setAssignment(alertId, assignment);
  return assignment;
}

export async function unassignAlert(alertId: string): Promise<void> {
  // TODO(server): replace local adapter with:
  // PATCH /clinician/alerts/:id/assignment
  // body: { assignedTo: null }
  removeAssignment(alertId);
}

export async function takeoverAlert(
  alertId: string,
  assignedTo: string,
  assignedToName?: string,
  reason?: string,
): Promise<AssignmentRecord> {
  // TODO(server): replace local adapter with:
  // POST /clinician/alerts/:id/takeover
  // body: { assignedTo: string, assignedToName?: string, reason?: string }
  void reason;

  return assignAlert(alertId, assignedTo, assignedToName, true);
}

export interface OverrideAlertRiskPayload {
  riskAuto: string;
  riskFinal: string;
  overrideReason?: string;
  overriddenBy: string;
  overriddenByName?: string;
}

export async function overrideAlertRisk(
  alertId: string,
  payload: OverrideAlertRiskPayload,
): Promise<RiskOverrideRecord | null> {
  // TODO(server): replace local adapter with:
  // PATCH /clinician/alerts/:id/risk-override
  // body: {
  //   riskFinal: "low"|"medium"|"high",
  //   overrideReason: string (required if changed),
  //   overriddenBy: string,
  //   overriddenByName?: string
  // }
  // Backend should write an OVERRIDE_RISK care_event for audit history.
  const changed = isRiskChanged(payload.riskAuto, payload.riskFinal);
  const reason = payload.overrideReason?.trim() ?? '';

  if (changed && !reason) {
    throw createAppError('Unknown', 'Override reason is required when final risk differs from auto risk.');
  }

  if (!changed && !reason) {
    clearRiskOverride(alertId);
    return null;
  }

  const record: RiskOverrideRecord = {
    riskAuto: payload.riskAuto,
    riskFinal: payload.riskFinal,
    overrideReason: reason || 'Confirmed auto risk.',
    overriddenAtISO: new Date().toISOString(),
    overriddenBy: payload.overriddenBy,
    overriddenByName: payload.overriddenByName,
  };

  setRiskOverride(alertId, record);
  return record;
}

export async function clearAlertRiskOverride(alertId: string): Promise<void> {
  // TODO(server): replace local adapter with:
  // DELETE /clinician/alerts/:id/risk-override
  clearRiskOverride(alertId);
}

export interface RetryNotificationPayload {
  channel?: 'telegram' | 'email' | 'slack' | 'sms';
  requestedBy: string;
  requestedByName?: string;
}

export interface RetryNotificationResult {
  status: 'queued' | 'sent' | 'failed';
  alert?: AlertItem;
}

export async function retryNotification(
  alertId: string,
  payload: RetryNotificationPayload,
): Promise<RetryNotificationResult> {
  // TODO(server): add retry endpoint:
  // POST /clinician/alerts/:id/retry-notification
  // body: { channel?: "telegram", requestedBy: string, requestedByName?: string }
  // returns: { ok: true, status: "queued"|"sent"|"failed", alert?: AlertItem }
  if (!NOTIFICATION_RETRY_ENABLED) {
    throw createAppError('HTTP', 'Backend endpoint not implemented for notification retry.', {
      status: 404,
      hint: 'Add POST /clinician/alerts/:id/retry-notification',
    });
  }

  const response = await fetchJson<{ ok: true; status: 'queued' | 'sent' | 'failed'; alert?: AlertItem }>(
    `/clinician/alerts/${encodeURIComponent(alertId)}/retry-notification`,
    {
      method: 'POST',
      json: payload,
    },
  );

  return {
    status: response.status,
    alert: response.alert,
  };
}

export async function getPatientTrends(patientId: string, days: 14 | 30): Promise<TrendPointRaw[]> {
  const key = trendsEndpointKey(patientId, days);

  try {
    const response = await fetchJson<TrendsResponse>(
      `/clinician/patients/${encodeURIComponent(patientId)}/trends`,
      {
        method: 'GET',
        query: { days },
      },
    );

    trendsEndpointAvailability.set(key, false);
    return response.trends;
  } catch (error) {
    const appError = asAppError(error);
    if (appError.kind === 'HTTP' && appError.status === 404) {
      trendsEndpointAvailability.set(key, true);
      return [];
    }

    trendsEndpointAvailability.set(key, false);
    throw error;
  }
}

export async function tryGetPatientCheckinsRange(
  patientId: string,
  from: string,
  to: string,
): Promise<TrendPointRaw[] | null> {
  // TODO(server): add custom date-range check-ins endpoint:
  // GET /clinician/patients/:patientId/checkins?from=YYYY-MM-DD&to=YYYY-MM-DD
  // returning { ok: true, checkins: TrendPointRaw[] }
  try {
    const response = await fetchJson<CheckinsRangeResponse>(
      `/clinician/patients/${encodeURIComponent(patientId)}/checkins`,
      {
        method: 'GET',
        query: { from, to },
      },
    );

    return response.checkins;
  } catch (error) {
    const appError = asAppError(error);
    if (appError.kind === 'HTTP' && appError.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function getPatientHydrationRange(
  patientId: string,
  from: string,
  to: string,
): Promise<HydrationRangeResponse> {
  const query = new URLSearchParams({
    from,
    to,
  });
  return fetchJson<HydrationRangeResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/hydration/range?${query.toString()}`,
    {
      method: 'GET',
    },
  );
}

export async function getPatientNutritionRange(
  patientId: string,
  from: string,
  to: string,
): Promise<NutritionRangeResponse> {
  const query = new URLSearchParams({
    from,
    to,
  });
  return fetchJson<NutritionRangeResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/nutrition/range?${query.toString()}`,
    {
      method: 'GET',
    },
  );
}

export async function listPatients(): Promise<PatientSummary[]> {
  const response = await fetchJson<ListPatientsResponse>('/clinician/patients', {
    method: 'GET',
  });

  return response.patients;
}

export async function getExercisePlan(patientId: string): Promise<ExercisePlan | null> {
  const response = await fetchJson<ExercisePlanResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/exercise-plan`,
    {
      method: 'GET',
    },
  );

  return response.plan ?? null;
}

export interface PutExercisePlanPayload {
  title: string;
  daysOfWeek: number[];
  items: Array<{
    key: string;
    name: string;
    instructions: string;
    sets?: number;
    reps?: number;
    holdSeconds?: number;
    restSeconds?: number;
    intensity?: 'easy' | 'moderate' | 'hard';
    videoUrl?: string;
    contraindications?: string[];
    order: number;
  }>;
}

export async function putExercisePlan(
  patientId: string,
  payload: PutExercisePlanPayload,
): Promise<ExercisePlan> {
  const response = await fetchJson<ExercisePlanResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/exercise-plan`,
    {
      method: 'PUT',
      json: payload,
    },
  );

  if (!response.plan) {
    throw createAppError('Unknown', 'Exercise plan response was empty.');
  }

  return response.plan;
}

export async function getRehabPhases(patientId: string): Promise<RehabPayload> {
  const response = await fetchJson<Partial<RehabResponse>>(
    `/clinician/patients/${encodeURIComponent(patientId)}/rehab-phases`,
    {
      method: 'GET',
    },
  );

  return response?.rehab
    ? response.rehab
    : {
      currentKey: null,
      phases: [],
      updatedAt: new Date(0).toISOString(),
    };
}

export async function setCurrentRehabPhase(
  patientId: string,
  currentKey: string,
): Promise<RehabPayload> {
  const response = await fetchJson<RehabResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/rehab-phase`,
    {
      method: 'PATCH',
      json: { currentKey },
    },
  );

  return response.rehab;
}

export async function getPatientExerciseSessions(
  patientId: string,
  limit = 50,
): Promise<ExerciseSessionListItem[]> {
  const response = await fetchJson<ExerciseSessionsListResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/exercise-sessions?limit=${encodeURIComponent(
      String(limit),
    )}`,
    { method: 'GET' },
  );

  return response.sessions ?? [];
}

export async function getExerciseSessionById(
  sessionId: string,
): Promise<ExerciseSessionDetail> {
  const response = await fetchJson<ExerciseSessionResponse>(
    `/clinician/exercise-sessions/${encodeURIComponent(sessionId)}`,
    { method: 'GET' },
  );

  return response.session;
}

export async function getPatientProms(
  patientId: string,
  limit = 50,
): Promise<{ due: PromDueCard[]; completed: PromHistoryRow[] }> {
  const response = await fetchJson<ClinicianPatientPromsResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/proms?limit=${encodeURIComponent(
      String(limit),
    )}`,
    { method: 'GET' },
  );

  return {
    due: response.due ?? [],
    completed: response.completed ?? [],
  };
}

export async function assignPromToPatient(
  patientId: string,
  templateKey: string,
  dueAt?: string,
): Promise<PromDueCard> {
  const response = await fetchJson<{
    ok: true;
    patientId: string;
    due: PromDueCard;
  }>(`/clinician/patients/${encodeURIComponent(patientId)}/proms/assign`, {
    method: 'POST',
    json: {
      templateKey,
      ...(dueAt ? { dueAt } : {}),
    },
  });

  return response.due;
}

export async function getPromInstanceById(promId: string): Promise<PromInstanceDetail> {
  const response = await fetchJson<ClinicianPromDetailResponse>(
    `/clinician/proms/${encodeURIComponent(promId)}`,
    { method: 'GET' },
  );

  return response.prom;
}

export async function getWeeklyReport(
  patientId: string,
  options: { weekStart?: string; tzOffsetMinutes?: number } = {},
): Promise<WeeklyReportPayload> {
  const query = new URLSearchParams();
  if (options.weekStart) {
    query.set('weekStart', options.weekStart);
  }
  if (typeof options.tzOffsetMinutes === 'number' && Number.isFinite(options.tzOffsetMinutes)) {
    query.set('tzOffsetMinutes', String(Math.trunc(options.tzOffsetMinutes)));
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return fetchJson<WeeklyReportPayload>(
    `/clinician/patients/${encodeURIComponent(patientId)}/reports/weekly${suffix}`,
    { method: 'GET' },
  );
}

export async function getAlertContext(alertId: string): Promise<AlertContextResult> {
  try {
    const response = await fetchJson<AlertContextResponse>(
      `/clinician/alerts/${encodeURIComponent(alertId)}/context`,
      { method: 'GET' },
    );

    return {
      alert: response.alert,
      triggeringEvent: response.triggeringEvent as CheckinEvent | ChatEvent | undefined,
      timeline: response.timeline?.length ? response.timeline : deriveAlertTimeline(response.alert),
    };
  } catch (error) {
    if (!isContextEndpointUnavailable(error)) {
      throw error;
    }

    // TODO(server): replace fallback once GET /clinician/alerts/:id/context is available.
    const alert = await findAlertById(alertId);
    return {
      alert,
      triggeringEvent: undefined,
      timeline: deriveAlertTimeline(alert),
    };
  }
}

export function useAlerts(
  status: AlertStatus,
  options: AlertPollingOptions = {},
): UseQueryResult<AlertItem[], unknown> {
  const { pollingEnabled = false, pollingIntervalMs = DEFAULT_POLLING_INTERVAL_MS } = options;

  return useQuery({
    queryKey: clinicianQueryKeys.alerts(status),
    queryFn: () => listAlerts(status),
    staleTime: QUERY_STALE_TIME_MS,
    retry: retryIfAllowed,
    refetchOnWindowFocus: false,
    refetchInterval: pollingEnabled ? pollingIntervalMs : false,
    refetchIntervalInBackground: false,
    placeholderData: (previous) => previous,
  });
}

export function useUpdateAlertStatus(): UseMutationResult<
  AlertItem,
  unknown,
  { id: string; status: 'acknowledged' | 'resolved' },
  AlertMutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }) => updateAlertStatus(id, status),
    retry: retryIfAllowed,
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['alerts'] });

      const previous = getAlertsCache(queryClient);
      const optimistic = applyOptimisticStatus(previous, id, status);
      writeAlertsCache(queryClient, optimistic);

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        writeAlertsCache(queryClient, context.previous);
      }
    },
    onSuccess: (updatedAlert) => {
      const current = getAlertsCache(queryClient);
      const next: Partial<Record<AlertStatus, AlertItem[]>> = {
        open: (current.open ?? []).filter((item) => item._id !== updatedAlert._id),
        acknowledged: (current.acknowledged ?? []).filter((item) => item._id !== updatedAlert._id),
        resolved: (current.resolved ?? []).filter((item) => item._id !== updatedAlert._id),
      };

      if (updatedAlert.status === 'acknowledged') {
        next.acknowledged = [updatedAlert, ...(next.acknowledged ?? [])];
      } else if (updatedAlert.status === 'resolved') {
        next.resolved = [updatedAlert, ...(next.resolved ?? [])];
      }

      writeAlertsCache(queryClient, next);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
      await queryClient.invalidateQueries({ queryKey: ['alert-context'] });
    },
  });
}

export function usePatientTrends(
  patientId: string | undefined,
  days: 14 | 30,
): UseQueryResult<TrendPointRaw[], unknown> {
  return useQuery({
    queryKey: clinicianQueryKeys.patientTrends(patientId ?? 'unknown', days),
    queryFn: () => getPatientTrends(patientId ?? '', days),
    enabled: Boolean(patientId),
    staleTime: QUERY_STALE_TIME_MS,
    retry: retryIfAllowed,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
}

export function isPatientTrendsEndpointMissing(
  patientId: string | undefined,
  days: 14 | 30,
): boolean {
  if (!patientId) {
    return false;
  }

  return trendsEndpointAvailability.get(trendsEndpointKey(patientId, days)) ?? false;
}

export function getPatientTrendsEndpointHint(): string {
  return TRENDS_ENDPOINT_HINT;
}

export function useAlertContext(
  alertId: string | undefined,
  enabled: boolean,
): UseQueryResult<AlertContextResult, unknown> {
  return useQuery({
    queryKey: clinicianQueryKeys.alertContext(alertId ?? 'unknown'),
    queryFn: () => getAlertContext(alertId ?? ''),
    enabled: enabled && Boolean(alertId),
    staleTime: QUERY_STALE_TIME_MS,
    retry: retryIfAllowed,
    refetchOnWindowFocus: false,
  });
}

export function usePatients(): UseQueryResult<PatientSummary[], unknown> {
  return useQuery({
    queryKey: clinicianQueryKeys.patients(),
    queryFn: () => listPatients(),
    staleTime: PATIENTS_QUERY_STALE_TIME_MS,
    retry: retryIfAllowed,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
}
