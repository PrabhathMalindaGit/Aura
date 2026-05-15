import type { CommunicationThread, CommunicationTimelineEvent } from '../../services/communicationWorkspace';
import type {
  ClinicianCoordinationCurrentHandoff,
  ClinicianCoordinationNoteItem,
  ClinicianCoordinationRecord,
  DashboardCommunicationOverviewItem,
} from '../../types/models';
import {
  getClinicianCoordinationFollowUpOwnerLabel,
  getClinicianCoordinationLatestActivity,
  getClinicianCoordinationLinkedTaskAssigneeLabel,
  getClinicianCoordinationLinkedTaskEmptyLabel,
  getClinicianCoordinationLinkedTaskSourceLabel,
  getClinicianCoordinationLinkedTaskStatusLabel,
  getClinicianCoordinationLinkedTaskUnavailableLabel,
  getClinicianCoordinationNextStepLabel,
} from '../../utils/clinicianCoordination';
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../../utils/dashboard';
import { sanitizeDashboardPreviewText } from '../../utils/syntheticRunTags';
import { truncateText } from '../../utils/text';
import type { ProvenanceSource } from './viewModels';

export type InboxBadgeTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'critical'
  | 'patient'
  | 'clinician'
  | 'unknown';

export interface InboxBadgeVm {
  label: string;
  tone: InboxBadgeTone;
}

export interface InboxQueueRowVm {
  key: string;
  patientId: string | null;
  patientName: string;
  freshnessLabel: string;
  freshnessTitle: string;
  responseLabel: string;
  responseTone: InboxBadgeTone;
  preview: string;
  metaLine: string;
  supportingBadges: InboxBadgeVm[];
}

export interface InboxSummaryFactVm {
  label: string;
  value: string;
  title?: string;
}

export interface InboxTimelineItemVm {
  id: string;
  speakerLabel: string;
  speakerSecondaryLabel?: string;
  role: 'patient' | 'clinician';
  preview: string;
  occurredAtLabel: string;
  occurredAtTitle: string;
  badges: InboxBadgeVm[];
  continuation: boolean;
  metaNote?: string | null;
}

export interface InboxWorkspaceVm {
  threadKey: string;
  patientId: string | null;
  patientIdLabel: string;
  patientName: string;
  responseLabel: string;
  responseTone: InboxBadgeTone;
  whyNowSummary: string;
  urgencyLine: string;
  contextStrip: string[];
  summaryFacts: InboxSummaryFactVm[];
  truthBadges: InboxBadgeVm[];
  timeline: InboxTimelineItemVm[];
  canOpenAlerts: boolean;
  canOpenPatient: boolean;
  canOpenStructuredCoordination: boolean;
}

export interface InboxMetadataVm {
  label: string;
  value: string | null;
}

export interface InboxSharedNoteVm {
  id: string;
  authorLabel: string;
  timestampLabel: string;
  timestampTitle: string;
  text: string;
}

export interface InboxSharedCoordinationVm {
  statusEyebrow: string;
  summary: string;
  note: string;
  facts: InboxMetadataVm[];
  notes: InboxSharedNoteVm[];
}

export interface InboxWorkflowTaskVm {
  state: 'linked' | 'unavailable' | 'empty';
  title: string;
  subtitle: string;
  facts: InboxMetadataVm[];
}

export interface InboxWorkflowActivityVm {
  title: string;
  subtitle: string;
  timestampLabel: string;
  timestampTitle: string;
  text: string;
}

export interface InboxWorkflowVm {
  linkedTask: InboxWorkflowTaskVm;
  latestActivity: InboxWorkflowActivityVm | null;
}

export interface InboxReferenceVm {
  summary: string;
  note: string;
  caution: string;
}

export interface InboxSupportVm {
  provenance: ProvenanceSource[];
  governanceFacts: InboxMetadataVm[];
  thresholdContext: string | null;
  responseStateNote: string | null;
  sharedCoordination: InboxSharedCoordinationVm;
  workflow: InboxWorkflowVm;
  reference: InboxReferenceVm;
}

