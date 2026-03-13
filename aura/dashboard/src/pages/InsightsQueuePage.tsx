import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
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

function formatQueueUpdatedAt(timestamp: number): string {
  if (!timestamp) {
    return '--';
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const pendingCount = queueQuery.data?.length ?? 0;
  const updatedAtLabel = formatQueueUpdatedAt(queueQuery.dataUpdatedAt);
  const queueStatusLabel = pendingCount === 0 ? 'Clear' : 'Needs review';
  const queueStatusHint =
    pendingCount === 0
      ? 'Monitoring remains active across patient safety signals.'
      : 'Review suggestions to confirm what should surface in clinician workflow.';

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
    <div className="page-stack insights-page">
      <Section
        className="dashboard-page-header insights-page-header"
        eyebrow="Clinical review"
        title="Insights"
        subtitle="Review pending insight suggestions and decide whether to surface them in clinician workflow."
        meta={
          <span className="insights-page__meta" aria-live="polite">
            <span className="insights-page__meta-pill insights-page__meta-pill--count">
              {pendingCount} pending
            </span>
            <span
              className={`insights-page__meta-pill insights-page__meta-pill--status ${
                pendingCount === 0
                  ? 'insights-page__meta-pill--status-clear'
                  : 'insights-page__meta-pill--status-attention'
              }`}
            >
              {pendingCount === 0 ? 'Monitoring active' : 'Queue needs review'}
            </span>
            <span className="insights-page__meta-pill insights-page__meta-pill--updated">
              Updated {updatedAtLabel}
            </span>
          </span>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={queueQuery.isFetching}
            onClick={() => {
              void queueQuery.refetch();
            }}
          >
            {queueQuery.isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />

      <div className="insights-overview-stack">
        <section className="insights-summary-strip" aria-label="Insights queue summary">
          <article className="insights-summary-strip__item insights-summary-strip__item--pending">
            <p className="insights-summary-strip__label">Pending suggestions</p>
            <p className="insights-summary-strip__value">{pendingCount}</p>
            <p className="insights-summary-strip__hint">Awaiting clinician review</p>
          </article>
          <article className="insights-summary-strip__item insights-summary-strip__item--status">
            <p className="insights-summary-strip__label">Queue status</p>
            <p
              className={`insights-summary-strip__value ${
                pendingCount === 0
                  ? 'insights-summary-strip__value--clear'
                  : 'insights-summary-strip__value--attention'
              }`}
            >
              {queueStatusLabel}
            </p>
            <p className="insights-summary-strip__hint">{queueStatusHint}</p>
          </article>
          <article className="insights-summary-strip__item insights-summary-strip__item--updated">
            <p className="insights-summary-strip__label">Last refresh</p>
            <p className="insights-summary-strip__value">{updatedAtLabel}</p>
            <p className="insights-summary-strip__hint">Queue freshness for this review view</p>
          </article>
        </section>

        <section className="insights-workspace-note" aria-label="Insights workspace guidance">
          <div className="insights-workspace-note__copy">
            <p className="insights-workspace-note__eyebrow">Review workspace</p>
            <p className="insights-workspace-note__text">
              Treat this queue like operational review, not a placeholder. Approve what should
              surface to clinicians and reject low-signal suggestions decisively.
            </p>
          </div>
          <div className="insights-workspace-note__facts" aria-live="polite">
            <span className="insights-workspace-note__fact">{pendingCount} pending</span>
            <span className="insights-workspace-note__fact">{queueStatusLabel}</span>
            <span className="insights-workspace-note__fact">Updated {updatedAtLabel}</span>
          </div>
        </section>
      </div>

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
        <div className="insights-page__error">
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

      <Card
        className="insights-workspace-card"
        title={
          <span className="insights-workspace-card__title">
            <span className="insights-workspace-card__title-text">Pending suggestions</span>
            <span className="insights-workspace-card__title-count">{pendingCount}</span>
            <span className="insights-workspace-card__title-meta">Operational review queue</span>
          </span>
        }
      >
        <p className="insights-queue-intro">
          Review each suggestion in context before it enters the clinician workflow.
        </p>
        {queueQuery.isLoading && pendingCount === 0 ? (
          <div className="patient-detail-skeleton-grid" aria-label="Insights queue loading placeholder">
            <Skeleton height={52} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        ) : pendingCount === 0 ? (
          <div className="insights-empty-state" role="status" aria-live="polite">
            <div className="insights-empty-state__title-row">
              <span className="insights-empty-state__icon" aria-hidden="true">
                ✓
              </span>
              <h3 className="insights-empty-state__title">No pending insights right now</h3>
            </div>
            <p className="insights-empty-state__description">
              The queue is clear. New clinical suggestions will appear here as new signals are processed.
            </p>
            <div className="insights-empty-state__footer">
              <div className="insights-empty-state__meta-group">
                <p className="insights-empty-state__meta">Last updated {updatedAtLabel}</p>
                <p className="insights-empty-state__meta insights-empty-state__meta--quiet">
                  Monitoring remains active.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={queueQuery.isFetching}
                onClick={() => {
                  void queueQuery.refetch();
                }}
              >
                Refresh queue
              </Button>
            </div>
          </div>
        ) : (
          <div className="stack stack--2 insights-queue-list">
            {(queueQuery.data ?? []).map((item) => (
              <div key={item.id} className="insights-queue__item">
                <div className="insights-queue__item-head">
                  <div className="insights-queue__item-main">
                    <p className="insights-queue__eyebrow">Clinical suggestion</p>
                    <p className="insights-queue__title">{item.title}</p>
                    <p className="insights-queue__patient">
                      <span className="insights-queue__patient-label">Patient</span>
                      <Link to={`/patients/${item.patientId}`}>
                        {item.patientDisplayName?.trim() || item.patientId}
                      </Link>
                    </p>
                  </div>
                  <div className="insights-queue__badges">
                    <Badge className="insights-queue__badge insights-queue__badge--category" variant="neutral">
                      {categoryLabel(item.category)}
                    </Badge>
                    <Badge
                      className="insights-queue__badge insights-queue__badge--confidence"
                      variant={confidenceVariant(item.confidence)}
                    >
                      {item.confidence}
                    </Badge>
                    <Badge className="insights-queue__badge insights-queue__badge--priority" variant="default">
                      P{item.priority}
                    </Badge>
                  </div>
                </div>
                <p className="muted-text insights-queue__message">{item.message}</p>
                <div className="muted-text insights-queue__meta" aria-label="Insight metadata">
                  <span className="insights-queue__meta-chip insights-queue__meta-chip--window">
                    Window {item.windowDays} days
                  </span>
                  <span className="insights-queue__meta-chip">
                    Created {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="insights-queue__actions">
                  <Button
                    className="insights-queue__action insights-queue__action--approve"
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
                    className="insights-queue__action insights-queue__action--reject"
                    variant="ghost"
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
