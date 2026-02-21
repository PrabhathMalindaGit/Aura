import type { AlertItem, TrendPointNormalized, TrendPointRaw } from '../types/models';
import type { DateRangeValue } from '../utils/datesRange';
import { isDateInRange, toISODate } from '../utils/datesRange';
import type { CsvColumnSpec } from '../utils/csv';
import { toDateKey } from '../utils/trends';

export interface AlertExportOptions {
  includeNotificationFields: boolean;
  includeAdvancedFields: boolean;
}

export interface PatientTrendExportOptions {
  includeNotes: boolean;
  includeAdvancedAlertFields: boolean;
}

function normalizeRisk(alert: AlertItem): string {
  return String(alert.riskFinal ?? alert.riskAuto ?? alert.risk ?? 'unknown');
}

function normalizeReason(reason: string | string[]): string {
  return Array.isArray(reason) ? reason.join('; ') : reason;
}

function truncateNotificationError(value: string | undefined): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  if (text.length <= 120) {
    return text;
  }

  return `${text.slice(0, 119)}…`;
}

export interface AlertExportRow {
  alertId: string;
  patientId: string;
  status: string;
  risk: string;
  reason: string;
  sourceType: string;
  sourceId: string;
  createdAt: string;
  acknowledgedAt: string;
  resolvedAt: string;
  seenAt?: string;
  assignedTo?: string;
  overriddenAt?: string;
  overrideReason?: string;
  notificationStatus?: string;
  notificationAttemptedAt?: string;
  notificationError?: string;
}

export function buildAlertExportRows(alerts: AlertItem[], options: AlertExportOptions): AlertExportRow[] {
  return alerts.map((alert) => {
    const base: AlertExportRow = {
      alertId: alert._id,
      patientId: alert.patientId,
      status: alert.status,
      risk: normalizeRisk(alert),
      reason: normalizeReason(alert.reason),
      sourceType: alert.source.type,
      sourceId: alert.source.sourceId,
      createdAt: alert.createdAt,
      acknowledgedAt: alert.acknowledgedAt ?? '',
      resolvedAt: alert.resolvedAt ?? '',
    };

    if (options.includeAdvancedFields) {
      base.seenAt = alert.seenAt ?? '';
      base.assignedTo = alert.assignedTo ?? '';
      base.overriddenAt = alert.overriddenAt ?? '';
      base.overrideReason = alert.overrideReason ?? '';
    }

    if (options.includeNotificationFields) {
      base.notificationStatus = alert.notificationStatus ?? 'unknown';
      base.notificationAttemptedAt = alert.notificationAttemptedAt ?? '';
      base.notificationError = truncateNotificationError(alert.notificationError);
    }

    return base;
  });
}

export function buildAlertExportColumns(options: AlertExportOptions): CsvColumnSpec<AlertExportRow>[] {
  const columns: CsvColumnSpec<AlertExportRow>[] = [
    { key: 'alertId', header: 'alertId' },
    { key: 'patientId', header: 'patientId' },
    { key: 'status', header: 'status' },
    { key: 'risk', header: 'risk' },
    { key: 'reason', header: 'reason' },
    { key: 'sourceType', header: 'sourceType' },
    { key: 'sourceId', header: 'sourceId' },
    { key: 'createdAt', header: 'createdAt' },
    { key: 'acknowledgedAt', header: 'acknowledgedAt' },
    { key: 'resolvedAt', header: 'resolvedAt' },
  ];

  if (options.includeAdvancedFields) {
    columns.push(
      { key: 'seenAt', header: 'seenAt' },
      { key: 'assignedTo', header: 'assignedTo' },
      { key: 'overriddenAt', header: 'overriddenAt' },
      { key: 'overrideReason', header: 'overrideReason' },
    );
  }

  if (options.includeNotificationFields) {
    columns.push(
      { key: 'notificationStatus', header: 'notificationStatus' },
      { key: 'notificationAttemptedAt', header: 'notificationAttemptedAt' },
      { key: 'notificationError', header: 'notificationError' },
    );
  }

  return columns;
}

export function filterAlertsForExportByRange(alerts: AlertItem[], range: DateRangeValue): AlertItem[] {
  return alerts.filter((alert) => isDateInRange(alert.createdAt, range));
}

export interface PatientTrendExportRow {
  date: string;
  pain: string;
  mood: string;
  exercisesAdherence: string;
  medicationTaken: string;
  notes?: string;
  hadAlert: string;
  alertCount: number;
  alertIds?: string;
  alertStatuses?: string;
}

