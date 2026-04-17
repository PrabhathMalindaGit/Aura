import type { ClinicianTruthChip } from '../../components/clinician/ClinicianTruthChips';
import {
  asPainText,
  buildFollowThroughSummary,
  formatPromBadgeLabel,
  getQueueLeadSignal,
  type QueueLeadSignal,
} from '../../components/worklist/presentation';
import type { WorklistRecord } from '../../types/models';
import { formatDashboardDateTime, formatDashboardRelativeTime, humanizeDashboardLabel } from '../../utils/dashboard';
import {
  formatExercisesPct,
  getWorklistPrimaryAction,
  getWorklistReviewLabel,
  getWorklistReviewSupport,
  getWorklistTruthChips,
  worklistPriorityLabel,
  worklistPriorityTone,
  type WorklistFilters,
  type WorklistPrimaryActionKind,
} from '../../utils/worklist';
import type { ProvenanceSource } from './viewModels';

export type TriageBadgeTone = 'neutral' | 'info' | 'warning' | 'critical';
export type TriageStatusTone = 'neutral' | 'success' | 'warning';

export interface TriageSignalChipVm {
  label: string;
  tone: TriageBadgeTone;
  source: 'server' | 'local';
}

export interface TriageActionVm {
  key: string;
  kind: WorklistPrimaryActionKind | 'patient';
  label: string;
}

export interface TriageMetricVm {
  label: string;
  value: string;
  tone?: TriageBadgeTone;
}

export interface TriageQueueRowVm {
  key: string;
  patientId: string;
  patientName: string;
  statusLabel: string;
  statusTone: TriageStatusTone;
  rehabPhase?: string;
  priorityLabel: string;
  priorityTone: TriageBadgeTone;
  whyNow: string;
  freshnessLine: string;
  freshnessTitle: string;
  leadSignal: QueueLeadSignal;
  supportingChips: TriageSignalChipVm[];
}

export interface TriageWorkspaceVm {
  patientId: string;
  patientName: string;
  patientIdLabel: string;
  statusLabel: string;
  statusTone: TriageStatusTone;
  rehabPhase?: string;
  priorityLabel: string;
  priorityTone: TriageBadgeTone;
  leadSignal: QueueLeadSignal;
  whyNowTitle: string;
  whyNowSupport: string;
  updatedLabel: string;
  updatedTitle: string;
  lastCheckinLabel: string;
  lastCheckinTitle: string;
  changeMetrics: TriageMetricVm[];
  supportingSignals: string[];
  truthChips: TriageSignalChipVm[];
  primaryAction: TriageActionVm;
  secondaryActions: TriageActionVm[];
}

export interface TriageGovernanceVm {
  provenance: ProvenanceSource[];
  lastReviewedBy: string | null;
  lastReviewedAt: string | null;
  responseTarget: string | null;
  thresholdContext: string | null;
  queuePrioritySource: string;
  queuePriorityBasis: string[];
  evidenceSummary: string[];
}

export interface TriageCaseVm {
  key: string;
  record: WorklistRecord;
  row: TriageQueueRowVm;
  workspace: TriageWorkspaceVm;
  governance: TriageGovernanceVm;
}

export function buildTriageCaseKey(item: WorklistRecord, index: number): string {
  const patientId = item.patientId.trim();
  const patientName = item.patientName.trim();

  if (patientId) {
    return patientId;
  }

  if (patientName) {
    return `${patientName.toLowerCase()}-${item.updatedAt}`;
  }

  return `queue-row-${index}`;
}

function mapTruthChipTone(chip: ClinicianTruthChip): TriageBadgeTone {
  if (chip.variant === 'danger') {
    return 'critical';
  }

  if (chip.variant === 'warning') {
    return 'warning';
  }

  if (chip.variant === 'info') {
    return 'info';
  }

  return 'neutral';
}

