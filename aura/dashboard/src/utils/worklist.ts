import type { PatientStatus, WorklistRecord, WorklistSortOption } from '../types/models';

export type WorklistStatusFilter = 'all' | PatientStatus;

export interface WorklistFilters {
  search: string;
  highRiskOnly: boolean;
  hasOpenAlerts: boolean;
  needsResponse: boolean;
  missedCheckins: boolean;
  assignedToMe: boolean;
  status: WorklistStatusFilter;
  sort: WorklistSortOption;
}

export function defaultWorklistFilters(): WorklistFilters {
  return {
    search: '',
    highRiskOnly: false,
    hasOpenAlerts: false,
    needsResponse: false,
    missedCheckins: false,
    assignedToMe: false,
    status: 'all',
    sort: 'priority',
  };
}

export function hasWorklistFilterConstraints(filters: WorklistFilters): boolean {
  return Boolean(
    filters.search.trim() ||
      filters.highRiskOnly ||
      filters.hasOpenAlerts ||
      filters.needsResponse ||
      filters.missedCheckins ||
      filters.assignedToMe ||
      filters.status !== 'all',
  );
}

export function getWorklistReviewLabel(item: WorklistRecord): string {
  return item.topIssue?.trim() || item.reviewReason?.trim() || 'Needs review';
}

export function getWorklistReviewSupport(item: WorklistRecord): string {
  if (item.topIssue && item.reviewReason && item.topIssue.trim() !== item.reviewReason.trim()) {
    return item.reviewReason;
  }

  if (item.communicationNeedsResponse) {
    return 'Patient communication is waiting for clinician follow-up.';
  }

  if (item.openAlertsCount > 0) {
    return `${item.openAlertsCount} open alert${item.openAlertsCount === 1 ? '' : 's'} require review.`;
  }

  if (item.missedCheckins.flag) {
    return `Missed ${item.missedCheckins.count} recent check-in${item.missedCheckins.count === 1 ? '' : 's'}.`;
  }

  if (item.activeTaskCount > 0) {
    return `${item.activeTaskCount} active follow-up task${item.activeTaskCount === 1 ? '' : 's'} on file.`;
  }

  if (item.nextAppointmentAt) {
    return 'Upcoming appointment context is available for follow-up planning.';
  }

  return 'Monitor recovery progress and recent operational context.';
}

export function worklistPriorityTone(item: WorklistRecord): 'risk-high' | 'warning' | 'neutral' {
  if (item.latestRiskLevel === 'high' || item.openAlertsCount > 0 || item.priorityScore >= 80) {
    return 'risk-high';
  }

  if (
    item.communicationNeedsResponse ||
    item.activeTaskCount > 0 ||
    item.missedCheckins.flag ||
    item.priorityScore >= 45
  ) {
    return 'warning';
  }

  return 'neutral';
}

export function worklistPriorityLabel(item: WorklistRecord): string {
  if (item.latestRiskLevel === 'high' || item.openAlertsCount > 0 || item.priorityScore >= 80) {
    return 'High priority';
  }

  if (
    item.communicationNeedsResponse ||
    item.activeTaskCount > 0 ||
    item.missedCheckins.flag ||
    item.priorityScore >= 45
  ) {
    return 'Needs review';
  }

  return 'Monitor';
}

export function formatExercisesPct(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return `${Math.round(value * 100)}%`;
}
