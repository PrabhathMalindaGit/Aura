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
  const slots = slotsQuery.data ?? [];
  const requests = requestsQuery.data ?? [];
  const availableSlotsCount = slots.filter((slot) => (slot.status ?? 'available') === 'available').length;
  const closedSlotsCount = slots.filter((slot) => (slot.status ?? 'available') === 'closed').length;
  const pendingRequestsCount = requests.filter((request) => request.status === 'pending').length;
  const refreshedAtLabel = formatWorkspaceUpdatedAt(slotsQuery.dataUpdatedAt, requestsQuery.dataUpdatedAt);
  const isRefreshingWorkspace = slotsQuery.isFetching || requestsQuery.isFetching;

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
        subtitle="Create clinician availability, review patient requests, and manage tele-rehab scheduling."
        meta={
          <span className="appointments-page__meta" aria-live="polite">
            <span className="appointments-page__meta-pill appointments-page__meta-pill--count">
              {pendingRequestsCount} pending requests
            </span>
            <span className="appointments-page__meta-pill">Updated {refreshedAtLabel}</span>
          </span>
        }
        actions={
          <Button
            variant="secondary"
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
        <article className="appointments-summary-strip__item">
          <p className="appointments-summary-strip__label">Total slots</p>
          <p className="appointments-summary-strip__value">{slots.length}</p>
        </article>
        <article className="appointments-summary-strip__item">
          <p className="appointments-summary-strip__label">Available slots</p>
          <p className="appointments-summary-strip__value">{availableSlotsCount}</p>
        </article>
        <article className="appointments-summary-strip__item">
          <p className="appointments-summary-strip__label">Closed slots</p>
          <p className="appointments-summary-strip__value">{closedSlotsCount}</p>
        </article>
        <article className="appointments-summary-strip__item appointments-summary-strip__item--attention">
          <p className="appointments-summary-strip__label">Pending requests</p>
          <p className="appointments-summary-strip__value">{pendingRequestsCount}</p>
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

      <Card className="appointments-composer-card" title="Create availability slot">
        <div className="appointments-composer">
          <p className="appointments-composer__intro">
            Set local date and time first, then share an optional tele-rehab meeting link for the slot.
          </p>
          <div className="appointments-composer__grid">
            <label className="appointments-composer__field">
              <span className="appointments-composer__label">Start (local datetime)</span>
              <input
                type="datetime-local"
                value={startsAtInput}
                onChange={(event) => setStartsAtInput(event.target.value)}
              />
            </label>
            <label className="appointments-composer__field">
              <span className="appointments-composer__label">End (local datetime)</span>
              <input
                type="datetime-local"
                value={endsAtInput}
                onChange={(event) => setEndsAtInput(event.target.value)}
              />
            </label>
            <label className="appointments-composer__field appointments-composer__field--wide">
              <span className="appointments-composer__label">Meeting link (optional)</span>
              <input
                type="text"
                value={meetingLinkInput}
                placeholder="https://..."
                onChange={(event) => setMeetingLinkInput(event.target.value)}
              />
            </label>
          </div>
          <div className="appointments-composer__actions">
            <p className="appointments-composer__hint">
              Slots are created as video visits and become visible in the booking queue immediately.
            </p>
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

      <Card className="appointments-workspace-card" title="Scheduling workspace">
        <div className="appointments-workspace">
          <p className="appointments-workspace__intro">
            Review availability and patient booking requests together to keep scheduling decisions quick and clear.
          </p>

          <section className="appointments-workspace__section" aria-label="Appointment slots">
            <header className="appointments-workspace__section-header">
              <h3 className="appointments-workspace__section-title">Slots</h3>
              <Badge variant={slotStatus === 'available' ? 'success' : 'default'}>
                {slotStatus === 'available' ? 'Available view' : 'Closed view'}
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
                  <h3 className="appointments-empty-state__title">No slots in this view</h3>
                </div>
                <p className="appointments-empty-state__description">
                  Create a new availability slot to start accepting patient booking requests.
                </p>
              </div>
            ) : (
              <div className="stack stack--2">
                {slots.map((slot) => (
                  <div key={slot.slotId} className="appointments-item">
                    <div className="appointments-item__header">
                      <div className="appointments-item__title-group">
                        <p className="appointments-item__title">{formatDateTime(slot.startsAt)}</p>
                        <p className="appointments-item__subtitle">
                          Ends {formatDateTime(slot.endsAt)}
                        </p>
                      </div>
                      <Badge variant={toStatusVariant(slot.status ?? 'available')}>
                        {(slot.status ?? 'available').toUpperCase()}
                      </Badge>
                    </div>
                    <div className="appointments-item__meta-row">
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

          <div className="appointments-workspace__divider" aria-hidden="true" />

          <section className="appointments-workspace__section" aria-label="Appointment requests">
            <header className="appointments-workspace__section-header">
              <h3 className="appointments-workspace__section-title">Requests</h3>
              <Badge variant={requestStatus === 'pending' ? 'warning' : 'default'}>
                {requestStatus}
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
                  <h3 className="appointments-empty-state__title">No requests in this view</h3>
                </div>
                <p className="appointments-empty-state__description">
                  Requests matching the current status filter will appear here when patients book slots.
                </p>
              </div>
            ) : (
              <div className="stack stack--2">
                {requests.map((item) => (
                  <div key={item.requestId} className="appointments-item">
                    <div className="appointments-item__header">
                      <div className="appointments-item__title-group">
                        <p className="appointments-item__title">{formatDateTime(item.startsAt)}</p>
                        <p className="appointments-item__subtitle">
                          Ends {formatDateTime(item.endsAt)}
                        </p>
                      </div>
                      <Badge variant={toStatusVariant(item.status)}>{item.status.toUpperCase()}</Badge>
                    </div>
                    <div className="appointments-item__meta-row">
                      <span className="appointments-item__meta-chip">Patient: {item.patientId}</span>
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
                      <p className="appointments-item__meta">
                        Note: {item.note}
                      </p>
                    ) : null}
                    {item.status === 'pending' ? (
                      <div className="appointments-item__actions">
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
                          variant="secondary"
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
      </Card>
    </div>
  );
}
