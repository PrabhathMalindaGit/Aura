import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { appointmentWorkflowLabel, appointmentWorkflowTone } from '../utils/patientDetail';
import { createPatientEntryState } from '../utils/patientEntryContext';
import { getPatientDisplayName } from '../utils/patientFilters';
import { asAppError, isRetryable, toUserMessage } from '../utils/errors';
import { formatRelativeTime } from '../utils/time';

type SlotStatusFilter = 'available' | 'closed';
type RequestStatusFilter = 'pending' | 'approved' | 'rejected' | 'canceled';
type BadgeVariant = 'default' | 'success' | 'warning' | 'danger';
type CoordinationTone = 'attention' | 'clear' | 'quiet';
const APPOINTMENTS_WORKSPACE_PAGE = 'appointments';

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

function normalizeAppointmentsWorkspaceState(value: unknown): {
  requestStatus: RequestStatusFilter;
  slotStatus: SlotStatusFilter;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      requestStatus: 'pending',
      slotStatus: 'available',
    };
  }

  const candidate = value as { requestStatus?: string; slotStatus?: string };

  return {
    requestStatus:
      candidate.requestStatus === 'approved' ||
      candidate.requestStatus === 'rejected' ||
      candidate.requestStatus === 'canceled'
        ? candidate.requestStatus
        : 'pending',
    slotStatus: candidate.slotStatus === 'closed' ? 'closed' : 'available',
  };
}