function mapPriorityTone(item: WorklistRecord): TriageBadgeTone {
  const tone = worklistPriorityTone(item);

  if (tone === 'risk-high') {
    return 'critical';
  }

  if (tone === 'warning') {
    return 'warning';
  }

  return 'neutral';
}

function mapStatusTone(status: WorklistRecord['patientStatus']): TriageStatusTone {
  if (status === 'active') {
    return 'success';
  }

  if (status === 'on_hold') {
    return 'warning';
  }

  return 'neutral';
}

function mapLeadSignalTone(signal: QueueLeadSignal): TriageBadgeTone {
  if (signal.tone === 'high-risk' || signal.tone === 'alerts') {
    return 'critical';
  }

  if (signal.tone === 'response' || signal.tone === 'follow-through') {
    return 'warning';
  }

  return 'neutral';
}

function formatMedicationTaken(value: boolean | undefined): string {
  if (typeof value !== 'boolean') {
    return '—';
  }

  return value ? 'Taken' : 'Missed';
}

function buildFreshness(item: WorklistRecord): {
  line: string;
  title: string;
} {
  const lineParts = [
    `Updated ${formatDashboardRelativeTime(item.updatedAt)}`,
    item.lastCheckinAt ? `Last check-in ${formatDashboardRelativeTime(item.lastCheckinAt)}` : null,
    item.communicationSummary?.responseDueAt
      ? `Due ${formatDashboardDateTime(item.communicationSummary.responseDueAt)}`
      : null,
  ].filter(Boolean) as string[];

  const titleParts = [
    `Updated ${formatDashboardDateTime(item.updatedAt)}`,
    item.lastCheckinAt ? `Last check-in ${formatDashboardDateTime(item.lastCheckinAt)}` : null,
    item.communicationSummary?.responseDueAt
      ? `Response due ${formatDashboardDateTime(item.communicationSummary.responseDueAt)}`
      : null,
  ].filter(Boolean) as string[];

  return {
    line: lineParts.join(' · '),
    title: titleParts.join(' · '),
  };
}

function buildProvenance(item: WorklistRecord): ProvenanceSource[] {
  const provenance = new Set<ProvenanceSource>();

  if (
    item.lastCheckinAt ||
    item.communicationNeedsResponse ||
    item.communicationSummary ||
    item.missedCheckins.flag ||
    (item.proms?.dueCount ?? 0) > 0
  ) {
    provenance.add('patient-reported');
  }

  if (
    item.thresholdSummary?.configured ||
    item.thresholdSummary?.updatedBy ||
    item.communicationSummary?.lastReviewedAt ||
    item.communicationSummary?.lastReviewedBy
  ) {
    provenance.add('clinician-entered');
  }

  if (provenance.size === 0) {
    provenance.add('unknown');
  }

  return Array.from(provenance);
}

function buildThresholdContext(item: WorklistRecord): string | null {
  const thresholdSummary = item.thresholdSummary;

  if (!thresholdSummary?.configured) {
    return null;
  }

  return [
    `Pain threshold ${thresholdSummary.painHighThreshold}/10`,
    `Missed check-ins after ${thresholdSummary.missedCheckinDays} day${thresholdSummary.missedCheckinDays === 1 ? '' : 's'}`,
    `Response target ${thresholdSummary.responseDelayHours}h`,
  ].join(' · ');
}

function buildResponseTarget(item: WorklistRecord): string | null {
  if (item.communicationSummary?.responseDueAt) {
    return `Due ${formatDashboardDateTime(item.communicationSummary.responseDueAt)}`;
  }

  if (item.communicationSummary?.responseDelayHours) {
    return `Response target ${item.communicationSummary.responseDelayHours}h`;
  }

  return null;
}

