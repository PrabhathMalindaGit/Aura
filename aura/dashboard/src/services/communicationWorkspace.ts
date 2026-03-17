import { getClinicianId } from './clinicianIdentity';
import type { DashboardCommunicationOverviewItem } from '../types/models';

const COMMUNICATION_WORKSPACE_STORAGE_PREFIX = 'aura_communication_workspace';

export type CommunicationThreadView =
  | 'all'
  | 'unread'
  | 'needs-response'
  | 'safety-flagged'
  | 'follow-up-requested';

export interface CommunicationLocalReply {
  id: string;
  patientId: string;
  text: string;
  createdAt: string;
  clinicianId: string;
}

export interface CommunicationTimelineEvent {
  id: string;
  kind: 'patient-message' | 'clinician-reply';
  patientId: string;
  occurredAt: string;
  senderLabel: string;
  preview: string;
  flaggedBySafety: boolean;
  followUpRequested: boolean;
  localOnly: boolean;
}

export interface CommunicationThread {
  id: string;
  patientId: string;
  patientName: string;
  validPatientId: boolean;
  latestEventAt: string;
  latestEventPreview: string;
  latestEventKind: CommunicationTimelineEvent['kind'];
  latestInboundAt?: string;
  latestReplyAt?: string;
  unread: boolean;
  needsResponse: boolean;
  safetyFlagged: boolean;
  followUpRequested: boolean;
  handled: boolean;
  timeline: CommunicationTimelineEvent[];
}

export interface CommunicationWorkspaceLocalState {
  repliesByPatient: Record<string, CommunicationLocalReply[]>;
  reviewedAtByPatient: Record<string, string>;
}

interface ReplyInput {
  patientId: string;
  text: string;
  createdAt?: string;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizePatientId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toSortValue(timestamp: string | undefined): number {
  if (!timestamp) {
    return 0;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createStorageKey(clinicianId: string): string {
  return `${COMMUNICATION_WORKSPACE_STORAGE_PREFIX}:${clinicianId}`;
}

function createEmptyLocalState(): CommunicationWorkspaceLocalState {
  return {
    repliesByPatient: {},
    reviewedAtByPatient: {},
  };
}

function normalizeLocalReplies(value: unknown): Record<string, CommunicationLocalReply[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const next: Record<string, CommunicationLocalReply[]> = {};

  for (const [rawPatientId, rawReplies] of Object.entries(value)) {
    const patientId = normalizePatientId(rawPatientId);
    if (!patientId || !Array.isArray(rawReplies)) {
      continue;
    }

    const replies = rawReplies
      .map((reply, index) => {
        if (!reply || typeof reply !== 'object' || Array.isArray(reply)) {
          return null;
        }

        const candidate = reply as Partial<CommunicationLocalReply>;
        const text = normalizeText(candidate.text);
        const createdAt = normalizeTimestamp(candidate.createdAt);

        if (!text || !createdAt) {
          return null;
        }

        return {
          id: normalizeText(candidate.id) || `local-reply-${patientId}-${index + 1}`,
          patientId,
          text,
          createdAt,
          clinicianId: normalizeText(candidate.clinicianId) || getClinicianId(),
        } satisfies CommunicationLocalReply;
      })
      .filter((reply): reply is CommunicationLocalReply => Boolean(reply))
      .sort((left, right) => toSortValue(left.createdAt) - toSortValue(right.createdAt));

    if (replies.length > 0) {
      next[patientId] = replies;
    }
  }

  return next;
}

function normalizeReviewedAtMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const next: Record<string, string> = {};

  for (const [rawPatientId, rawTimestamp] of Object.entries(value)) {
    const patientId = normalizePatientId(rawPatientId);
    const timestamp = normalizeTimestamp(rawTimestamp);

    if (!patientId || !timestamp) {
      continue;
    }

    next[patientId] = timestamp;
  }

  return next;
}

function normalizeLocalState(value: unknown): CommunicationWorkspaceLocalState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyLocalState();
  }

  const candidate = value as Partial<CommunicationWorkspaceLocalState>;

  return {
    repliesByPatient: normalizeLocalReplies(candidate.repliesByPatient),
    reviewedAtByPatient: normalizeReviewedAtMap(candidate.reviewedAtByPatient),
  };
}

