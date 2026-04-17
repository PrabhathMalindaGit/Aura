import type {
  AlertItem,
  AppointmentRequestItem,
  CheckinAdaptationDecision,
  CheckinAdaptationHistoryEntry,
  ClinicianCoordinationRecord,
  ClinicianTaskItem,
  DashboardCommunicationOverviewItem,
  ExerciseSessionListItem,
  InsightItem,
  PatientRecoverySupportConfig,
  PatientStatus,
  PatientSummary,
  PatientThresholdConfig,
  PromDueCard,
  PromHistoryRow,
  RehabPayload,
  SafetyAuditEntry,
  TrendSummaryMetrics,
  WorklistRecord,
} from '../../types/models';
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../../utils/dashboard';
import {
  formatPatientEntryReturnLabel,
  formatPatientEntrySourceCue,
  type PatientEntryContext,
} from '../../utils/patientEntryContext';
import type { DashboardV2MetadataItem } from '../patterns/MetadataList';
import type { ProvenanceSource } from './viewModels';

export type PatientWorkspaceTabId = 'overview' | 'communications' | 'guidance' | 'history';
export type PatientWorkspaceActionId =
  | 'alerts'
  | 'communication'
  | 'tasks'
  | 'appointments'
  | 'worklist'
  | 'plan'
  | 'history';
export type TemporaryFullFlowOption = 'off' | '3d' | '7d';

export interface PatientWorkspaceNavLinkVm {
  id: PatientWorkspaceTabId;
  label: string;
  to: string;
}

export interface PatientWorkspaceHeaderVm {
  returnTo: string;
  returnLabel: string;
  sourceCue: string | null;
  patientName: string;
  patientId: string;
  statusLabel: string;
  statusTone: 'success' | 'warning' | 'critical' | 'neutral';
  rehabPhaseLabel: string | null;
  lastActivityLabel: string;
  lastActivityTitle?: string;
  reviewWindowLabel: string;
  facts: Array<{ label: string; value: string; note: string }>;
  navLinks: PatientWorkspaceNavLinkVm[];
}

export interface PatientWorkspaceDecisionStripVm {
  scopeLabel: string;
  whyNowTitle: string;
  whyNowBody: string;
  attentionLine: string;
  facts: Array<{ label: string; value: string; note: string }>;
  actions: Array<{ id: PatientWorkspaceActionId; label: string }>;
}

export interface PatientTrajectoryVm {
  headline: string;
  summary: string;
  statusTone: 'success' | 'warning' | 'critical' | 'neutral';
}

export interface PatientWorkspaceOverviewVm {
  freshnessLabel: string | null;
  reviewWindowItems: Array<{ label: string; value: string; note: string }>;
  trajectory: PatientTrajectoryVm;
  followThroughDigest: Array<{ label: string; value: string; text: string }>;
  guidanceDigest: Array<{ label: string; value: string; text: string }>;
}

export interface PatientWorkspaceCommunicationsVm {
  freshnessLabel: string | null;
  serverTruthNote: string;
  localTruthNote: string;
}

export interface PatientWorkspaceGuidanceVm {
  freshnessLabel: string | null;
  rehabSummary: string;
  promSummary: string;
  insightSummary: string;
  recoverySupportSummary: string;
}

export interface PatientWorkspaceHistoryVm {
  freshnessLabel: string | null;
  summaryItems: Array<{ label: string; value: string; note: string }>;
}

export interface PatientWorkspaceGovernanceVm {
  workflowFacts: DashboardV2MetadataItem[];
  governanceFacts: DashboardV2MetadataItem[];
  thresholdFacts: DashboardV2MetadataItem[];
  provenance: ProvenanceSource[];
  explanation: string;
}

export interface BuildPatientWorkspaceHeaderInput {
  patientId: string;
  patient: PatientSummary | null;
  entryContext: PatientEntryContext | null;
  worklistItem: WorklistRecord | null;
  currentRehabPhaseTitle: string | null;
  lastActivityAt: string | null;
  selectedDays: 14 | 30;
  navLinks: PatientWorkspaceNavLinkVm[];
  openAlertCount: number;
  followUpCount: number;
  nextAppointment: AppointmentRequestItem | null;
}

export interface BuildPatientWorkspaceDecisionStripInput {
  scopeLabel: string;
  worklistItem: WorklistRecord | null;
  latestOpenAlertReason: string | null;
  latestPain: number | null;
  adherence7d: number | null;
  reviewHint: string | null;
  actions: Array<{ id: PatientWorkspaceActionId; label: string }>;
  facts: Array<{ label: string; value: string; note: string }>;
}

