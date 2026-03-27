import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import { Skeleton } from '../components/ui/Skeleton';
import {
  createAppointmentSlot,
  listAppointmentRequests,
  listAppointmentSlots,
  reviewAppointmentRequest,
  usePatients,
} from '../services/clinicianApi';
import { readWorkspaceState, writeWorkspaceState } from '../services/workspaceState';
import type { AppointmentRequestItem, AppointmentSlot } from '../types/models';
import { appointmentWorkflowLabel, appointmentWorkflowTone } from '../utils/patientDetail';
import { createPatientEntryState } from '../utils/patientEntryContext';
import { getPatientDisplayName } from '../utils/patientFilters';
import { asAppError, isRetryable, toUserMessage } from '../utils/errors';
import { formatRelativeTime } from '../utils/time';

type SlotStatusFilter = 'available' | 'closed';
type RequestStatusFilter = 'pending' | 'approved' | 'rejected' | 'canceled';
type ScheduleView = 'week' | 'day';
type BadgeVariant = 'default' | 'success' | 'warning' | 'danger';
type CoordinationTone = 'attention' | 'clear' | 'quiet';
const APPOINTMENTS_WORKSPACE_PAGE = 'appointments';

interface AppointmentsWorkspaceState {
  requestStatus: RequestStatusFilter;
  slotStatus: SlotStatusFilter;
  scheduleView: ScheduleView;
  scheduleDate: string;
}

interface CoordinationState {
  label: string;
  note: string;
  tone: CoordinationTone;
}

interface CoverageState {
  label: string;
  summaryHint: string;
  note: string;
  publishNote: string;
  tone: CoordinationTone;
}

interface PublishOutcome {
  slotId: string;
  startsAt: string;
  endsAt: string;
}

interface RequestReviewOutcome {
  status: 'approved' | 'rejected';
  patientLabel: string;
}

interface ScheduleRange {
  from: string;
  to: string;
  dayKeys: string[];
  label: string;
  caption: string;
}

interface RequestScheduleContext {
  label: string;
  note: string;
  tone: CoordinationTone;
  inRange: boolean;
}

function toIsoDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('Use a valid date/time value.');
  }
  return parsed.toISOString();
}

function toStatusVariant(status: string): BadgeVariant {
  if (status === 'approved' || status === 'available') {
    return 'success';
  }
  if (status === 'pending') {
    return 'warning';
  }
  if (status === 'rejected' || status === 'canceled' || status === 'closed') {
    return 'danger';
  }
  return 'default';
}

