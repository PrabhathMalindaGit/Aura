import type { SeenAlertMap } from '../../services/seenStore';
import type {
  AlertItem,
  AlertStatus,
  PatientSummary,
  TimelineEvent,
} from '../../types/models';
import { normalizeWorkspaceSearch } from '../../services/workspaceState';
import { formatRiskLabel, getEffectiveRisk, hasRiskOverride } from '../../utils/risk';
import {
  alertSourceLabel,
  alertStatusLabel,
  notificationStatusLabel,
  shortReferenceLabel,
} from '../../utils/notification';
import { isAlertUnseenForUi } from '../../utils/seen';
import { formatExactTime, formatRelativeTime, isAfterWithinDays } from '../../utils/time';
import { computeAlertKpis } from '../../utils/kpi';

export type AlertsSourceFilter = 'all' | 'checkin' | 'chat';
export type AlertsTimeRangeFilter = '24h' | '7d' | '30d';
export type AlertsSortOrder = 'newest' | 'oldest' | 'patient-asc';
export type AlertsBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'critical' | 'unknown';

export interface AlertsWorkspaceState {
  status: AlertStatus;
  searchValue: string;
  sourceFilter: AlertsSourceFilter;
  timeRange: AlertsTimeRangeFilter;
  sortOrder: AlertsSortOrder;
  unseenOnly: boolean;
  assignedToMeOnly: boolean;
  unassignedOnly: boolean;
  overriddenOnly: boolean;
}

export interface AlertsStatusOptionVm {
  id: AlertStatus;
  label: string;
  count: number;
}

export interface AlertsStatusBarVm {
  title: string;
  description: string;
  viewLabel: string;
  guidanceLine: string;
  facts: Array<{ key: string; label: string; value: string }>;
  statusOptions: AlertsStatusOptionVm[];
}

export interface AlertQueueRowVm {
  key: string;
  alertId: string;
  patientId: string;
  patientName: string;
  reason: string;
  sourceLabel: string;
  severityLabel: string;
  severityTone: AlertsBadgeTone;
  freshnessLabel: string;
  freshnessTitle: string;
  statusLabel: string;
  statusTone: AlertsBadgeTone;
  supportLine: string;
  stateBadges: Array<{ label: string; tone: AlertsBadgeTone }>;
}

export interface AlertReviewHeaderVm {
  alertId: string;
  patientId: string;
  patientName: string;
  patientStatusLabel: string;
  reason: string;
  sourceLabel: string;
  referenceLabel: string;
  severityLabel: string;
  severityTone: AlertsBadgeTone;
  statusLabel: string;
  statusTone: AlertsBadgeTone;
  freshnessLabel: string;
  freshnessTitle: string;
  seenLabel: string;
  seenTone: AlertsBadgeTone;
  assignmentLabel: string;
}

export interface AlertReviewSummaryVm {
  title: string;
  summary: string;
  supportingFacts: Array<{ label: string; value: string; tone?: AlertsBadgeTone }>;
  basisItems: string[];
}

export interface AlertGovernanceVm {
  patientTitle: string;
  patientSubtitle: string;
  patientFacts: Array<{ label: string; value: string }>;
  governanceFacts: Array<{ label: string; value: string }>;
  thresholdFacts: Array<{ label: string; value: string }>;
  notificationFacts: Array<{ label: string; value: string }>;
  latestAudit: string;
}

const DAY_LOOKUP: Record<AlertsTimeRangeFilter, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
};

export function defaultAlertsWorkspaceState(): AlertsWorkspaceState {
  return {
    status: 'open',
    searchValue: '',
    sourceFilter: 'all',
    timeRange: '7d',
    sortOrder: 'newest',
    unseenOnly: false,
    assignedToMeOnly: false,
    unassignedOnly: false,
    overriddenOnly: false,
  };
}

export function normalizeAlertsWorkspaceState(value: unknown): AlertsWorkspaceState {
  const fallback = defaultAlertsWorkspaceState();

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  const candidate = value as Partial<AlertsWorkspaceState>;
  const status =
    candidate.status === 'acknowledged' || candidate.status === 'resolved'
      ? candidate.status
      : 'open';
  const assignedToMeOnly = candidate.assignedToMeOnly === true;
  const unassignedOnly = candidate.unassignedOnly === true && !assignedToMeOnly;

  return {
    status,
    searchValue: normalizeWorkspaceSearch(candidate.searchValue),
    sourceFilter:
      candidate.sourceFilter === 'checkin' || candidate.sourceFilter === 'chat'
        ? candidate.sourceFilter
        : fallback.sourceFilter,
    timeRange:
      candidate.timeRange === '24h' || candidate.timeRange === '30d'
        ? candidate.timeRange
        : fallback.timeRange,
    sortOrder:
      candidate.sortOrder === 'oldest' || candidate.sortOrder === 'patient-asc'
        ? candidate.sortOrder
        : fallback.sortOrder,
    unseenOnly: status === 'open' && candidate.unseenOnly === true,
    assignedToMeOnly: status === 'open' && assignedToMeOnly,
    unassignedOnly: status === 'open' && unassignedOnly,
    overriddenOnly: status === 'open' && candidate.overriddenOnly === true,
  };
}

