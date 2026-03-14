import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import { Skeleton } from '../components/ui/Skeleton';
import {
  listInsightsQueue,
  reviewInsight,
  usePatients,
} from '../services/clinicianApi';
import { asAppError, isRetryable, toUserMessage } from '../utils/errors';
import { getPatientDisplayName } from '../utils/patientFilters';

type QueueStateTone = 'active' | 'blocked' | 'clear';

interface QueueState {
  label: string;
  hint: string;
  tone: QueueStateTone;
}

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

function formatQueueUpdatedAt(...timestamps: number[]): string {
  const timestamp = Math.max(...timestamps.filter((value) => Number.isFinite(value) && value > 0), 0);
  if (!timestamp) {
    return '--';
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function describeQueueState(pendingCount: number, hasError: boolean): QueueState {
  if (hasError) {
    return {
      label: 'Blocked',
      hint: 'The queue could not load. Review is blocked until the queue refreshes.',
      tone: 'blocked',
    };
  }

  if (pendingCount === 0) {
    return {
      label: 'Clear',
      hint: 'No pending guidance is waiting for clinician review.',
      tone: 'clear',
    };
  }

  return {
    label: 'Active review',
    hint: 'Pending guidance is ready for clinician decision and moving through review normally.',
    tone: 'active',
  };
}

export function InsightsQueuePage(): JSX.Element {
  const navigate = useNavigate();
  const [isSubmittingId, setIsSubmittingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const patientsQuery = usePatients();

  const queueQuery = useQuery({
    queryKey: ['insights-queue', 'pending'],
    queryFn: () => listInsightsQueue('pending', 50),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const approvedInsightsQuery = useQuery({
    queryKey: ['insights-queue', 'approved'],
    queryFn: () => listInsightsQueue('approved', 50),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const rejectedInsightsQuery = useQuery({
    queryKey: ['insights-queue', 'rejected'],
    queryFn: () => listInsightsQueue('rejected', 50),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientNameById = useMemo(() => {
    return new Map(
      (patientsQuery.data ?? []).map((patient) => [patient.id, getPatientDisplayName(patient)]),
    );
  }, [patientsQuery.data]);

  const pendingItems = queueQuery.data ?? [];
  const approvedCount = approvedInsightsQuery.data?.length ?? 0;
  const rejectedCount = rejectedInsightsQuery.data?.length ?? 0;
  const reviewedCountsUnavailable = Boolean(approvedInsightsQuery.error || rejectedInsightsQuery.error);
  const reviewedCount = reviewedCountsUnavailable ? null : approvedCount + rejectedCount;
  const pendingCount = pendingItems.length;
  const queueState = describeQueueState(pendingCount, Boolean(queueQuery.error));
  const updatedAtLabel = formatQueueUpdatedAt(
    queueQuery.dataUpdatedAt,
    approvedInsightsQuery.dataUpdatedAt,
    rejectedInsightsQuery.dataUpdatedAt,
    patientsQuery.dataUpdatedAt,
  );
  const isRefreshingQueue =
    queueQuery.isFetching ||
    approvedInsightsQuery.isFetching ||
    rejectedInsightsQuery.isFetching ||
    patientsQuery.isFetching;
  const pendingCountLabel = `${pendingCount} awaiting review`;
  const reviewedCountLabel =
    reviewedCount === null ? 'Reviewed counts unavailable' : `${reviewedCount} reviewed in current view`;
  const reviewedSummaryHint =
    reviewedCount === null
      ? 'Approved and rejected counts are unavailable right now.'
      : `Approved ${approvedCount} · Rejected ${rejectedCount} in current queue view.`;
  const queueContextHint =
    pendingCount === 0
      ? 'Approve only what should surface in clinician workflow. Rejection keeps low-signal guidance out of workflow.'
      : 'Start with what is awaiting review, confirm why it was suggested, then decide whether it belongs in clinician workflow.';
  const emptyTitle =
    pendingCount === 0 && (reviewedCount ?? 0) > 0
      ? 'Queue is clear'
      : 'No guidance suggestions are waiting';
  const emptyDescription =
    pendingCount === 0 && (reviewedCount ?? 0) > 0
      ? 'No pending suggestions are waiting now. Reviewed-state counts above reflect the current queue view only and do not represent a full history.'
      : 'Monitoring remains active and new guidance suggestions will appear here when they are generated.';
  const emptyMeta =
    pendingCount === 0 && (reviewedCount ?? 0) > 0
      ? reviewedSummaryHint
      : 'Monitoring remains active.';

  async function handleRefreshQueue(): Promise<void> {
    await Promise.all([
      queueQuery.refetch(),
      approvedInsightsQuery.refetch(),
      rejectedInsightsQuery.refetch(),
      patientsQuery.refetch(),
    ]);
  }

  async function handleReview(insightId: string, status: 'approved' | 'rejected'): Promise<void> {
    setErrorMessage(null);
    setNoticeMessage(null);
    setIsSubmittingId(`${insightId}:${status}`);
    try {
      await reviewInsight(insightId, status);
      setNoticeMessage(status === 'approved' ? 'Insight approved.' : 'Insight rejected.');
      await handleRefreshQueue();
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
        subtitle="Review suggested guidance deliberately, decide what belongs in clinician workflow, and reject low-signal suggestions before they surface."
        meta={
          <span className="insights-page__meta" aria-live="polite">
            <span className="insights-page__meta-pill insights-page__meta-pill--count">
              {pendingCountLabel}
            </span>
            <span
              className={`insights-page__meta-pill insights-page__meta-pill--status insights-page__meta-pill--status-${queueState.tone}`}
            >
              {queueState.label}
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
            disabled={isRefreshingQueue}
            onClick={() => {
              void handleRefreshQueue();
            }}
          >
            {isRefreshingQueue ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />

      <div className="insights-overview-stack">
        <section className="insights-summary-strip" aria-label="Insights queue summary">
          <article className="insights-summary-strip__item insights-summary-strip__item--pending">
            <p className="insights-summary-strip__label">Awaiting review</p>
            <p className="insights-summary-strip__value">{pendingCount}</p>
            <p className="insights-summary-strip__hint">Pending guidance still needing clinician review.</p>
          </article>
          <article className="insights-summary-strip__item insights-summary-strip__item--status">
            <p className="insights-summary-strip__label">Queue state</p>
            <p
              className={`insights-summary-strip__value insights-summary-strip__value--${queueState.tone}`}
            >
              {queueState.label}
            </p>
            <p className="insights-summary-strip__hint">{queueState.hint}</p>
          </article>
          <article className="insights-summary-strip__item insights-summary-strip__item--reviewed">
            <p className="insights-summary-strip__label">Reviewed in current queue view</p>
            <p className="insights-summary-strip__value">{reviewedCount ?? '--'}</p>
            <p className="insights-summary-strip__hint">{reviewedSummaryHint}</p>
          </article>
          <article className="insights-summary-strip__item insights-summary-strip__item--updated">
            <p className="insights-summary-strip__label">Last refresh</p>
            <p className="insights-summary-strip__value">{updatedAtLabel}</p>
            <p className="insights-summary-strip__hint">Queue freshness for this review surface.</p>
          </article>
        </section>

        <section className="insights-workspace-note" aria-label="Insights workspace guidance">
          <div className="insights-workspace-note__copy">
            <p className="insights-workspace-note__eyebrow">Review workspace</p>
            <p className="insights-workspace-note__text">
              Treat this as clinician review, not passive information. Approve guidance that belongs
              in workflow, reject what should stay out, and open the patient record whenever the
              queue item needs more context.
            </p>
          </div>
          <div className="insights-workspace-note__facts" aria-live="polite">
            <span className="insights-workspace-note__fact">{pendingCountLabel}</span>
            <span className="insights-workspace-note__fact">{reviewedCountLabel}</span>
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

      <Card
        className="insights-workspace-card"
        title={
          <span className="insights-workspace-card__title">
            <span className="insights-workspace-card__title-text">Guidance review queue</span>
            <span className="insights-workspace-card__title-count">{pendingCount}</span>
            <span className="insights-workspace-card__title-meta">Pending clinician decision</span>
          </span>
        }
      >
        <div className="insights-queue-context">
          <div className="insights-queue-context__copy">
            <p className="insights-queue-context__eyebrow">Review path</p>
            <p className="insights-queue-context__text">{queueContextHint}</p>
          </div>
          <div className="insights-queue-context__facts" aria-live="polite">
            <span className="insights-queue-context__fact">{pendingCountLabel}</span>
            <span className="insights-queue-context__fact">Approve surfaces into workflow</span>
            <span className="insights-queue-context__fact">Reject keeps low-signal guidance out</span>
            <span className="insights-queue-context__fact">Open patient for context</span>
          </div>
        </div>

        <p className="insights-queue-intro">
          Review each pending suggestion in context before it enters clinician workflow. Reviewed
          counts above are context only and do not represent a full archive.
        </p>

        {queueQuery.error && pendingCount === 0 ? (
          <div className="insights-page__error">
            <AlertBanner variant="error" title="Could not load insight queue">
              {toUserMessage(queueQuery.error)}
            </AlertBanner>
            <Button
              variant="secondary"
              onClick={() => {
                void handleRefreshQueue();
              }}
            >
              Retry
            </Button>
          </div>
        ) : queueQuery.isLoading && pendingCount === 0 ? (
          <div className="patient-detail-skeleton-grid" aria-label="Insights queue loading placeholder">
            <Skeleton height={52} />
            <Skeleton height={100} />
            <Skeleton height={100} />
          </div>
        ) : pendingCount === 0 ? (
          <div className="insights-empty-state" role="status" aria-live="polite">
            <div className="insights-empty-state__title-row">
              <span className="insights-empty-state__icon" aria-hidden="true">
                ✓
              </span>
              <h3 className="insights-empty-state__title">{emptyTitle}</h3>
            </div>
            <p className="insights-empty-state__description">{emptyDescription}</p>
            <div className="insights-empty-state__footer">
              <div className="insights-empty-state__meta-group">
                <p className="insights-empty-state__meta">Last updated {updatedAtLabel}</p>
                <p className="insights-empty-state__meta insights-empty-state__meta--quiet">
                  {emptyMeta}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={isRefreshingQueue}
                onClick={() => {
                  void handleRefreshQueue();
                }}
              >
                Refresh queue
              </Button>
            </div>
          </div>
        ) : (
          <div className="stack stack--2 insights-queue-list">
            {pendingItems.map((item) => {
              const patientLabel =
                item.patientDisplayName?.trim() ||
                patientNameById.get(item.patientId) ||
                item.patientId;

              return (
                <div key={item.id} className="insights-queue__item">
                  <div className="insights-queue__item-head">
                    <div className="insights-queue__item-main">
                      <p className="insights-queue__eyebrow">Guidance suggestion</p>
                      <p className="insights-queue__title">{item.title}</p>
                      <div className="insights-queue__patient-row">
                        <p className="insights-queue__patient">
                          <span className="insights-queue__patient-label">Patient</span>
                          <Link to={`/patients/${item.patientId}`}>{patientLabel}</Link>
                        </p>
                        <p className="insights-queue__patient-id">Patient ID {item.patientId}</p>
                      </div>
                    </div>
                    <div className="insights-queue__state">
                      <Badge className="insights-queue__state-badge" variant="warning">
                        Pending review
                      </Badge>
                    </div>
                  </div>

                  <div className="insights-queue__context-row" aria-label="Insight context">
                    <Badge className="insights-queue__badge insights-queue__badge--category" variant="neutral">
                      {categoryLabel(item.category)}
                    </Badge>
                    <Badge className="insights-queue__badge insights-queue__badge--priority" variant="default">
                      Priority {item.priority}
                    </Badge>
                    <span className="insights-queue__context-chip insights-queue__context-chip--confidence">
                      Confidence {item.confidence}
                    </span>
                    <span className="insights-queue__context-chip">
                      Window {item.windowDays} days
                    </span>
                    <span className="insights-queue__context-chip">
                      Created {formatDateTime(item.createdAt)}
                    </span>
                    {item.reviewedAt ? (
                      <span className="insights-queue__context-chip">
                        Reviewed {formatDateTime(item.reviewedAt)}
                      </span>
                    ) : null}
                  </div>

                  <div className="insights-queue__reason">
                    <p className="insights-queue__reason-label">Reason for review</p>
                    <p className="insights-queue__message">{item.message}</p>
                  </div>

                  <div className="insights-queue__footer">
                    <div className="insights-queue__decision">
                      <p className="insights-queue__decision-label">Clinician decision</p>
                      <p className="insights-queue__decision-text">
                        Approve to surface this guidance in clinician workflow. Reject when it
                        should stay out of workflow or does not warrant clinician action.
                      </p>
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
                        {isSubmittingId === `${item.id}:approved` ? 'Approving…' : 'Approve for workflow'}
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
                        {isSubmittingId === `${item.id}:rejected` ? 'Rejecting…' : 'Reject suggestion'}
                      </Button>
                      <Button
                        className="insights-queue__action insights-queue__action--open"
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/patients/${encodeURIComponent(item.patientId)}`)}
                      >
                        Open patient
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
