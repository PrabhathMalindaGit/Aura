import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

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
} from '../services/clinicianApi';
import { asAppError, isRetryable, toUserMessage } from '../utils/errors';

function toIsoDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('Use a valid date/time value.');
  }
  return parsed.toISOString();
}

function toStatusVariant(status: string): 'default' | 'success' | 'warning' | 'danger' {
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

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatWorkspaceUpdatedAt(slotsUpdatedAt: number, requestsUpdatedAt: number): string {
  const timestamp = Math.max(slotsUpdatedAt || 0, requestsUpdatedAt || 0);
  if (!timestamp) {
    return '--';
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSlotViewLabel(status: 'available' | 'closed'): string {
  return status === 'available' ? 'Open capacity' : 'Closed capacity';
}

function formatRequestViewLabel(status: 'pending' | 'approved' | 'rejected' | 'canceled'): string {
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

export function AppointmentsPage(): JSX.Element {
  const [slotStatus, setSlotStatus] = useState<'available' | 'closed'>('available');
  const [requestStatus, setRequestStatus] = useState<'pending' | 'approved' | 'rejected' | 'canceled'>(
    'pending',
  );
  const [startsAtInput, setStartsAtInput] = useState('');
  const [endsAtInput, setEndsAtInput] = useState('');
  const [meetingLinkInput, setMeetingLinkInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [reviewingKey, setReviewingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

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

  const canCreate = useMemo(
    () => startsAtInput.trim().length > 0 && endsAtInput.trim().length > 0 && !isCreating,
    [endsAtInput, isCreating, startsAtInput],
  );
  const slots = useMemo(() => slotsQuery.data ?? [], [slotsQuery.data]);
  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const availableSlotsCount = slots.filter((slot) => (slot.status ?? 'available') === 'available').length;
  const closedSlotsCount = slots.filter((slot) => (slot.status ?? 'available') === 'closed').length;
  const pendingRequestsCount = requests.filter((request) => request.status === 'pending').length;
  const refreshedAtLabel = formatWorkspaceUpdatedAt(slotsQuery.dataUpdatedAt, requestsQuery.dataUpdatedAt);
  const isRefreshingWorkspace = slotsQuery.isFetching || requestsQuery.isFetching;
  const schedulingStatusLabel = pendingRequestsCount > 0 ? 'Needs attention' : 'Steady';
  const slotViewLabel = formatSlotViewLabel(slotStatus);
  const requestViewLabel = formatRequestViewLabel(requestStatus);
  const nextAvailableSlotLabel = useMemo(() => {
    const nextSlot = slots
      .filter((slot) => (slot.status ?? 'available') === 'available')
      .map((slot) => ({ slot, startsAt: new Date(slot.startsAt).getTime() }))
      .filter((entry) => Number.isFinite(entry.startsAt))
      .sort((left, right) => left.startsAt - right.startsAt)[0];

    return nextSlot ? formatDateTime(nextSlot.slot.startsAt) : '--';
  }, [slots]);
  const nextAvailableSlotMeta =
    nextAvailableSlotLabel === '--' ? 'No open slot yet' : `Next open ${nextAvailableSlotLabel}`;
  const slotsSectionNote =
    slotStatus === 'available'
      ? `${slots.length} ready to book`
      : `${slots.length} unavailable or completed`;
  const requestsSectionNote =
    requestStatus === 'pending'
      ? `${requests.length} waiting for review`
      : `${requests.length} in this status`;
  const slotsEmptyTitle =
    slotStatus === 'available' ? 'No open slots right now' : 'No closed slots in this view';
  const slotsEmptyDescription =
    slotStatus === 'available'
      ? 'Create a new availability window to publish bookable capacity for patients.'
      : 'Closed or completed availability will appear here after scheduling changes or past sessions.';
  const requestsEmptyTitle =
    requestStatus === 'pending' ? 'No requests need review' : `No ${requestStatus} requests`;
  const requestsEmptyDescription =
    requestStatus === 'pending'
      ? 'New patient booking requests will appear here when they need clinician review.'
      : 'Requests matching this workflow state will appear here when the queue changes.';

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

      setNoticeMessage('Appointment slot created.');
      setStartsAtInput('');
      setEndsAtInput('');
      setMeetingLinkInput('');
      await Promise.all([slotsQuery.refetch(), requestsQuery.refetch()]);
    } catch (error) {
      setErrorMessage(toUserMessage(asAppError(error)));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleReview(
    requestId: string,
    status: 'approved' | 'rejected',
  ): Promise<void> {
    setErrorMessage(null);
    setNoticeMessage(null);
    setReviewingKey(`${requestId}:${status}`);
    try {
      await reviewAppointmentRequest(requestId, status);
      setNoticeMessage(status === 'approved' ? 'Request approved.' : 'Request rejected.');
      await Promise.all([slotsQuery.refetch(), requestsQuery.refetch()]);
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
        subtitle="Plan clinician availability, review booking requests, and keep tele-rehab scheduling clear."
        meta={
          <span className="appointments-page__meta" aria-live="polite">
            <span className="appointments-page__meta-pill appointments-page__meta-pill--count">
              {pendingRequestsCount} pending requests
            </span>
            <span className="appointments-page__meta-pill">{availableSlotsCount} open slots</span>
            <span
              className={`appointments-page__meta-pill appointments-page__meta-pill--status ${
                pendingRequestsCount > 0
                  ? 'appointments-page__meta-pill--status-attention'
                  : 'appointments-page__meta-pill--status-clear'
              }`}
            >
              {schedulingStatusLabel}
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
              void Promise.all([slotsQuery.refetch(), requestsQuery.refetch()]);
            }}
          >
            {isRefreshingWorkspace ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      />

      <section className="appointments-summary-strip" aria-label="Appointments summary">
        <article className="appointments-summary-strip__item appointments-summary-strip__item--total">
          <p className="appointments-summary-strip__label">Total slots</p>
          <p className="appointments-summary-strip__value">{slots.length}</p>
          <p className="appointments-summary-strip__hint">Available and closed combined</p>
        </article>
        <article className="appointments-summary-strip__item appointments-summary-strip__item--available">
          <p className="appointments-summary-strip__label">Available slots</p>
          <p className="appointments-summary-strip__value">{availableSlotsCount}</p>
          <p className="appointments-summary-strip__hint">Ready to book now</p>
        </article>
        <article className="appointments-summary-strip__item appointments-summary-strip__item--closed">
          <p className="appointments-summary-strip__label">Closed slots</p>
          <p className="appointments-summary-strip__value">{closedSlotsCount}</p>
          <p className="appointments-summary-strip__hint">Already completed or unavailable</p>
        </article>
        <article className="appointments-summary-strip__item appointments-summary-strip__item--attention">
          <p className="appointments-summary-strip__label">Pending requests</p>
          <p className="appointments-summary-strip__value">{pendingRequestsCount}</p>
          <p className="appointments-summary-strip__hint">{nextAvailableSlotMeta}</p>
        </article>
      </section>

      <section className="appointments-workspace-note" aria-label="Scheduling workspace context">
        <div className="appointments-workspace-note__copy">
          <p className="appointments-workspace-note__eyebrow">How this workspace flows</p>
          <p className="appointments-workspace-note__text">
            Publish availability first, then review booking requests in the same workspace so scheduling decisions stay quick, traceable, and clinically calm.
          </p>
        </div>
        <div className="appointments-workspace-note__facts">
          <span className="appointments-workspace-note__fact">{slotViewLabel}</span>
          <span className="appointments-workspace-note__fact">{requestViewLabel}</span>
          <span className="appointments-workspace-note__fact">{nextAvailableSlotMeta}</span>
        </div>
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

      <Card
        className="appointments-composer-card"
        title={
          <span className="appointments-card-title">
            Create availability
            <span className="appointments-card-title__meta">Planning</span>
          </span>
        }
      >
        <div className="appointments-composer">
          <div className="appointments-composer__context">
            <span className="appointments-composer__context-pill">New bookable slot</span>
            <p className="appointments-composer__context-note">
              Published slots appear in the booking queue immediately and are offered as video visits.
            </p>
          </div>
          <p className="appointments-composer__intro">
            Set the local schedule window first, then attach an optional visit link for the patient-facing slot.
          </p>
          <div className="appointments-composer__surface">
            <div className="appointments-composer__cluster">
              <p className="appointments-composer__cluster-label">Schedule window</p>
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
                Add a meeting link only when the slot should open directly into a tele-rehab session.
              </p>
            </div>
          </div>
          <div className="appointments-composer__actions">
            <div className="appointments-composer__hint-group">
              <p className="appointments-composer__hint">
                Slots become visible in the booking queue immediately after creation.
              </p>
              <p className="appointments-composer__hint appointments-composer__hint--quiet">
                {nextAvailableSlotMeta} · Last refresh {refreshedAtLabel}
              </p>
            </div>
            <Button
              variant="primary"
              disabled={!canCreate}
              onClick={() => {
                void handleCreateSlot();
              }}
            >
              {isCreating ? 'Creating...' : 'Create slot'}
            </Button>
          </div>
        </div>
      </Card>

      <Card
        className="appointments-workspace-card"
        title={
          <span className="appointments-card-title">
            Scheduling workspace
            <span className="appointments-card-title__meta">Review & coordination</span>
          </span>
        }
      >
        <div className="appointments-workspace">
          <div className="appointments-workspace__context">
            <div className="appointments-workspace__context-facts">
              <span className="appointments-workspace__context-pill">{slotViewLabel}</span>
              <span className="appointments-workspace__context-pill">{requestViewLabel}</span>
            </div>
          </div>
          <p className="appointments-workspace__intro">
            Review availability and patient booking requests together so planning and follow-up stay in one calm operational view.
          </p>
          <div className="appointments-workspace__panels">
            <section className="appointments-workspace__section appointments-workspace__section--slots" aria-label="Appointment slots">
              <header className="appointments-workspace__section-header">
                <div className="appointments-workspace__section-heading">
                  <h3 className="appointments-workspace__section-title">Slots</h3>
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
                  Available
                </Button>
                <Button
                  variant={slotStatus === 'closed' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setSlotStatus('closed')}
                >
                  Closed
                </Button>
              </div>

              {slotsQuery.error ? (
                <AlertBanner variant="error" title="Could not load slots">
                  {toUserMessage(slotsQuery.error)}
                </AlertBanner>
              ) : null}

              {slotsQuery.isLoading && slots.length === 0 ? (
                <div className="appointments-skeleton" aria-label="Appointment slots loading placeholder">
                  <Skeleton height={64} />
                  <Skeleton height={64} />
                  <Skeleton height={64} />
                </div>
              ) : slots.length === 0 ? (
                <div className="appointments-empty-state" role="status" aria-live="polite">
                  <div className="appointments-empty-state__title-row">
                    <span className="appointments-empty-state__icon" aria-hidden="true">
                      ⏱
                    </span>
                    <h3 className="appointments-empty-state__title">{slotsEmptyTitle}</h3>
                  </div>
                  <p className="appointments-empty-state__description">
                    {slotsEmptyDescription}
                  </p>
                  <div className="appointments-empty-state__footer">
                    <p className="appointments-empty-state__meta">Updated {refreshedAtLabel}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isRefreshingWorkspace}
                      onClick={() => {
                        void Promise.all([slotsQuery.refetch(), requestsQuery.refetch()]);
                      }}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="stack stack--2">
                  {slots.map((slot) => (
                    <div key={slot.slotId} className="appointments-item appointments-item--slot">
                      <div className="appointments-item__header">
                        <div className="appointments-item__title-group">
                          <p className="appointments-item__eyebrow">Availability slot</p>
                          <p className="appointments-item__title">{formatDateTime(slot.startsAt)}</p>
                          <p className="appointments-item__subtitle">
                            Ends {formatDateTime(slot.endsAt)}
                          </p>
                          <p className="appointments-item__support">
                            {slotStatus === 'available'
                              ? 'Ready for patient booking'
                              : 'Unavailable for new bookings'}
                          </p>
                        </div>
                        <Badge variant={toStatusVariant(slot.status ?? 'available')}>
                          {(slot.status ?? 'available').toUpperCase()}
                        </Badge>
                      </div>
                      <div className="appointments-item__meta-row appointments-item__meta-row--primary">
                        <span className="appointments-item__meta-chip">Video visit</span>
                        {slot.clinicianName ? (
                          <span className="appointments-item__meta-chip">Clinician: {slot.clinicianName}</span>
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
                  ))}
                </div>
              )}
            </section>

            <section className="appointments-workspace__section appointments-workspace__section--requests" aria-label="Appointment requests">
              <header className="appointments-workspace__section-header">
                <div className="appointments-workspace__section-heading">
                  <h3 className="appointments-workspace__section-title">Requests</h3>
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
                  <Skeleton height={72} />
                  <Skeleton height={72} />
                  <Skeleton height={72} />
                </div>
              ) : requests.length === 0 ? (
                <div className="appointments-empty-state" role="status" aria-live="polite">
                  <div className="appointments-empty-state__title-row">
                    <span className="appointments-empty-state__icon" aria-hidden="true">
                      ✓
                    </span>
                    <h3 className="appointments-empty-state__title">{requestsEmptyTitle}</h3>
                  </div>
                  <p className="appointments-empty-state__description">
                    {requestsEmptyDescription}
                  </p>
                  <div className="appointments-empty-state__footer">
                    <p className="appointments-empty-state__meta">Updated {refreshedAtLabel}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isRefreshingWorkspace}
                      onClick={() => {
                        void Promise.all([slotsQuery.refetch(), requestsQuery.refetch()]);
                      }}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="stack stack--2">
                  {requests.map((item) => (
                    <div key={item.requestId} className="appointments-item appointments-item--request">
                      <div className="appointments-item__header">
                        <div className="appointments-item__title-group">
                          <p className="appointments-item__eyebrow">Booking request</p>
                          <p className="appointments-item__title">{formatDateTime(item.startsAt)}</p>
                          <p className="appointments-item__subtitle">
                            Ends {formatDateTime(item.endsAt)}
                          </p>
                          <p className="appointments-item__support">
                            {item.status === 'pending'
                              ? 'Awaiting clinician review'
                              : item.reviewedAt
                                ? `Reviewed ${formatDateTime(item.reviewedAt)}`
                                : 'Decision recorded'}
                          </p>
                        </div>
                        <Badge variant={toStatusVariant(item.status)}>{item.status.toUpperCase()}</Badge>
                      </div>
                      <div className="appointments-item__meta-row appointments-item__meta-row--primary">
                        <span className="appointments-item__meta-chip appointments-item__meta-chip--patient">
                          Patient: {item.patientId}
                        </span>
                        <span className="appointments-item__meta-chip">Video visit</span>
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
                        <p className="appointments-item__meta appointments-item__meta--note">
                          Note: {item.note}
                        </p>
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
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </Card>
    </div>
  );
}