function getThreadSummary(thread: CommunicationThread): string {
  if (thread.safetyFlagged) {
    return 'Safety context is active and should stay visible through review.';
  }

  if (thread.responseDelayed) {
    return 'Response is delayed past the configured threshold.';
  }

  if (thread.needsResponse) {
    return 'Waiting on clinician follow-up.';
  }

  if (thread.reviewedAfterLatestInbound) {
    return 'Durable care-team review is recorded.';
  }

  if (thread.latestEventKind === 'clinician-reply') {
    return 'A local clinician reply is the latest activity in this browser.';
  }

  if (thread.followUpRequested) {
    return 'Follow-up was requested in recent patient messaging.';
  }

  return 'Recent patient message in review.';
}

function getResponseState(thread: CommunicationThread): InboxBadgeVm {
  if (thread.safetyFlagged) {
    return { label: 'Safety flagged', tone: 'critical' };
  }

  if (thread.responseDelayed) {
    return { label: 'Response delayed', tone: 'warning' };
  }

  if (thread.needsResponse) {
    return { label: 'Needs response', tone: 'info' };
  }

  if (thread.reviewedAfterLatestInbound) {
    return { label: 'Reviewed', tone: 'success' };
  }

  if (thread.followUpRequested) {
    return { label: 'Follow-up requested', tone: 'info' };
  }

  return { label: 'In review', tone: 'neutral' };
}