function buildPriorityBasis(item: WorklistRecord): string[] {
  const promBadgeLabel = formatPromBadgeLabel(item);
  const basis: string[] = [];

  if (item.latestRiskLevel === 'high') {
    basis.push('High risk signal');
  }

  if (item.communicationNeedsResponse) {
    basis.push(
      item.communicationSummary?.responseDelayed || item.communicationSummary?.delayedResponse
        ? `Response delayed (${item.communicationSummary?.responseAgeHours ?? '—'}h)`
        : 'Needs response',
    );
  }

  if (item.openAlertsCount > 0) {
    basis.push(`${item.openAlertsCount} open alert${item.openAlertsCount === 1 ? '' : 's'}`);
  }

  if (item.activeTaskCount > 0) {
    basis.push(`${item.activeTaskCount} active task${item.activeTaskCount === 1 ? '' : 's'}`);
  }

  if (item.missedCheckins.flag) {
    basis.push(`Missed ${item.missedCheckins.count} check-in${item.missedCheckins.count === 1 ? '' : 's'}`);
  }

  if (promBadgeLabel) {
    basis.push(promBadgeLabel);
  }

  if (item.nextAppointmentAt) {
    basis.push('Upcoming appointment context');
  }

  if (basis.length === 0) {
    basis.push('Monitor recovery progress');
  }

  return basis;
}

function buildSupportingSignals(item: WorklistRecord): string[] {
  const promBadgeLabel = formatPromBadgeLabel(item);
  const followThroughSummary = buildFollowThroughSummary(item, promBadgeLabel);
  const signals: string[] = [];

  if (followThroughSummary.length > 0) {
    signals.push(followThroughSummary.join(' · '));
  }

  if (item.communicationSummary?.reviewedAfterLatestInbound) {
    signals.push('Latest inbound message was reviewed and still needs follow-up.');
  }

  if (item.communicationSummary?.flaggedBySafetyCount) {
    signals.push(
      `${item.communicationSummary.flaggedBySafetyCount} safety-flagged message${item.communicationSummary.flaggedBySafetyCount === 1 ? '' : 's'}.`,
    );
  }

  if (item.thresholdSummary?.configured) {
    signals.push(`Pain threshold marker ${item.thresholdSummary.painHighThreshold}/10 is configured.`);
  }

  if (signals.length === 0) {
    signals.push('No additional supporting context is active in the current queue.');
  }

  return signals;
}

function buildChangeMetrics(item: WorklistRecord): TriageMetricVm[] {
  const metrics: TriageMetricVm[] = [
    {
      label: 'Pain score',
      value: asPainText(item.lastPainScore),
      tone:
        typeof item.lastPainScore === 'number' &&
        typeof item.thresholdSummary?.painHighThreshold === 'number' &&
        item.lastPainScore >= item.thresholdSummary.painHighThreshold
          ? 'critical'
          : 'neutral',
    },
    {
      label: 'Exercises',
      value: formatExercisesPct(item.adherenceSummary.exercisesPct),
    },
    {
      label: 'Medication',
      value: formatMedicationTaken(item.adherenceSummary.medicationTaken),
      tone:
        item.adherenceSummary.medicationTaken === false ? 'warning' : 'neutral',
    },
    {
      label: 'PROMs',
      value: formatPromBadgeLabel(item) ?? 'None due',
      tone: (item.proms?.overdueCount ?? 0) > 0 ? 'warning' : 'neutral',
    },
    {
      label: 'Alerts',
      value:
        item.openAlertsCount > 0
          ? `${item.openAlertsCount} open`
          : 'None open',
      tone: item.openAlertsCount > 0 ? 'critical' : 'neutral',
    },
  ];

  if (item.communicationNeedsResponse) {
    metrics.push({
      label: 'Response',
      value:
        item.communicationSummary?.responseDelayed || item.communicationSummary?.delayedResponse
          ? `Delayed ${item.communicationSummary?.responseAgeHours ?? '—'}h`
          : item.communicationSummary?.responseDueAt
            ? `Due ${formatDashboardDateTime(item.communicationSummary.responseDueAt)}`
            : 'Needs response',
      tone:
        item.communicationSummary?.responseDelayed || item.communicationSummary?.delayedResponse
          ? 'critical'
          : 'warning',
    });
  }

  if (item.missedCheckins.flag) {
    metrics.push({
      label: 'Check-ins',
      value: `Missed ${item.missedCheckins.count}`,
      tone: 'warning',
    });
  }

  if (item.nextAppointmentAt) {
    metrics.push({
      label: 'Appointment',
      value: formatDashboardDateTime(item.nextAppointmentAt),
    });
  }

  if (item.thresholdSummary?.configured) {
    metrics.push({
      label: 'Threshold',
      value: `${item.thresholdSummary.painHighThreshold}/10`,
      tone: 'info',
    });
  }

  return metrics;
}

