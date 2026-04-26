import type {
  AppointmentRequestItem,
  AppointmentSlot,
  AppointmentWorkflowStatus,
  PatientSummary,
} from '../../types/models';
import { appointmentWorkflowLabel } from '../../utils/patientDetail';
import { formatExactTime, formatRelativeTime } from '../../utils/time';

export type AppointmentSlotFilter = 'available' | 'closed';
export type AppointmentRequestFilter = 'pending' | 'approved' | 'rejected' | 'canceled';
export type ScheduleView = 'week' | 'day';
export type AppointmentsBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'critical' | 'unknown';

export interface AppointmentsWorkspaceState {
  requestStatus: AppointmentRequestFilter;
  slotStatus: AppointmentSlotFilter;
  scheduleView: ScheduleView;
  scheduleDate: string;
}

export interface AppointmentsStatusBarVm {
  title: string;
  description: string;
  guidanceLine: string;
  facts: Array<{ key: string; label: string; value: string }>;
  requestOptions: Array<{ id: AppointmentRequestFilter; label: string; count?: number }>;
}

export interface AppointmentRequestRowVm {
  key: string;
  requestId: string;
  patientId: string;
  patientName: string;
  statusLabel: string;
  statusTone: AppointmentsBadgeTone;
  workflowLabel: string;
  workflowTone: AppointmentsBadgeTone;
  scheduleLabel: string;
  timingLabel: string;
  supportLine: string;
  detailLine: string;
  waitLabel: string;
}

export interface AppointmentReviewHeaderVm {
  requestId: string;
  patientId: string;
  patientName: string;
  patientStatusLabel: string;
  requestStatusLabel: string;
  requestStatusTone: AppointmentsBadgeTone;
  workflowLabel: string;
  workflowTone: AppointmentsBadgeTone;
  scheduleLabel: string;
  requestAgeLabel: string;
  reviewLabel: string;
  modalityLabel: string;
}

export interface AppointmentScheduleSlotVm {
  slotId: string;
  label: string;
  timeLabel: string;
  title: string;
  detailLabel: string;
  modeLabel: string;
  statusLabel: string;
  statusTone: AppointmentsBadgeTone;
  justPublished: boolean;
}

export interface AppointmentScheduleDayVm {
  dayKey: string;
  label: string;
  isToday: boolean;
  isSelectedRequestDay: boolean;
  slots: AppointmentScheduleSlotVm[];
}

export interface AppointmentPlannerVm {
  rangeLabel: string;
  rangeCaption: string;
  scheduleView: ScheduleView;
  slotStatus: AppointmentSlotFilter;
  requestScheduleContext: {
    label: string;
    note: string;
    tone: 'attention' | 'clear' | 'quiet';
  } | null;
  dayItems: AppointmentScheduleDayVm[];
  emptyTitle: string;
  emptyDescription: string;
  hasAnyVisibleSlots: boolean;
}

export interface AppointmentCapacityVm {
  title: string;
  note: string;
  slotStatus: AppointmentSlotFilter;
  items: AppointmentScheduleSlotVm[];
  emptyTitle: string;
  emptyDescription: string;
}

export interface AppointmentPublishVm {
  guidance: string;
  metaLabel: string;
  statusTone: AppointmentsBadgeTone;
  startsAtInput: string;
  endsAtInput: string;
  meetingLinkInput: string;
  canPublish: boolean;
  publishing: boolean;
  outcomeTitle: string | null;
  outcomeMessage: string | null;
  outcomeFollowThrough: string | null;
}

export interface AppointmentsGovernanceVm {
  patientTitle: string;
  patientSubtitle: string;
  requestSummary: string;
  requestReason: string;
  constraints: string;
  recommendedSlot: string;
  patientFacts: Array<{ label: string; value: string }>;
  workflowFacts: Array<{ label: string; value: string }>;
  scheduleFacts: Array<{ label: string; value: string }>;
  explanation: string;
}