function toWorkflowVariant(status: string | undefined): BadgeVariant {
  const tone = appointmentWorkflowTone(status);
  if (tone === 'success' || tone === 'warning' || tone === 'danger') {
    return tone;
  }
  return 'default';
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatWorkspaceUpdatedAt(...timestamps: number[]): string {
  const timestamp = Math.max(...timestamps.filter((value) => Number.isFinite(value) && value > 0), 0);
  if (!timestamp) {
    return '--';
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSlotViewLabel(status: SlotStatusFilter): string {
  return status === 'available' ? 'Open capacity' : 'Closed capacity';
}

function formatRequestViewLabel(status: RequestStatusFilter): string {
  if (status === 'pending') {
    return 'Needs review';
  }
  if (status === 'approved') {
    return 'Approved';
  }
  if (status === 'rejected') {
    return 'Declined';
  }
  return 'Canceled';
}

function formatCalendarDay(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimeRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return `${startsAt} - ${endsAt}`;
  }

  return `${start.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })} to ${end.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function formatWaitingDuration(value: string): string {
  const relative = formatRelativeTime(value);

  if (relative === 'Unknown') {
    return 'Waiting';
  }

  if (relative === 'Just now') {
    return 'Waiting now';
  }

  return `Waiting ${relative.replace(/\s+ago$/, '')}`;
}

function patientInitials(label: string): string {
  const normalized = label.trim();
  if (!normalized) {
    return 'PT';
  }

  const parts = normalized.split(/\s+/).slice(0, 2);
  const initials = parts
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return initials || normalized.slice(0, 2).toUpperCase();
}

function padDateSegment(value: number): string {
  return String(value).padStart(2, '0');
}

function toLocalDateKey(value: Date): string {
  return `${value.getFullYear()}-${padDateSegment(value.getMonth() + 1)}-${padDateSegment(
    value.getDate(),
  )}`;
}

function parseLocalDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const next = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!Number.isFinite(next.getTime())) {
    return null;
  }

  return next;
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(value: Date): Date {
  const start = startOfLocalDay(value);
  const offset = (start.getDay() + 6) % 7;
  return addDays(start, -offset);
}

function formatDayHeader(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
  });
}

function formatScheduleRangeLabel(startsAt: Date, endsAt: Date): string {
  const startLabel = startsAt.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
  const endLabel = endsAt.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });

  return `${startLabel} - ${endLabel}`;
}

function createDefaultAppointmentsWorkspaceState(): AppointmentsWorkspaceState {
  return {
    requestStatus: 'pending',
    slotStatus: 'available',
    scheduleView: 'week',
    scheduleDate: toLocalDateKey(new Date()),
  };
}

function getScheduleRange(scheduleView: ScheduleView, scheduleDate: string): ScheduleRange {
  const anchorDate = parseLocalDateKey(scheduleDate) ?? new Date();
  const normalizedAnchor = startOfLocalDay(anchorDate);

  if (scheduleView === 'day') {
    const dayKey = toLocalDateKey(normalizedAnchor);
    return {
      from: normalizedAnchor.toISOString(),
      to: addDays(normalizedAnchor, 1).toISOString(),
      dayKeys: [dayKey],
      label: normalizedAnchor.toLocaleDateString([], {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
      caption: 'Day view',
    };
  }

  const weekStart = startOfWeek(normalizedAnchor);
  const dayKeys = Array.from({ length: 7 }, (_, index) => toLocalDateKey(addDays(weekStart, index)));
  const weekEnd = addDays(weekStart, 6);

  return {
    from: weekStart.toISOString(),
    to: addDays(weekStart, 7).toISOString(),
    dayKeys,
    label: formatScheduleRangeLabel(weekStart, weekEnd),
    caption: 'Week view',
  };
}

function sortSlotsByStart(slots: AppointmentSlot[]): AppointmentSlot[] {
  return [...slots].sort((left, right) => {
    return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
  });
}

function isSameLocalDay(left: string, rightDateKey: string): boolean {
  const parsed = new Date(left);
  if (!Number.isFinite(parsed.getTime())) {
    return false;
  }

  return toLocalDateKey(parsed) === rightDateKey;
}

function rangesOverlap(
  leftStartsAt: string,
  leftEndsAt: string,
  rightStartsAt: string,
  rightEndsAt: string,
): boolean {
  const leftStartMs = new Date(leftStartsAt).getTime();
  const leftEndMs = new Date(leftEndsAt).getTime();
  const rightStartMs = new Date(rightStartsAt).getTime();
  const rightEndMs = new Date(rightEndsAt).getTime();

  if (
    !Number.isFinite(leftStartMs) ||
    !Number.isFinite(leftEndMs) ||
    !Number.isFinite(rightStartMs) ||
    !Number.isFinite(rightEndMs)
  ) {
    return false;
  }

  return leftStartMs < rightEndMs && leftEndMs > rightStartMs;
}

function requestFallsInVisibleRange(
  request: AppointmentRequestItem,
  range: ScheduleRange,
): boolean {
  return rangesOverlap(request.startsAt, request.endsAt, range.from, range.to);
}

function describeRequestScheduleContext(
  request: AppointmentRequestItem | null,
  scheduleView: ScheduleView,
  range: ScheduleRange,
  scheduleSlots: AppointmentSlot[],
): RequestScheduleContext | null {
  if (!request) {
    return null;
  }

  const openSlots = scheduleSlots.filter((slot) => (slot.status ?? 'available') === 'available');
  const scheduleViewLabel = scheduleView === 'week' ? 'week' : 'day';

  if (!requestFallsInVisibleRange(request, range)) {
    return {
      label: `Requested window is outside this ${scheduleViewLabel}`,
      note: `Use ${scheduleView === 'week' ? 'Previous or Next week' : 'Previous or Next day'} to inspect visible capacity around this request.`,
      tone: 'quiet',
      inRange: false,
    };
  }

  const sameWindowOpenSlots = openSlots.filter((slot) =>
    rangesOverlap(slot.startsAt, slot.endsAt, request.startsAt, request.endsAt),
  );
  if (sameWindowOpenSlots.length > 0) {
    return {
      label: 'Open capacity is visible in this requested block',
      note: 'Published windows are visible during the requested time block in the current schedule. Review them before deciding the next scheduling step.',
      tone: 'clear',
      inRange: true,
    };
  }

  const requestDayKey = toLocalDateKey(new Date(request.startsAt));
  const sameDayOpenSlots = openSlots.filter((slot) => isSameLocalDay(slot.startsAt, requestDayKey));
  if (sameDayOpenSlots.length > 0) {
    return {
      label: 'Open capacity is visible on the requested day',
      note: 'Published windows are visible on this day in the current schedule, even though none are shown during the requested block.',
      tone: 'clear',
      inRange: true,
    };
  }

  if (openSlots.length > 0) {
    return {
      label: `Open capacity is visible elsewhere in this ${scheduleViewLabel}`,
      note: 'Published windows are visible in the current schedule range, but not on the requested day shown here.',
      tone: 'quiet',
      inRange: true,
    };
  }

  return {
    label: `No open capacity is visible in this ${scheduleViewLabel}`,
    note: 'No published open slot appears in the current schedule range. Review the queue, then publish availability only if more clinician time is truly needed.',
    tone: 'attention',
    inRange: true,
  };
}

function describeCoordinationState(
  pendingRequestsCount: number,
  availableSlotsCount: number,
): CoordinationState {
  if (pendingRequestsCount > 0 && availableSlotsCount === 0) {
    return {
      label: 'Requests waiting without open capacity',
      note: 'Review requests first, then publish availability so the queue can move without overpromising booked time.',
      tone: 'attention',
    };
  }

  if (pendingRequestsCount > 0) {
    return {
      label: 'Requests waiting',
      note: 'Review demand now and confirm whether the current open capacity is enough before publishing more slots.',
      tone: 'attention',
    };
  }

  if (availableSlotsCount > 0) {
    return {
      label: 'Capacity open',
      note: 'The review queue is quiet and published availability is ready for new bookings.',
      tone: 'clear',
    };
  }

  return {
    label: 'Quiet queue',
    note: 'No requests are waiting and no open capacity is currently published.',
    tone: 'quiet',
  };
}

function describeCoverageState(
  pendingRequestsCount: number,
  availableSlotsCount: number,
): CoverageState {
  if (pendingRequestsCount > 0 && availableSlotsCount === 0) {
    return {
      label: 'Demand uncovered',
      summaryHint: 'Requests are waiting and there are no open slots published yet.',
      note: 'Published capacity does not yet cover the waiting queue.',
      publishNote:
        'Review the waiting requests first, then publish availability so the queue has real coverage.',
      tone: 'attention',
    };
  }

  if (pendingRequestsCount > availableSlotsCount) {
    return {
      label: 'Demand exceeds open capacity',
      summaryHint: 'Some open slots are published, but they do not yet cover all waiting requests.',
      note: 'Published capacity does not yet cover the waiting queue.',
      publishNote:
        'Review the queue, then publish more availability if the current open slots will not absorb the waiting demand.',
      tone: 'attention',
    };
  }

  if (pendingRequestsCount > 0) {
    return {
      label: 'Demand currently covered',
      summaryHint: 'Open capacity appears sufficient for the requests already waiting.',
      note: 'Current open slots appear sufficient for the waiting queue while clinician review continues.',
      publishNote:
        'Additional publishing is optional right now. Use this panel only if more follow-up time truly needs to be opened.',
      tone: 'clear',
    };
  }

  if (availableSlotsCount > 0) {
    return {
      label: 'Queue quiet with open capacity',
      summaryHint: 'Open capacity is already published even though no requests are waiting right now.',
      note: 'No requests are waiting and published capacity is ready if new demand arrives.',
      publishNote:
        'Capacity is already published. Add more availability only if additional clinician time needs to be opened.',
      tone: 'quiet',
    };
  }

  return {
    label: 'Queue quiet with no published capacity',
    summaryHint: 'The queue is quiet and there is no open capacity published right now.',
    note: 'No requests are waiting and no capacity is currently published.',
    publishNote: 'Leave capacity unpublished until new demand needs coverage.',
    tone: 'quiet',
  };
}

function describeNextOpenSlot(slots: Array<{ startsAt: string; endsAt: string }>): {
  value: string;
  hint: string;
} {
  const nextSlot = slots
    .map((slot) => ({ slot, startsAtMs: new Date(slot.startsAt).getTime() }))
    .filter((entry) => Number.isFinite(entry.startsAtMs))
    .sort((left, right) => left.startsAtMs - right.startsAtMs)[0];

  if (!nextSlot) {
    return {
      value: 'No open slot yet',
      hint: 'Publish availability below when demand needs coverage.',
    };
  }

  return {
    value: formatCalendarDay(nextSlot.slot.startsAt),
    hint: formatTimeRange(nextSlot.slot.startsAt, nextSlot.slot.endsAt),
  };
}

function matchPublishedOpenSlot(
  createdSlot: AppointmentSlot,
  openSlots: AppointmentSlot[],
): AppointmentSlot | null {
  const normalizedCreatedId = createdSlot.slotId?.trim();
  if (normalizedCreatedId) {
    const directMatch = openSlots.find((slot) => slot.slotId === normalizedCreatedId);
    if (directMatch) {
      return directMatch;
    }
  }

  return (
    openSlots.find(
      (slot) =>
        (slot.status ?? 'available') === 'available' &&
        slot.startsAt === createdSlot.startsAt &&
        slot.endsAt === createdSlot.endsAt,
    ) ?? null
  );
}

function describePublishCoverage(
  pendingRequestsCount: number,
  availableSlotsCount: number,
): {
  coverageText: string;
  nextStepText: string;
} {
  if (pendingRequestsCount > availableSlotsCount) {
    return {
      coverageText: 'Open capacity is published, but some requests are still waiting without enough coverage.',
      nextStepText: 'Review requests to confirm where more scheduling time is still needed.',
    };
  }

  if (pendingRequestsCount > 0) {
    return {
      coverageText: 'Open capacity is published and current demand now appears covered.',
      nextStepText: 'Review requests to confirm the next scheduling step.',
    };
  }

  if (availableSlotsCount > 0) {
    return {
      coverageText: 'The queue is quiet and open capacity is now available if new demand arrives.',
      nextStepText: 'Open capacity is ready while the request queue stays quiet.',
    };
  }

  return {
    coverageText: 'Availability is published in the current workspace.',
    nextStepText: 'Review the queue to confirm the next scheduling step.',
  };
}

function normalizeAppointmentsWorkspaceState(value: unknown): AppointmentsWorkspaceState {
  const fallback = createDefaultAppointmentsWorkspaceState();

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  const candidate = value as {
    requestStatus?: string;
    slotStatus?: string;
    scheduleView?: string;
    scheduleDate?: string;
  };
  const parsedDate = candidate.scheduleDate ? parseLocalDateKey(candidate.scheduleDate) : null;

  return {
    requestStatus:
      candidate.requestStatus === 'approved' ||
      candidate.requestStatus === 'rejected' ||
      candidate.requestStatus === 'canceled'
        ? candidate.requestStatus
        : 'pending',
    slotStatus: candidate.slotStatus === 'closed' ? 'closed' : 'available',
    scheduleView: candidate.scheduleView === 'day' ? 'day' : 'week',
    scheduleDate: parsedDate ? toLocalDateKey(parsedDate) : fallback.scheduleDate,
  };
}

export function AppointmentsPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [workspaceState, setWorkspaceState] = useState<AppointmentsWorkspaceState>(() =>
    readWorkspaceState(
      APPOINTMENTS_WORKSPACE_PAGE,
      createDefaultAppointmentsWorkspaceState(),
      normalizeAppointmentsWorkspaceState,
    ),
  );
  const { requestStatus, scheduleDate, scheduleView, slotStatus } = workspaceState;
  const [startsAtInput, setStartsAtInput] = useState('');
  const [endsAtInput, setEndsAtInput] = useState('');
  const [meetingLinkInput, setMeetingLinkInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [reviewingKey, setReviewingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastPublishOutcome, setLastPublishOutcome] = useState<PublishOutcome | null>(null);
  const [lastRequestReviewOutcome, setLastRequestReviewOutcome] =
    useState<RequestReviewOutcome | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const patientsQuery = usePatients();
  const scheduleRange = useMemo(
    () => getScheduleRange(scheduleView, scheduleDate),
    [scheduleDate, scheduleView],
  );

  const scheduleSlotsQuery = useQuery({
    queryKey: ['appointments-schedule-slots', scheduleRange.from, scheduleRange.to],
    queryFn: () =>
      listAppointmentSlots({
        from: scheduleRange.from,
        to: scheduleRange.to,
        limit: 200,
      }),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const requestsQuery = useQuery({
    queryKey: ['appointments-requests', requestStatus],
    queryFn: () => listAppointmentRequests({ status: requestStatus, limit: 100 }),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const openSlotsSummaryQuery = useQuery({
    queryKey: ['appointments-slots-summary', 'available'],
    queryFn: () => listAppointmentSlots({ status: 'available', limit: 100 }),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const pendingRequestsSummaryQuery = useQuery({
    queryKey: ['appointments-requests-summary', 'pending'],
    queryFn: () => listAppointmentRequests({ status: 'pending', limit: 100 }),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const canCreate = useMemo(
    () => startsAtInput.trim().length > 0 && endsAtInput.trim().length > 0 && !isCreating,
    [endsAtInput, isCreating, startsAtInput],
  );

  const scheduleSlots = useMemo(
    () => sortSlotsByStart(scheduleSlotsQuery.data ?? []),
    [scheduleSlotsQuery.data],
  );
  const slots = useMemo(
    () => scheduleSlots.filter((slot) => (slot.status ?? 'available') === slotStatus),
    [scheduleSlots, slotStatus],
  );
  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const openSlots = useMemo(() => openSlotsSummaryQuery.data ?? [], [openSlotsSummaryQuery.data]);
  const pendingRequests = useMemo(
    () => pendingRequestsSummaryQuery.data ?? [],
    [pendingRequestsSummaryQuery.data],
  );
  const patientNameById = useMemo(() => {
    return new Map((patientsQuery.data ?? []).map((patient) => [patient.id, getPatientDisplayName(patient)]));
  }, [patientsQuery.data]);

  const availableSlotsCount = openSlots.length;
  const pendingRequestsCount = pendingRequests.length;
  const refreshedAtLabel = formatWorkspaceUpdatedAt(
    scheduleSlotsQuery.dataUpdatedAt,
    requestsQuery.dataUpdatedAt,
    openSlotsSummaryQuery.dataUpdatedAt,
    pendingRequestsSummaryQuery.dataUpdatedAt,
    patientsQuery.dataUpdatedAt,
  );

  function openPatientFromAppointments(item: {
    patientId: string;
    workflowStatus?: string;
    status?: string;
    note?: string | null;
  }): void {
    const normalizedPatientId = item.patientId.trim();

    if (!normalizedPatientId) {
      return;
    }

    navigate(`/patients/${encodeURIComponent(normalizedPatientId)}`, {
      state: createPatientEntryState({
        patientId: normalizedPatientId,
        source: 'appointments',
        subtype: item.workflowStatus?.trim() || item.status?.trim() || 'review',
        hint: item.note?.trim() || 'Scheduling follow-through',
        focus: 'appointments',
        returnTo: '/appointments',
      }),
    });
  }
  const isRefreshingWorkspace =
    scheduleSlotsQuery.isFetching ||
    requestsQuery.isFetching ||
    openSlotsSummaryQuery.isFetching ||
    pendingRequestsSummaryQuery.isFetching ||
    patientsQuery.isFetching;
  const slotViewLabel = formatSlotViewLabel(slotStatus);
  const requestViewLabel = formatRequestViewLabel(requestStatus);
  const coordinationState = describeCoordinationState(pendingRequestsCount, availableSlotsCount);
  const coverageState = describeCoverageState(pendingRequestsCount, availableSlotsCount);
  const nextOpenSlotSummary = describeNextOpenSlot(openSlots);
  const capacityNeedsPublishing = pendingRequestsCount > availableSlotsCount;
  const publishOutcomeCopy = lastPublishOutcome
    ? describePublishCoverage(pendingRequestsCount, availableSlotsCount)
    : null;
  const requestReviewOutcomeTitle =
    lastRequestReviewOutcome?.status === 'approved' ? 'Request approved' : 'Request rejected';
  const requestReviewOutcomeFollowThrough =
    pendingRequestsCount > 0
      ? `${pendingRequestsCount} request${pendingRequestsCount === 1 ? '' : 's'} still ${
          pendingRequestsCount === 1 ? 'needs' : 'need'
        } review in this view.`
      : availableSlotsCount > 0
        ? 'Pending review is clear and open capacity remains available.'
        : 'Pending review is clear and the queue is quiet.';
  const publishOutcomeSlotLabel = lastPublishOutcome
    ? `${formatCalendarDay(lastPublishOutcome.startsAt)} · ${formatTimeRange(
        lastPublishOutcome.startsAt,
        lastPublishOutcome.endsAt,
      )}`
    : null;
  const showViewOpenCapacityAction = lastPublishOutcome !== null && slotStatus !== 'available';
  const showReviewRequestsAction =
    lastPublishOutcome !== null && pendingRequestsCount > 0 && requestStatus !== 'pending';
  const requestCountLabel = `${pendingRequestsCount} request${pendingRequestsCount === 1 ? '' : 's'} waiting`;
  const openCapacityLabel = `${availableSlotsCount} open slot${availableSlotsCount === 1 ? '' : 's'}`;
  const capacityStatusLabel = coverageState.label;
  const workspaceActionLabel = capacityNeedsPublishing ? 'Publish after review' : 'Coverage ready';
  const requestsSummaryHint =
    pendingRequestsCount > 0
      ? 'Requests still need clinician review before scheduling decisions are final.'
      : 'No booking requests are waiting for clinician review right now.';
  const openCapacitySummaryHint =
    availableSlotsCount > 0
      ? pendingRequestsCount > availableSlotsCount
        ? 'Some open slots are published, but more coverage may still be needed.'
        : pendingRequestsCount > 0
          ? 'Open capacity appears sufficient for the requests already waiting.'
          : 'Published slots are ready if new demand arrives.'
      : pendingRequestsCount > 0
        ? 'No open slots are published for the waiting queue.'
        : 'No capacity is currently published.';
  const composerGuidance = coverageState.publishNote;
  const composerMetaLabel = capacityNeedsPublishing
    ? 'Demand needs coverage'
    : pendingRequestsCount > 0
      ? 'Demand appears covered'
      : availableSlotsCount > 0
        ? 'Capacity already published'
        : 'Publish only when needed';
  const composerStatusVariant: BadgeVariant = capacityNeedsPublishing
    ? 'warning'
    : availableSlotsCount > 0
      ? 'success'
      : 'default';
  const requestsSectionNote =
    requestStatus === 'pending'
      ? pendingRequestsCount > 0
        ? availableSlotsCount === 0
          ? `${pendingRequestsCount} request${pendingRequestsCount === 1 ? ' is' : 's are'} waiting and no open capacity is published yet.`
          : pendingRequestsCount > availableSlotsCount
            ? `${pendingRequestsCount} request${pendingRequestsCount === 1 ? ' is' : 's are'} waiting while only ${availableSlotsCount} open slot${availableSlotsCount === 1 ? ' is' : 's are'} published.`
            : `${pendingRequestsCount} request${pendingRequestsCount === 1 ? ' is' : 's are'} waiting and open capacity appears sufficient while review continues.`
        : availableSlotsCount > 0
          ? 'No requests are waiting right now and published capacity is ready if new demand arrives.'
          : 'No requests are waiting right now.'
      : `${requests.length} requests are shown in this status view for reference.`;
  const slotsEmptyTitle =
    slotStatus === 'available'
      ? `No open capacity in this ${scheduleView}`
      : `No closed capacity in this ${scheduleView}`;
  const slotsEmptyDescription =
    slotStatus === 'available'
      ? pendingRequestsCount > 0
        ? 'Requests are waiting and no open capacity is visible in the current schedule range. Review the queue, then publish availability if coverage is needed.'
        : 'No open capacity is visible in the current schedule range. Move to another day or week, or leave capacity unpublished until demand needs coverage.'
      : 'No closed capacity is visible in the current schedule range.';
  const requestsEmptyTitle =
    requestStatus === 'pending' ? 'No requests are waiting right now' : `No ${requestStatus} requests`;
  const requestsEmptyDescription =
    requestStatus === 'pending'
      ? availableSlotsCount > 0
        ? 'Queue is quiet and published capacity is ready if new demand arrives.'
        : 'Queue is quiet. New booking requests will appear here when clinician review is needed.'
      : 'Requests matching this review state will appear here when scheduling activity changes.';
  const scheduleTitle = 'Schedule';
  const scheduleNote =
    scheduleView === 'week'
      ? 'Use the visible week to judge whether published capacity covers the request currently in review.'
      : 'Use the visible day to judge whether published capacity covers the request currently in review.';
  const scheduleEmptyTitle =
    scheduleView === 'week' ? 'No visible capacity in this week' : 'No visible capacity in this day';
  const scheduleEmptyDescription =
    scheduleView === 'week'
      ? 'No open or closed slots are present in the current fetched week. Move to another week or publish availability when demand needs coverage.'
      : 'No open or closed slots are present in the current fetched day. Move to another day or publish availability when demand needs coverage.';
  const slotsDetailTitle = slotStatus === 'available' ? 'Open capacity detail' : 'Closed capacity detail';
  const slotsDetailNote =
    slotStatus === 'available'
      ? 'Reference the open windows already visible in this range before publishing more clinician time.'
      : 'Reference closed windows in this range without changing the current schedule view.';

  const visibleOpenSlotsCount = useMemo(
    () => scheduleSlots.filter((slot) => (slot.status ?? 'available') === 'available').length,
    [scheduleSlots],
  );
  const visibleClosedSlotsCount = Math.max(scheduleSlots.length - visibleOpenSlotsCount, 0);
  const selectedRequest = useMemo(
    () => requests.find((item) => item.requestId === selectedRequestId) ?? requests[0] ?? null,
    [requests, selectedRequestId],
  );
  const requestScheduleContext = useMemo(
    () => describeRequestScheduleContext(selectedRequest, scheduleView, scheduleRange, scheduleSlots),
    [scheduleRange, scheduleSlots, scheduleView, selectedRequest],
  );
  const todayDateKey = toLocalDateKey(new Date());
  const selectedRequestDayKey =
    selectedRequest && Number.isFinite(new Date(selectedRequest.startsAt).getTime())
      ? toLocalDateKey(new Date(selectedRequest.startsAt))
      : null;
  const scheduleSlotsByDay = useMemo(() => {
    const next = new Map<string, AppointmentSlot[]>();
    scheduleRange.dayKeys.forEach((dayKey) => {
      next.set(dayKey, []);
    });
    scheduleSlots.forEach((slot) => {
      const slotDayKey = toLocalDateKey(new Date(slot.startsAt));
      if (!next.has(slotDayKey)) {
        return;
      }
      next.set(slotDayKey, [...(next.get(slotDayKey) ?? []), slot]);
    });

    return next;
  }, [scheduleRange.dayKeys, scheduleSlots]);
  const demandCapacityScale = Math.max(pendingRequestsCount, availableSlotsCount, 1);
  const demandCapacityBars = [
    {
      key: 'demand',
      label: 'Requests waiting',
      count: pendingRequestsCount,
      width: `${(pendingRequestsCount / demandCapacityScale) * 100}%`,
    },
    {
      key: 'capacity',
      label: 'Open slots',
      count: availableSlotsCount,
      width: `${(availableSlotsCount / demandCapacityScale) * 100}%`,
    },
  ] as const;
  const visibleCapacityPreview = scheduleRange.dayKeys.map((dayKey) => {
    const daySlots = scheduleSlotsByDay.get(dayKey) ?? [];
    const openCount = daySlots.filter((slot) => (slot.status ?? 'available') === 'available').length;
    const closedCount = Math.max(daySlots.length - openCount, 0);

    return {
      dayKey,
      label: formatDayHeader(dayKey),
      openCount,
      closedCount,
      totalCount: daySlots.length,
      openHeight: `${Math.max(openCount, 0) * 18 + 8}px`,
      closedHeight: `${Math.max(closedCount, 0) * 12 + 8}px`,
      isToday: dayKey === todayDateKey,
    };
  });
  const summaryLeadTitle =
    capacityNeedsPublishing
      ? 'Demand needs scheduling coverage'
      : pendingRequestsCount > 0
        ? 'Demand is under active review'
        : availableSlotsCount > 0
          ? 'Capacity is already open'
          : 'Queue is quiet';
  const summaryLeadNarrative =
    capacityNeedsPublishing
      ? 'Review the waiting requests, inspect the visible schedule, then publish only the clinician time that actually closes the coverage gap.'
      : coordinationState.note;

  useEffect(() => {
    if (requests.length === 0) {
      if (selectedRequestId !== null) {
        setSelectedRequestId(null);
      }
      return;
    }

    if (!selectedRequestId || !requests.some((item) => item.requestId === selectedRequestId)) {
      setSelectedRequestId(requests[0]?.requestId ?? null);
    }
  }, [requests, selectedRequestId]);

  function updateWorkspaceState(
    patch:
      | Partial<AppointmentsWorkspaceState>
      | ((current: AppointmentsWorkspaceState) => AppointmentsWorkspaceState),
  ): void {
    setWorkspaceState((current) => {
      const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
      writeWorkspaceState(APPOINTMENTS_WORKSPACE_PAGE, next);
      return next;
    });
  }

  function handleRequestStatusChange(status: RequestStatusFilter): void {
    updateWorkspaceState({ requestStatus: status });
  }

  function handleSlotStatusChange(status: SlotStatusFilter): void {
    updateWorkspaceState({ slotStatus: status });
  }

  function handleScheduleViewChange(view: ScheduleView): void {
    updateWorkspaceState({ scheduleView: view });
  }

  function handleScheduleDateShift(direction: 'previous' | 'next'): void {
    updateWorkspaceState((current) => {
      const anchorDate = parseLocalDateKey(current.scheduleDate) ?? new Date();
      const offset = direction === 'next' ? 1 : -1;
      const nextDate =
        current.scheduleView === 'day'
          ? addDays(anchorDate, offset)
          : addDays(anchorDate, offset * 7);

      return {
        ...current,
        scheduleDate: toLocalDateKey(nextDate),
      };
    });
  }

  function handleScheduleToday(): void {
    updateWorkspaceState({
      scheduleDate: toLocalDateKey(new Date()),
    });
  }

  async function handleRefreshWorkspace() {
    const [
      scheduleSlotsResult,
      requestsResult,
      openSlotsResult,
      pendingRequestsResult,
      patientsResult,
    ] =
      await Promise.all([
        scheduleSlotsQuery.refetch(),
        requestsQuery.refetch(),
        openSlotsSummaryQuery.refetch(),
        pendingRequestsSummaryQuery.refetch(),
        patientsQuery.refetch(),
      ]);

    return {
      scheduleSlotsResult,
      requestsResult,
      openSlotsResult,
      pendingRequestsResult,
      patientsResult,
    };
  }

  async function handleCreateSlot(): Promise<void> {
    setErrorMessage(null);
    setLastPublishOutcome(null);
    setIsCreating(true);
    try {
      const startsAt = toIsoDateTime(startsAtInput);
      const endsAt = toIsoDateTime(endsAtInput);

      const createdSlot = await createAppointmentSlot({
        startsAt,
        endsAt,
        meetingLink: meetingLinkInput.trim() || undefined,
      });

      setStartsAtInput('');
      setEndsAtInput('');
      setMeetingLinkInput('');
      const refreshResults = await handleRefreshWorkspace();
      const openSlotsData = refreshResults.openSlotsResult.data;
      const pendingRequestsData = refreshResults.pendingRequestsResult.data;
      const canConfirmOutcome =
        !refreshResults.pendingRequestsResult.error &&
        Array.isArray(pendingRequestsData);

      if (canConfirmOutcome) {
        let refreshedOpenSlots = Array.isArray(openSlotsData) ? openSlotsData : null;
        let matchedSlot = refreshedOpenSlots
          ? matchPublishedOpenSlot(createdSlot, refreshedOpenSlots)
          : null;

        if (!matchedSlot) {
          refreshedOpenSlots = await listAppointmentSlots({ status: 'available', limit: 100 });
          matchedSlot = matchPublishedOpenSlot(createdSlot, refreshedOpenSlots);
        }

        if (matchedSlot) {
          queryClient.setQueryData(['appointments-slots-summary', 'available'], refreshedOpenSlots);
          const matchedStartsAtMs = new Date(matchedSlot.startsAt).getTime();
          const scheduleRangeStartMs = new Date(scheduleRange.from).getTime();
          const scheduleRangeEndMs = new Date(scheduleRange.to).getTime();

          if (
            Number.isFinite(matchedStartsAtMs) &&
            matchedStartsAtMs >= scheduleRangeStartMs &&
            matchedStartsAtMs < scheduleRangeEndMs
          ) {
            queryClient.setQueryData<AppointmentSlot[]>(
              ['appointments-schedule-slots', scheduleRange.from, scheduleRange.to],
              (current = []) =>
                sortSlotsByStart([
                  ...current.filter((slot) => slot.slotId !== matchedSlot.slotId),
                  matchedSlot,
                ]),
            );
          }
          setLastPublishOutcome({
            slotId: matchedSlot.slotId,
            startsAt: matchedSlot.startsAt,
            endsAt: matchedSlot.endsAt,
          });
        }
      }
    } catch (error) {
      setErrorMessage(toUserMessage(asAppError(error)));
      setLastPublishOutcome(null);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleReview(requestId: string, status: 'approved' | 'rejected'): Promise<void> {
    setErrorMessage(null);
    setLastRequestReviewOutcome(null);
    setReviewingKey(`${requestId}:${status}`);
    const pendingItem = requests.find((item) => item.requestId === requestId) ?? null;
    try {
      const reviewedItem = await reviewAppointmentRequest(requestId, status);
      const refreshResult = await handleRefreshWorkspace();
      const refreshedPendingRequests = refreshResult.pendingRequestsResult.data;
      const refreshedOpenSlots = refreshResult.openSlotsResult.data;
      const movedOutOfPending =
        Array.isArray(refreshedPendingRequests) &&
        !refreshedPendingRequests.some((item) => item.requestId === reviewedItem.requestId);

      if (
        !refreshResult.pendingRequestsResult.error &&
        !refreshResult.openSlotsResult.error &&
        Array.isArray(refreshedPendingRequests) &&
        Array.isArray(refreshedOpenSlots) &&
        movedOutOfPending
      ) {
        const patientId = reviewedItem.patientId.trim();
        const patientLabel =
          patientNameById.get(patientId) ?? pendingItem?.patientId ?? patientId;

        setLastRequestReviewOutcome({
          status,
          patientLabel,
        });
      }
    } catch (error) {
      setLastRequestReviewOutcome(null);
      setErrorMessage(toUserMessage(asAppError(error)));
    } finally {
      setReviewingKey(null);
    }
  }

  function renderScheduleSlot(slot: AppointmentSlot): JSX.Element {
    const resolvedStatus = slot.status ?? 'available';
    const isRecentlyPublished = lastPublishOutcome?.slotId === slot.slotId;
    const isRequestContextSlot =
      selectedRequest !== null &&
      requestScheduleContext?.inRange === true &&
      rangesOverlap(slot.startsAt, slot.endsAt, selectedRequest.startsAt, selectedRequest.endsAt);

    return (
      <article
        key={`schedule-${slot.slotId}`}
        className={`appointments-schedule-slot appointments-schedule-slot--${resolvedStatus}${
          isRecentlyPublished ? ' appointments-schedule-slot--recent' : ''
        }${isRequestContextSlot ? ' appointments-schedule-slot--request-context' : ''}`}
      >
        <div className="appointments-schedule-slot__header">
          <p className="appointments-schedule-slot__time">{formatTimeRange(slot.startsAt, slot.endsAt)}</p>
          <Badge variant={toStatusVariant(resolvedStatus)}>
            {resolvedStatus === 'available' ? 'Open' : 'Closed'}
          </Badge>
        </div>
        <p className="appointments-schedule-slot__label">
          {resolvedStatus === 'available' ? 'Open capacity' : 'Closed capacity'}
        </p>
        <p className="appointments-schedule-slot__note">
          {resolvedStatus === 'available'
            ? 'Visible for request follow-through in this range.'
            : 'Kept in the visible schedule for reference only.'}
        </p>
        {isRecentlyPublished ? (
          <p className="appointments-schedule-slot__status">Recently published in this session.</p>
        ) : null}
      </article>
    );
  }

  return (
    <div className="page-stack dashboard-page-shell dashboard-page-shell--appointments appointments-page">
      <Section
        className="dashboard-page-header dashboard-page-header--appointments appointments-page-header"
        eyebrow="Care coordination"
        title="Appointments"
        subtitle="Review scheduling demand, confirm whether open capacity is sufficient, and publish new availability only when it is truly needed."
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={isRefreshingWorkspace}
            onClick={() => {
              void handleRefreshWorkspace();
            }}
          >
            {isRefreshingWorkspace ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      />

      <section className="appointments-summary-strip" aria-label="Appointments summary">
        <article className={`appointments-summary-strip__lead appointments-summary-strip__lead--${coordinationState.tone}`}>
          <div className="appointments-summary-strip__lead-copy">
            <p className="appointments-summary-strip__eyebrow">Scheduling coordination</p>
            <div className="appointments-summary-strip__headline">
              <p className="appointments-summary-strip__lead-value">{pendingRequestsCount}</p>
              <div className="appointments-summary-strip__headline-copy">
                <p className="appointments-summary-strip__headline-title">{summaryLeadTitle}</p>
                <p className="appointments-summary-strip__hint">{summaryLeadNarrative}</p>
              </div>
            </div>
            <div className="appointments-summary-strip__lead-pills" aria-live="polite">
              <span className="appointments-summary-strip__lead-pill">{coordinationState.label}</span>
              <span className="appointments-summary-strip__lead-pill">{coverageState.label}</span>
              <span className="appointments-summary-strip__lead-pill">Updated {refreshedAtLabel}</span>
            </div>
          </div>
          <div className="appointments-summary-strip__comparison" aria-label="Demand versus capacity">
            <div className="appointments-summary-strip__comparison-copy">
              <p className="appointments-summary-strip__comparison-label">Demand vs capacity</p>
              <p className="appointments-summary-strip__comparison-note">
                Read waiting demand against the currently published open slots before publishing more time.
              </p>
            </div>
            <div className="appointments-summary-strip__comparison-bars">
              {demandCapacityBars.map((bar) => (
                <div key={bar.key} className="appointments-summary-strip__comparison-row">
                  <span className="appointments-summary-strip__comparison-row-label">
                    {bar.label}
                  </span>
                  <div className="appointments-summary-strip__comparison-track" aria-hidden="true">
                    <span
                      className={`appointments-summary-strip__comparison-fill appointments-summary-strip__comparison-fill--${bar.key}`}
                      style={{ width: bar.width }}
                    />
                  </div>
                  <span className="appointments-summary-strip__comparison-count">{bar.count}</span>
                </div>
              ))}
            </div>
            <div className="appointments-summary-strip__capacity-preview" aria-label="Visible capacity by day">
              {visibleCapacityPreview.map((day) => (
                <div
                  key={day.dayKey}
                  className={`appointments-summary-strip__capacity-day${
                    day.isToday ? ' appointments-summary-strip__capacity-day--today' : ''
                  }`}
                  title={`${day.label}: ${day.openCount} open, ${day.closedCount} closed`}
                >
                  <div className="appointments-summary-strip__capacity-bars" aria-hidden="true">
                    <span
                      className="appointments-summary-strip__capacity-bar appointments-summary-strip__capacity-bar--closed"
                      style={{ height: day.closedHeight }}
                    />
                    <span
                      className="appointments-summary-strip__capacity-bar appointments-summary-strip__capacity-bar--open"
                      style={{ height: day.openHeight }}
                    />
                  </div>
                  <span className="appointments-summary-strip__capacity-label">{day.label}</span>
                </div>
              ))}
            </div>
          </div>
        </article>
        <article
          className={`appointments-summary-strip__item appointments-summary-strip__item--state appointments-summary-strip__item--state-${coordinationState.tone}`}
        >
          <p className="appointments-summary-strip__label">Coordination state</p>
          <p className="appointments-summary-strip__value appointments-summary-strip__value--state">
            {coordinationState.label}
          </p>
          <p className="appointments-summary-strip__hint">{coverageState.summaryHint}</p>
        </article>
        <article className="appointments-summary-strip__item appointments-summary-strip__item--attention">
          <p className="appointments-summary-strip__label">Requests waiting</p>
          <p className="appointments-summary-strip__value">{pendingRequestsCount}</p>
          <p className="appointments-summary-strip__hint">{requestsSummaryHint}</p>
        </article>
        <article className="appointments-summary-strip__item appointments-summary-strip__item--available">
          <p className="appointments-summary-strip__label">Open capacity</p>
          <p className="appointments-summary-strip__value">{availableSlotsCount}</p>
          <p className="appointments-summary-strip__hint">{openCapacitySummaryHint}</p>
        </article>
        <article className="appointments-summary-strip__item appointments-summary-strip__item--timing">
          <p className="appointments-summary-strip__label">Next open slot</p>
          <p className="appointments-summary-strip__value">{nextOpenSlotSummary.value}</p>
          <p className="appointments-summary-strip__hint">{nextOpenSlotSummary.hint}</p>
        </article>
      </section>

      {errorMessage ? (
        <AlertBanner variant="error" title="Could not complete action">
          {errorMessage}
        </AlertBanner>
      ) : null}

      <Card
        className="appointments-workspace-card"
        title={
          <span className="appointments-card-title appointments-card-title--shell">
            <span className="appointments-card-title__eyebrow">Scheduling coordination</span>
            <span className="appointments-card-title__headline">Demand and capacity console</span>
          </span>
        }
        action={
          <div className="appointments-workspace__context-facts appointments-workspace__context-facts--summary" aria-live="polite">
            <span className="appointments-workspace__context-pill appointments-workspace__context-pill--demand">
              {requestCountLabel}
            </span>
            <span className="appointments-workspace__context-pill appointments-workspace__context-pill--capacity">
              {openCapacityLabel}
            </span>
            <span
              className={`appointments-workspace__context-pill appointments-workspace__context-pill--status appointments-workspace__context-pill--status-${coverageState.tone}`}
            >
              {capacityStatusLabel}
            </span>
          </div>
        }
      >
        <div className="appointments-workspace">
          <div className="appointments-workspace__context">
            <div className="appointments-workspace__context-copy">
              <p className="appointments-workspace__context-eyebrow">What needs attention now</p>
              <p className="appointments-workspace__context-text">{coordinationState.note}</p>
              <p className="appointments-workspace__coverage-text">{coverageState.note}</p>
            </div>
            {capacityNeedsPublishing ? (
              <div className="appointments-workspace__context-facts" aria-live="polite">
                <span className="appointments-workspace__context-pill appointments-workspace__context-pill--action">
                  {workspaceActionLabel}
                </span>
              </div>
            ) : null}
          </div>
          {lastPublishOutcome && publishOutcomeCopy ? (
            <section
              className={`appointments-publish-outcome appointments-publish-outcome--${coverageState.tone}`}
              aria-label="Latest publish outcome"
              aria-live="polite"
            >
              <div className="appointments-publish-outcome__copy">
                <p className="appointments-publish-outcome__eyebrow">Latest publish</p>
                <div className="appointments-publish-outcome__heading-row">
                  <h3 className="appointments-publish-outcome__title">Availability published</h3>
                  <span
                    className={`appointments-publish-outcome__status appointments-publish-outcome__status--${coverageState.tone}`}
                  >
                    {coverageState.label}
                  </span>
                </div>
                <p className="appointments-publish-outcome__text">
                  {publishOutcomeSlotLabel
                    ? `${publishOutcomeSlotLabel} is now open in this workspace.`
                    : 'New open capacity is now available in this workspace.'}
                </p>
                <p className="appointments-publish-outcome__text appointments-publish-outcome__text--status">
                  {publishOutcomeCopy.coverageText}
                </p>
                <p className="appointments-publish-outcome__next-step">
                  {publishOutcomeCopy.nextStepText}
                </p>
              </div>
              {showViewOpenCapacityAction || showReviewRequestsAction ? (
                <div className="appointments-publish-outcome__actions">
                  {showViewOpenCapacityAction ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        handleSlotStatusChange('available');
                      }}
                    >
                      View open capacity
                    </Button>
                  ) : null}
                  {showReviewRequestsAction ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        handleRequestStatusChange('pending');
                      }}
                    >
                      Review requests
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
          <div className="appointments-workspace__panels">
            <section
              className={`appointments-workspace__section appointments-workspace__section--requests${
                requestStatus === 'pending' ? ' appointments-workspace__section--requests-active' : ''
              }`}
              aria-label="Appointment requests"
            >
              <header className="appointments-workspace__section-header">
                <div className="appointments-workspace__section-heading">
                  <h3 className="appointments-workspace__section-title">Request review</h3>
                  <p className="appointments-workspace__section-note">{requestsSectionNote}</p>
                </div>
                <Badge variant={requestStatus === 'pending' ? 'warning' : 'default'}>
                  {requestViewLabel}
                </Badge>
              </header>
              <div className="appointments-filter-group appointments-filter-group--segmented">
                {(['pending', 'approved', 'rejected', 'canceled'] as const).map((status) => (
                  <Button
                    key={status}
                    variant={requestStatus === status ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => {
                      handleRequestStatusChange(status);
                    }}
                  >
                    {status}
                  </Button>
                ))}
              </div>

              {requestStatus === 'pending' && lastRequestReviewOutcome ? (
                <div
                  className={`appointments-request-outcome appointments-request-outcome--${lastRequestReviewOutcome.status}`}
                  data-testid="appointments-request-outcome"
                  role="status"
                  aria-live="polite"
                >
                  <div className="appointments-request-outcome__copy">
                    <p className="appointments-request-outcome__eyebrow">Latest request review</p>
                    <strong className="appointments-request-outcome__title">
                      {requestReviewOutcomeTitle}
                    </strong>
                    <p className="appointments-request-outcome__text">
                      Request for {lastRequestReviewOutcome.patientLabel} moved out of Pending review.
                    </p>
                    <p className="appointments-request-outcome__next">
                      {requestReviewOutcomeFollowThrough}
                    </p>
                  </div>
                </div>
              ) : null}

              {requestsQuery.error ? (
                <AlertBanner variant="error" title="Could not load requests">
                  {toUserMessage(requestsQuery.error)}
                </AlertBanner>
              ) : null}

              {requestsQuery.isLoading && requests.length === 0 ? (
                <div className="appointments-skeleton" aria-label="Appointment requests loading placeholder">
                  <Skeleton height={96} />
                  <Skeleton height={96} />
                  <Skeleton height={96} />
                </div>
              ) : requests.length === 0 ? (
                <div className="appointments-empty-state appointments-empty-state--requests" role="status" aria-live="polite">
                  <div className="appointments-empty-state__title-row">
                    <span className="appointments-empty-state__icon" aria-hidden="true">
                      ✓
                    </span>
                    <h3 className="appointments-empty-state__title">{requestsEmptyTitle}</h3>
                  </div>
                  <p className="appointments-empty-state__description">{requestsEmptyDescription}</p>
                  <div className="appointments-empty-state__footer">
                    <p className="appointments-empty-state__meta">Updated {refreshedAtLabel}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isRefreshingWorkspace}
                      onClick={() => {
                        void handleRefreshWorkspace();
                      }}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="stack stack--2">
                  {requests.map((item) => {
                    const patientName = patientNameById.get(item.patientId) ?? item.patientId;
                    const patientMonogram = patientInitials(patientName);
                    const isPendingRequest = item.status === 'pending';
                    const isSelectedRequest = selectedRequest?.requestId === item.requestId;
                    const lifecycleLabel = isPendingRequest
                      ? 'Pending review'
                      : item.status === 'approved'
                        ? 'Approved for workflow'
                        : item.status === 'rejected'
                          ? 'Rejected'
                          : 'Canceled';
                    const lifecycleTiming = isPendingRequest
                      ? formatWaitingDuration(item.createdAt)
                      : item.reviewedAt
                        ? `Reviewed ${formatDateTime(item.reviewedAt)}`
                        : `Recorded ${formatDateTime(item.createdAt)}`;

                    return (
                      <div
                        key={item.requestId}
                        className={`appointments-item appointments-item--request${
                          isPendingRequest ? ' appointments-item--request-pending' : ''
                        }${isSelectedRequest ? ' appointments-item--request-selected' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelectedRequest}
                        onClick={() => {
                          setSelectedRequestId(item.requestId);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') {
                            return;
                          }
                          event.preventDefault();
                          setSelectedRequestId(item.requestId);
                        }}
                      >
                        <div className="appointments-item__header">
                          <div className="appointments-item__identity">
                            <span className="appointments-item__avatar" aria-hidden="true">
                              {patientMonogram}
                            </span>
                            <div className="appointments-item__title-group">
                              <p className="appointments-item__eyebrow">Booking request</p>
                              <p className="appointments-item__title">{patientName}</p>
                              <p className="appointments-item__subtitle">Patient ID {item.patientId}</p>
                              <p className="appointments-item__support">
                                <span className="appointments-item__support-label">{lifecycleLabel}</span>
                                <span className="appointments-item__support-divider" aria-hidden="true">
                                  ·
                                </span>
                                <span className="appointments-item__support-detail">{lifecycleTiming}</span>
                              </p>
                            </div>
                          </div>
                          <div className="appointments-item__state-column">
                            <span
                              className={`appointments-item__freshness appointments-item__freshness--${
                                isPendingRequest ? 'pending' : 'handled'
                              }`}
                            >
                              {lifecycleTiming}
                            </span>
                            <div className="appointments-item__badge-stack">
                              <Badge variant={toStatusVariant(item.status)}>
                                {formatRequestViewLabel(item.status)}
                              </Badge>
                              <Badge variant={toWorkflowVariant(item.workflowStatus)}>
                                {appointmentWorkflowLabel(item.workflowStatus)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="appointments-item__schedule">
                          <p className="appointments-item__schedule-label">Requested window</p>
                          <p className="appointments-item__schedule-value">
                            {formatTimeRange(item.startsAt, item.endsAt)}
                          </p>
                          <p className="appointments-item__schedule-support">
                            {formatCalendarDay(item.startsAt)} · Video visit requested
                          </p>
                        </div>
                        {item.note ? (
                          <div className="appointments-item__reason">
                            <p className="appointments-item__reason-label">Request note</p>
                            <p className="appointments-item__reason-text">{item.note}</p>
                          </div>
                        ) : null}
                        <div className="appointments-item__meta-row appointments-item__meta-row--primary">
                          <span className="appointments-item__meta-chip">
                            Created {formatDateTime(item.createdAt)}
                          </span>
                          {item.reviewedAt ? (
                            <span className="appointments-item__meta-chip">
                              Reviewed {formatDateTime(item.reviewedAt)}
                            </span>
                          ) : null}
                        </div>
                        {isPendingRequest ? (
                          <div className="appointments-item__action-bar">
                            <div className="appointments-item__action-copy">
                              <p className="appointments-item__action-label">Next action</p>
                              <p className="appointments-item__action-text">
                                Review demand now, then approve only when this window still fits the visible schedule.
                              </p>
                            </div>
                            <div className="appointments-item__actions appointments-item__actions--pending">
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={reviewingKey !== null}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleReview(item.requestId, 'approved');
                                }}
                              >
                                {reviewingKey === `${item.requestId}:approved` ? 'Approving...' : 'Approve'}
                              </Button>
                              <Button
                                className="appointments-item__open"
                                size="sm"
                                variant="secondary"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openPatientFromAppointments(item);
                                }}
                              >
                                Open patient
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={reviewingKey !== null}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleReview(item.requestId, 'rejected');
                                }}
                              >
                                {reviewingKey === `${item.requestId}:rejected` ? 'Rejecting...' : 'Reject'}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="appointments-item__action-bar appointments-item__action-bar--reference">
                            <div className="appointments-item__action-copy">
                              <p className="appointments-item__action-label">Reference state</p>
                              <p className="appointments-item__action-text">
                                Keep this reviewed request visible for context while checking whether open capacity still needs adjustment.
                              </p>
                            </div>
                            <div className="appointments-item__actions">
                              <Button
                                className="appointments-item__open"
                                size="sm"
                                variant="secondary"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openPatientFromAppointments(item);
                                }}
                              >
                                Open patient
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section
              className={`appointments-workspace__section appointments-workspace__section--slots${
                slotStatus === 'available' ? ' appointments-workspace__section--slots-available' : ''
              }`}
              aria-label="Schedule"
            >
              <header className="appointments-workspace__section-header">
                <div className="appointments-workspace__section-heading">
                  <h3 className="appointments-workspace__section-title">{scheduleTitle}</h3>
                  <p className="appointments-workspace__section-note">{scheduleNote}</p>
                </div>
                <Badge variant="default">
                  {scheduleRange.caption}
                </Badge>
              </header>
              {selectedRequest && requestScheduleContext ? (
                <section
                  className={`appointments-schedule-context appointments-schedule-context--${requestScheduleContext.tone}`}
                  data-testid="appointments-schedule-context"
                  aria-live="polite"
                >
                  <div className="appointments-schedule-context__copy">
                    <p className="appointments-schedule-context__eyebrow">Selected request</p>
                    <h4 className="appointments-schedule-context__title">
                      {patientNameById.get(selectedRequest.patientId) ?? selectedRequest.patientId}
                    </h4>
                    <p className="appointments-schedule-context__text">
                      {requestScheduleContext.label}
                    </p>
                    <p className="appointments-schedule-context__note">
                      {requestScheduleContext.note}
                    </p>
                  </div>
                  <div className="appointments-schedule-context__facts">
                    <span className="appointments-item__meta-chip">
                      {formatCalendarDay(selectedRequest.startsAt)}
                    </span>
                    <span className="appointments-item__meta-chip">
                      {formatTimeRange(selectedRequest.startsAt, selectedRequest.endsAt)}
                    </span>
                    <span className="appointments-item__meta-chip">
                      {formatWaitingDuration(selectedRequest.createdAt)}
                    </span>
                  </div>
                  {selectedRequest.note ? (
                    <div className="appointments-item__reason">
                      <p className="appointments-item__reason-label">Request note</p>
                      <p className="appointments-item__reason-text">{selectedRequest.note}</p>
                    </div>
                  ) : null}
                </section>
              ) : null}
              <div className="appointments-schedule__control-shell">
                <div className="appointments-schedule__diagnosis">
                  <div className="appointments-schedule__diagnosis-copy">
                    <p className="appointments-schedule__diagnosis-eyebrow">Schedule diagnosis</p>
                    <p className="appointments-schedule__diagnosis-title">{coverageState.label}</p>
                    <p className="appointments-schedule__diagnosis-note">{coverageState.summaryHint}</p>
                  </div>
                  <div className="appointments-schedule__facts" aria-live="polite">
                    <span className="appointments-workspace__context-pill appointments-workspace__context-pill--capacity">
                      {visibleOpenSlotsCount} open visible
                    </span>
                    <span className="appointments-workspace__context-pill appointments-workspace__context-pill--status appointments-workspace__context-pill--status-quiet">
                      {visibleClosedSlotsCount} closed visible
                    </span>
                  </div>
                </div>
                <div className="appointments-schedule__toolbar">
                  <div className="appointments-filter-group appointments-filter-group--segmented">
                    <Button
                      variant={scheduleView === 'week' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => {
                        handleScheduleViewChange('week');
                      }}
                    >
                      Week
                    </Button>
                    <Button
                      variant={scheduleView === 'day' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => {
                        handleScheduleViewChange('day');
                      }}
                    >
                      Day
                    </Button>
                  </div>
                  <div className="appointments-schedule__nav">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        handleScheduleDateShift('previous');
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        handleScheduleToday();
                      }}
                    >
                      Today
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        handleScheduleDateShift('next');
                      }}
                    >
                      Next
                    </Button>
                    <p
                      className="appointments-schedule__range-label"
                      data-testid="appointments-schedule-range-label"
                    >
                      {scheduleRange.label}
                    </p>
                  </div>
                </div>
              </div>

              {scheduleSlotsQuery.error ? (
                <AlertBanner variant="error" title="Could not load schedule">
                  {toUserMessage(scheduleSlotsQuery.error)}
                </AlertBanner>
              ) : null}

              {scheduleSlotsQuery.isLoading && scheduleSlots.length === 0 ? (
                <div className="appointments-skeleton" aria-label="Appointment schedule loading placeholder">
                  <Skeleton height={128} />
                  <Skeleton height={128} />
                </div>
              ) : (
                <>
                  {scheduleSlots.length === 0 ? (
                    <div className="appointments-empty-state appointments-empty-state--slots" role="status" aria-live="polite">
                      <div className="appointments-empty-state__title-row">
                        <span className="appointments-empty-state__icon" aria-hidden="true">
                          ⏱
                        </span>
                        <h3 className="appointments-empty-state__title">{scheduleEmptyTitle}</h3>
                      </div>
                      <p className="appointments-empty-state__description">{scheduleEmptyDescription}</p>
                    </div>
                  ) : null}
                  {scheduleView === 'week' ? (
                    <div className="appointments-schedule-week" data-testid="appointments-schedule-week">
                      {scheduleRange.dayKeys.map((dayKey) => {
                        const daySlots = scheduleSlotsByDay.get(dayKey) ?? [];
                        const isToday = dayKey === todayDateKey;
                        const isRequestDay =
                          selectedRequestDayKey !== null &&
                          requestScheduleContext?.inRange === true &&
                          selectedRequestDayKey === dayKey;

                        return (
                          <section
                            key={dayKey}
                            className={`appointments-schedule-day${
                              isToday ? ' appointments-schedule-day--today' : ''
                            }${isRequestDay ? ' appointments-schedule-day--request-context' : ''}`}
                            aria-label={`Schedule for ${formatDayHeader(dayKey)}`}
                          >
                            <header className="appointments-schedule-day__header">
                              <p className="appointments-schedule-day__title">{formatDayHeader(dayKey)}</p>
                              <p className="appointments-schedule-day__meta">
                                {daySlots.length === 0
                                  ? 'No fetched slots'
                                  : `${daySlots.length} slot${daySlots.length === 1 ? '' : 's'}`}
                              </p>
                            </header>
                            {daySlots.length === 0 ? (
                              <p className="appointments-schedule-day__empty">
                                No visible capacity in this day.
                              </p>
                            ) : (
                              <div className="appointments-schedule-day__slots">
                                {daySlots.map((slot) => renderScheduleSlot(slot))}
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="appointments-schedule-day-agenda" data-testid="appointments-schedule-day">
                      <header className="appointments-schedule-day-agenda__header">
                        <p className="appointments-schedule-day-agenda__title">{scheduleRange.label}</p>
                        <p className="appointments-schedule-day-agenda__meta">
                          {scheduleSlots.length === 0
                            ? 'No fetched slots in this day'
                            : `${scheduleSlots.length} slot${scheduleSlots.length === 1 ? '' : 's'} visible`}
                        </p>
                      </header>
                      {scheduleSlots.length === 0 ? (
                        <p className="appointments-schedule-day__empty">
                          No visible capacity in this day.
                        </p>
                      ) : (
                        <div className="appointments-schedule-day-agenda__slots">
                          {scheduleSlots.map((slot) => renderScheduleSlot(slot))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="appointments-workspace__divider" />

              <div className="appointments-schedule-detail">
                <header className="appointments-workspace__section-header appointments-schedule-detail__header">
                  <div className="appointments-workspace__section-heading">
                    <h4 className="appointments-workspace__section-title">{slotsDetailTitle}</h4>
                    <p className="appointments-workspace__section-note">{slotsDetailNote}</p>
                  </div>
                  <Badge variant={slotStatus === 'available' ? 'success' : 'default'}>
                    {slotViewLabel}
                  </Badge>
                </header>
                <div className="appointments-filter-group appointments-filter-group--segmented">
                  <Button
                    variant={slotStatus === 'available' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => {
                      handleSlotStatusChange('available');
                    }}
                  >
                    Open capacity
                  </Button>
                  <Button
                    variant={slotStatus === 'closed' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => {
                      handleSlotStatusChange('closed');
                    }}
                  >
                    Closed capacity
                  </Button>
                </div>

                {scheduleSlotsQuery.isLoading && scheduleSlots.length === 0 ? (
                  <div className="appointments-skeleton" aria-label="Appointment slots loading placeholder">
                    <Skeleton height={88} />
                    <Skeleton height={88} />
                    <Skeleton height={88} />
                  </div>
                ) : slots.length === 0 ? (
                  <div className="appointments-empty-state appointments-empty-state--slots" role="status" aria-live="polite">
                    <div className="appointments-empty-state__title-row">
                      <span className="appointments-empty-state__icon" aria-hidden="true">
                        ⏱
                      </span>
                      <h3 className="appointments-empty-state__title">{slotsEmptyTitle}</h3>
                    </div>
                    <p className="appointments-empty-state__description">{slotsEmptyDescription}</p>
                    <div className="appointments-empty-state__footer">
                      <p className="appointments-empty-state__meta">Updated {refreshedAtLabel}</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isRefreshingWorkspace}
                        onClick={() => {
                          void handleRefreshWorkspace();
                        }}
                      >
                        Refresh
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="stack stack--2">
                    {slots.map((slot) => {
                      const resolvedStatus = slot.status ?? 'available';
                      const readinessLabel =
                        resolvedStatus === 'available'
                          ? 'Ready to absorb demand'
                          : 'Not open for new bookings';

                      return (
                        <div
                          key={slot.slotId}
                          className={`appointments-item appointments-item--slot${
                            resolvedStatus === 'available'
                              ? ' appointments-item--slot-available'
                              : ' appointments-item--slot-closed'
                          }${
                            slotStatus === 'available' && lastPublishOutcome?.slotId === slot.slotId
                              ? ' appointments-item--slot-just-published'
                              : ''
                          }${
                            selectedRequest !== null &&
                            requestScheduleContext?.inRange === true &&
                            rangesOverlap(
                              slot.startsAt,
                              slot.endsAt,
                              selectedRequest.startsAt,
                              selectedRequest.endsAt,
                            )
                              ? ' appointments-item--slot-request-context'
                              : ''
                          }`}
                        >
                          <div className="appointments-item__header">
                            <div className="appointments-item__title-group">
                              <p className="appointments-item__eyebrow">
                                {resolvedStatus === 'available' ? 'Open capacity' : 'Closed capacity'}
                              </p>
                              <p className="appointments-item__title">{formatTimeRange(slot.startsAt, slot.endsAt)}</p>
                              <p className="appointments-item__subtitle">{formatCalendarDay(slot.startsAt)}</p>
                              <p className="appointments-item__support">{readinessLabel}</p>
                            </div>
                            <Badge variant={toStatusVariant(resolvedStatus)}>
                              {resolvedStatus.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="appointments-item__schedule appointments-item__schedule--capacity">
                            <p className="appointments-item__schedule-label">
                              {resolvedStatus === 'available' ? 'Published window' : 'Closed window'}
                            </p>
                            <p className="appointments-item__schedule-value">{readinessLabel}</p>
                            <p className="appointments-item__schedule-support">
                              {slotStatus === 'available'
                                ? 'Ready if reviewed demand needs this time.'
                                : 'Kept for schedule reference after changes or completed sessions.'}
                            </p>
                          </div>
                          <div className="appointments-item__meta-row appointments-item__meta-row--primary">
                            <span className="appointments-item__meta-chip">Video visit</span>
                            {slot.clinicianName ? (
                              <span className="appointments-item__meta-chip">Clinician {slot.clinicianName}</span>
                            ) : null}
                            {slot.createdAt ? (
                              <span className="appointments-item__meta-chip">
                                Created {formatDateTime(slot.createdAt)}
                              </span>
                            ) : null}
                          </div>
                          {slot.meetingLink ? (
                            <p className="appointments-item__meta appointments-item__meta--link">
                              Meeting link:{' '}
                              <a href={slot.meetingLink} target="_blank" rel="noreferrer">
                                {slot.meetingLink}
                              </a>
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </Card>

      <Card
        className="appointments-composer-card"
        title={
          <span className="appointments-card-title appointments-card-title--composer">
            <span className="appointments-card-title__eyebrow">Next step</span>
            <span className="appointments-card-title__headline">Publish availability</span>
          </span>
        }
        action={<Badge variant={composerStatusVariant}>{composerMetaLabel}</Badge>}
      >
        <div className="appointments-composer">
          <div className="appointments-composer__context">
            <span
              className={`appointments-composer__context-pill appointments-composer__context-pill--${coverageState.tone}`}
            >
              Publish after queue review
            </span>
            <p className="appointments-composer__context-note">{composerGuidance}</p>
          </div>
          <div className="appointments-composer__summary">
            <p className="appointments-composer__intro">
              Use this panel after request review to publish only the clinician time the queue still
              needs.
            </p>
            <div className="appointments-composer__summary-facts" aria-live="polite">
              <span className="appointments-composer__summary-pill">{requestCountLabel}</span>
              <span className="appointments-composer__summary-pill">{openCapacityLabel}</span>
              <span className="appointments-composer__summary-pill">Updated {refreshedAtLabel}</span>
            </div>
          </div>
          <div className="appointments-composer__surface">
            <div className="appointments-composer__cluster">
              <p className="appointments-composer__cluster-label">Availability window</p>
              <div className="appointments-composer__grid">
                <label className="appointments-composer__field form-field">
                  <span className="appointments-composer__label">Start (local datetime)</span>
                  <input
                    type="datetime-local"
                    value={startsAtInput}
                    onChange={(event) => setStartsAtInput(event.target.value)}
                  />
                </label>
                <label className="appointments-composer__field form-field">
                  <span className="appointments-composer__label">End (local datetime)</span>
                  <input
                    type="datetime-local"
                    value={endsAtInput}
                    onChange={(event) => setEndsAtInput(event.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="appointments-composer__cluster appointments-composer__cluster--supporting">
              <p className="appointments-composer__cluster-label">Visit details</p>
              <div className="appointments-composer__grid appointments-composer__grid--supporting">
                <label className="appointments-composer__field appointments-composer__field--wide form-field">
                  <span className="appointments-composer__label">Meeting link (optional)</span>
                  <input
                    type="text"
                    value={meetingLinkInput}
                    placeholder="https://..."
                    onChange={(event) => setMeetingLinkInput(event.target.value)}
                  />
                </label>
              </div>
              <p className="appointments-composer__cluster-note">
                Add a meeting link only when the published slot should open directly into a tele-rehab
                visit.
              </p>
            </div>
          </div>
          <div className="appointments-composer__actions">
            <div className="appointments-composer__hint-group">
              <p className="appointments-composer__hint">
                Published slots become immediately visible to the booking queue after creation.
              </p>
              <p className="appointments-composer__hint appointments-composer__hint--quiet">
                Queue state: {coverageState.label} · Last refresh {refreshedAtLabel}
              </p>
            </div>
            <Button
              className="appointments-composer__publish"
              variant="primary"
              disabled={!canCreate}
              onClick={() => {
                void handleCreateSlot();
              }}
            >
              {isCreating ? 'Publishing...' : 'Publish availability'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
