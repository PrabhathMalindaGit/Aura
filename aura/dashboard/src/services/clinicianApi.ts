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
import { fetchJson, getApiBaseUrl, getStoredClinicianToken } from './apiClient';
import {
  type AlertContextResponse,
  type AlertContextResult,
  type AlertItem,
  type AlertStatus,
  type DashboardCommunicationOverview,
  type DashboardCommunicationOverviewResponse,
  type DashboardFollowUpTaskItem,
  type DashboardFollowUpTasksResponse,
  type DashboardPriorityQueueItem,
  type DashboardPriorityQueueResponse,
  type DashboardRecentSafetyEventsResponse,
  type DashboardSafetyEvent,
  type DashboardSummary,
  type DashboardSummaryResponse,
  type DashboardTodayAppointmentItem,
  type DashboardTodayAppointmentsResponse,
  type CheckinsRangeResponse,
  type HydrationRangeResponse,
  type NutritionRangeResponse,
  type WearablesSummaryResponse,
  type WearablesDailyResponse,
  type WearableSource,
  type MedicationListResponse,
  type MedicationAdherenceRangeResponse,
  type AppointmentSlot,
  type AppointmentSlotsResponse,
  type AppointmentRequestItem,
  type AppointmentRequestsResponse,
  type PatientPhotosResponse,
  type SymptomPhotoMeta,
  type InsightItem,
  type InsightStatus,
  type InsightsQueueResponse,
  type PatientInsightsResponse,
  type GenerateInsightsResponse,
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
  type WorklistResponse,
  type WorklistSortOption,
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
const DASHBOARD_QUERY_STALE_TIME_MS = 10_000;
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
  dashboardSummary: (): QueryKey => ['dashboard', 'summary'],
  dashboardPriorityQueue: (limit: number): QueryKey => ['dashboard', 'priority-queue', limit],
  dashboardRecentSafetyEvents: (limit: number): QueryKey => ['dashboard', 'recent-safety-events', limit],
  dashboardTodayAppointments: (): QueryKey => ['dashboard', 'today-appointments'],
  dashboardFollowUpTasks: (limit: number, assignedToMe: boolean): QueryKey =>
    ['dashboard', 'follow-up-tasks', limit, assignedToMe],
  dashboardCommunicationOverview: (limit: number): QueryKey =>
    ['dashboard', 'communication-overview', limit],
  worklist: (params: {
    search?: string;
    highRiskOnly?: boolean;
    hasOpenAlerts?: boolean;
    needsResponse?: boolean;
    missedCheckins?: boolean;
    assignedToMe?: boolean;
    status?: string;
    sort?: WorklistSortOption;
  }): QueryKey => ['worklist', params],
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
  await fetchJson<PatchAlertResponse>(`/clinician/alerts/${encodeURIComponent(_id)}/seen`, {
    method: 'PATCH',
    json: {},
  });
}

export async function assignAlert(
  alertId: string,
  assignedTo: string,
  assignedToName?: string,
  force: boolean = false,
): Promise<AssignmentRecord> {
  const response = await fetchJson<PatchAlertResponse>(
    `/clinician/alerts/${encodeURIComponent(alertId)}/assignment`,
    {
      method: 'PATCH',
      json: {
        assignedTo,
        assignedToName,
        force,
      },
    },
  );

  const serverAlert = response.alert;
  const assignment: AssignmentRecord = {
    assignedTo: serverAlert?.assignedTo ?? assignedTo,
    assignedToName: serverAlert?.assignedToName ?? assignedToName,
    assignedAtISO: serverAlert?.assignedAt ?? new Date().toISOString(),
  };

  setAssignment(alertId, assignment);
  return assignment;
}

export async function unassignAlert(alertId: string): Promise<void> {
  await fetchJson<PatchAlertResponse>(`/clinician/alerts/${encodeURIComponent(alertId)}/assignment`, {
    method: 'PATCH',
    json: {
      assignedTo: null,
    },
  });
  removeAssignment(alertId);
}

