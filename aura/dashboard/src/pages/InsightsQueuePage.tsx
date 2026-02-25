import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { listInsightsQueue, reviewInsight } from '../services/clinicianApi';
import { asAppError, isRetryable, toUserMessage } from '../utils/errors';

function categoryLabel(value: string): string {
  if (value === 'questionnaires') {
    return 'Questionnaires';
  }
  if (value === 'recovery') {
    return 'Recovery';
  }
  if (value === 'adherence') {
    return 'Adherence';
  }
  if (value === 'safety') {
    return 'Safety';
  }
  if (value === 'symptoms') {
    return 'Symptoms';
  }
  return 'Habits';
}

function confidenceVariant(value: string): 'default' | 'success' | 'warning' | 'danger' {
  if (value === 'high') {
    return 'success';
  }
  if (value === 'medium') {
    return 'warning';
  }
  return 'default';
}

export function InsightsQueuePage(): JSX.Element {
  const [isSubmittingId, setIsSubmittingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const queueQuery = useQuery({
    queryKey: ['insights-queue', 'pending'],
    queryFn: () => listInsightsQueue('pending', 50),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  async function handleReview(insightId: string, status: 'approved' | 'rejected'): Promise<void> {
    setErrorMessage(null);
    setNoticeMessage(null);
    setIsSubmittingId(`${insightId}:${status}`);
    try {
      await reviewInsight(insightId, status);
      setNoticeMessage(status === 'approved' ? 'Insight approved.' : 'Insight rejected.');
      await queueQuery.refetch();
    } catch (error) {
      setErrorMessage(toUserMessage(asAppError(error)));
    } finally {
      setIsSubmittingId(null);
    }
  }

  return (
    <div className="page-stack">
      <Card
        title="Insights queue"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void queueQuery.refetch();
            }}
          >
            Refresh
          </Button>
        }
      >
        <p className="muted-text">
          Review pending insight suggestions before they are visible to patients.
        </p>
      </Card>

      {errorMessage ? (
        <AlertBanner variant="error" title="Could not update insight">
          {errorMessage}
        </AlertBanner>
      ) : null}

      {noticeMessage ? (
        <AlertBanner variant="success" title="Insight updated">
          {noticeMessage}
        </AlertBanner>
      ) : null}

      {queueQuery.error ? (
        <div className="patient-detail-error-state">
          <AlertBanner variant="error" title="Could not load insight queue">
            {toUserMessage(queueQuery.error)}
          </AlertBanner>
          <Button
            variant="secondary"
            onClick={() => {
              void queueQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <Card title="Pending suggestions">
        {queueQuery.isLoading && (queueQuery.data?.length ?? 0) === 0 ? (
          <div className="patient-detail-skeleton-grid" aria-label="Insights queue loading placeholder">
            <Skeleton height={52} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        ) : (queueQuery.data?.length ?? 0) === 0 ? (
          <EmptyState title="No pending insights" description="Queue is clear right now." />
        ) : (
          <div className="stack stack--2">
            {(queueQuery.data ?? []).map((item) => (
              <div
                key={item.id}
                style={{
                  border: '1px solid var(--color-border-muted)',
                  borderRadius: '0.75rem',
                  padding: '0.75rem',
                  display: 'grid',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{item.title}</p>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <Badge variant="default">{categoryLabel(item.category)}</Badge>
                    <Badge variant={confidenceVariant(item.confidence)}>
                      {item.confidence}
                    </Badge>
                    <Badge variant="default">P{item.priority}</Badge>
                  </div>
                </div>
                <p className="muted-text" style={{ margin: 0 }}>
                  {item.message}
                </p>
                <p className="muted-text" style={{ margin: 0 }}>
                  Patient:{' '}
                  <Link to={`/patients/${item.patientId}`}>
                    {item.patientDisplayName?.trim() || item.patientId}
                  </Link>{' '}
                  · Window: {item.windowDays} days
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isSubmittingId !== null}
                    onClick={() => {
                      void handleReview(item.id, 'approved');
                    }}
                  >
                    {isSubmittingId === `${item.id}:approved` ? 'Approving…' : 'Approve'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isSubmittingId !== null}
                    onClick={() => {
                      void handleReview(item.id, 'rejected');
                    }}
                  >
                    {isSubmittingId === `${item.id}:rejected` ? 'Rejecting…' : 'Reject'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
