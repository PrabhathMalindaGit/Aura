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
import { appointmentWorkflowLabel, appointmentWorkflowTone } from '../utils/patientDetail';
import { getPatientDisplayName } from '../utils/patientFilters';
import { asAppError, isRetryable, toUserMessage } from '../utils/errors';

type SlotStatusFilter = 'available' | 'closed';
type RequestStatusFilter = 'pending' | 'approved' | 'rejected' | 'canceled';
type BadgeVariant = 'default' | 'success' | 'warning' | 'danger';
type CoordinationTone = 'attention' | 'clear' | 'quiet';

interface CoordinationState {
  label: string;
  note: string;
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

export function AppointmentsPage(): JSX.Element {
  const navigate = useNavigate();
  const [slotStatus, setSlotStatus] = useState<SlotStatusFilter>('available');
  const [requestStatus, setRequestStatus] = useState<RequestStatusFilter>('pending');
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
  const isRefreshingWorkspace =
    slotsQuery.isFetching ||
    requestsQuery.isFetching ||
    openSlotsSummaryQuery.isFetching ||
    pendingRequestsSummaryQuery.isFetching ||
    patientsQuery.isFetching;
  const slotViewLabel = formatSlotViewLabel(slotStatus);
  const requestViewLabel = formatRequestViewLabel(requestStatus);
  const coordinationState = describeCoordinationState(pendingRequestsCount, availableSlotsCount);
  const nextOpenSlotSummary = describeNextOpenSlot(openSlots);
  const capacityNeedsPublishing = pendingRequestsCount > availableSlotsCount;
  const requestCountLabel = `${pendingRequestsCount} request${pendingRequestsCount === 1 ? '' : 's'} waiting`;
  const openCapacityLabel = `${availableSlotsCount} open slot${availableSlotsCount === 1 ? '' : 's'}`;
  const capacityStatusLabel =
    availableSlotsCount > 0 ? 'Open capacity is available' : 'No open capacity is published';
  const workspaceActionLabel = capacityNeedsPublishing
    ? 'Publish more availability'
    : availableSlotsCount > 0
      ? 'Open capacity is available'
      : 'Review demand before publishing';
  const requestsSummaryHint =
    pendingRequestsCount > 0
      ? 'Booking requests still needing clinician review.'
      : 'No booking requests are currently waiting.';
  const openCapacitySummaryHint =
    availableSlotsCount > 0
      ? 'Published slots ready to absorb demand.'
      : pendingRequestsCount > 0
        ? 'No open slots are published for the waiting queue.'
        : 'No availability is published yet.';
  const composerGuidance =
    pendingRequestsCount > availableSlotsCount
      ? 'Requests are outpacing current open capacity. Publishing another slot is likely the next clinician step after review.'
      : pendingRequestsCount > 0 && availableSlotsCount > 0
        ? 'There is some open capacity while requests wait. Publish more only if the current schedule will not absorb demand.'
        : pendingRequestsCount === 0 && availableSlotsCount > 0
          ? 'Capacity is already published and ready. Add more availability only if additional follow-up time needs to be opened.'
          : 'No availability is currently published. Use this panel when new clinician time is ready to be offered.';
  const slotsSectionNote =
    slotStatus === 'available'
      ? availableSlotsCount > 0
        ? `${availableSlotsCount} open slots are ready for booking review.`
        : 'No open capacity is currently published.'
      : slots.length > 0
        ? `${slots.length} closed or archived slots remain in this view.`
        : 'No archived or unavailable capacity is in this view.';
  const requestsSectionNote =
    requestStatus === 'pending'
      ? pendingRequestsCount > 0
        ? `${pendingRequestsCount} requests are waiting for clinician review.`
        : availableSlotsCount > 0
          ? 'No requests are waiting right now and open capacity is already published.'
          : 'No requests are waiting right now.'
      : `${requests.length} requests are shown in this status view.`;
  const slotsEmptyTitle =
    slotStatus === 'available' ? 'No open capacity is published' : 'No closed capacity in this view';
  const slotsEmptyDescription =
    slotStatus === 'available'
      ? pendingRequestsCount > 0
        ? 'Requests are waiting but there are no open slots in this view. Review the queue, then publish availability below.'
        : 'No open slots are currently published. Add availability below when new clinician time is ready.'
      : 'Archived or unavailable slots will appear here after schedule changes or completed sessions.';
  const requestsEmptyTitle =
    requestStatus === 'pending' ? 'No requests need review' : `No ${requestStatus} requests`;
  const requestsEmptyDescription =
    requestStatus === 'pending'
      ? availableSlotsCount > 0
        ? 'The review queue is quiet and open capacity is already available for future bookings.'
        : 'New patient booking requests will appear here when clinician review is needed.'
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
          <p className="appointments-summary-strip__hint">{coordinationState.note}</p>
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
            Review incoming demand before publishing more availability. This workspace keeps request
            review and capacity decisions side by side without pretending to assign requests directly
            into slots.
          </p>
        </div>
        <div className="appointments-workspace-note__facts" aria-live="polite">
          <span className="appointments-workspace-note__fact">{requestCountLabel}</span>
          <span className="appointments-workspace-note__fact">{openCapacityLabel}</span>
          <span className="appointments-workspace-note__fact">{capacityStatusLabel}</span>
        </div>
      </section>

      <Card
        className="appointments-workspace-card"
        title={
          <span className="appointments-card-title">
            Scheduling coordination
            <span className="appointments-card-title__meta">Review before publishing</span>
          </span>
        }
      >
        <div className="appointments-workspace">
          <div className="appointments-workspace__context">
            <div className="appointments-workspace__context-copy">
              <p className="appointments-workspace__context-eyebrow">What needs attention now</p>
              <p className="appointments-workspace__context-text">{coordinationState.note}</p>
            </div>
            <div className="appointments-workspace__context-facts" aria-live="polite">
              <span className="appointments-workspace__context-pill appointments-workspace__context-pill--demand">
                {requestCountLabel}
              </span>
              <span className="appointments-workspace__context-pill appointments-workspace__context-pill--capacity">
                {openCapacityLabel}
              </span>
              <span className="appointments-workspace__context-pill appointments-workspace__context-pill--status">
                {capacityStatusLabel}
              </span>
              {capacityNeedsPublishing ? (
                <span className="appointments-workspace__context-pill appointments-workspace__context-pill--action">
                  {workspaceActionLabel}
                </span>
              ) : null}
            </div>
          </div>
          <p className="appointments-workspace__intro">
            Start with booking requests, confirm how much open capacity is already published, then add
            new availability only when the queue actually needs it.
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
                    onClick={() => setRequestStatus(status)}
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
                    const reviewLabel =
                      item.status === 'pending'
                        ? 'Awaiting clinician review'
                        : item.reviewedAt
                          ? `Reviewed ${formatDateTime(item.reviewedAt)}`
                          : 'Decision recorded';

                    return (
                      <div
                        key={item.requestId}
                        className={`appointments-item appointments-item--request${
                          item.status === 'pending' ? ' appointments-item--request-pending' : ''
                        }`}
                      >
                        <div className="appointments-item__header">
                          <div className="appointments-item__title-group">
                            <p className="appointments-item__eyebrow">Booking request</p>
                            <p className="appointments-item__title">{patientName}</p>
                            <p className="appointments-item__subtitle">Patient ID {item.patientId}</p>
                            <p className="appointments-item__support">{reviewLabel}</p>
                          </div>
                          <div className="appointments-item__badge-stack">
                            <Badge variant={toStatusVariant(item.status)}>{item.status.toUpperCase()}</Badge>
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
                            {formatCalendarDay(item.startsAt)} · Video visit
                          </p>
                        </div>
                        <div className="appointments-item__meta-row appointments-item__meta-row--primary">
                          <span className="appointments-item__meta-chip appointments-item__meta-chip--patient">
                            Patient ID {item.patientId}
                          </span>
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
                          <p className="appointments-item__meta appointments-item__meta--note">Note: {item.note}</p>
                        ) : null}
                        {item.status === 'pending' ? (
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
                              size="sm"
                              variant="ghost"
                              disabled={reviewingKey !== null}
                              onClick={() => {
                                void handleReview(item.requestId, 'rejected');
                              }}
                            >
                              {reviewingKey === `${item.requestId}:rejected` ? 'Rejecting...' : 'Reject'}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => navigate(`/patients/${encodeURIComponent(item.patientId)}`)}
                            >
                              Open patient
                            </Button>
                          </div>
                        ) : (
                          <div className="appointments-item__actions">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => navigate(`/patients/${encodeURIComponent(item.patientId)}`)}
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
                  onClick={() => setSlotStatus('available')}
                >
                  Open capacity
                </Button>
                <Button
                  variant={slotStatus === 'closed' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setSlotStatus('closed')}
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
                        ? 'Published and ready for booking'
                        : 'Closed to new bookings';

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
                          <p className="appointments-item__schedule-label">Capacity state</p>
                          <p className="appointments-item__schedule-value">{readinessLabel}</p>
                          <p className="appointments-item__schedule-support">
                            {slotStatus === 'available'
                              ? 'Visible to absorb future demand.'
                              : 'Retained for historical scheduling context.'}
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
            <span className="appointments-card-title__meta">After coordination review</span>
          </span>
        }
      >
        <div className="appointments-composer">
          <div className="appointments-composer__context">
            <span className="appointments-composer__context-pill">Publish after queue review</span>
            <p className="appointments-composer__context-note">{composerGuidance}</p>
          </div>
          <p className="appointments-composer__intro">
            Add bookable clinician time only after the current review queue and published capacity are
            clear.
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
                Published slots become visible to the booking queue immediately after creation.
              </p>
              <p className="appointments-composer__hint appointments-composer__hint--quiet">
                {capacityNeedsPublishing ? 'Demand currently exceeds open capacity.' : capacityStatusLabel} ·
                Last refresh {refreshedAtLabel}
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