export function parsePatientWorkspaceDays(value: string | null): 14 | 30 {
  return value === '30' ? 30 : 14;
}

export function buildPatientWorkspacePath(
  patientId: string,
  tabId: PatientWorkspaceTabId,
): string {
  return `/patients/${encodeURIComponent(patientId)}/${tabId}`;
}

export function getPatientWorkspaceTabFromPath(pathname: string): PatientWorkspaceTabId {
  const segments = pathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1];

  if (
    lastSegment === 'communications' ||
    lastSegment === 'guidance' ||
    lastSegment === 'history' ||
    lastSegment === 'overview'
  ) {
    return lastSegment;
  }

  return 'overview';
}

export function formatCountLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatAlertReasonText(reason: AlertItem['reason']): string {
  return Array.isArray(reason) ? reason.join(', ') : reason;
}

export function getPatientStatusLabel(status: PatientStatus | undefined): string {
  if (status === 'on_hold') {
    return 'On hold';
  }

  if (status === 'discharged') {
    return 'Discharged';
  }

  if (status === 'inactive') {
    return 'Inactive';
  }

  return 'Active';
}

export function getPatientStatusTone(
  status: PatientStatus | undefined,
): PatientWorkspaceHeaderVm['statusTone'] {
  if (status === 'on_hold') {
    return 'warning';
  }

  if (status === 'inactive') {
    return 'critical';
  }

  if (status === 'discharged') {
    return 'neutral';
  }

  return 'success';
}

export function recoverySupportModeLabel(
  mode: PatientRecoverySupportConfig['checkinMode'] | undefined,
): string {
  if (mode === 'adaptive') {
    return 'Adaptive';
  }

  if (mode === 'force_full') {
    return 'Force full';
  }

  return 'Standard';
}

export function adaptationModeLabel(
  mode: CheckinAdaptationDecision['mode'] | undefined,
): string {
  if (mode === 'shortened') {
    return 'Shortened';
  }

  if (mode === 'expanded') {
    return 'Expanded';
  }

  return 'Standard';
}

export function adaptationDecisionSourceLabel(
  source: CheckinAdaptationDecision['decisionSource'] | undefined,
): string {
  switch (source) {
    case 'persistent_force_full':
      return 'Persistent force full';
    case 'temporary_force_full':
      return 'Temporary full flow';
    case 'hard_safety_expanded':
      return 'Hard safety';
    case 'cooldown_standard':
      return 'Cooldown';
    case 'adaptive_shortened':
      return 'Adaptive shortening';
    case 'adaptive_expanded':
      return 'Adaptive expansion';
    case 'adaptive_standard_fallback':
    default:
      return 'Adaptive full flow';
  }
}

export function temporaryFullFlowOptionLabel(option: TemporaryFullFlowOption): string {
  if (option === '3d') {
    return '3 days';
  }

  if (option === '7d') {
    return '7 days';
  }

  return 'Off';
}

export function getTemporaryFullFlowOption(
  temporaryForceFullUntil: string | null | undefined,
): TemporaryFullFlowOption {
  if (!temporaryForceFullUntil) {
    return 'off';
  }

  const parsed = Date.parse(temporaryForceFullUntil);
  if (!Number.isFinite(parsed) || parsed <= Date.now()) {
    return 'off';
  }

  const remainingDays = (parsed - Date.now()) / (24 * 60 * 60 * 1000);
  return remainingDays <= 4 ? '3d' : '7d';
}