export function reasonText(reason: string | string[]): string {
  return Array.isArray(reason) ? reason.join(' ') : reason;
}

export function formatAlertsLastUpdated(lastSuccessAt: number | null): string {
  if (!lastSuccessAt) {
    return '--';
  }

  return new Date(lastSuccessAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatAlertsStatusViewLabel(status: AlertStatus): string {
  if (status === 'acknowledged') {
    return 'Acknowledged queue';
  }

  if (status === 'resolved') {
    return 'Resolved archive';
  }

  return 'Open queue';
}

function mapSeverityTone(alert: AlertItem): AlertsBadgeTone {
  const effectiveRisk = getEffectiveRisk(alert).trim().toLowerCase();

  if (effectiveRisk === 'high') {
    return 'critical';
  }

  if (effectiveRisk === 'medium') {
    return 'warning';
  }

  if (effectiveRisk === 'low') {
    return 'success';
  }

  return 'unknown';
}

function mapStatusTone(status: AlertStatus): AlertsBadgeTone {
  if (status === 'resolved') {
    return 'success';
  }

  if (status === 'acknowledged') {
    return 'info';
  }

  return 'warning';
}

function buildAlertFreshness(alert: AlertItem): { label: string; title: string } {
  return {
    label: formatRelativeTime(alert.createdAt),
    title: formatExactTime(alert.createdAt),
  };
}

function buildAssignmentLabel(alert: AlertItem): string {
  if (!alert.assignedTo) {
    return 'Unassigned';
  }

  return alert.assignedToName?.trim() || alert.assignedTo;
}

function buildPatientName(alert: AlertItem, patient: PatientSummary | null): string {
  const displayName = patient?.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  return `Patient ${alert.patientId}`;
}

function buildStateBadges(
  alert: AlertItem,
  seenAlertMap: SeenAlertMap,
): Array<{ label: string; tone: AlertsBadgeTone }> {
  const badges: Array<{ label: string; tone: AlertsBadgeTone }> = [];

  if (alert.status === 'open') {
    badges.push({
      label: isAlertUnseenForUi(alert, seenAlertMap) ? 'Unseen' : 'Seen',
      tone: isAlertUnseenForUi(alert, seenAlertMap) ? 'warning' : 'success',
    });
  }

  if (alert.assignedTo) {
    badges.push({ label: buildAssignmentLabel(alert), tone: 'info' });
  }

  if (hasRiskOverride(alert)) {
    badges.push({ label: 'Override', tone: 'warning' });
  }

  return badges.slice(0, 2);
}

export function filterAlerts(
  alerts: AlertItem[],
  options: {
    searchValue: string;
    sourceFilter: AlertsSourceFilter;
    timeRange: AlertsTimeRangeFilter;
    unseenOnly: boolean;
    assignedToMeOnly: boolean;
    unassignedOnly: boolean;
    overriddenOnly: boolean;
    clinicianId: string;
    seenAlertMap: SeenAlertMap;
    status: AlertStatus;
  },
): AlertItem[] {
  const normalizedSearch = options.searchValue.trim().toLowerCase();

  return alerts.filter((alert) => {
    if (options.sourceFilter !== 'all' && alert.source.type !== options.sourceFilter) {
      return false;
    }

    if (!isAfterWithinDays(alert.createdAt, DAY_LOOKUP[options.timeRange])) {
      return false;
    }

    if (options.status === 'open') {
      if (options.unseenOnly && !isAlertUnseenForUi(alert, options.seenAlertMap)) {
        return false;
      }

      if (options.assignedToMeOnly && alert.assignedTo !== options.clinicianId) {
        return false;
      }

      if (options.unassignedOnly && Boolean(alert.assignedTo)) {
        return false;
      }

      if (options.overriddenOnly && !hasRiskOverride(alert)) {
        return false;
      }
    }

    if (!normalizedSearch) {
      return true;
    }

    const searchable = `${alert._id} ${alert.patientId} ${reasonText(alert.reason)} ${alert.source.type}`.toLowerCase();
    return searchable.includes(normalizedSearch);
  });
}

export function sortAlerts(alerts: AlertItem[], order: AlertsSortOrder): AlertItem[] {
  const next = [...alerts];

  if (order === 'patient-asc') {
    next.sort((left, right) => left.patientId.localeCompare(right.patientId));
    return next;
  }

  if (order === 'oldest') {
    next.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    return next;
  }

  next.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  return next;
}

export function buildAlertsStatusBar(params: {
  status: AlertStatus;
  statusCounts: Record<AlertStatus, number>;
  visibleCount: number;
  filterCount: number;
  updatedAtLabel: string;
  openAlerts: AlertItem[];
  seenAlertMap: SeenAlertMap;
  clinicianId: string;
}): AlertsStatusBarVm {
  const openKpis = computeAlertKpis(params.openAlerts, params.seenAlertMap, params.clinicianId);

  const guidanceLine =
    params.status === 'open'
      ? openKpis.overdueCount > 0
        ? `${openKpis.overdueCount} open alert${openKpis.overdueCount === 1 ? '' : 's'} are older than 24 hours and should lead review.`
        : openKpis.unseenCount > 0
          ? `${openKpis.unseenCount} open alert${openKpis.unseenCount === 1 ? '' : 's'} still need first review.`
          : params.visibleCount > 0
            ? `${params.visibleCount} open alert${params.visibleCount === 1 ? '' : 's'} remain in the current governance queue.`
            : 'No open alerts are visible in the current queue view.'
      : params.visibleCount > 0
        ? `${params.visibleCount} ${params.status} alert${params.visibleCount === 1 ? '' : 's'} remain available for review.`
        : `No ${params.status} alerts are visible in this view.`;

  return {
    title: 'Alert governance',
    description: 'Review alert basis, ownership, and threshold context without losing queue position.',
    viewLabel: formatAlertsStatusViewLabel(params.status),
    guidanceLine,
    facts: [
      {
        key: 'visible',
        label: 'Visible alerts',
        value: String(params.visibleCount),
      },
      {
        key: 'updated',
        label: 'Updated',
        value: params.updatedAtLabel,
      },
      {
        key: 'filters',
        label: 'Active filters',
        value: String(params.filterCount),
      },
    ],
    statusOptions: [
      { id: 'open', label: 'Open', count: params.statusCounts.open },
      { id: 'acknowledged', label: 'Acknowledged', count: params.statusCounts.acknowledged },
      { id: 'resolved', label: 'Resolved', count: params.statusCounts.resolved },
    ],
  };
}

export function buildAlertQueueRow(params: {
  alert: AlertItem;
  patient: PatientSummary | null;
  seenAlertMap: SeenAlertMap;
}): AlertQueueRowVm {
  const { alert, patient, seenAlertMap } = params;
  const freshness = buildAlertFreshness(alert);
  const reason = reasonText(alert.reason);
  const referenceLabel = shortReferenceLabel(alert._id);

  return {
    key: alert._id,
    alertId: alert._id,
    patientId: alert.patientId,
    patientName: buildPatientName(alert, patient),
    reason,
    sourceLabel: alertSourceLabel(alert.source.type),
    severityLabel: formatRiskLabel(getEffectiveRisk(alert)),
    severityTone: mapSeverityTone(alert),
    freshnessLabel: freshness.label,
    freshnessTitle: freshness.title,
    statusLabel: alertStatusLabel(alert.status),
    statusTone: mapStatusTone(alert.status),
    supportLine: [
      alertSourceLabel(alert.source.type),
      referenceLabel ?? null,
      alert.assignedTo ? `Assigned ${buildAssignmentLabel(alert)}` : 'Unassigned',
    ]
      .filter(Boolean)
      .join(' · '),
    stateBadges: buildStateBadges(alert, seenAlertMap),
  };
}

export function buildAlertReviewHeader(params: {
  alert: AlertItem;
  patient: PatientSummary | null;
  seen: boolean;
}): AlertReviewHeaderVm {
  const { alert, patient, seen } = params;
  const freshness = buildAlertFreshness(alert);

  return {
    alertId: alert._id,
    patientId: alert.patientId,
    patientName: buildPatientName(alert, patient),
    patientStatusLabel: patient?.status ? patient.status.replace('_', ' ') : 'Unknown',
    reason: reasonText(alert.reason),
    sourceLabel: alertSourceLabel(alert.source.type),
    referenceLabel: shortReferenceLabel(alert._id) ?? alert._id,
    severityLabel: formatRiskLabel(getEffectiveRisk(alert)),
    severityTone: mapSeverityTone(alert),
    statusLabel: alertStatusLabel(alert.status),
    statusTone: mapStatusTone(alert.status),
    freshnessLabel: freshness.label,
    freshnessTitle: freshness.title,
    seenLabel: seen ? 'Seen' : 'Unseen',
    seenTone: seen ? 'success' : 'warning',
    assignmentLabel: buildAssignmentLabel(alert),
  };
}

export function buildAlertReviewSummary(alert: AlertItem): AlertReviewSummaryVm {
  const reason = reasonText(alert.reason);
  const basisItems = [
    ...(alert.reasonsAuto?.filter(Boolean) ?? []),
    alert.overrideReason?.trim() ? `Override rationale: ${alert.overrideReason.trim()}` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    title: 'Why this alert fired',
    summary: reason,
    supportingFacts: [
      {
        label: 'Alert basis',
        value: reason,
      },
      {
        label: 'Recorded auto basis',
        value: alert.reasonsAuto?.length ? alert.reasonsAuto.join(' · ') : 'Unknown',
      },
      {
        label: 'Effective risk',
        value: formatRiskLabel(getEffectiveRisk(alert)),
        tone: mapSeverityTone(alert),
      },
      {
        label: 'Notification status',
        value: notificationStatusLabel(alert.notificationStatus),
      },
    ],
    basisItems,
  };
}

function latestTimelineLabel(timeline: TimelineEvent[] | undefined): string {
  if (!timeline?.length) {
    return 'Unknown';
  }

  const latest = [...timeline].sort((left, right) => Date.parse(right.at) - Date.parse(left.at))[0];
  return `${latest.label} · ${formatRelativeTime(latest.at)}`;
}

export function buildAlertGovernance(params: {
  alert: AlertItem;
  patient: PatientSummary | null;
  seen: boolean;
  timeline: TimelineEvent[] | undefined;
}): AlertGovernanceVm {
  const { alert, patient, seen, timeline } = params;
  const assigned = buildAssignmentLabel(alert);
  const patientTitle = buildPatientName(alert, patient);
  const patientSubtitle = patient?.status
    ? `Status ${patient.status.replace('_', ' ')}`
    : 'Patient status Unknown';

  return {
    patientTitle,
    patientSubtitle,
    patientFacts: [
      { label: 'Patient ID', value: alert.patientId },
      { label: 'Status', value: patient?.status ?? 'Unknown' },
      { label: 'Last check-in', value: patient?.lastCheckinAt ? formatRelativeTime(patient.lastCheckinAt) : 'Unknown' },
    ],
    governanceFacts: [
      { label: 'Assigned', value: assigned },
      {
        label: 'Assignment source',
        value: alert.assignedTo ? alert.assignmentSource ?? 'Unknown' : 'Unassigned',
      },
      { label: 'Seen state', value: seen ? 'Seen' : 'Unseen' },
      { label: 'Source', value: alertSourceLabel(alert.source.type) },
      { label: 'Reference', value: shortReferenceLabel(alert._id) ?? alert._id },
    ],
    thresholdFacts: [
      { label: 'Alert basis', value: reasonText(alert.reason) },
      {
        label: 'Recorded auto basis',
        value: alert.reasonsAuto?.length ? alert.reasonsAuto.join(' · ') : 'Unknown',
      },
      { label: 'Auto risk', value: formatRiskLabel(alert.riskAuto ?? alert.risk) },
      { label: 'Final risk', value: formatRiskLabel(alert.riskFinal ?? alert.riskAuto ?? alert.risk) },
      {
        label: 'Override',
        value: hasRiskOverride(alert)
          ? alert.overrideReason?.trim() || 'Override recorded'
          : 'None',
      },
      {
        label: 'Overridden by',
        value: hasRiskOverride(alert)
          ? alert.overriddenByName?.trim() || alert.overriddenBy || 'Unknown'
          : 'Unknown',
      },
    ],
    notificationFacts: [
      { label: 'Notification status', value: notificationStatusLabel(alert.notificationStatus) },
      { label: 'Channel', value: alert.notificationChannel ?? 'Unknown' },
      { label: 'Attempted', value: alert.notificationAttemptedAt ? formatExactTime(alert.notificationAttemptedAt) : 'Unknown' },
      { label: 'Sent', value: alert.notificationSentAt ? formatExactTime(alert.notificationSentAt) : 'Unknown' },
      { label: 'Failed', value: alert.notificationFailedAt ? formatExactTime(alert.notificationFailedAt) : 'Unknown' },
    ],
    latestAudit: latestTimelineLabel(timeline),
  };
}