export interface AppointmentDisplayRequestFields {
  rehabLabel?: string;
  visitTypeLabel?: string;
  durationLabel?: string;
  modalityLabel?: string;
  waitLabel?: string;
  clinicianLabel?: string;
  locationLabel?: string;
  constraints?: string;
  recommendedSlot?: string;
}

export interface AppointmentDisplaySlotFields {
  displayTitle?: string;
  displayDetail?: string;
  displayMode?: string;
}

type AppointmentRequestWithDisplay = AppointmentRequestItem & AppointmentDisplayRequestFields;
type AppointmentSlotWithDisplay = AppointmentSlot & AppointmentDisplaySlotFields;

export interface CoordinationState {
  label: string;
  note: string;
  tone: 'attention' | 'clear' | 'quiet';
}

export interface CoverageState {
  label: string;
  summaryHint: string;
  note: string;
  publishNote: string;
  tone: 'attention' | 'clear' | 'quiet';
}

export interface PublishOutcomeState {
  coverageText: string;
  nextStepText: string;
}

export interface ScheduleRange {
  from: string;
  to: string;
  dayKeys: string[];
  label: string;
  caption: string;
}

export function createDefaultAppointmentsWorkspaceState(): AppointmentsWorkspaceState {
  return {
    requestStatus: 'pending',
    slotStatus: 'available',
    scheduleView: 'week',
    scheduleDate: toLocalDateKey(new Date()),
  };
}

