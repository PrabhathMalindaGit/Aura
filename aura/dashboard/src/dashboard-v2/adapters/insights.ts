import type {
  InsightConfidence,
  InsightItem,
  InsightStatus,
  PatientSummary,
} from '../../types/models';
import { formatExactTime, formatRelativeTime } from '../../utils/time';

export type InsightsView = 'pending' | 'approved' | 'rejected';
export type InsightsBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'critical' | 'unknown';

export interface InsightsWorkspaceState {
  activeView: InsightsView;
}

export interface InsightsStatusOptionVm {
  id: InsightsView;
  label: string;
  count: number;
}

export interface InsightsStatusBarVm {
  title: string;
  description: string;
  guidanceLine: string;
  viewLabel: string;
  facts: Array<{ key: string; label: string; value: string }>;
  statusOptions: InsightsStatusOptionVm[];
}

export interface InsightQueueRowVm {
  key: string;
  insightId: string;
  patientId: string;
  patientName: string;
  title: string;
  messagePreview: string;
  categoryLabel: string;
  confidenceLabel: string;
  confidenceTone: InsightsBadgeTone;
  priorityLabel: string;
  priorityTone: InsightsBadgeTone;
  statusLabel: string;
  statusTone: InsightsBadgeTone;
  supportLine: string;
  createdLabel: string;
  createdTitle: string;
  selectable: boolean;
}

export interface InsightQueueSectionVm {
  key: string;
  title: string;
  description: string;
  rows: InsightQueueRowVm[];
  selectable: boolean;
}

export interface InsightReviewHeaderVm {
  insightId: string;
  patientId: string;
  patientName: string;
  patientStatusLabel: string;
  title: string;
  statusLabel: string;
  statusTone: InsightsBadgeTone;
  categoryLabel: string;
  confidenceLabel: string;
  confidenceTone: InsightsBadgeTone;
  priorityLabel: string;
  priorityTone: InsightsBadgeTone;
  reviewWindowLabel: string;
  createdLabel: string;
  createdTitle: string;
  reviewedLabel: string;
}

export interface InsightReviewSummaryVm {
  title: string;
  summary: string;
  supportingFacts: Array<{ label: string; value: string }>;
  basisItems: string[];
}

export interface InsightsGovernanceVm {
  patientTitle: string;
  patientSubtitle: string;
  patientFacts: Array<{ label: string; value: string }>;
  reviewFacts: Array<{ label: string; value: string }>;
  supportFacts: Array<{ label: string; value: string }>;
  explanation: string;
}

export interface InsightsOutcomeVm {
  kind: 'single' | 'batch';
  tone: 'success' | 'warning';
  title: string;
  message: string;
  ctaLabel?: string;
}

export function categoryLabel(value: string): string {
  if (value === 'questionnaires') {
    return 'Questionnaires';
  }
  if (value === 'recovery') {
    return 'Recovery';
  }
  if (value === 'adherence') {
    return 'Adherence';
  }
  if (value === 'safety') {
    return 'Safety';
  }
  if (value === 'symptoms') {
    return 'Symptoms';
  }
  return 'Habits';
}

export function defaultInsightsWorkspaceState(): InsightsWorkspaceState {
  return {
    activeView: 'pending',
  };
}

export function normalizeInsightsWorkspaceState(value: unknown): InsightsWorkspaceState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaultInsightsWorkspaceState();
  }

  const candidate = value as Partial<InsightsWorkspaceState>;
  return {
    activeView:
      candidate.activeView === 'approved' || candidate.activeView === 'rejected'
        ? candidate.activeView
        : 'pending',
  };
}

