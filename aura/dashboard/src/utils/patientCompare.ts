import type {
  DashboardCommunicationOverviewItem,
  PatientSummary,
  WorklistRecord,
} from '../types/models';
import { formatRelativeDate } from './date';
import { formatDateKey } from './format';
import { getPatientDisplayName } from './patientFilters';
import type { TrendSummaryMetrics } from './trends';
import { truncateText } from './text';

export const MAX_COMPARE_PATIENTS = 3;

export interface ComparePatientSelection {
  requestedIds: string[];
  validIds: string[];
  validPatients: PatientSummary[];
  overflowed: boolean;
  unavailableCount: number;
}

export interface PatientCommunicationSignals {
  items: DashboardCommunicationOverviewItem[];
  latestItem: DashboardCommunicationOverviewItem | null;
  needsResponse: boolean;
  followUpSignal: boolean;
}

function normalizePatientId(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSupportText(value: string | undefined): string {
  if (!value) {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeRequestedComparePatientIds(
  values: readonly (string | null | undefined)[],
): string[] {
  const normalizedIds: string[] = [];
  const seen = new Set<string>();

  values.forEach((value) => {
    const normalized = normalizePatientId(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    normalizedIds.push(normalized);
  });

  return normalizedIds;
}

export function resolveComparePatientSelection(
  values: readonly (string | null | undefined)[],
  patients: readonly PatientSummary[],
): ComparePatientSelection {
  const requestedIds = normalizeRequestedComparePatientIds(values);
  const patientById = new Map(
    patients.map((patient) => [patient.id.trim(), patient] as const),
  );
  const validIds: string[] = [];
  const validPatients: PatientSummary[] = [];
  let unavailableCount = 0;

  requestedIds.forEach((patientId) => {
    const patient = patientById.get(patientId);
    if (!patient) {
      unavailableCount += 1;
      return;
    }

    if (validIds.length >= MAX_COMPARE_PATIENTS) {
      return;
    }

    validIds.push(patientId);
    validPatients.push(patient);
  });

  return {
    requestedIds,
    validIds,
    validPatients,
    overflowed: requestedIds.length > MAX_COMPARE_PATIENTS,
    unavailableCount,
  };
}

export function groupCommunicationSignalsByPatient(
  items: readonly DashboardCommunicationOverviewItem[],
): Record<string, PatientCommunicationSignals> {
  const grouped = new Map<string, DashboardCommunicationOverviewItem[]>();

  items.forEach((item) => {
    const patientId = normalizePatientId(item.patientId);
    if (!patientId) {
      return;
    }

    const current = grouped.get(patientId) ?? [];
    current.push(item);
    grouped.set(patientId, current);
  });

  return Array.from(grouped.entries()).reduce<Record<string, PatientCommunicationSignals>>(
    (result, [patientId, patientItems]) => {
      const sortedItems = [...patientItems].sort(
        (left, right) => Date.parse(right.messageCreatedAt) - Date.parse(left.messageCreatedAt),
      );

      result[patientId] = {
        items: sortedItems,
        latestItem: sortedItems[0] ?? null,
        needsResponse: sortedItems.some((item) => item.needsResponse),
        followUpSignal: sortedItems.some(
          (item) => item.followUpRequested || item.flaggedBySafety,
        ),
      };

      return result;
    },
    {},
  );
}

export function getCompareAlertCount(
  patient: PatientSummary,
  worklistItem?: WorklistRecord | null,
): number {
  return worklistItem?.openAlertsCount ?? patient.openAlertCount ?? 0;
}

export function getComparePainSnapshot(
  patient: PatientSummary,
  worklistItem?: WorklistRecord | null,
  trendSummary?: TrendSummaryMetrics | null,
): number | null {
  if (typeof trendSummary?.latestPain === 'number') {
    return trendSummary.latestPain;
  }

  if (typeof worklistItem?.lastPainScore === 'number') {
    return worklistItem.lastPainScore;
  }

  return typeof patient.lastPain === 'number' ? patient.lastPain : null;
}

export function getCompareAdherenceValue(
  worklistItem?: WorklistRecord | null,
  trendSummary?: TrendSummaryMetrics | null,
): number | null {
  if (typeof trendSummary?.adherence7d === 'number') {
    return trendSummary.adherence7d;
  }

  return typeof worklistItem?.adherenceSummary.exercisesPct === 'number'
    ? worklistItem.adherenceSummary.exercisesPct
    : null;
}

export function getComparePatientSupportLine(
  patient: PatientSummary,
  worklistItem?: WorklistRecord | null,
): string {
  const topIssue = normalizeSupportText(worklistItem?.topIssue);
  if (topIssue) {
    return truncateText(topIssue, 72).text;
  }

  const reviewReason = normalizeSupportText(worklistItem?.reviewReason);
  if (reviewReason) {
    return truncateText(reviewReason, 72).text;
  }

  if (patient.lastCheckinAt) {
    return `Last check-in ${formatRelativeDate(patient.lastCheckinAt)}`;
  }

  return 'No recent check-in recorded';
}

export function getCompareRecentActivityLabel(
  patient: PatientSummary,
  trendSummary?: TrendSummaryMetrics | null,
): string {
  if (patient.lastCheckinAt) {
    return formatRelativeDate(patient.lastCheckinAt);
  }

  if (trendSummary?.lastCheckinDate) {
    return formatDateKey(trendSummary.lastCheckinDate);
  }

  return 'No recent activity';
}

export function getCompareAlertContext(
  patient: PatientSummary,
  worklistItem?: WorklistRecord | null,
): string {
  const reviewReason = normalizeSupportText(worklistItem?.reviewReason);
  if (reviewReason) {
    return truncateText(reviewReason, 96).text;
  }

  const count = getCompareAlertCount(patient, worklistItem);
  if (count > 0) {
    return `${count} active alert${count === 1 ? '' : 's'} in the current roster`;
  }

  return 'No active alerts in the current roster';
}

export function hasAlertCompareAction(
  patient: PatientSummary,
  worklistItem?: WorklistRecord | null,
): boolean {
  return getCompareAlertCount(patient, worklistItem) > 0;
}

export function hasCommunicationCompareAction(
  signals: PatientCommunicationSignals | undefined,
): boolean {
  return Boolean(signals && signals.items.length > 0);
}

export function getCommunicationPreviewText(
  signals: PatientCommunicationSignals | undefined,
): string {
  const preview = signals?.latestItem?.messagePreview?.trim() ?? '';

  if (preview) {
    return truncateText(preview, 120).text;
  }

  return 'No recent communication preview in the current dashboard signals.';
}

export function getComparePatientName(patient: PatientSummary): string {
  return getPatientDisplayName(patient);
}