export async function takeoverAlert(
  alertId: string,
  assignedTo: string,
  assignedToName?: string,
  reason?: string,
): Promise<AssignmentRecord> {
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
  const changed = isRiskChanged(payload.riskAuto, payload.riskFinal);
  const reason = payload.overrideReason?.trim() ?? '';

  if (changed && !reason) {
    throw createAppError('Unknown', 'Override reason is required when final risk differs from auto risk.');
  }

  if (!changed && !reason) {
    clearRiskOverride(alertId);
    return null;
  }

  const response = await fetchJson<PatchAlertResponse>(
    `/clinician/alerts/${encodeURIComponent(alertId)}/risk-override`,
    {
      method: 'PATCH',
      json: {
        riskFinal: payload.riskFinal,
        overrideReason: reason || 'Confirmed auto risk.',
        overriddenBy: payload.overriddenBy,
        overriddenByName: payload.overriddenByName,
      },
    },
  );

  const serverAlert = response.alert;
  const record: RiskOverrideRecord = {
    riskAuto: serverAlert?.riskAuto ?? payload.riskAuto,
    riskFinal: serverAlert?.riskFinal ?? payload.riskFinal,
    overrideReason: serverAlert?.overrideReason ?? (reason || 'Confirmed auto risk.'),
    overriddenAtISO: serverAlert?.overriddenAt ?? new Date().toISOString(),
    overriddenBy: serverAlert?.overriddenBy ?? payload.overriddenBy,
    overriddenByName: serverAlert?.overriddenByName ?? payload.overriddenByName,
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

export async function getPatientWearablesSummary(
  patientId: string,
  from: string,
  to: string,
  source: WearableSource = 'mock',
): Promise<WearablesSummaryResponse> {
  const query = new URLSearchParams({
    from,
    to,
    source,
  });
  return fetchJson<WearablesSummaryResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/wearables/summary?${query.toString()}`,
    {
      method: 'GET',
    },
  );
}

export async function getPatientWearablesDaily(
  patientId: string,
  from: string,
  to: string,
  source: WearableSource = 'mock',
): Promise<WearablesDailyResponse> {
  const query = new URLSearchParams({
    from,
    to,
    source,
  });
  return fetchJson<WearablesDailyResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/wearables/daily?${query.toString()}`,
    {
      method: 'GET',
    },
  );
}

export async function getPatientMedications(
  patientId: string,
): Promise<MedicationListResponse> {
  return fetchJson<MedicationListResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/medications`,
    {
      method: 'GET',
    },
  );
}

export async function getPatientMedicationAdherence(
  patientId: string,
  from: string,
  to: string,
): Promise<MedicationAdherenceRangeResponse> {
  const query = new URLSearchParams({
    from,
    to,
  });
  return fetchJson<MedicationAdherenceRangeResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/medications/adherence?${query.toString()}`,
    {
      method: 'GET',
    },
  );
}

export async function createAppointmentSlot(payload: {
  startsAt: string;
  endsAt: string;
  meetingLink?: string;
}): Promise<AppointmentSlot> {
  const response = await fetchJson<{
    ok: true;
    slot: AppointmentSlot;
  }>('/clinician/appointments/slots', {
    method: 'POST',
    json: payload,
  });

  return response.slot;
}

export async function listAppointmentSlots(params: {
  from?: string;
  to?: string;
  status?: 'available' | 'closed';
  limit?: number;
} = {}): Promise<AppointmentSlot[]> {
  const query = new URLSearchParams();
  if (params.from) {
    query.set('from', params.from);
  }
  if (params.to) {
    query.set('to', params.to);
  }
  if (params.status) {
    query.set('status', params.status);
  }
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.max(1, Math.trunc(params.limit))));
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const response = await fetchJson<AppointmentSlotsResponse>(
    `/clinician/appointments/slots${suffix}`,
    { method: 'GET' },
  );
  return response.items ?? [];
}

export async function listAppointmentRequests(params: {
  status?: 'pending' | 'approved' | 'rejected' | 'canceled';
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<AppointmentRequestItem[]> {
  const query = new URLSearchParams();
  if (params.status) {
    query.set('status', params.status);
  }
  if (params.from) {
    query.set('from', params.from);
  }
  if (params.to) {
    query.set('to', params.to);
  }
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.max(1, Math.trunc(params.limit))));
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const response = await fetchJson<AppointmentRequestsResponse>(
    `/clinician/appointments/requests${suffix}`,
    { method: 'GET' },
  );
  return response.items ?? [];
}

export async function reviewAppointmentRequest(
  requestId: string,
  status: 'approved' | 'rejected',
): Promise<AppointmentRequestItem> {
  const response = await fetchJson<{
    ok: true;
    item: AppointmentRequestItem;
  }>(`/clinician/appointments/requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    json: { status },
  });

  return response.item;
}

export async function getPatientPhotos(
  patientId: string,
  params: { limit?: number; from?: string; to?: string } = {},
): Promise<PatientPhotosResponse> {
  const query = new URLSearchParams();
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.max(1, Math.trunc(params.limit))));
  }
  if (params.from) {
    query.set('from', params.from);
  }
  if (params.to) {
    query.set('to', params.to);
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return fetchJson<PatientPhotosResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/photos${suffix}`,
    { method: 'GET' },
  );
}