export function formatInsightsLastUpdated(lastSuccessAt: number | null): string {
  if (!lastSuccessAt) {
    return '--';
  }

  return new Date(lastSuccessAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function insightPatientName(item: InsightItem, patient: PatientSummary | null): string {
  const displayName = patient?.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  return item.patientDisplayName?.trim() || `Patient ${item.patientId}`;
}

function insightStatusLabel(status: InsightStatus): string {
  if (status === 'approved') {
    return 'Approved';
  }
  if (status === 'rejected') {
    return 'Rejected';
  }
  return 'Pending';
}

function insightStatusTone(status: InsightStatus): InsightsBadgeTone {
  if (status === 'approved') {
    return 'success';
  }
  if (status === 'rejected') {
    return 'unknown';
  }
  return 'warning';
}

function confidenceTone(confidence: InsightConfidence): InsightsBadgeTone {
  if (confidence === 'high') {
    return 'info';
  }
  if (confidence === 'medium') {
    return 'neutral';
  }
  return 'unknown';
}

function priorityTone(priority: number): InsightsBadgeTone {
  if (priority > 1) {
    return 'warning';
  }
  return 'neutral';
}

function prioritySupportLabel(priority: number): string {
  return priority > 1 ? 'Priority review' : 'Routine batch review';
}

function reviewedLabel(item: InsightItem): string {
  if (!item.reviewedAt) {
    return 'Unreviewed';
  }

  return formatExactTime(item.reviewedAt);
}

export function buildInsightQueueRow(
  item: InsightItem,
  patient: PatientSummary | null,
): InsightQueueRowVm {
  const createdLabel = formatRelativeTime(item.createdAt);
  const supportLine =
    item.status === 'pending'
      ? item.priority > 1
        ? `Individual review required in this ${item.windowDays}-day follow-up window.`
        : `Routine follow-up can stay in list-scoped batch review for this ${item.windowDays}-day window.`
      : item.status === 'approved'
        ? `Reviewed ${reviewedLabel(item)} and surfaced into workflow.`
        : `Reviewed ${reviewedLabel(item)} and kept out of workflow.`;

  return {
    key: `${item.status}-${item.id}`,
    insightId: item.id,
    patientId: item.patientId,
    patientName: insightPatientName(item, patient),
    title: item.title,
    messagePreview: item.message,
    categoryLabel: categoryLabel(item.category),
    confidenceLabel: item.confidence,
    confidenceTone: confidenceTone(item.confidence),
    priorityLabel: `Priority ${item.priority}`,
    priorityTone: priorityTone(item.priority),
    statusLabel: insightStatusLabel(item.status),
    statusTone: insightStatusTone(item.status),
    supportLine,
    createdLabel,
    createdTitle: formatExactTime(item.createdAt),
    selectable: item.status === 'pending' && item.priority <= 1,
  };
}

export function buildInsightsStatusBar(params: {
  activeView: InsightsView;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  individualPendingCount: number;
  batchablePendingCount: number;
  updatedAtLabel: string;
}): InsightsStatusBarVm {
  const statusOptions: InsightsStatusOptionVm[] = [
    { id: 'pending', label: 'Pending', count: params.pendingCount },
    { id: 'approved', label: 'Approved', count: params.approvedCount },
    { id: 'rejected', label: 'Rejected', count: params.rejectedCount },
  ];

  const viewLabel =
    params.activeView === 'approved'
      ? 'Approved follow-up'
      : params.activeView === 'rejected'
        ? 'Rejected follow-up'
        : 'Pending follow-up';

  const guidanceLine =
    params.activeView === 'pending'
      ? params.individualPendingCount > 0
        ? `${params.individualPendingCount} suggestion${params.individualPendingCount === 1 ? '' : 's'} still need individual review before routine batching.`
        : params.batchablePendingCount > 0
          ? `${params.batchablePendingCount} low-priority suggestion${params.batchablePendingCount === 1 ? '' : 's'} can move through list-scoped batch review when deeper handling is not needed.`
          : 'No pending follow-up suggestions are waiting right now.'
      : params.activeView === 'approved'
        ? `${params.approvedCount} approved suggestion${params.approvedCount === 1 ? '' : 's'} remain visible for quiet review and onward routing.`
        : `${params.rejectedCount} rejected suggestion${params.rejectedCount === 1 ? '' : 's'} remain visible for quiet review and onward routing.`;

  return {
    title: 'Follow-up insights',
    description: 'Review supported follow-up suggestions without turning the route into a general analytics surface.',
    guidanceLine,
    viewLabel,
    facts: [
      { key: 'pending', label: 'Pending', value: String(params.pendingCount) },
      { key: 'approved', label: 'Approved', value: String(params.approvedCount) },
      { key: 'rejected', label: 'Rejected', value: String(params.rejectedCount) },
      { key: 'updated', label: 'Updated', value: params.updatedAtLabel },
    ],
    statusOptions,
  };
}

export function buildInsightReviewHeader(
  item: InsightItem,
  patient: PatientSummary | null,
): InsightReviewHeaderVm {
  return {
    insightId: item.id,
    patientId: item.patientId,
    patientName: insightPatientName(item, patient),
    patientStatusLabel: patient?.status ? patient.status.replace('_', ' ') : 'Unknown',
    title: item.title,
    statusLabel: insightStatusLabel(item.status),
    statusTone: insightStatusTone(item.status),
    categoryLabel: categoryLabel(item.category),
    confidenceLabel: item.confidence,
    confidenceTone: confidenceTone(item.confidence),
    priorityLabel: `Priority ${item.priority}`,
    priorityTone: priorityTone(item.priority),
    reviewWindowLabel: `${item.windowDays}-day window`,
    createdLabel: formatRelativeTime(item.createdAt),
    createdTitle: formatExactTime(item.createdAt),
    reviewedLabel: item.reviewedAt ? formatExactTime(item.reviewedAt) : 'Unreviewed',
  };
}

export function buildInsightReviewSummary(item: InsightItem): InsightReviewSummaryVm {
  const title = item.status === 'pending' ? 'Why this needs follow-up' : 'Review snapshot';
  const basisItems = [
    `Category: ${categoryLabel(item.category)}`,
    `Confidence is recorded as ${item.confidence}.`,
    `The recorded review window is ${item.windowDays} days.`,
  ];

  if (item.status === 'approved') {
    basisItems.push('This suggestion is already surfaced into workflow in the current route state.');
  } else if (item.status === 'rejected') {
    basisItems.push('This suggestion is already kept out of workflow in the current route state.');
  } else if (item.priority <= 1) {
    basisItems.push('This item remains eligible for list-scoped batch review while it stays visible.');
  } else {
    basisItems.push('This item remains in individual review because its recorded priority is above the batchable threshold.');
  }

  return {
    title,
    summary: item.message,
    supportingFacts: [
      { label: 'Category', value: categoryLabel(item.category) },
      { label: 'Confidence', value: item.confidence },
      { label: 'Priority', value: String(item.priority) },
      { label: 'Review window', value: `${item.windowDays} days` },
    ],
    basisItems,
  };
}

function formatPatientFactValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return 'Unknown';
  }

  return String(value);
}