function buildSecondaryActions(
  item: WorklistRecord,
  primaryAction: ReturnType<typeof getWorklistPrimaryAction>,
): TriageActionVm[] {
  const patientId = item.patientId.trim();
  const actions: TriageActionVm[] = [];

  if (patientId && primaryAction.kind !== 'patient') {
    actions.push({
      key: 'patient',
      kind: 'patient',
      label: 'Open patient',
    });
  }

  if (patientId && item.communicationNeedsResponse && primaryAction.kind !== 'communication') {
    actions.push({
      key: 'communication',
      kind: 'communication',
      label: 'Open communication',
    });
  }

  if (item.openAlertsCount > 0 && primaryAction.kind !== 'alerts') {
    actions.push({
      key: 'alerts',
      kind: 'alerts',
      label: 'Open alerts',
    });
  }

  if (item.nextAppointmentAt && primaryAction.kind !== 'appointments') {
    actions.push({
      key: 'appointments',
      kind: 'appointments',
      label: 'Open appointments',
    });
  }

  return actions;
}

function buildSignalChips(item: WorklistRecord): TriageSignalChipVm[] {
  return getWorklistTruthChips(item)
    .slice(0, 2)
    .map((chip) => ({
      label: chip.label,
      tone: mapTruthChipTone(chip),
      source: chip.truth,
    }));
}

function buildStatusLabel(item: WorklistRecord): string {
  return humanizeDashboardLabel(item.patientStatus);
}

export function countActiveWorklistFilters(filters: WorklistFilters): number {
  let count = 0;

  if (filters.search.trim()) {
    count += 1;
  }

  if (filters.highRiskOnly) {
    count += 1;
  }

  if (filters.hasOpenAlerts) {
    count += 1;
  }

  if (filters.needsResponse) {
    count += 1;
  }

  if (filters.missedCheckins) {
    count += 1;
  }

  if (filters.needsPromReview) {
    count += 1;
  }

  if (filters.assignedToMe) {
    count += 1;
  }

  if (filters.status !== 'all') {
    count += 1;
  }

  return count;
}

export function describeWorklistQueueScope(filters: WorklistFilters): string {
  if (filters.highRiskOnly) {
    return 'High-risk view active';
  }

  if (filters.needsResponse) {
    return 'Needs-response view active';
  }

  if (filters.hasOpenAlerts) {
    return 'Alert-focused view active';
  }

  if (filters.assignedToMe) {
    return 'Assigned-to-me view active';
  }

  if (filters.missedCheckins) {
    return 'Missed check-ins view active';
  }

  if (filters.needsPromReview) {
    return 'PROM review view active';
  }

  if (filters.status !== 'all') {
    return `${humanizeDashboardLabel(filters.status)} patients in view`;
  }

  if (filters.search.trim()) {
    return 'Search view active';
  }

  return 'Full review queue';
}