export function normalizeAppointmentsWorkspaceState(value: unknown): AppointmentsWorkspaceState {
  const fallback = createDefaultAppointmentsWorkspaceState();

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  const candidate = value as Partial<AppointmentsWorkspaceState>;
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

export function formatAppointmentsLastUpdated(lastSuccessAt: number | null): string {
  if (!lastSuccessAt) {
    return '--';
  }

  return new Date(lastSuccessAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function padDateSegment(value: number): string {
  return String(value).padStart(2, '0');
}

export function toLocalDateKey(value: Date): string {
  return `${value.getFullYear()}-${padDateSegment(value.getMonth() + 1)}-${padDateSegment(value.getDate())}`;
}

export function parseLocalDateKey(value: string): Date | null {
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

export function getScheduleRange(scheduleView: ScheduleView, scheduleDate: string): ScheduleRange {
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
    label: `${weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString([], { month: 'short', day: 'numeric' })}`,
    caption: 'Week view',
  };
}

export function sortSlotsByStart(slots: AppointmentSlot[]): AppointmentSlot[] {
  return [...slots].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
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

  return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} to ${end.toLocaleTimeString([], {
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

function formatRequestStatusLabel(status: AppointmentRequestFilter): string {
  if (status === 'approved') {
    return 'Approved';
  }
  if (status === 'rejected') {
    return 'Rejected';
  }
  if (status === 'canceled') {
    return 'Canceled';
  }
  return 'Needs review';
}

function requestStatusTone(status: AppointmentRequestFilter): AppointmentsBadgeTone {
  if (status === 'approved') {
    return 'success';
  }
  if (status === 'pending') {
    return 'warning';
  }
  if (status === 'rejected' || status === 'canceled') {
    return 'unknown';
  }
  return 'neutral';
}

function workflowTone(status: AppointmentWorkflowStatus | undefined): AppointmentsBadgeTone {
  if (status === 'awaiting_confirmation' || status === 'reschedule_requested') {
    return 'warning';
  }
  if (status === 'completed') {
    return 'success';
  }
  if (status === 'missed') {
    return 'critical';
  }
  return 'neutral';
}

function formatSlotStatusLabel(status: AppointmentSlotFilter): string {
  return status === 'available' ? 'Open capacity' : 'Closed capacity';
}

function isSameLocalDay(left: string, rightDateKey: string): boolean {
  const parsed = new Date(left);
  if (!Number.isFinite(parsed.getTime())) {
    return false;
  }

  return toLocalDateKey(parsed) === rightDateKey;
}

function rangesOverlap(leftStartsAt: string, leftEndsAt: string, rightStartsAt: string, rightEndsAt: string): boolean {
  const leftStartMs = Date.parse(leftStartsAt);
  const leftEndMs = Date.parse(leftEndsAt);
  const rightStartMs = Date.parse(rightStartsAt);
  const rightEndMs = Date.parse(rightEndsAt);

  if (!Number.isFinite(leftStartMs) || !Number.isFinite(leftEndMs) || !Number.isFinite(rightStartMs) || !Number.isFinite(rightEndMs)) {
    return false;
  }

  return leftStartMs < rightEndMs && leftEndMs > rightStartMs;
}

function requestFallsInVisibleRange(request: AppointmentRequestItem, range: ScheduleRange): boolean {
  return rangesOverlap(request.startsAt, request.endsAt, range.from, range.to);
}

export function describeRequestScheduleContext(
  request: AppointmentRequestItem | null,
  scheduleView: ScheduleView,
  range: ScheduleRange,
  scheduleSlots: AppointmentSlot[],
): CoordinationState | null {
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
    };
  }

  const sameWindowOpenSlots = openSlots.filter((slot) =>
    rangesOverlap(slot.startsAt, slot.endsAt, request.startsAt, request.endsAt),
  );
  if (sameWindowOpenSlots.length > 0) {
    return {
      label: 'Open capacity is visible in this requested block',
      note: 'Published windows are visible during the requested time block in the current schedule.',
      tone: 'clear',
    };
  }

  const requestDayKey = toLocalDateKey(new Date(request.startsAt));
  const sameDayOpenSlots = openSlots.filter((slot) => isSameLocalDay(slot.startsAt, requestDayKey));
  if (sameDayOpenSlots.length > 0) {
    return {
      label: 'Open capacity is visible on the requested day',
      note: 'Published windows are visible on this day, even though none are shown during the requested block.',
      tone: 'clear',
    };
  }

  if (openSlots.length > 0) {
    return {
      label: `Open capacity is visible elsewhere in this ${scheduleViewLabel}`,
      note: 'Published windows are visible in the current schedule range, but not on the requested day shown here.',
      tone: 'quiet',
    };
  }

  return {
    label: `No open capacity is visible in this ${scheduleViewLabel}`,
    note: 'Review the queue, then publish availability only if more clinician time is truly needed.',
    tone: 'attention',
  };
}

export function describeCoordinationState(
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

export function describeCoverageState(
  pendingRequestsCount: number,
  availableSlotsCount: number,
): CoverageState {
  if (pendingRequestsCount > 0 && availableSlotsCount === 0) {
    return {
      label: 'Demand uncovered',
      summaryHint: 'Requests are waiting and there are no open slots published yet.',
      note: 'Published capacity does not yet cover the waiting queue.',
      publishNote: 'Review the waiting requests first, then publish availability so the queue has real coverage.',
      tone: 'attention',
    };
  }

  if (pendingRequestsCount > availableSlotsCount) {
    return {
      label: 'Demand exceeds open capacity',
      summaryHint: 'Some open slots are published, but they do not yet cover all waiting requests.',
      note: 'Published capacity does not yet cover the waiting queue.',
      publishNote: 'Review the queue, then publish more availability if the current open slots will not absorb the waiting demand.',
      tone: 'attention',
    };
  }

  if (pendingRequestsCount > 0) {
    return {
      label: 'Demand currently covered',
      summaryHint: 'Open capacity appears sufficient for the requests already waiting.',
      note: 'Current open slots appear sufficient for the waiting queue while clinician review continues.',
      publishNote: 'Additional publishing is optional right now. Use this panel only if more follow-up time truly needs to be opened.',
      tone: 'clear',
    };
  }

  if (availableSlotsCount > 0) {
    return {
      label: 'Queue quiet with open capacity',
      summaryHint: 'Open capacity is already published even though no requests are waiting right now.',
      note: 'No requests are waiting and published capacity is ready if new demand arrives.',
      publishNote: 'Capacity is already published. Add more availability only if additional clinician time needs to be opened.',
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

export function describePublishCoverage(
  pendingRequestsCount: number,
  availableSlotsCount: number,
): PublishOutcomeState {
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

export function matchPublishedOpenSlot(
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

function nextOpenSlotSummary(slots: Array<{ startsAt: string; endsAt: string }>): { value: string; hint: string } {
  const nextSlot = slots
    .map((slot) => ({ slot, startsAtMs: Date.parse(slot.startsAt) }))
    .filter((entry) => Number.isFinite(entry.startsAtMs))
    .sort((left, right) => left.startsAtMs - right.startsAtMs)[0];

  if (!nextSlot) {
    return {
      value: 'No open slot yet',
      hint: 'Publish availability only when demand needs coverage.',
    };
  }

  return {
    value: formatCalendarDay(nextSlot.slot.startsAt),
    hint: formatTimeRange(nextSlot.slot.startsAt, nextSlot.slot.endsAt),
  };
}

function patientName(patientId: string, patient: PatientSummary | null): string {
  return patient?.displayName?.trim() || `Patient ${patientId}`;
}

function formatPatientFact(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return 'Unknown';
  }

  return String(value);
}

export function buildAppointmentsStatusBar(params: {
  requestStatus: AppointmentRequestFilter;
  slotStatus: AppointmentSlotFilter;
  scheduleRangeLabel: string;
  pendingRequestsCount: number;
  availableSlotsCount: number;
  updatedAtLabel: string;
  coordinationState: CoordinationState;
  coverageState: CoverageState;
  requestStatusCounts?: Partial<Record<AppointmentRequestFilter, number>>;
}): AppointmentsStatusBarVm {
  return {
    title: 'Appointments',
    description: 'Review scheduling requests, inspect visible capacity, and publish only the follow-up time still needed.',
    guidanceLine:
      params.requestStatus === 'pending'
        ? params.coverageState.summaryHint
        : `${formatRequestStatusLabel(params.requestStatus)} requests stay visible for operational follow-through while the current planner range remains ${params.scheduleRangeLabel}.`,
    facts: [
      { key: 'requests', label: 'Request view', value: formatRequestStatusLabel(params.requestStatus) },
      { key: 'slots', label: 'Capacity view', value: formatSlotStatusLabel(params.slotStatus) },
      { key: 'range', label: 'Range', value: params.scheduleRangeLabel },
      { key: 'pending', label: 'Pending requests', value: String(params.pendingRequestsCount) },
      { key: 'open', label: 'Open capacity', value: String(params.availableSlotsCount) },
      { key: 'updated', label: 'Updated', value: params.updatedAtLabel },
    ],
    requestOptions: [
      { id: 'pending', label: 'Needs review', count: params.requestStatusCounts?.pending },
      { id: 'approved', label: 'Approved', count: params.requestStatusCounts?.approved },
      { id: 'rejected', label: 'Rejected', count: params.requestStatusCounts?.rejected },
      { id: 'canceled', label: 'Canceled', count: params.requestStatusCounts?.canceled },
    ],
  };
}

export function buildAppointmentRequestRow(
  request: AppointmentRequestItem,
  patient: PatientSummary | null,
): AppointmentRequestRowVm {
  const workflowLabel = appointmentWorkflowLabel(request.workflowStatus);
  const display = request as AppointmentRequestWithDisplay;
  const detailLine = [
    display.visitTypeLabel,
    display.durationLabel,
    display.modalityLabel,
  ].filter(Boolean).join(' · ');

  return {
    key: request.requestId,
    requestId: request.requestId,
    patientId: request.patientId,
    patientName: patientName(request.patientId, patient),
    statusLabel: formatRequestStatusLabel(request.status),
    statusTone: requestStatusTone(request.status),
    workflowLabel,
    workflowTone: workflowTone(request.workflowStatus),
    scheduleLabel: `${formatCalendarDay(request.startsAt)} · ${formatTimeRange(request.startsAt, request.endsAt)}`,
    timingLabel:
      display.waitLabel ??
      (request.status === 'pending'
        ? formatWaitingDuration(request.createdAt)
        : request.reviewedAt
          ? `Reviewed ${formatRelativeTime(request.reviewedAt)}`
          : `Updated ${formatRelativeTime(request.updatedAt ?? request.createdAt)}`),
    supportLine:
      request.note?.trim() ||
      (request.workflowStatus
        ? `${workflowLabel} remains the recorded workflow state.`
        : 'Review this request against the visible schedule before deciding the next step.'),
    detailLine:
      detailLine ||
      [workflowLabel, request.modality].filter(Boolean).join(' · '),
    waitLabel:
      display.waitLabel ??
      (request.status === 'pending'
        ? formatWaitingDuration(request.createdAt)
        : request.reviewedAt
          ? `Reviewed ${formatRelativeTime(request.reviewedAt)}`
          : `Updated ${formatRelativeTime(request.updatedAt ?? request.createdAt)}`),
  };
}

export function buildAppointmentReviewHeader(
  request: AppointmentRequestItem,
  patient: PatientSummary | null,
): AppointmentReviewHeaderVm {
  const display = request as AppointmentRequestWithDisplay;

  return {
    requestId: request.requestId,
    patientId: request.patientId,
    patientName: patientName(request.patientId, patient),
    patientStatusLabel: patient?.status ? patient.status.replace('_', ' ') : 'Unknown',
    requestStatusLabel: formatRequestStatusLabel(request.status),
    requestStatusTone: requestStatusTone(request.status),
    workflowLabel: appointmentWorkflowLabel(request.workflowStatus),
    workflowTone: workflowTone(request.workflowStatus),
    scheduleLabel: [
      display.rehabLabel,
      display.visitTypeLabel,
      display.durationLabel,
      display.modalityLabel,
    ].filter(Boolean).join(' · ') || `${formatCalendarDay(request.startsAt)} · ${formatTimeRange(request.startsAt, request.endsAt)}`,
    requestAgeLabel: display.waitLabel ?? formatWaitingDuration(request.createdAt),
    reviewLabel: request.reviewedAt ? formatExactTime(request.reviewedAt) : 'Unreviewed',
    modalityLabel: display.modalityLabel ?? request.modality,
  };
}

export function buildAppointmentPlanner(
  params: {
    scheduleRange: ScheduleRange;
    scheduleView: ScheduleView;
    scheduleSlots: AppointmentSlot[];
    selectedRequest: AppointmentRequestItem | null;
    selectedRequestDayKey: string | null;
    lastPublishOutcomeSlotId: string | null;
  },
): AppointmentPlannerVm {
  const dayItems = params.scheduleRange.dayKeys.map((dayKey) => {
    const slots = params.scheduleSlots
      .filter((slot) => toLocalDateKey(new Date(slot.startsAt)) === dayKey)
      .map<AppointmentScheduleSlotVm>((slot) => ({
        slotId: slot.slotId,
        label: formatTimeRange(slot.startsAt, slot.endsAt),
        timeLabel: formatTimeRange(slot.startsAt, slot.endsAt),
        title: (slot as AppointmentSlotWithDisplay).displayTitle ?? formatSlotStatusLabel((slot.status ?? 'available') as AppointmentSlotFilter),
        detailLabel: (slot as AppointmentSlotWithDisplay).displayDetail ?? (slot.meetingLink ? 'Telehealth window' : 'Published clinician time'),
        modeLabel: (slot as AppointmentSlotWithDisplay).displayMode ?? (slot.meetingLink ? 'Telehealth' : 'In-person'),
        statusLabel: formatSlotStatusLabel((slot.status ?? 'available') as AppointmentSlotFilter),
        statusTone: (slot.status ?? 'available') === 'available' ? 'success' : 'unknown',
        justPublished: params.lastPublishOutcomeSlotId === slot.slotId,
      }));

    return {
      dayKey,
      label:
        params.scheduleView === 'week'
          ? new Date(dayKey).toLocaleDateString([], { weekday: 'short', day: 'numeric' })
          : formatCalendarDay(dayKey),
      isToday: dayKey === toLocalDateKey(new Date()),
      isSelectedRequestDay: params.selectedRequestDayKey === dayKey,
      slots,
    };
  });

  const requestScheduleContext = describeRequestScheduleContext(
    params.selectedRequest,
    params.scheduleView,
    params.scheduleRange,
    params.scheduleSlots,
  );

  return {
    rangeLabel: params.scheduleRange.label,
    rangeCaption: params.scheduleRange.caption,
    scheduleView: params.scheduleView,
    slotStatus: 'available',
    requestScheduleContext,
    dayItems,
    hasAnyVisibleSlots: params.scheduleSlots.length > 0,
    emptyTitle:
      params.scheduleView === 'week'
        ? 'No visible capacity in this week'
        : 'No visible capacity in this day',
    emptyDescription:
      params.scheduleView === 'week'
        ? 'Move to another week or publish availability when demand needs coverage.'
        : 'Move to another day or publish availability when demand needs coverage.',
  };
}

export function buildAppointmentCapacity(
  slots: AppointmentSlot[],
  slotStatus: AppointmentSlotFilter,
  lastPublishOutcomeSlotId: string | null,
): AppointmentCapacityVm {
  const filteredSlots = slots
    .filter((slot) => (slot.status ?? 'available') === slotStatus)
    .map<AppointmentScheduleSlotVm>((slot) => ({
      slotId: slot.slotId,
      label: `${formatCalendarDay(slot.startsAt)} · ${formatTimeRange(slot.startsAt, slot.endsAt)}`,
      timeLabel: formatTimeRange(slot.startsAt, slot.endsAt),
      title: (slot as AppointmentSlotWithDisplay).displayTitle ?? formatSlotStatusLabel((slot.status ?? 'available') as AppointmentSlotFilter),
      detailLabel: (slot as AppointmentSlotWithDisplay).displayDetail ?? formatCalendarDay(slot.startsAt),
      modeLabel: (slot as AppointmentSlotWithDisplay).displayMode ?? (slot.meetingLink ? 'Telehealth' : 'In-person'),
      statusLabel: formatSlotStatusLabel((slot.status ?? 'available') as AppointmentSlotFilter),
      statusTone: (slot.status ?? 'available') === 'available' ? 'success' : 'unknown',
      justPublished: lastPublishOutcomeSlotId === slot.slotId,
    }));

  return {
    title: slotStatus === 'available' ? 'Open capacity detail' : 'Closed capacity detail',
    note:
      slotStatus === 'available'
        ? 'Reference visible open windows before publishing more clinician time.'
        : 'Reference closed windows in this range without changing the current schedule view.',
    slotStatus,
    items: filteredSlots,
    emptyTitle:
      slotStatus === 'available'
        ? 'No open capacity visible'
        : 'No closed capacity visible',
    emptyDescription:
      slotStatus === 'available'
        ? 'No open capacity detail is visible in this range yet.'
        : 'No closed capacity is visible in this range right now.',
  };
}

export function buildAppointmentPublishVm(params: {
  coverageState: CoverageState;
  startsAtInput: string;
  endsAtInput: string;
  meetingLinkInput: string;
  canPublish: boolean;
  publishing: boolean;
  publishOutcomeState: PublishOutcomeState | null;
  publishOutcomeLabel: string | null;
}): AppointmentPublishVm {
  return {
    guidance: params.coverageState.publishNote,
    metaLabel:
      params.coverageState.tone === 'attention'
        ? 'Demand needs coverage'
        : params.coverageState.tone === 'clear'
          ? 'Demand appears covered'
          : 'Publish only when needed',
    statusTone:
      params.coverageState.tone === 'attention'
        ? 'warning'
        : params.coverageState.tone === 'clear'
          ? 'success'
          : 'neutral',
    startsAtInput: params.startsAtInput,
    endsAtInput: params.endsAtInput,
    meetingLinkInput: params.meetingLinkInput,
    canPublish: params.canPublish,
    publishing: params.publishing,
    outcomeTitle: params.publishOutcomeState ? 'Availability published' : null,
    outcomeMessage: params.publishOutcomeLabel,
    outcomeFollowThrough: params.publishOutcomeState
      ? `${params.publishOutcomeState.coverageText} ${params.publishOutcomeState.nextStepText}`
      : null,
  };
}

export function buildAppointmentsGovernance(params: {
  request: AppointmentRequestItem | null;
  patient: PatientSummary | null;
  coordinationState: CoordinationState;
  coverageState: CoverageState;
  scheduleRange: ScheduleRange;
  openSlots: AppointmentSlot[];
  requestScheduleContext: CoordinationState | null;
}): AppointmentsGovernanceVm | null {
  if (!params.request) {
    return null;
  }

  const nextOpenSlot = nextOpenSlotSummary(openSlotsSummary(params.openSlots));
  const display = params.request as AppointmentRequestWithDisplay;
  const requestSummary = [
    display.rehabLabel,
    display.visitTypeLabel,
    display.durationLabel,
    display.modalityLabel,
  ].filter(Boolean).join(' · ') || `${formatCalendarDay(params.request.startsAt)} · ${formatTimeRange(params.request.startsAt, params.request.endsAt)}`;

  return {
    patientTitle: patientName(params.request.patientId, params.patient),
    patientSubtitle: display.rehabLabel ?? params.request.patientId,
    requestSummary,
    requestReason:
      params.request.note?.trim() ||
      'Review this request against visible capacity before deciding the next scheduling step.',
    constraints:
      display.constraints ??
      `Requested window: ${formatCalendarDay(params.request.startsAt)} · ${formatTimeRange(params.request.startsAt, params.request.endsAt)}`,
    recommendedSlot:
      display.recommendedSlot ??
      `${nextOpenSlot.value} · ${nextOpenSlot.hint}`,
    patientFacts: [
      { label: 'Patient status', value: formatPatientFact(params.patient?.status) },
      {
        label: 'Last check-in',
        value: params.patient?.lastCheckinAt ? formatExactTime(params.patient.lastCheckinAt) : 'Unknown',
      },
      { label: 'Open alerts', value: formatPatientFact(params.patient?.openAlertCount) },
    ],
    workflowFacts: [
      { label: 'Request status', value: formatRequestStatusLabel(params.request.status) },
      { label: 'Workflow', value: appointmentWorkflowLabel(params.request.workflowStatus) },
      {
        label: 'Reviewed',
        value: params.request.reviewedAt ? formatExactTime(params.request.reviewedAt) : 'Unreviewed',
      },
      {
        label: 'Reviewed by',
        value: params.request.reviewedBy?.name?.trim() || params.request.reviewedBy?.clinicianId || 'Unknown',
      },
      { label: 'Updated', value: params.request.updatedAt ? formatExactTime(params.request.updatedAt) : 'Unknown' },
    ],
    scheduleFacts: [
      { label: 'Schedule range', value: params.scheduleRange.label },
      { label: 'Coverage state', value: params.coverageState.label },
      { label: 'Queue state', value: params.coordinationState.label },
      { label: 'Request context', value: params.requestScheduleContext?.label ?? 'Unknown' },
      { label: 'Next open slot', value: `${nextOpenSlot.value} · ${nextOpenSlot.hint}` },
    ],
    explanation:
      'This route shows only supported scheduling and request metadata. It does not claim confirmed booking, ownership, or guaranteed coverage unless the route data explicitly supports it.',
  };
}

function openSlotsSummary(openSlots: AppointmentSlot[]): Array<{ startsAt: string; endsAt: string }> {
  return openSlots
    .filter((slot) => (slot.status ?? 'available') === 'available')
    .map((slot) => ({ startsAt: slot.startsAt, endsAt: slot.endsAt }));
}