export async function getPhotoMeta(photoId: string): Promise<SymptomPhotoMeta> {
  return fetchJson<SymptomPhotoMeta>(
    `/clinician/photos/${encodeURIComponent(photoId)}/meta`,
    { method: 'GET' },
  );
}

export async function fetchPhotoBlob(photoId: string): Promise<Blob> {
  const token = getStoredClinicianToken();
  const headers = new Headers();
  headers.set('Accept', 'image/*');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/clinician/photos/${encodeURIComponent(photoId)}/file`,
      {
        method: 'GET',
        headers,
      },
    );
    if (!response.ok) {
      throw createAppError('HTTP', 'Could not load symptom photo file.', {
        status: response.status,
      });
    }
    return await response.blob();
  } catch (error) {
    throw asAppError(error);
  }
}

export async function listInsightsQueue(
  status: InsightStatus = 'pending',
  limit: number = 50,
): Promise<InsightItem[]> {
  const query = new URLSearchParams();
  query.set('status', status);
  if (Number.isFinite(limit)) {
    query.set('limit', String(Math.max(1, Math.trunc(limit))));
  }
  const response = await fetchJson<InsightsQueueResponse>(
    `/clinician/insights?${query.toString()}`,
    { method: 'GET' },
  );
  return response.items ?? [];
}

export async function reviewInsight(
  insightId: string,
  status: 'approved' | 'rejected',
): Promise<InsightItem> {
  const response = await fetchJson<{ ok: true; item: InsightItem }>(
    `/clinician/insights/${encodeURIComponent(insightId)}`,
    {
      method: 'PATCH',
      json: { status },
    },
  );
  return response.item;
}

export async function generatePatientInsights(
  patientId: string,
  windowDays: number = 14,
): Promise<GenerateInsightsResponse> {
  return fetchJson<GenerateInsightsResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/insights/generate`,
    {
      method: 'POST',
      json: { windowDays },
    },
  );
}