export function AppointmentsPage(): JSX.Element {
  const navigate = useNavigate();
  const [slotStatus, setSlotStatus] = useState<SlotStatusFilter>(() =>
    readWorkspaceState(
      APPOINTMENTS_WORKSPACE_PAGE,
      { requestStatus: 'pending' as RequestStatusFilter, slotStatus: 'available' as SlotStatusFilter },
      normalizeAppointmentsWorkspaceState,
    ).slotStatus,
  );
  const [requestStatus, setRequestStatus] = useState<RequestStatusFilter>(() =>
    readWorkspaceState(
      APPOINTMENTS_WORKSPACE_PAGE,
      { requestStatus: 'pending' as RequestStatusFilter, slotStatus: 'available' as SlotStatusFilter },
      normalizeAppointmentsWorkspaceState,
    ).requestStatus,
  );
  const [startsAtInput, setStartsAtInput] = useState('');
  const [endsAtInput, setEndsAtInput] = useState('');
  const [meetingLinkInput, setMeetingLinkInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [reviewingKey, setReviewingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const patientsQuery = usePatients();

  const slotsQuery = useQuery({
    queryKey: ['appointments-slots', slotStatus],
    queryFn: () => listAppointmentSlots({ status: slotStatus, limit: 100 }),
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

  const slots = useMemo(() => slotsQuery.data ?? [], [slotsQuery.data]);
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
    slotsQuery.dataUpdatedAt,
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
    slotsQuery.isFetching ||
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
  const slotsSectionNote =
    slotStatus === 'available'
      ? availableSlotsCount > 0
        ? pendingRequestsCount > availableSlotsCount
          ? `${availableSlotsCount} open slot${availableSlotsCount === 1 ? ' is' : 's are'} published, but more coverage may be needed after review.`
          : pendingRequestsCount > 0
            ? `${availableSlotsCount} open slot${availableSlotsCount === 1 ? ' is' : 's are'} published for ${pendingRequestsCount} waiting request${pendingRequestsCount === 1 ? '' : 's'}.`
            : `${availableSlotsCount} open slot${availableSlotsCount === 1 ? ' is' : 's are'} published and ready if new demand arrives.`
        : pendingRequestsCount > 0
          ? 'No open capacity is published for the waiting queue.'
          : 'No open capacity is currently published.'
      : slots.length > 0
        ? `${slots.length} closed slot${slots.length === 1 ? '' : 's'} remain in this view for schedule reference.`
        : 'No archived or closed capacity is in this view.';
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
    slotStatus === 'available' ? 'No open capacity is published' : 'No closed capacity in this view';
  const slotsEmptyDescription =
    slotStatus === 'available'
      ? pendingRequestsCount > 0
        ? 'Requests are waiting and no open capacity is published. Review the queue, then publish availability if coverage is needed.'
        : 'No open capacity is currently published. Keep capacity unpublished until demand needs coverage.'
      : 'No archived or closed capacity is in this view.';
  const requestsEmptyTitle =
    requestStatus === 'pending' ? 'No requests are waiting right now' : `No ${requestStatus} requests`;
  const requestsEmptyDescription =
    requestStatus === 'pending'
      ? availableSlotsCount > 0
        ? 'Queue is quiet and published capacity is ready if new demand arrives.'
        : 'Queue is quiet. New booking requests will appear here when clinician review is needed.'
      : 'Requests matching this review state will appear here when scheduling activity changes.';

  async function handleRefreshWorkspace(): Promise<void> {
    await Promise.all([
      slotsQuery.refetch(),
      requestsQuery.refetch(),
      openSlotsSummaryQuery.refetch(),
      pendingRequestsSummaryQuery.refetch(),
      patientsQuery.refetch(),
    ]);
  }

  async function handleCreateSlot(): Promise<void> {
    setErrorMessage(null);
    setNoticeMessage(null);
    setIsCreating(true);
    try {
      const startsAt = toIsoDateTime(startsAtInput);
      const endsAt = toIsoDateTime(endsAtInput);

      await createAppointmentSlot({
        startsAt,
        endsAt,
        meetingLink: meetingLinkInput.trim() || undefined,
      });

      setNoticeMessage('Availability published.');
      setStartsAtInput('');
      setEndsAtInput('');
      setMeetingLinkInput('');
      await handleRefreshWorkspace();
    } catch (error) {
      setErrorMessage(toUserMessage(asAppError(error)));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleReview(requestId: string, status: 'approved' | 'rejected'): Promise<void> {
    setErrorMessage(null);
    setNoticeMessage(null);
    setReviewingKey(`${requestId}:${status}`);
    try {
      await reviewAppointmentRequest(requestId, status);
      setNoticeMessage(status === 'approved' ? 'Request approved.' : 'Request rejected.');
      await handleRefreshWorkspace();
    } catch (error) {
      setErrorMessage(toUserMessage(asAppError(error)));
    } finally {
      setReviewingKey(null);
    }
  }

  return (
    <div className="page-stack appointments-page">
      <Section
        className="dashboard-page-header appointments-page-header"
        eyebrow="Care coordination"
        title="Appointments"
        subtitle="Review scheduling demand, confirm whether open capacity is sufficient, and publish new availability only when it is truly needed."
        meta={
          <span className="appointments-page__meta" aria-live="polite">
            <span className="appointments-page__meta-pill appointments-page__meta-pill--count">
              {requestCountLabel}
            </span>
            <span className="appointments-page__meta-pill">{openCapacityLabel}</span>
            <span
              className={`appointments-page__meta-pill appointments-page__meta-pill--status appointments-page__meta-pill--status-${coordinationState.tone}`}
            >
              {coordinationState.label}
            </span>
            <span className="appointments-page__meta-pill appointments-page__meta-pill--updated">
              Updated {refreshedAtLabel}
            </span>
          </span>
        }
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

      {noticeMessage ? (
        <AlertBanner variant="success" title="Updated">
          {noticeMessage}
        </AlertBanner>
      ) : null}

      <section className="appointments-workspace-note" aria-label="Appointments workspace guidance">
        <div className="appointments-workspace-note__copy">
          <p className="appointments-workspace-note__eyebrow">Scheduling workspace</p>
          <p className="appointments-workspace-note__text">
            Requests create scheduling demand. Open capacity responds to that demand. Publish new
            availability only when the current queue still needs coverage.
          </p>
        </div>
        <div className="appointments-workspace-note__facts" aria-live="polite">
          <span className="appointments-workspace-note__fact">{requestCountLabel}</span>
          <span className="appointments-workspace-note__fact">{openCapacityLabel}</span>
          <span
            className={`appointments-workspace-note__fact appointments-workspace-note__fact--status appointments-workspace-note__fact--status-${coverageState.tone}`}
          >
            {capacityStatusLabel}
          </span>
        </div>
      </section>

      <Card
        className="appointments-workspace-card"
        title={
          <span className="appointments-card-title">
            Scheduling coordination
            <span className="appointments-card-title__meta">Review demand before publishing</span>
          </span>
        }
      >
        <div className="appointments-workspace">
          <div className="appointments-workspace__context">
            <div className="appointments-workspace__context-copy">
              <p className="appointments-workspace__context-eyebrow">What needs attention now</p>
              <p className="appointments-workspace__context-text">{coordinationState.note}</p>
              <p className="appointments-workspace__coverage-text">{coverageState.note}</p>
            </div>
            <div className="appointments-workspace__context-facts" aria-live="polite">
              <span className="appointments-workspace__context-pill appointments-workspace__context-pill--demand">
                {requestCountLabel}
              </span>
              <span className="appointments-workspace__context-pill appointments-workspace__context-pill--capacity">
                {openCapacityLabel}
              </span>
              <span
                className={`appointments-workspace__context-pill appointments-workspace__context-pill--status appointments-workspace__context-pill--status-${coverageState.tone}`}
              >
                {coverageState.label}
              </span>
              {capacityNeedsPublishing ? (
                <span className="appointments-workspace__context-pill appointments-workspace__context-pill--action">
                  {workspaceActionLabel}
                </span>
              ) : null}
            </div>
          </div>
          <p className="appointments-workspace__intro">
            Start with request review, use open capacity to judge whether demand is covered, then
            publish new availability only if the waiting queue still needs clinician time.
          </p>
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
                      setRequestStatus(status);
                      writeWorkspaceState(APPOINTMENTS_WORKSPACE_PAGE, {
                        requestStatus: status,
                        slotStatus,
                      });
                    }}
                  >
                    {status}
                  </Button>
                ))}
              </div>

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
                    const isPendingRequest = item.status === 'pending';
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
                        }`}
                      >
                        <div className="appointments-item__header">
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
                          <div className="appointments-item__badge-stack">
                            <Badge variant={toStatusVariant(item.status)}>{formatRequestViewLabel(item.status)}</Badge>
                            <Badge variant={toWorkflowVariant(item.workflowStatus)}>
                              {appointmentWorkflowLabel(item.workflowStatus)}
                            </Badge>
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
                        <div className="appointments-item__meta-row appointments-item__meta-row--primary">
                          <span className="appointments-item__meta-chip">
                            Workflow {appointmentWorkflowLabel(item.workflowStatus)}
                          </span>
                          <span className="appointments-item__meta-chip">
                            Created {formatDateTime(item.createdAt)}
                          </span>
                          {item.reviewedAt ? (
                            <span className="appointments-item__meta-chip">
                              Reviewed {formatDateTime(item.reviewedAt)}
                            </span>
                          ) : null}
                        </div>
                        {item.note ? (
                          <div className="appointments-item__reason">
                            <p className="appointments-item__reason-label">Request note</p>
                            <p className="appointments-item__reason-text">{item.note}</p>
                          </div>
                        ) : null}
                        {isPendingRequest ? (
                          <div className="appointments-item__actions appointments-item__actions--pending">
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={reviewingKey !== null}
                              onClick={() => {
                                void handleReview(item.requestId, 'approved');
                              }}
                            >
                              {reviewingKey === `${item.requestId}:approved` ? 'Approving...' : 'Approve'}
                            </Button>
                            <Button
                              className="appointments-item__open"
                              size="sm"
                              variant="secondary"
                              onClick={() => openPatientFromAppointments(item)}
                            >
                              Open patient
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={reviewingKey !== null}
                              onClick={() => {
                                void handleReview(item.requestId, 'rejected');
                              }}
                            >
                              {reviewingKey === `${item.requestId}:rejected` ? 'Rejecting...' : 'Reject'}
                            </Button>
                          </div>
                        ) : (
                          <div className="appointments-item__actions">
                            <Button
                              className="appointments-item__open"
                              size="sm"
                              variant="secondary"
                              onClick={() => openPatientFromAppointments(item)}
                            >
                              Open patient
                            </Button>
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
              aria-label={slotStatus === 'available' ? 'Open capacity' : 'Closed capacity'}
            >
              <header className="appointments-workspace__section-header">
                <div className="appointments-workspace__section-heading">
                  <h3 className="appointments-workspace__section-title">{slotViewLabel}</h3>
                  <p className="appointments-workspace__section-note">{slotsSectionNote}</p>
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
                    setSlotStatus('available');
                    writeWorkspaceState(APPOINTMENTS_WORKSPACE_PAGE, {
                      requestStatus,
                      slotStatus: 'available',
                    });
                  }}
                >
                  Open capacity
                </Button>
                <Button
                  variant={slotStatus === 'closed' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => {
                    setSlotStatus('closed');
                    writeWorkspaceState(APPOINTMENTS_WORKSPACE_PAGE, {
                      requestStatus,
                      slotStatus: 'closed',
                    });
                  }}
                >
                  Closed capacity
                </Button>
              </div>

              {slotsQuery.error ? (
                <AlertBanner variant="error" title="Could not load capacity">
                  {toUserMessage(slotsQuery.error)}
                </AlertBanner>
              ) : null}

              {slotsQuery.isLoading && slots.length === 0 ? (
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
            </section>
          </div>
        </div>
      </Card>

      <Card
        className="appointments-composer-card"
        title={
          <span className="appointments-card-title">
            Publish availability
            <span className="appointments-card-title__meta">{composerMetaLabel}</span>
          </span>
        }
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
          <p className="appointments-composer__intro">
            Use this panel after request review to publish only the clinician time the queue still
            needs.
          </p>
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