export function buildWorklistQueueGuidance(
  items: WorklistRecord[],
  activeFilterConstraints: boolean,
): string {
  const summary = {
    highRisk: items.filter((item) => item.latestRiskLevel === 'high').length,
    needsResponse: items.filter((item) => item.communicationNeedsResponse).length,
    openAlerts: items.filter((item) => item.openAlertsCount > 0).length,
  };

  if (items.length === 0) {
    return activeFilterConstraints
      ? 'No patients match this current queue view.'
      : 'Active review is clear right now.';
  }

  if (summary.highRisk > 0) {
    return 'High-risk review still leads this current queue.';
  }

  if (summary.needsResponse > 0) {
    return 'Response follow-up still leads this current queue.';
  }

  if (summary.openAlerts > 0) {
    return 'Alert-linked review still remains in this current queue.';
  }

  return 'Continue with the next patient in this queue.';
}

export function buildTriageCases(items: WorklistRecord[]): TriageCaseVm[] {
  return items.map((item, index) => {
    const key = buildTriageCaseKey(item, index);
    const reviewLabel = getWorklistReviewLabel(item);
    const reviewSupport = getWorklistReviewSupport(item);
    const truthChips = buildSignalChips(item);
    const promBadgeLabel = formatPromBadgeLabel(item);
    const leadSignal = getQueueLeadSignal(item, promBadgeLabel);
    const freshness = buildFreshness(item);
    const priorityLabel = worklistPriorityLabel(item);
    const priorityTone = mapPriorityTone(item);
    const primaryAction = getWorklistPrimaryAction(item);

    return {
      key,
      record: item,
      row: {
        key,
        patientId: item.patientId,
        patientName: item.patientName?.trim() || item.patientId,
        statusLabel: buildStatusLabel(item),
        statusTone: mapStatusTone(item.patientStatus),
        rehabPhase: item.rehabPhase,
        priorityLabel,
        priorityTone,
        whyNow: reviewLabel,
        freshnessLine: freshness.line,
        freshnessTitle: freshness.title,
        leadSignal,
        supportingChips: truthChips,
      },
      workspace: {
        patientId: item.patientId.trim(),
        patientName: item.patientName?.trim() || item.patientId,
        patientIdLabel: item.patientId.trim() ? `ID: ${item.patientId.trim()}` : 'ID: Unknown',
        statusLabel: buildStatusLabel(item),
        statusTone: mapStatusTone(item.patientStatus),
        rehabPhase: item.rehabPhase,
        priorityLabel,
        priorityTone,
        leadSignal,
        whyNowTitle: reviewLabel,
        whyNowSupport: reviewSupport,
        updatedLabel: formatDashboardRelativeTime(item.updatedAt),
        updatedTitle: formatDashboardDateTime(item.updatedAt),
        lastCheckinLabel: formatDashboardRelativeTime(item.lastCheckinAt),
        lastCheckinTitle: formatDashboardDateTime(item.lastCheckinAt),
        changeMetrics: buildChangeMetrics(item),
        supportingSignals: buildSupportingSignals(item),
        truthChips,
        primaryAction: {
          key: primaryAction.kind,
          kind: primaryAction.kind,
          label: primaryAction.label,
        },
        secondaryActions: buildSecondaryActions(item, primaryAction),
      },
      governance: {
        provenance: buildProvenance(item),
        lastReviewedBy:
          item.communicationSummary?.lastReviewedBy?.displayName?.trim() ||
          item.communicationSummary?.lastReviewedBy?.clinicianId?.trim() ||
          null,
        lastReviewedAt: item.communicationSummary?.lastReviewedAt
          ? formatDashboardDateTime(item.communicationSummary.lastReviewedAt)
          : null,
        responseTarget: buildResponseTarget(item),
        thresholdContext: buildThresholdContext(item),
        queuePrioritySource: 'Server-calculated',
        queuePriorityBasis: buildPriorityBasis(item),
        evidenceSummary: [
          reviewSupport,
          ...buildSupportingSignals(item),
        ],
      },
    };
  });
}

export function formatQueueStatusLabel(value: string): string {
  return humanizeDashboardLabel(value);
}

export function getLeadSignalTone(signal: QueueLeadSignal): TriageBadgeTone {
  return mapLeadSignalTone(signal);
}