export async function getPatientInsights(
  patientId: string,
  status?: InsightStatus,
  limit: number = 50,
): Promise<InsightItem[]> {
  const query = new URLSearchParams();
  if (status) {
    query.set('status', status);
  }
  if (Number.isFinite(limit)) {
    query.set('limit', String(Math.max(1, Math.trunc(limit))));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const response = await fetchJson<PatientInsightsResponse>(
    `/clinician/patients/${encodeURIComponent(patientId)}/insights${suffix}`,
    { method: 'GET' },
  );
  return response.items ?? [];
}

export async function listPatients(): Promise<PatientSummary[]> {
  const response = await fetchJson<ListPatientsResponse>('/clinician/patients', {
    method: 'GET',
  });

  return response.patients;
}

export interface ListWorklistParams {
  search?: string;
  highRiskOnly?: boolean;
  hasOpenAlerts?: boolean;
  needsResponse?: boolean;
  missedCheckins?: boolean;
  assignedToMe?: boolean;
  status?: string;
  sort?: WorklistSortOption;
}

export async function listClinicianWorklist(
  params: ListWorklistParams = {},
): Promise<WorklistResponse> {
  const response = await fetchJson<WorklistResponse>('/clinician/worklist', {
    method: 'GET',
    query: {
      search: params.search?.trim() || undefined,
      highRiskOnly: params.highRiskOnly === true ? 'true' : undefined,
      hasOpenAlerts: params.hasOpenAlerts === true ? 'true' : undefined,
      needsResponse: params.needsResponse === true ? 'true' : undefined,
      missedCheckins: params.missedCheckins === true ? 'true' : undefined,
      assignedToMe: params.assignedToMe === true ? 'true' : undefined,
      status: params.status && params.status !== 'all' ? params.status : undefined,
      sort: params.sort ?? 'priority',
    },
  });

  return response;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await fetchJson<DashboardSummaryResponse>('/clinician/dashboard/summary', {
    method: 'GET',
  });

  return response.summary;
}

export async function listDashboardPriorityQueue(limit: number = 8): Promise<DashboardPriorityQueueItem[]> {
  const response = await fetchJson<DashboardPriorityQueueResponse>('/clinician/dashboard/priority-queue', {
    method: 'GET',
    query: { limit },
  });

  return response.items ?? [];
}

export async function listDashboardRecentSafetyEvents(limit: number = 6): Promise<DashboardSafetyEvent[]> {
  const response = await fetchJson<DashboardRecentSafetyEventsResponse>(
    '/clinician/dashboard/recent-safety-events',
    {
      method: 'GET',
      query: { limit },
    },
  );

  return response.items ?? [];
}

export async function listDashboardTodayAppointments(): Promise<DashboardTodayAppointmentItem[]> {
  const response = await fetchJson<DashboardTodayAppointmentsResponse>('/clinician/dashboard/today-appointments', {
    method: 'GET',
  });

  return response.items ?? [];
}

export async function listDashboardFollowUpTasks(
  params: { limit?: number; assignedToMe?: boolean } = {},
): Promise<DashboardFollowUpTaskItem[]> {
  const response = await fetchJson<DashboardFollowUpTasksResponse>('/clinician/dashboard/follow-up-tasks', {
    method: 'GET',
    query: {
      limit: params.limit,
      assignedToMe: params.assignedToMe === true ? 'true' : undefined,
    },
  });

  return response.items ?? [];
}

export async function getDashboardCommunicationOverview(
  limit: number = 5,
): Promise<DashboardCommunicationOverview> {
  const response = await fetchJson<DashboardCommunicationOverviewResponse>(
    '/clinician/dashboard/communication-overview',
    {
      method: 'GET',
      query: { limit },
    },
  );

  return response.overview;
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

export function useDashboardSummary(): UseQueryResult<DashboardSummary, unknown> {
  return useQuery({
    queryKey: clinicianQueryKeys.dashboardSummary(),
    queryFn: () => getDashboardSummary(),
    staleTime: DASHBOARD_QUERY_STALE_TIME_MS,
    retry: retryIfAllowed,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
}

export function useDashboardPriorityQueue(
  limit: number = 8,
): UseQueryResult<DashboardPriorityQueueItem[], unknown> {
  return useQuery({
    queryKey: clinicianQueryKeys.dashboardPriorityQueue(limit),
    queryFn: () => listDashboardPriorityQueue(limit),
    staleTime: DASHBOARD_QUERY_STALE_TIME_MS,
    retry: retryIfAllowed,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
}

export function useDashboardRecentSafetyEvents(
  limit: number = 6,
): UseQueryResult<DashboardSafetyEvent[], unknown> {
  return useQuery({
    queryKey: clinicianQueryKeys.dashboardRecentSafetyEvents(limit),
    queryFn: () => listDashboardRecentSafetyEvents(limit),
    staleTime: DASHBOARD_QUERY_STALE_TIME_MS,
    retry: retryIfAllowed,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
}

export function useDashboardTodayAppointments(): UseQueryResult<DashboardTodayAppointmentItem[], unknown> {
  return useQuery({
    queryKey: clinicianQueryKeys.dashboardTodayAppointments(),
    queryFn: () => listDashboardTodayAppointments(),
    staleTime: DASHBOARD_QUERY_STALE_TIME_MS,
    retry: retryIfAllowed,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
}

export function useDashboardFollowUpTasks(
  params: { limit?: number; assignedToMe?: boolean } = {},
): UseQueryResult<DashboardFollowUpTaskItem[], unknown> {
  const limit = params.limit ?? 5;
  const assignedToMe = params.assignedToMe === true;

  return useQuery({
    queryKey: clinicianQueryKeys.dashboardFollowUpTasks(limit, assignedToMe),
    queryFn: () => listDashboardFollowUpTasks({ limit, assignedToMe }),
    staleTime: DASHBOARD_QUERY_STALE_TIME_MS,
    retry: retryIfAllowed,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
}

export function useDashboardCommunicationOverview(
  limit: number = 5,
): UseQueryResult<DashboardCommunicationOverview, unknown> {
  return useQuery({
    queryKey: clinicianQueryKeys.dashboardCommunicationOverview(limit),
    queryFn: () => getDashboardCommunicationOverview(limit),
    staleTime: DASHBOARD_QUERY_STALE_TIME_MS,
    retry: retryIfAllowed,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
}

export function useClinicianWorklist(
  params: ListWorklistParams = {},
): UseQueryResult<WorklistResponse, unknown> {
  return useQuery({
    queryKey: clinicianQueryKeys.worklist({
      search: params.search?.trim() || undefined,
      highRiskOnly: params.highRiskOnly === true,
      hasOpenAlerts: params.hasOpenAlerts === true,
      needsResponse: params.needsResponse === true,
      missedCheckins: params.missedCheckins === true,
      assignedToMe: params.assignedToMe === true,
      status: params.status && params.status !== 'all' ? params.status : undefined,
      sort: params.sort ?? 'priority',
    }),
    queryFn: () => listClinicianWorklist(params),
    staleTime: DASHBOARD_QUERY_STALE_TIME_MS,
    retry: retryIfAllowed,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
}