export function readCommunicationWorkspaceLocalState(
  clinicianId: string = getClinicianId(),
): CommunicationWorkspaceLocalState {
  if (!isBrowser()) {
    return createEmptyLocalState();
  }

  try {
    const raw = window.localStorage.getItem(createStorageKey(clinicianId));
    if (!raw) {
      return createEmptyLocalState();
    }

    return normalizeLocalState(JSON.parse(raw));
  } catch {
    return createEmptyLocalState();
  }
}

function writeCommunicationWorkspaceLocalState(
  state: CommunicationWorkspaceLocalState,
  clinicianId: string,
): CommunicationWorkspaceLocalState {
  if (!isBrowser()) {
    return state;
  }

  try {
    window.localStorage.setItem(createStorageKey(clinicianId), JSON.stringify(state));
  } catch {
    // Ignore storage failures to keep the workspace usable.
  }

  return state;
}

export function addCommunicationThreadReply(
  currentState: CommunicationWorkspaceLocalState,
  input: ReplyInput,
  clinicianId: string = getClinicianId(),
): CommunicationWorkspaceLocalState {
  const patientId = normalizePatientId(input.patientId);
  const text = normalizeText(input.text);
  const createdAt = normalizeTimestamp(input.createdAt) ?? new Date().toISOString();

  if (!patientId || !text) {
    return currentState;
  }

  const currentReplies = currentState.repliesByPatient[patientId] ?? [];
  const nextReply: CommunicationLocalReply = {
    id: `local-reply-${patientId}-${createdAt}`,
    patientId,
    text,
    createdAt,
    clinicianId,
  };

  const nextState: CommunicationWorkspaceLocalState = {
    repliesByPatient: {
      ...currentState.repliesByPatient,
      [patientId]: [...currentReplies, nextReply].sort(
        (left, right) => toSortValue(left.createdAt) - toSortValue(right.createdAt),
      ),
    },
    reviewedAtByPatient: currentState.reviewedAtByPatient,
  };

  return writeCommunicationWorkspaceLocalState(nextState, clinicianId);
}

export function markCommunicationThreadReviewed(
  currentState: CommunicationWorkspaceLocalState,
  patientId: string,
  latestInboundAt: string | undefined,
  clinicianId: string = getClinicianId(),
): CommunicationWorkspaceLocalState {
  const normalizedPatientId = normalizePatientId(patientId);
  const normalizedLatestInboundAt = normalizeTimestamp(latestInboundAt);

  if (!normalizedPatientId || !normalizedLatestInboundAt) {
    return currentState;
  }

  const currentReviewedAt = currentState.reviewedAtByPatient[normalizedPatientId];
  if (toSortValue(currentReviewedAt) >= toSortValue(normalizedLatestInboundAt)) {
    return currentState;
  }

  const nextState: CommunicationWorkspaceLocalState = {
    repliesByPatient: currentState.repliesByPatient,
    reviewedAtByPatient: {
      ...currentState.reviewedAtByPatient,
      [normalizedPatientId]: normalizedLatestInboundAt,
    },
  };

  return writeCommunicationWorkspaceLocalState(nextState, clinicianId);
}

function buildInboundEvent(item: DashboardCommunicationOverviewItem): CommunicationTimelineEvent {
  const patientId = normalizePatientId(item.patientId);
  const preview = normalizeText(item.messagePreview) || 'Patient communication is available for review.';
  const occurredAt = normalizeTimestamp(item.messageCreatedAt) ?? new Date(0).toISOString();

  return {
    id: item.messageId?.trim() || item.id,
    kind: 'patient-message',
    patientId,
    occurredAt,
    senderLabel: 'Patient',
    preview,
    flaggedBySafety: item.flaggedBySafety === true,
    followUpRequested: item.followUpRequested === true,
    localOnly: false,
  };
}

function buildReplyEvent(reply: CommunicationLocalReply): CommunicationTimelineEvent {
  return {
    id: reply.id,
    kind: 'clinician-reply',
    patientId: reply.patientId,
    occurredAt: reply.createdAt,
    senderLabel: 'Clinician',
    preview: reply.text,
    flaggedBySafety: false,
    followUpRequested: false,
    localOnly: true,
  };
}