function normalizeTrendPoint(raw: TrendPointRaw): TrendPointNormalized {
  return {
    date: toDateKey(raw.date),
    pain: typeof raw.pain === 'number' ? raw.pain : null,
    mood: typeof raw.mood === 'number' ? raw.mood : null,
    exercises: typeof raw.adherence?.exercises === 'number' ? raw.adherence.exercises : null,
    medication: typeof raw.adherence?.medication === 'boolean' ? raw.adherence.medication : null,
    notes: raw.notes ?? null,
  };
}

export function normalizeTrendPointsForExport(points: TrendPointRaw[] | TrendPointNormalized[]): TrendPointNormalized[] {
  return points.map((point) => {
    if ('exercises' in point && 'medication' in point) {
      return point as TrendPointNormalized;
    }

    return normalizeTrendPoint(point as TrendPointRaw);
  });
}

export function filterTrendPointsForExportByRange(
  points: TrendPointNormalized[],
  range: DateRangeValue,
): TrendPointNormalized[] {
  return points.filter((point) => isDateInRange(point.date, range));
}

function buildAlertsByDate(alerts: AlertItem[]): Map<string, AlertItem[]> {
  const map = new Map<string, AlertItem[]>();

  alerts.forEach((alert) => {
    const dateKey = toDateKey(alert.createdAt);
    const list = map.get(dateKey) ?? [];
    list.push(alert);
    map.set(dateKey, list);
  });

  return map;
}

export function buildPatientTrendExportRows(
  points: TrendPointNormalized[],
  alerts: AlertItem[],
  options: PatientTrendExportOptions,
): PatientTrendExportRow[] {
  const alertsByDate = buildAlertsByDate(alerts);

  return points.map((point) => {
    const dayAlerts = alertsByDate.get(point.date) ?? [];

    const row: PatientTrendExportRow = {
      date: point.date,
      pain: point.pain === null ? '' : String(point.pain),
      mood: point.mood === null ? '' : String(point.mood),
      exercisesAdherence: point.exercises === null ? '' : String(point.exercises),
      medicationTaken: point.medication === null ? '' : String(point.medication),
      hadAlert: dayAlerts.length > 0 ? 'true' : 'false',
      alertCount: dayAlerts.length,
    };

    if (options.includeNotes) {
      row.notes = point.notes ?? '';
    }

    if (options.includeAdvancedAlertFields) {
      row.alertIds = dayAlerts.map((alert) => alert._id).join('; ');
      row.alertStatuses = dayAlerts.map((alert) => alert.status).join('; ');
    }

    return row;
  });
}

export function buildPatientTrendExportColumns(
  options: PatientTrendExportOptions,
): CsvColumnSpec<PatientTrendExportRow>[] {
  const columns: CsvColumnSpec<PatientTrendExportRow>[] = [
    { key: 'date', header: 'date' },
    { key: 'pain', header: 'pain' },
    { key: 'mood', header: 'mood' },
    { key: 'exercisesAdherence', header: 'exercisesAdherence' },
    { key: 'medicationTaken', header: 'medicationTaken' },
  ];

  if (options.includeNotes) {
    columns.push({ key: 'notes', header: 'notes' });
  }

  columns.push(
    { key: 'hadAlert', header: 'hadAlert' },
    { key: 'alertCount', header: 'alertCount' },
  );

  if (options.includeAdvancedAlertFields) {
    columns.push(
      { key: 'alertIds', header: 'alertIds' },
      { key: 'alertStatuses', header: 'alertStatuses' },
    );
  }

  return columns;
}

export function createAlertsCsvFilename(range: DateRangeValue): string {
  return `Aura_Alerts_${range.from}_to_${range.to}.csv`;
}

export function createPatientCheckinsCsvFilename(patientId: string, range: DateRangeValue): string {
  return `Aura_Patient_${patientId}_Checkins_${range.from}_to_${range.to}.csv`;
}

export function createPatientAlertsCsvFilename(patientId: string, range: DateRangeValue): string {
  return `Aura_Patient_${patientId}_Alerts_${range.from}_to_${range.to}.csv`;
}

export function rangeIncludesDate(range: DateRangeValue, value: string): boolean {
  return isDateInRange(value, range);
}

export function formatExportDateRangeSummary(range: DateRangeValue): string {
  return `${toISODate(range.from)} to ${toISODate(range.to)}`;
}
