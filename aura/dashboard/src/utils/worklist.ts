import type { PatientStatus, WorklistRecord, WorklistSortOption } from '../types/models';
import type { ClinicianTruthChip } from '../components/clinician/ClinicianTruthChips';

export type WorklistStatusFilter = 'all' | PatientStatus;

export interface WorklistFilters {
  search: string;
  highRiskOnly: boolean;
  hasOpenAlerts: boolean;
  needsResponse: boolean;
  missedCheckins: boolean;
  needsPromReview: boolean;
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
    needsPromReview: false,
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
      filters.needsPromReview ||
      filters.assignedToMe ||
      filters.status !== 'all',
  );
}

function formatPromLabel(item: WorklistRecord): string | null {
  const dueCount = item.proms?.dueCount ?? 0;
  const overdueCount = item.proms?.overdueCount ?? 0;

  if (dueCount <= 0) {
    return null;
  }

  if (overdueCount > 0) {
    if (overdueCount === dueCount) {
      return `${overdueCount} overdue PROM${overdueCount === 1 ? '' : 's'}`;
    }
    return `${dueCount} PROMs due (${overdueCount} overdue)`;
  }

  return `${dueCount} PROM${dueCount === 1 ? '' : 's'} due`;
}

export function getWorklistReviewLabel(item: WorklistRecord): string {
  return item.topIssue?.trim() || item.reviewReason?.trim() || formatPromLabel(item) || 'Needs review';
}

export function getWorklistReviewSupport(item: WorklistRecord): string {
  if (item.topIssue && item.reviewReason && item.topIssue.trim() !== item.reviewReason.trim()) {
    return item.reviewReason;
  }

  if (item.communicationNeedsResponse) {
    if (item.communicationSummary?.responseDelayed || item.communicationSummary?.delayedResponse) {
      return `Patient communication has exceeded the ${item.communicationSummary.responseDelayHours ?? 'configured'} hour response target.`;
    }
    if (item.communicationSummary?.reviewedAfterLatestInbound) {
      return 'The latest patient message has been reviewed and still needs follow-up.';
    }
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

  if ((item.proms?.dueCount ?? 0) > 0) {
    if ((item.proms?.overdueCount ?? 0) > 0) {
      return 'Recovery questionnaires are still due and include overdue follow-through.';
    }

    return 'Recovery questionnaires are due and ready for clinician follow-through.';
  }

  return 'Monitor recovery progress and recent operational context.';
}

export type WorklistPrimaryActionKind =
  | 'patient'
  | 'communication'
  | 'alerts'
  | 'appointments';

export function getWorklistPrimaryAction(item: WorklistRecord): {
  kind: WorklistPrimaryActionKind;
  label: string;
} {
  if (item.openAlertsCount > 0) {
    return { kind: 'alerts', label: 'Open alerts' };
  }

  if (item.communicationNeedsResponse) {
    return { kind: 'communication', label: 'Open communication' };
  }

  if (
    item.nextAppointmentAt &&
    item.activeTaskCount === 0 &&
    !item.missedCheckins.flag &&
    (item.proms?.dueCount ?? 0) === 0
  ) {
    return { kind: 'appointments', label: 'Open appointments' };
  }

  return { kind: 'patient', label: 'Open patient' };
}

export function getWorklistTruthChips(item: WorklistRecord): ClinicianTruthChip[] {
  const chips: ClinicianTruthChip[] = [];

  if (item.communicationSummary?.responseDelayed || item.communicationSummary?.delayedResponse) {
    chips.push({
      label: 'Response delayed',
      variant: 'warning',
      truth: 'server',
    });
  } else if (item.communicationSummary?.reviewedAfterLatestInbound) {
    chips.push({
      label: 'Reviewed',
      variant: 'info',
      truth: 'server',
    });
  }

  if ((item.communicationSummary?.flaggedBySafetyCount ?? 0) > 0) {
    chips.push({
      label: 'Safety flagged',
      variant: 'danger',
      truth: 'server',
    });
  }

  if (item.communicationSummary?.responseDueAt) {
    const dueAt = new Date(item.communicationSummary.responseDueAt);
    chips.push({
      label: `Due by ${dueAt.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })}`,
      variant: 'neutral',
      truth: 'server',
    });
  }

  if (item.openAlertsCount > 0) {
    chips.push({
      label: `${item.openAlertsCount} open alert${item.openAlertsCount === 1 ? '' : 's'}`,
      variant: 'danger',
      truth: 'server',
    });
  }

  return chips;
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