export function buildTemporaryFullFlowUntil(
  option: TemporaryFullFlowOption,
): string | null {
  if (option === 'off') {
    return null;
  }

  const days = option === '3d' ? 3 : 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function buildPatientWorkspaceNavLinks(
  patientId: string,
  search: string,
): PatientWorkspaceNavLinkVm[] {
  return [
    { id: 'overview', label: 'Overview', to: `${buildPatientWorkspacePath(patientId, 'overview')}${search}` },
    {
      id: 'communications',
      label: 'Communications',
      to: `${buildPatientWorkspacePath(patientId, 'communications')}${search}`,
    },
    { id: 'guidance', label: 'Guidance', to: `${buildPatientWorkspacePath(patientId, 'guidance')}${search}` },
    { id: 'history', label: 'History', to: `${buildPatientWorkspacePath(patientId, 'history')}${search}` },
  ];
}

export function buildPatientWorkspaceHeader({
  patientId,
  patient,
  entryContext,
  worklistItem,
  currentRehabPhaseTitle,
  lastActivityAt,
  selectedDays,
  navLinks,
  openAlertCount,
  followUpCount,
  nextAppointment,
}: BuildPatientWorkspaceHeaderInput): PatientWorkspaceHeaderVm {
  const hasSourceReturnLink =
    entryContext !== null &&
    (entryContext.returnTo !== '/patients' || entryContext.source === 'patients');

  return {
    returnTo: hasSourceReturnLink ? entryContext?.returnTo ?? '/patients' : '/patients',
    returnLabel:
      entryContext && hasSourceReturnLink
        ? formatPatientEntryReturnLabel(entryContext.source)
        : 'Back to patients',
    sourceCue: entryContext ? formatPatientEntrySourceCue(entryContext.source) : null,
    patientName: patient?.displayName?.trim() || worklistItem?.patientName || patientId,
    patientId,
    statusLabel: getPatientStatusLabel(patient?.status ?? worklistItem?.patientStatus),
    statusTone: getPatientStatusTone(patient?.status ?? worklistItem?.patientStatus),
    rehabPhaseLabel: currentRehabPhaseTitle,
    lastActivityLabel: lastActivityAt
      ? `Last activity ${formatDashboardRelativeTime(lastActivityAt)}`
      : 'No recent activity',
    lastActivityTitle: lastActivityAt ? formatDashboardDateTime(lastActivityAt) : undefined,
    reviewWindowLabel: `${selectedDays} day review window`,
    navLinks,
    facts: [
      {
        label: 'Open alerts',
        value: String(openAlertCount),
        note: openAlertCount > 0 ? 'Safety review required' : 'Queue clear',
      },
      {
        label: 'Follow-through',
        value: followUpCount > 0 ? String(followUpCount) : 'Steady',
        note:
          followUpCount > 0
            ? `${followUpCount} active task${followUpCount === 1 ? '' : 's'} or messages waiting`
            : 'No active task or message queue waiting',
      },
      {
        label: 'Next schedule point',
        value: nextAppointment ? formatDashboardRelativeTime(nextAppointment.startsAt) : 'No slot set',
        note: nextAppointment ? 'Upcoming appointment context in view' : 'Schedule only when follow-up is needed',
      },
    ],
  };
}

export function buildPatientWorkspaceDecisionStrip({
  scopeLabel,
  worklistItem,
  latestOpenAlertReason,
  latestPain,
  adherence7d,
  reviewHint,
  actions,
  facts,
}: BuildPatientWorkspaceDecisionStripInput): PatientWorkspaceDecisionStripVm {
  const whyNowTitle =
    worklistItem?.topIssue?.trim() ||
    (latestOpenAlertReason
      ? 'Open safety alert needs review'
      : (latestPain ?? 0) >= 7
        ? 'Pain elevated in current window'
        : (adherence7d ?? 1) < 0.5
          ? 'Adherence below target in current window'
          : 'Stable review window');

  const whyNowBody =
    worklistItem?.reviewReason?.trim() ||
    latestOpenAlertReason ||
    ((latestPain ?? 0) >= 7
      ? `Latest patient-reported pain is ${latestPain}/10 in the selected review window.`
      : (adherence7d ?? 1) < 0.5
        ? `Recent exercise completion is ${Math.round((adherence7d ?? 0) * 100)}% in the selected review window.`
        : 'Use the active pane, shared coordination, and review metadata to confirm the next clinician step.');

  return {
    scopeLabel,
    whyNowTitle,
    whyNowBody,
    attentionLine: reviewHint ?? 'Current patient review context is preserved across subroutes.',
    facts,
    actions,
  };
}

export function buildPatientTrajectoryVm(
  trendSummary: TrendSummaryMetrics,
): PatientTrajectoryVm {
  const adherence = trendSummary.adherence7d ?? null;
  const latestPain = trendSummary.latestPain ?? null;

  if (latestPain !== null && latestPain >= 7) {
    return {
      headline: 'Worsening',
      summary: `Pain remains elevated at ${latestPain}/10 in the current review window.`,
      statusTone: 'critical',
    };
  }

  if (adherence !== null && adherence < 0.5) {
    return {
      headline: 'Needs support',
      summary: `Exercise completion is ${Math.round(adherence * 100)}% across the recent review window.`,
      statusTone: 'warning',
    };
  }

  if (trendSummary.avgPain7d !== null || adherence !== null) {
    return {
      headline: 'Stable',
      summary: 'Recent recovery signals are steady enough for focused review instead of a full trend deep-dive.',
      statusTone: 'success',
    };
  }

  return {
    headline: 'Unknown',
    summary: 'Trend context is limited in this review window.',
    statusTone: 'neutral',
  };
}

export function buildPatientOverviewVm(input: {
  freshnessLabel: string | null;
  reviewWindowItems: Array<{ label: string; value: string; note: string }>;
  communicationItems: DashboardCommunicationOverviewItem[];
  activeTasks: ClinicianTaskItem[];
  nextAppointment: AppointmentRequestItem | null;
  promDue: PromDueCard[];
  pendingInsights: InsightItem[];
  approvedInsights: InsightItem[];
  currentRehabPhaseTitle: string | null;
  sessions: ExerciseSessionListItem[];
  trendSummary: TrendSummaryMetrics;
}): PatientWorkspaceOverviewVm {
  const latestCommunicationItem = input.communicationItems[0] ?? null;
  const nextOpenTask = input.activeTasks[0] ?? null;
  const nextPromDue = input.promDue[0] ?? null;
  const nextPendingInsight = input.pendingInsights[0] ?? null;
  const latestSession = input.sessions[0] ?? null;

  return {
    freshnessLabel: input.freshnessLabel,
    reviewWindowItems: input.reviewWindowItems,
    trajectory: buildPatientTrajectoryVm(input.trendSummary),
    followThroughDigest: [
      {
        label: 'Communication',
        value:
          input.communicationItems.length === 0
            ? 'No threads waiting'
            : `${input.communicationItems.length} waiting`,
        text:
          latestCommunicationItem?.messagePreview?.trim() ||
          'No recent patient communication needs review.',
      },
      {
        label: 'Tasks',
        value:
          input.activeTasks.length === 0
            ? 'No open tasks'
            : `${input.activeTasks.length} open`,
        text:
          nextOpenTask?.title ||
          'The follow-through queue is clear right now.',
      },
      {
        label: 'Schedule',
        value: input.nextAppointment ? 'Appointment queued' : 'No appointment queued',
        text:
          input.nextAppointment?.note?.trim() ||
          'Keep scheduling in the secondary workflow unless follow-up is required.',
      },
    ],
    guidanceDigest: [
      {
        label: 'Questionnaires',
        value: input.promDue.length === 0 ? 'No PROMs due' : `${input.promDue.length} due`,
        text:
          nextPromDue
            ? `${nextPromDue.title} due ${formatDashboardDateTime(nextPromDue.dueAt)}`
            : 'No questionnaire activity is waiting in this window.',
      },
      {
        label: 'Clinical guidance',
        value:
          input.pendingInsights.length === 0
            ? 'No pending suggestions'
            : `${input.pendingInsights.length} pending`,
        text:
          nextPendingInsight?.title ||
          (input.approvedInsights.length > 0
            ? `${input.approvedInsights.length} approved suggestion${input.approvedInsights.length === 1 ? '' : 's'} in view.`
            : 'No approved or pending guidance suggestions in this window.'),
      },
      {
        label: 'Rehab and sessions',
        value: input.currentRehabPhaseTitle ?? 'Phase not set',
        text:
          latestSession?.planTitle ||
          'No recent exercise sessions are visible in this review window.',
      },
    ],
  };
}

export function buildPatientCommunicationsVm(freshnessLabel: string | null): PatientWorkspaceCommunicationsVm {
  return {
    freshnessLabel,
    serverTruthNote: 'Server-reviewed delay and review state remain authoritative in this patient workspace.',
    localTruthNote: 'Quick replies here are browser-local and private until handled elsewhere. They never become shared coordination notes.',
  };
}

export function buildPatientGuidanceVm(input: {
  freshnessLabel: string | null;
  rehab: RehabPayload | null;
  promDue: PromDueCard[];
  completedProms: PromHistoryRow[];
  pendingInsights: InsightItem[];
  approvedInsights: InsightItem[];
  recoverySupport: PatientRecoverySupportConfig | null;
}): PatientWorkspaceGuidanceVm {
  return {
    freshnessLabel: input.freshnessLabel,
    rehabSummary:
      input.rehab?.phases.length
        ? `${input.rehab.phases.length} rehab phase${input.rehab.phases.length === 1 ? '' : 's'} in pathway`
        : 'No rehab pathway loaded',
    promSummary:
      input.promDue.length > 0
        ? `${input.promDue.length} questionnaire${input.promDue.length === 1 ? '' : 's'} due`
        : input.completedProms.length > 0
          ? `${input.completedProms.length} questionnaire${input.completedProms.length === 1 ? '' : 's'} completed`
          : 'No questionnaire activity',
    insightSummary:
      input.pendingInsights.length > 0
        ? `${input.pendingInsights.length} pending guidance suggestion${input.pendingInsights.length === 1 ? '' : 's'}`
        : input.approvedInsights.length > 0
          ? `${input.approvedInsights.length} approved guidance suggestion${input.approvedInsights.length === 1 ? '' : 's'}`
          : 'No guidance suggestions in this window',
    recoverySupportSummary: input.recoverySupport
      ? `${recoverySupportModeLabel(input.recoverySupport.checkinMode)} check-ins`
      : 'Default recovery-support configuration',
  };
}

export function buildPatientHistoryVm(input: {
  freshnessLabel: string | null;
  summaryItems: Array<{ label: string; value: string; note: string }>;
}): PatientWorkspaceHistoryVm {
  return {
    freshnessLabel: input.freshnessLabel,
    summaryItems: input.summaryItems,
  };
}

export function buildPatientGovernanceVm(input: {
  worklistItem: WorklistRecord | null;
  communicationItems: DashboardCommunicationOverviewItem[];
  currentHandoff: ClinicianCoordinationRecord['currentHandoff'] | null;
  thresholds: PatientThresholdConfig | null;
  recoverySupport: PatientRecoverySupportConfig | null;
  adaptationDecision: CheckinAdaptationDecision | null;
  adaptationHistory: CheckinAdaptationHistoryEntry[];
  safetyEvents: SafetyAuditEntry[];
}): PatientWorkspaceGovernanceVm {
  const latestCommunication = input.communicationItems[0] ?? null;
  const latestSafetyEvent = input.safetyEvents[0] ?? null;

  return {
    workflowFacts: [
      {
        label: 'Follow-up owner',
        value:
          input.currentHandoff?.followUpOwner.kind === 'clinician'
            ? input.currentHandoff.followUpOwner.displayName
            : input.currentHandoff?.followUpOwner.kind === 'custom'
              ? input.currentHandoff.followUpOwner.label
              : null,
      },
      {
        label: 'Linked task',
        value: input.currentHandoff?.linkedTask?.title ?? null,
      },
      {
        label: 'Next step',
        value: input.currentHandoff?.nextStep ?? null,
      },
    ],
    governanceFacts: [
      {
        label: 'Shared handoff updated',
        value: input.currentHandoff?.updatedAt ? formatDashboardDateTime(input.currentHandoff.updatedAt) : null,
      },
      {
        label: 'Latest response state',
        value:
          latestCommunication?.responseDelayed || latestCommunication?.responseState === 'delayed'
            ? 'Response delayed'
            : latestCommunication?.reviewedAfterLatestInbound
              ? 'Reviewed'
              : latestCommunication?.flaggedBySafety
                ? 'Safety flagged'
                : latestCommunication
                  ? 'Needs response'
                  : null,
      },
      {
        label: 'Safety basis',
        value: latestSafetyEvent?.summary ?? null,
      },
    ],
    thresholdFacts: [
      {
        label: 'Pain threshold',
        value: input.thresholds ? `Pain >= ${input.thresholds.painHighThreshold}` : null,
      },
      {
        label: 'Response delay',
        value: input.thresholds ? `${input.thresholds.responseDelayHours}h` : null,
      },
      {
        label: 'Recovery support',
        value: input.recoverySupport ? recoverySupportModeLabel(input.recoverySupport.checkinMode) : null,
      },
      {
        label: 'Latest adaptation',
        value: input.adaptationDecision ? adaptationModeLabel(input.adaptationDecision.mode) : null,
      },
      {
        label: 'Adaptation source',
        value: input.adaptationDecision ? adaptationDecisionSourceLabel(input.adaptationDecision.decisionSource) : null,
      },
      {
        label: 'Adaptation history',
        value:
          input.adaptationHistory.length > 0
            ? `${input.adaptationHistory.length} recent decision${input.adaptationHistory.length === 1 ? '' : 's'}`
            : null,
      },
      {
        label: 'Worklist priority',
        value: input.worklistItem ? String(input.worklistItem.priorityScore) : null,
      },
    ],
    provenance: ['patient-reported', 'clinician-entered', 'unknown'],
    explanation:
      'Shared coordination, threshold metadata, review provenance, and local communication continuity remain intentionally separate here. Unsupported assignment, AI authorship, or patient-facing delivery claims are not shown.',
  };
}