export function deriveCommunicationThreads(
  items: DashboardCommunicationOverviewItem[],
  localState: CommunicationWorkspaceLocalState = createEmptyLocalState(),
): CommunicationThread[] {
  const groups = new Map<string, DashboardCommunicationOverviewItem[]>();

  for (const item of items) {
    const patientId = normalizePatientId(item.patientId);
    const groupKey = patientId || `unknown-${item.id}`;
    const current = groups.get(groupKey);

    if (current) {
      current.push(item);
      continue;
    }

    groups.set(groupKey, [item]);
  }

  return [...groups.entries()]
    .map(([groupKey, groupItems]) => {
      const inboundItems = [...groupItems].sort(
        (left, right) => toSortValue(left.messageCreatedAt) - toSortValue(right.messageCreatedAt),
      );
      const latestInboundItem = inboundItems[inboundItems.length - 1];
      const patientId = normalizePatientId(latestInboundItem?.patientId);
      const validPatientId = patientId.length > 0;
      const patientName =
        normalizeText(latestInboundItem?.patientName) ||
        patientId ||
        'Patient context unavailable';
      const localReplies = validPatientId ? localState.repliesByPatient[patientId] ?? [] : [];
      const inboundTimeline = inboundItems.map(buildInboundEvent);
      const replyTimeline = localReplies.map(buildReplyEvent);
      const timeline = [...inboundTimeline, ...replyTimeline].sort((left, right) => {
        const leftTime = toSortValue(left.occurredAt);
        const rightTime = toSortValue(right.occurredAt);

        if (leftTime !== rightTime) {
          return leftTime - rightTime;
        }

        if (left.kind === right.kind) {
          return left.id.localeCompare(right.id);
        }

        return left.kind === 'patient-message' ? -1 : 1;
      });
      const latestEvent = timeline[timeline.length - 1];
      const latestInboundAt = latestInboundItem?.messageCreatedAt;
      const latestReplyAt = localReplies[localReplies.length - 1]?.createdAt;
      const latestInboundSortValue = toSortValue(latestInboundAt);
      const latestReplySortValue = toSortValue(latestReplyAt);
      const reviewedAt = validPatientId ? localState.reviewedAtByPatient[patientId] : undefined;
      const unread = latestInboundSortValue > 0 && latestInboundSortValue > toSortValue(reviewedAt);
      const needsResponse =
        latestReplySortValue > 0
          ? latestInboundSortValue > latestReplySortValue
          : inboundItems.some((item) => item.needsResponse === true);
      const safetyFlagged = inboundItems.some((item) => item.flaggedBySafety === true);
      const followUpRequested = inboundItems.some((item) => item.followUpRequested === true);

      return {
        id: groupKey,
        patientId,
        patientName,
        validPatientId,
        latestEventAt: latestEvent?.occurredAt ?? latestInboundAt ?? new Date(0).toISOString(),
        latestEventPreview: latestEvent?.preview ?? 'Communication timeline unavailable.',
        latestEventKind: latestEvent?.kind ?? 'patient-message',
        latestInboundAt,
        latestReplyAt,
        unread,
        needsResponse,
        safetyFlagged,
        followUpRequested,
        handled: !unread && !needsResponse,
        timeline,
      } satisfies CommunicationThread;
    })
    .sort((left, right) => toSortValue(right.latestEventAt) - toSortValue(left.latestEventAt));
}

export function findCommunicationThreadByPatientId(
  threads: CommunicationThread[],
  patientId: string,
): CommunicationThread | null {
  const normalizedPatientId = normalizePatientId(patientId);

  if (!normalizedPatientId) {
    return null;
  }

  return (
    threads.find((thread) => thread.validPatientId && thread.patientId === normalizedPatientId) ??
    null
  );
}

export function deriveCommunicationThreadForPatient(
  items: DashboardCommunicationOverviewItem[],
  patientId: string,
  localState: CommunicationWorkspaceLocalState = createEmptyLocalState(),
): CommunicationThread | null {
  return findCommunicationThreadByPatientId(
    deriveCommunicationThreads(items, localState),
    patientId,
  );
}

export function filterCommunicationThreads(
  threads: CommunicationThread[],
  view: CommunicationThreadView,
): CommunicationThread[] {
  if (view === 'unread') {
    return threads.filter((thread) => thread.unread);
  }

  if (view === 'needs-response') {
    return threads.filter((thread) => thread.needsResponse);
  }

  if (view === 'safety-flagged') {
    return threads.filter((thread) => thread.safetyFlagged);
  }

  if (view === 'follow-up-requested') {
    return threads.filter((thread) => thread.followUpRequested);
  }

  return threads;
}
