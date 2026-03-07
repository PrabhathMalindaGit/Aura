import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Section } from '../components/ui/Section';
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
    <div className="page-stack">
      <Section
        className="dashboard-page-header"
        eyebrow="Care coordination"
        title="Appointments"
        subtitle="Manage tele-rehab slots and review patient booking requests."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void Promise.all([slotsQuery.refetch(), requestsQuery.refetch()]);
            }}
          >
            Refresh
          </Button>
        }
      />

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

      <Card title="Create slot">
        <div className="stack stack--2">
          <label className="stack stack--1">
            <span className="muted-text">Start (local datetime)</span>
            <input
              type="datetime-local"
              value={startsAtInput}
              onChange={(event) => setStartsAtInput(event.target.value)}
            />
          </label>
          <label className="stack stack--1">
            <span className="muted-text">End (local datetime)</span>
            <input
              type="datetime-local"
              value={endsAtInput}
              onChange={(event) => setEndsAtInput(event.target.value)}
            />
          </label>
          <label className="stack stack--1">
            <span className="muted-text">Meeting link (optional)</span>
            <input
              type="text"
              value={meetingLinkInput}
              placeholder="https://..."
              onChange={(event) => setMeetingLinkInput(event.target.value)}
            />
          </label>
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
      </Card>

      <Card title="Slots">
        <div className="stack stack--2">
          <div className="appointments-filter-group">
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

          {slotsQuery.isLoading && (slotsQuery.data?.length ?? 0) === 0 ? (
            <p className="muted-text">Loading slots...</p>
          ) : (slotsQuery.data?.length ?? 0) === 0 ? (
            <EmptyState title="No slots" description="No slots match this filter." />
          ) : (
            <div className="stack stack--2">
              {(slotsQuery.data ?? []).map((slot) => (
                <div key={slot.slotId} className="appointments-item">
                  <div className="appointments-item__header">
                    <p className="appointments-item__title">{formatDateTime(slot.startsAt)}</p>
                    <Badge variant={toStatusVariant(slot.status ?? 'available')}>
                      {(slot.status ?? 'available').toUpperCase()}
                    </Badge>
                  </div>
                  <p className="muted-text appointments-item__meta">
                    Ends: {formatDateTime(slot.endsAt)}
                  </p>
                  {slot.meetingLink ? (
                    <p className="muted-text appointments-item__meta">
                      Link: {slot.meetingLink}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card title="Requests">
        <div className="stack stack--2">
          <div className="appointments-filter-group">
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

          {requestsQuery.isLoading && (requestsQuery.data?.length ?? 0) === 0 ? (
            <p className="muted-text">Loading requests...</p>
          ) : (requestsQuery.data?.length ?? 0) === 0 ? (
            <EmptyState title="No requests" description="No appointment requests match this filter." />
          ) : (
            <div className="stack stack--2">
              {(requestsQuery.data ?? []).map((item) => (
                <div key={item.requestId} className="appointments-item">
                  <div className="appointments-item__header">
                    <p className="appointments-item__title">{formatDateTime(item.startsAt)}</p>
                    <Badge variant={toStatusVariant(item.status)}>{item.status.toUpperCase()}</Badge>
                  </div>
                  <p className="muted-text appointments-item__meta">
                    Patient: {item.patientId} · Ends: {formatDateTime(item.endsAt)}
                  </p>
                  {item.note ? (
                    <p className="muted-text appointments-item__meta">
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
        </div>
      </Card>
    </div>
  );
}