export function buildInsightsGovernance(
  item: InsightItem,
  patient: PatientSummary | null,
): InsightsGovernanceVm {
  return {
    patientTitle: insightPatientName(item, patient),
    patientSubtitle: item.patientId,
    patientFacts: [
      { label: 'Patient status', value: formatPatientFactValue(patient?.status) },
      {
        label: 'Last check-in',
        value: patient?.lastCheckinAt ? formatExactTime(patient.lastCheckinAt) : 'Unknown',
      },
      { label: 'Open alerts', value: formatPatientFactValue(patient?.openAlertCount) },
      {
        label: 'Last pain',
        value: patient?.lastPain !== undefined ? String(patient.lastPain) : 'Unknown',
      },
    ],
    reviewFacts: [
      { label: 'Lifecycle', value: insightStatusLabel(item.status) },
      { label: 'Created', value: formatExactTime(item.createdAt) },
      { label: 'Reviewed', value: item.reviewedAt ? formatExactTime(item.reviewedAt) : 'Unreviewed' },
      { label: 'Confidence', value: item.confidence },
    ],
    supportFacts: [
      { label: 'Category', value: categoryLabel(item.category) },
      { label: 'Review window', value: `${item.windowDays} days` },
      { label: 'Queue treatment', value: prioritySupportLabel(item.priority) },
      { label: 'Priority', value: String(item.priority) },
    ],
    explanation:
      'This route shows only the supported follow-up metadata carried by the current insight queue and linked patient summary. Unsupported provenance stays omitted.',
  };
}

export function buildInsightsOutcome(params: {
  kind: 'single' | 'batch';
  status: 'approved' | 'rejected';
  successCount?: number;
  title?: string;
  patientName?: string;
}): InsightsOutcomeVm {
  if (params.kind === 'batch') {
    return {
      kind: 'batch',
      tone: params.status === 'approved' ? 'success' : 'warning',
      title: params.status === 'approved' ? 'Batch approved' : 'Batch rejected',
      message: `${params.successCount ?? 0} low-priority suggestion${params.successCount === 1 ? '' : 's'} ${params.status === 'approved' ? 'moved into workflow.' : 'stayed out of workflow.'}`,
      ctaLabel: params.status === 'approved' ? 'View approved' : 'View rejected',
    };
  }

  return {
    kind: 'single',
    tone: params.status === 'approved' ? 'success' : 'warning',
    title: params.status === 'approved' ? 'Suggestion approved' : 'Suggestion rejected',
    message: `${params.patientName ?? 'Patient'} · ${params.title ?? 'Insight'} ${params.status === 'approved' ? 'surfaced into workflow.' : 'stayed out of workflow.'}`,
    ctaLabel: params.status === 'approved' ? 'View approved' : 'View rejected',
  };
}