function getQueueMetaLine(
  thread: CommunicationThread,
  item: DashboardCommunicationOverviewItem | null,
): string {
  const parts = [
    thread.safetyFlagged
      ? 'Safety flagged'
      : thread.responseDelayed
        ? 'Response delayed'
        : thread.needsResponse
          ? 'Needs response'
          : thread.reviewedAfterLatestInbound
            ? 'Reviewed'
            : thread.followUpRequested
              ? 'Follow-up requested'
              : null,
    item?.patientRiskLevel === 'high' ? 'Higher risk' : null,
    typeof item?.openAlertCount === 'number' && item.openAlertCount > 0
      ? `${item.openAlertCount} open alert${item.openAlertCount === 1 ? '' : 's'}`
      : null,
    item?.lastPainScore !== undefined ? `Pain ${item.lastPainScore}/10` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.slice(0, 2).join(' · ') : getThreadSummary(thread);
}

function buildSupportingBadges(
  thread: CommunicationThread,
  item: DashboardCommunicationOverviewItem | null,
): InboxBadgeVm[] {
  const badges: InboxBadgeVm[] = [];

  if (thread.safetyFlagged) {
    badges.push({ label: 'Safety', tone: 'critical' });
  } else if (thread.responseDelayed) {
    badges.push({ label: 'Delayed', tone: 'warning' });
  }

  if (item?.patientRiskLevel === 'high') {
    badges.push({ label: 'Higher risk', tone: 'warning' });
  } else if (typeof item?.openAlertCount === 'number' && item.openAlertCount > 0) {
    badges.push({
      label: `${item.openAlertCount} alert${item.openAlertCount === 1 ? '' : 's'}`,
      tone: 'critical',
    });
  }

  if (badges.length < 2 && item?.lastPainScore !== undefined) {
    badges.push({ label: `Pain ${item.lastPainScore}/10`, tone: 'neutral' });
  }

  return badges.slice(0, 2);
}

function getTimelineEventContinuation(
  currentEvent: CommunicationTimelineEvent,
  previousEvent: CommunicationTimelineEvent | undefined,
): boolean {
  if (!previousEvent) {
    return false;
  }

  return (
    previousEvent.kind === currentEvent.kind &&
    previousEvent.senderLabel === currentEvent.senderLabel &&
    previousEvent.senderSecondaryLabel === currentEvent.senderSecondaryLabel &&
    previousEvent.localOnly === currentEvent.localOnly
  );
}

function buildTimelineBadges(event: CommunicationTimelineEvent): InboxBadgeVm[] {
  const badges: InboxBadgeVm[] = [
    event.kind === 'clinician-reply'
      ? {
          label: event.localOnly ? 'Local clinician reply' : 'Clinician reply',
          tone: 'success',
        }
      : {
          label: 'Patient message',
          tone: 'patient',
        },
  ];

  if (event.flaggedBySafety) {
    badges.push({ label: 'Safety flagged', tone: 'critical' });
  } else if (event.followUpRequested) {
    badges.push({ label: 'Follow-up requested', tone: 'info' });
  } else if (event.localOnly && event.kind !== 'clinician-reply') {
    badges.push({ label: 'Local only', tone: 'neutral' });
  }

  return badges.slice(0, 2);
}

function buildTimelineMetaNote(event: CommunicationTimelineEvent): string | null {
  if (event.flaggedBySafety && event.followUpRequested) {
    return 'Follow-up requested';
  }

  if (event.localOnly && event.kind !== 'clinician-reply') {
    return 'Local-only context';
  }

  return null;
}

function buildContextStrip(item: DashboardCommunicationOverviewItem | null): string[] {
  if (!item) {
    return [];
  }

  return [
    item.patientRiskLevel === 'high' ? 'Higher risk' : 'Lower risk',
    typeof item.openAlertCount === 'number'
      ? `${item.openAlertCount} open alert${item.openAlertCount === 1 ? '' : 's'}`
      : null,
    item.lastCheckinAt ? `Check-in ${formatDashboardRelativeTime(item.lastCheckinAt)}` : null,
    item.lastPainScore !== undefined ? `Pain ${item.lastPainScore}/10` : null,
    item.responseDueAt
      ? `Due ${formatDashboardRelativeTime(item.responseDueAt)}`
      : item.responseDelayHours
        ? `Target ${item.responseDelayHours}h`
        : null,
  ].filter((value): value is string => Boolean(value));
}

function buildTruthBadges(
  thread: CommunicationThread,
  item: DashboardCommunicationOverviewItem | null,
): InboxBadgeVm[] {
  const badges = [getResponseState(thread)];

  if (!thread.unread) {
    badges.push({ label: 'Opened here', tone: 'neutral' });
  }

  if (item?.followUpRequested) {
    badges.push({ label: 'Follow-up requested', tone: 'info' });
  }

  return badges.slice(0, 4);
}

function buildThresholdContext(item: DashboardCommunicationOverviewItem | null): string | null {
  const thresholdSummary = item?.thresholdSummary;

  if (!thresholdSummary?.configured) {
    return null;
  }

  return [
    `Pain threshold ${thresholdSummary.painHighThreshold}/10`,
    `Missed check-ins after ${thresholdSummary.missedCheckinDays} day${thresholdSummary.missedCheckinDays === 1 ? '' : 's'}`,
    `Response target ${thresholdSummary.responseDelayHours}h`,
  ].join(' · ');
}

function buildResponseStateNote(item: DashboardCommunicationOverviewItem | null): string | null {
  if (!item) {
    return null;
  }

  if (item.responseDueAt) {
    return `Response due ${formatDashboardDateTime(item.responseDueAt)}`;
  }

  if (item.responseDelayed && item.responseAgeHours) {
    return `Response delayed by ${item.responseAgeHours}h`;
  }

  if (item.responseDelayHours) {
    return `Response target ${item.responseDelayHours}h`;
  }

  return null;
}

function buildProvenance(
  item: DashboardCommunicationOverviewItem | null,
  coordination: ClinicianCoordinationRecord | null,
): ProvenanceSource[] {
  const sources = new Set<ProvenanceSource>();

  if (
    item?.messagePreview ||
    item?.lastCheckinAt ||
    item?.lastPainScore !== undefined ||
    item?.followUpRequested
  ) {
    sources.add('patient-reported');
  }

  if (
    item?.lastReviewedAt ||
    item?.lastReviewedBy ||
    item?.thresholdSummary?.configured ||
    coordination?.currentHandoff ||
    (coordination?.noteHistory.length ?? 0) > 0
  ) {
    sources.add('clinician-entered');
  }

  if (sources.size === 0) {
    sources.add('unknown');
  }

  return Array.from(sources);
}

function buildSharedCoordinationFacts(
  handoff: ClinicianCoordinationCurrentHandoff | null,
): InboxMetadataVm[] {
  if (!handoff) {
    return [];
  }

  return [
    { label: 'Next step', value: getClinicianCoordinationNextStepLabel(handoff.nextStep) },
    {
      label: 'Follow-up owner',
      value: getClinicianCoordinationFollowUpOwnerLabel(handoff.followUpOwner),
    },
    { label: 'Updated by', value: handoff.updatedBy.displayName },
    { label: 'Updated', value: formatDashboardDateTime(handoff.updatedAt) },
  ];
}

function buildSharedNotes(notes: ClinicianCoordinationNoteItem[]): InboxSharedNoteVm[] {
  return notes.slice(0, 3).map((note) => ({
    id: note.id,
    authorLabel: note.createdBy.displayName,
    timestampLabel: formatDashboardRelativeTime(note.createdAt),
    timestampTitle: formatDashboardDateTime(note.createdAt),
    text: note.text,
  }));
}

export function buildInboxQueueRow(
  thread: CommunicationThread,
  item: DashboardCommunicationOverviewItem | null,
): InboxQueueRowVm {
  const responseState = getResponseState(thread);

  return {
    key: thread.id,
    patientId: thread.validPatientId ? thread.patientId : null,
    patientName: thread.patientName,
    freshnessLabel: formatDashboardRelativeTime(thread.latestEventAt),
    freshnessTitle: formatDashboardDateTime(thread.latestEventAt),
    responseLabel: responseState.label,
    responseTone: responseState.tone,
    preview: truncateText(
      sanitizeDashboardPreviewText(thread.latestEventPreview) ||
        'Patient communication is available for review.',
      116,
    ).text,
    metaLine: getQueueMetaLine(thread, item),
    supportingBadges: buildSupportingBadges(thread, item),
  };
}

export function buildInboxWorkspace(
  thread: CommunicationThread,
  item: DashboardCommunicationOverviewItem | null,
): InboxWorkspaceVm {
  const responseState = getResponseState(thread);

  return {
    threadKey: thread.id,
    patientId: thread.validPatientId ? thread.patientId : null,
    patientIdLabel: thread.validPatientId ? `ID: ${thread.patientId}` : 'ID: Unknown',
    patientName: thread.patientName,
    responseLabel: responseState.label,
    responseTone: responseState.tone,
    whyNowSummary: getThreadSummary(thread),
    urgencyLine:
      buildResponseStateNote(item) ??
      (thread.latestInboundAt
        ? `Latest inbound ${formatDashboardRelativeTime(thread.latestInboundAt)}`
        : 'Review context is based on the current patient thread.'),
    contextStrip: buildContextStrip(item),
    summaryFacts: [
      {
        label: 'Updated',
        value: formatDashboardRelativeTime(thread.latestEventAt),
        title: formatDashboardDateTime(thread.latestEventAt),
      },
      {
        label: 'Latest source',
        value: thread.latestEventKind === 'clinician-reply' ? 'Local clinician reply' : 'Patient message',
      },
      ...(thread.latestInboundAt
        ? [
            {
              label: 'Latest inbound',
              value: formatDashboardRelativeTime(thread.latestInboundAt),
              title: formatDashboardDateTime(thread.latestInboundAt),
            },
          ]
        : []),
      ...(item?.responseDueAt
        ? [
            {
              label: 'Due',
              value: formatDashboardRelativeTime(item.responseDueAt),
              title: formatDashboardDateTime(item.responseDueAt),
            },
          ]
        : []),
    ],
    truthBadges: buildTruthBadges(thread, item),
    timeline: thread.timeline.map((event, index) => {
      const continuation = getTimelineEventContinuation(event, thread.timeline[index - 1]);
      const badges = buildTimelineBadges(event);

      return {
        id: event.id,
        speakerLabel: continuation ? 'Continuation' : event.senderLabel,
        speakerSecondaryLabel: continuation ? undefined : event.senderSecondaryLabel,
        role: event.kind === 'clinician-reply' ? 'clinician' : 'patient',
        preview:
          sanitizeDashboardPreviewText(event.preview) ||
          'Patient communication is available for review.',
        occurredAtLabel: formatDashboardRelativeTime(event.occurredAt),
        occurredAtTitle: formatDashboardDateTime(event.occurredAt),
        badges: continuation ? badges.slice(1) : badges,
        continuation,
        metaNote: buildTimelineMetaNote(event),
      };
    }),
    canOpenAlerts:
      thread.validPatientId &&
      (thread.safetyFlagged || (typeof item?.openAlertCount === 'number' && item.openAlertCount > 0)),
    canOpenPatient: thread.validPatientId,
    canOpenStructuredCoordination: thread.validPatientId,
  };
}

export function buildInboxSupport(
  thread: CommunicationThread,
  item: DashboardCommunicationOverviewItem | null,
  coordination: ClinicianCoordinationRecord | null,
): InboxSupportVm {
  const handoff = coordination?.currentHandoff ?? null;
  const latestActivity = getClinicianCoordinationLatestActivity(coordination);
  const linkedTask = handoff?.linkedTask ?? null;

  return {
    provenance: buildProvenance(item, coordination),
    governanceFacts: [
      {
        label: 'Last reviewed by',
        value: item?.lastReviewedBy?.displayName ?? null,
      },
      {
        label: 'Last reviewed at',
        value: item?.lastReviewedAt ? formatDashboardDateTime(item.lastReviewedAt) : null,
      },
      {
        label: 'Response state',
        value: item?.responseState ? item.responseState : null,
      },
      {
        label: 'Follow-up owner',
        value: handoff ? getClinicianCoordinationFollowUpOwnerLabel(handoff.followUpOwner) : null,
      },
    ],
    thresholdContext: buildThresholdContext(item),
    responseStateNote: buildResponseStateNote(item),
    sharedCoordination: {
      statusEyebrow: handoff ? 'Current shared handoff' : 'No current shared handoff',
      summary: handoff?.summary ?? 'No current shared handoff saved.',
      note: handoff
        ? 'Read-only here. Use Patient Detail for structured handoff edits.'
        : latestActivity
          ? 'No shared handoff is saved yet. The latest team-visible activity still appears below.'
          : 'Add the first shared note below if the care team needs patient-scoped context now.',
      facts: buildSharedCoordinationFacts(handoff),
      notes: buildSharedNotes(coordination?.noteHistory ?? []),
    },
    workflow: {
      linkedTask: linkedTask
        ? {
            state: 'linked',
            title: linkedTask.title,
            subtitle:
              'Existing follow-through task reference only. Shared coordination does not create or complete this task.',
            facts: [
              { label: 'Status', value: getClinicianCoordinationLinkedTaskStatusLabel(linkedTask.status) },
              { label: 'Priority', value: getClinicianCoordinationLinkedTaskStatusLabel(linkedTask.priority) },
              { label: 'Assignee', value: getClinicianCoordinationLinkedTaskAssigneeLabel(linkedTask.assignedTo) },
              { label: 'Due', value: linkedTask.dueAt ? formatDashboardDateTime(linkedTask.dueAt) : 'Not set' },
              {
                label: 'Source',
                value: getClinicianCoordinationLinkedTaskSourceLabel(linkedTask),
              },
            ],
          }
        : handoff?.linkedTaskId
          ? {
              state: 'unavailable',
              title: getClinicianCoordinationLinkedTaskUnavailableLabel(),
              subtitle:
                'This handoff still points to a task id, but Aura cannot resolve that task right now.',
              facts: [],
            }
          : {
              state: 'empty',
              title: getClinicianCoordinationLinkedTaskEmptyLabel(),
              subtitle:
                'If the care team needs an explicit workflow reference, link one from Patient Detail.',
              facts: [],
            },
      latestActivity: latestActivity
        ? {
            title: latestActivity.author.displayName,
            subtitle: latestActivity.label,
            timestampLabel: formatDashboardRelativeTime(latestActivity.timestamp),
            timestampTitle: formatDashboardDateTime(latestActivity.timestamp),
            text: truncateText(latestActivity.text || 'No summary saved.', 180).text,
          }
        : null,
    },
    reference: {
      summary:
        'This timeline is limited to patient communication plus local clinician replies saved in this browser.',
      note:
        'Shared coordination is team-visible Aura context and never appears as a sent message in this timeline.',
      caution:
        thread.unread
          ? 'Browser-local continuity stays secondary to server-reviewed and delayed response state.'
          : 'Opened here remains local continuity only and does not replace server-reviewed truth.',
    },
  };
}
