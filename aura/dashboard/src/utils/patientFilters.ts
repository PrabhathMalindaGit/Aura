import type { PatientStatus, PatientSummary } from '../types/models';
import { isOlderThanDays, isWithinDays, parseIsoToMs } from './date';

export const MISSED_CHECKIN_DAYS = 2;

export type PatientStatusFilter = 'all' | PatientStatus;
export type RecentlyActiveFilter = 'all' | '24h' | '7d' | '30d';
export type PatientSortOption = 'alerts-desc' | 'last-checkin-desc' | 'name-asc' | 'status-active-first';

export interface PatientFilters {
  search: string;
  status: PatientStatusFilter;
  hasOpenAlertsOnly: boolean;
  missedCheckinsOnly: boolean;
  recentlyActive: RecentlyActiveFilter;
  sort: PatientSortOption;
}

const STATUS_PRIORITY: Record<PatientStatus, number> = {
  active: 0,
  on_hold: 1,
  inactive: 2,
  discharged: 3,
};

function toRecentlyActiveDays(value: RecentlyActiveFilter): number | null {
  if (value === '24h') {
    return 1;
  }

  if (value === '7d') {
    return 7;
  }

  if (value === '30d') {
    return 30;
  }

  return null;
}

export function getPatientStatus(patient: PatientSummary): PatientStatus {
  if (patient.status === 'active' || patient.status === 'on_hold' || patient.status === 'discharged' || patient.status === 'inactive') {
    return patient.status;
  }

  return 'inactive';
}

export function getPatientDisplayName(patient: PatientSummary): string {
  if (patient.displayName && patient.displayName.trim().length > 0) {
    return patient.displayName.trim();
  }

  return patient.id;
}

export function hasOpenAlerts(patient: PatientSummary): boolean {
  return (patient.openAlertCount ?? 0) > 0;
}

export function getPatientRosterReason(patient: PatientSummary, nowMs: number = Date.now()): string {
  const openAlertCount = patient.openAlertCount ?? 0;
  if (openAlertCount > 0) {
    return `${openAlertCount} active alert${openAlertCount === 1 ? '' : 's'}`;
  }

  if (isMissedCheckin(patient, nowMs)) {
    return 'Missed recent check-in';
  }

  if (isRecentlyActive(patient, '7d', nowMs)) {
    return 'Recently active this week';
  }

  const status = getPatientStatus(patient);
  if (status === 'on_hold') {
    return 'On-hold monitoring';
  }

  if (status === 'discharged') {
    return 'Discharged from active care';
  }

  if (status === 'inactive') {
    return 'Inactive record';
  }

  return 'Active monitoring';
}

export function isMissedCheckin(patient: PatientSummary, nowMs: number = Date.now()): boolean {
  return isOlderThanDays(patient.lastCheckinAt, MISSED_CHECKIN_DAYS, nowMs);
}

export function isRecentlyActive(patient: PatientSummary, filter: RecentlyActiveFilter, nowMs: number = Date.now()): boolean {
  const days = toRecentlyActiveDays(filter);
  if (days === null) {
    return true;
  }

  return isWithinDays(patient.lastCheckinAt, days, nowMs);
}

export function matchesPatientSearch(patient: PatientSummary, search: string): boolean {
  const normalized = search.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = `${patient.id} ${getPatientDisplayName(patient)}`.toLowerCase();
  return haystack.includes(normalized);
}

export function filterPatients(
  patients: PatientSummary[],
  filters: Pick<PatientFilters, 'search' | 'status' | 'hasOpenAlertsOnly' | 'missedCheckinsOnly' | 'recentlyActive'>,
  nowMs: number = Date.now(),
): PatientSummary[] {
  return patients.filter((patient) => {
    if (!matchesPatientSearch(patient, filters.search)) {
      return false;
    }

    if (filters.status !== 'all' && getPatientStatus(patient) !== filters.status) {
      return false;
    }

    if (filters.hasOpenAlertsOnly && !hasOpenAlerts(patient)) {
      return false;
    }

    if (filters.missedCheckinsOnly && !isMissedCheckin(patient, nowMs)) {
      return false;
    }

    if (!isRecentlyActive(patient, filters.recentlyActive, nowMs)) {
      return false;
    }

    return true;
  });
}

function sortByAlertsDesc(left: PatientSummary, right: PatientSummary): number {
  const leftCount = left.openAlertCount ?? 0;
  const rightCount = right.openAlertCount ?? 0;
  if (leftCount !== rightCount) {
    return rightCount - leftCount;
  }

  const leftCheckin = parseIsoToMs(left.lastCheckinAt) ?? 0;
  const rightCheckin = parseIsoToMs(right.lastCheckinAt) ?? 0;
  return rightCheckin - leftCheckin;
}

function sortByLastCheckinDesc(left: PatientSummary, right: PatientSummary): number {
  const leftCheckin = parseIsoToMs(left.lastCheckinAt) ?? 0;
  const rightCheckin = parseIsoToMs(right.lastCheckinAt) ?? 0;
  if (leftCheckin !== rightCheckin) {
    return rightCheckin - leftCheckin;
  }

  return getPatientDisplayName(left).localeCompare(getPatientDisplayName(right));
}

function sortByNameAsc(left: PatientSummary, right: PatientSummary): number {
  return getPatientDisplayName(left).localeCompare(getPatientDisplayName(right));
}

function sortByStatusPriority(left: PatientSummary, right: PatientSummary): number {
  const leftPriority = STATUS_PRIORITY[getPatientStatus(left)];
  const rightPriority = STATUS_PRIORITY[getPatientStatus(right)];

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return sortByNameAsc(left, right);
}

export function sortPatients(patients: PatientSummary[], sort: PatientSortOption): PatientSummary[] {
  const next = [...patients];

  if (sort === 'alerts-desc') {
    return next.sort(sortByAlertsDesc);
  }

  if (sort === 'last-checkin-desc') {
    return next.sort(sortByLastCheckinDesc);
  }

  if (sort === 'name-asc') {
    return next.sort(sortByNameAsc);
  }

  return next.sort(sortByStatusPriority);
}

export function applyPatientFilters(patients: PatientSummary[], filters: PatientFilters, nowMs: number = Date.now()): PatientSummary[] {
  const filtered = filterPatients(patients, filters, nowMs);
  return sortPatients(filtered, filters.sort);
}

export function defaultPatientFilters(): PatientFilters {
  return {
    search: '',
    status: 'all',
    hasOpenAlertsOnly: false,
    missedCheckinsOnly: false,
    recentlyActive: 'all',
    sort: 'alerts-desc',
  };
}
