import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import { Skeleton } from '../components/ui/Skeleton';
import { Tabs } from '../components/ui/Tabs';
import {
  listInsightsQueue,
  reviewInsight,
  usePatients,
} from '../services/clinicianApi';
import type { InsightItem, InsightStatus } from '../types/models';
import { asAppError, isRetryable, toUserMessage } from '../utils/errors';
import { getPatientDisplayName } from '../utils/patientFilters';

type QueueStateTone = 'active' | 'blocked' | 'clear' | 'quiet';
type QueueView = 'pending' | 'approved' | 'rejected';
type BadgeVariant = 'warning' | 'success' | 'neutral';

interface QueueState {
  label: string;
  hint: string;
  tone: QueueStateTone;
}

interface QueueViewConfig {
  titleMeta: string;
  contextHint: string;
  intro: string;
  facts: string[];
  emptyTitle: string;
  emptyDescription: string;
  emptyMeta: string;
  errorTitle: string;
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

function describeQueueState(
  pendingCount: number,
  reviewedCount: number | null,
  hasPendingError: boolean,
): QueueState {
  if (hasPendingError) {
    return {
      label: 'Blocked',
      hint: 'The pending queue could not load. Review is blocked until the queue refreshes.',
      tone: 'blocked',
    };
  }

  if (pendingCount > 0) {
    return {
      label: 'Active review',
      hint: 'Pending guidance is ready for clinician review and moving through the queue normally.',
      tone: 'active',
    };
  }

  if (reviewedCount === null) {
    return {
      label: 'Queue cleared',
      hint: 'No pending guidance is waiting. Reviewed-state visibility is unavailable right now.',
      tone: 'clear',
    };
  }

  if (reviewedCount > 0) {
    return {
      label: 'Queue cleared',
      hint: 'No pending guidance is waiting. Reviewed items remain visible in this current queue view.',
      tone: 'clear',
    };
  }

  return {
    label: 'Quiet queue',
    hint: 'No pending or reviewed guidance is present in this current queue view right now.',
    tone: 'quiet',
  };
}

function insightPriorityTone(priority: number): 'high' | 'medium' | 'low' {
  if (priority >= 3) {
    return 'high';
  }

  if (priority === 2) {
    return 'medium';
  }

  return 'low';
}

function formatLifecycleTabLabel(label: string, count: number, hasError: boolean): string {
  return `${label} (${hasError ? '--' : count})`;
}

function insightLifecycleLabel(status: InsightStatus): string {
  if (status === 'approved') {
    return 'Approved for workflow';
  }
  if (status === 'rejected') {
    return 'Rejected from workflow';
  }
  return 'Pending review';
}

function insightLifecycleBadgeVariant(status: InsightStatus): BadgeVariant {
  if (status === 'approved') {
    return 'success';
  }
  if (status === 'rejected') {
    return 'neutral';
  }
  return 'warning';
}

function insightReasonLabel(status: InsightStatus): string {
  return status === 'pending' ? 'Reason for review' : 'Reason snapshot';
}

function insightOutcomeLabel(status: InsightStatus): string {
  return status === 'pending' ? 'Clinician decision' : 'Workflow outcome';
}

function insightOutcomeText(status: InsightStatus): string {
  if (status === 'approved') {
    return 'This suggestion has already surfaced into clinician workflow in the current review context.';
  }
  if (status === 'rejected') {
    return 'This suggestion has already been kept out of clinician workflow in the current review context.';
  }
  return 'Approve to surface this guidance into clinician workflow. Reject when it should stay out of workflow or does not warrant clinician action.';
}

function describeQueueView(
  view: QueueView,
  {
    pendingCount,
    approvedCount,
    rejectedCount,
    reviewedCount,
    reviewedCountsUnavailable,
  }: {
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    reviewedCount: number | null;
    reviewedCountsUnavailable: boolean;
  },
): QueueViewConfig {
  const pendingCountLabel = `${pendingCount} awaiting review`;
  const approvedCountLabel = reviewedCountsUnavailable
    ? 'Approved unavailable'
    : `${approvedCount} approved in current view`;
  const rejectedCountLabel = reviewedCountsUnavailable
    ? 'Rejected unavailable'
    : `${rejectedCount} rejected in current view`;

  if (view === 'approved') {
    return {
      titleMeta: 'Already surfaced into workflow',
      contextHint:
        'Approved suggestions have already surfaced into clinician workflow in this current queue view. Open the patient when deeper review context is still needed.',
      intro:
        'Use this view to confirm what has already been approved in the current review context without turning the queue into a history product.',
      facts: [approvedCountLabel, 'Surfaced into workflow', 'Open patient for context'],
      emptyTitle: 'No approved suggestions in this queue view',
      emptyDescription:
        'No suggestions have been approved in the current queue view yet.',
      emptyMeta: 'Approved items surface into workflow in this current queue view only.',
      errorTitle: 'Could not load approved suggestions',
    };
  }

  if (view === 'rejected') {
    return {
      titleMeta: 'Filtered out of workflow',
      contextHint:
        'Rejected suggestions remain out of clinician workflow in this current queue view. Open the patient when the record still needs more context.',
      intro:
        'Use this view to confirm what was already filtered out in the current review context without implying a deeper audit archive.',
      facts: [rejectedCountLabel, 'Filtered out of workflow', 'Open patient for context'],
      emptyTitle: 'No rejected suggestions in this queue view',
      emptyDescription:
        'No suggestions have been rejected in the current queue view yet.',
      emptyMeta: 'Rejected items stay out of workflow in this current queue view only.',
      errorTitle: 'Could not load rejected suggestions',
    };
  }

  if (pendingCount === 0 && reviewedCount !== null && reviewedCount > 0) {
    return {
      titleMeta: 'Pending review is clear',
      contextHint:
        'No pending suggestions are waiting. Use the approved and rejected views to see what has already been handled in this current queue view.',
      intro:
        'The pending queue is clear. Reviewed tabs remain available so clinicians can confirm what surfaced into workflow versus what was filtered out.',
      facts: [pendingCountLabel, approvedCountLabel, rejectedCountLabel, 'Open patient for context'],
      emptyTitle: 'Queue is clear',
      emptyDescription:
        'No pending suggestions are waiting now. Approved and rejected views below reflect what was already handled in this current queue view only.',
      emptyMeta: 'Monitoring remains active while reviewed outcomes stay visible.',
      errorTitle: 'Could not load pending suggestions',
    };
  }

  if (pendingCount === 0) {
    return {
      titleMeta: 'No pending clinician decision',
      contextHint:
        'No pending suggestions are waiting right now. Monitoring remains active and new items will appear here when they are generated.',
      intro:
        'The pending queue is quiet. New suggestions will appear here when clinician review is needed.',
      facts: [pendingCountLabel, approvedCountLabel, rejectedCountLabel, 'Monitoring remains active'],
      emptyTitle: 'No guidance suggestions are waiting',
      emptyDescription:
        'Monitoring remains active and new guidance suggestions will appear here when they are generated.',
      emptyMeta: 'No pending or reviewed items are in this current queue view right now.',
      errorTitle: 'Could not load pending suggestions',
    };
  }

  return {
    titleMeta: 'Pending clinician decision',
    contextHint:
      'Start with what is awaiting review, confirm why it was suggested, then decide whether it belongs in clinician workflow or should stay out.',
    intro:
      'Review each pending suggestion in context before it enters clinician workflow. Approved and rejected tabs show what has already been handled in this current queue view.',
    facts: [pendingCountLabel, 'Approve surfaces into workflow', 'Reject keeps low-signal guidance out', 'Open patient for context'],
    emptyTitle: 'No pending suggestions are waiting',
    emptyDescription:
      'No pending suggestions are waiting right now.',
    emptyMeta: 'Monitoring remains active.',
    errorTitle: 'Could not load pending suggestions',
  };
}

export function InsightsQueuePage(): JSX.Element {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<QueueView>('pending');
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
  const approvedItems = approvedInsightsQuery.data ?? [];
  const rejectedItems = rejectedInsightsQuery.data ?? [];
  const approvedCount = approvedItems.length;
  const rejectedCount = rejectedItems.length;
  const reviewedCountsUnavailable = Boolean(approvedInsightsQuery.error || rejectedInsightsQuery.error);
  const reviewedCount = reviewedCountsUnavailable ? null : approvedCount + rejectedCount;
  const pendingCount = pendingItems.length;
  const queueState = describeQueueState(pendingCount, reviewedCount, Boolean(queueQuery.error));
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
  const approvedCountLabel = approvedInsightsQuery.error
    ? 'Approved unavailable'
    : `${approvedCount} approved in current view`;
  const rejectedCountLabel = rejectedInsightsQuery.error
    ? 'Rejected unavailable'
    : `${rejectedCount} rejected in current view`;
  const reviewedSummaryHint =
    reviewedCount === null
      ? 'Approved and rejected counts are unavailable right now.'
      : `Approved ${approvedCount} · Rejected ${rejectedCount} in current queue view.`;
  const tabs = useMemo(
    () => [
      {
        id: 'pending',
        label: formatLifecycleTabLabel('Pending', pendingCount, Boolean(queueQuery.error)),
      },
      {
        id: 'approved',
        label: formatLifecycleTabLabel(
          'Approved',
          approvedCount,
          Boolean(approvedInsightsQuery.error),
        ),
      },
      {
        id: 'rejected',
        label: formatLifecycleTabLabel(
          'Rejected',
          rejectedCount,
          Boolean(rejectedInsightsQuery.error),
        ),
      },
    ],
    [
      approvedCount,
      approvedInsightsQuery.error,
      pendingCount,
      queueQuery.error,
      rejectedCount,
      rejectedInsightsQuery.error,
    ],
  );

  const activeQuery =
    activeView === 'pending'
      ? queueQuery
      : activeView === 'approved'
        ? approvedInsightsQuery
        : rejectedInsightsQuery;
  const activeItems =
    activeView === 'pending'
      ? pendingItems
      : activeView === 'approved'
        ? approvedItems
        : rejectedItems;
  const viewConfig = describeQueueView(activeView, {
    pendingCount,
    approvedCount,
    rejectedCount,
    reviewedCount,
    reviewedCountsUnavailable,
  });

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

  function renderInsightCard(item: InsightItem): JSX.Element {
    const patientLabel =
      item.patientDisplayName?.trim() ||
      patientNameById.get(item.patientId) ||
      item.patientId;
    const priorityTone = insightPriorityTone(item.priority);
    const isPending = item.status === 'pending';

    return (
      <div
        key={item.id}
        className={`insights-queue__item insights-queue__item--${priorityTone} insights-queue__item--state-${item.status}`}
      >
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
            <Badge
              className={`insights-queue__state-badge insights-queue__state-badge--${item.status}`}
              variant={insightLifecycleBadgeVariant(item.status)}
            >
              {insightLifecycleLabel(item.status)}
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
          <span className="insights-queue__context-chip">Window {item.windowDays} days</span>
          <span className="insights-queue__context-chip">Created {formatDateTime(item.createdAt)}</span>
          {item.reviewedAt ? (
            <span className="insights-queue__context-chip">
              Reviewed {formatDateTime(item.reviewedAt)}
            </span>
          ) : null}
        </div>

        <div className="insights-queue__reason">
          <p className="insights-queue__reason-label">{insightReasonLabel(item.status)}</p>
          <p className="insights-queue__message">{item.message}</p>
        </div>

        <div className="insights-queue__footer">
          <div className="insights-queue__decision">
            <p className="insights-queue__decision-label">{insightOutcomeLabel(item.status)}</p>
            <p className="insights-queue__decision-text">{insightOutcomeText(item.status)}</p>
          </div>
          <div
            className={`insights-queue__actions${
              isPending ? ' insights-queue__actions--pending' : ' insights-queue__actions--reviewed'
            }`}
          >
            {isPending ? (
              <>
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
                  className="insights-queue__action insights-queue__action--open"
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/patients/${encodeURIComponent(item.patientId)}`)}
                >
                  Open patient
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
              </>
            ) : (
              <Button
                className="insights-queue__action insights-queue__action--open"
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/patients/${encodeURIComponent(item.patientId)}`)}
              >
                Open patient
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack insights-page">
      <Section
        className="dashboard-page-header insights-page-header"
        eyebrow="Clinical review"
        title="Insights"
        subtitle="Review suggested guidance deliberately, decide what belongs in clinician workflow, and confirm what was already approved or rejected in the current review context."
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
            <p className="insights-summary-strip__hint">
              Pending guidance still needing clinician review.
            </p>
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
              Treat this as a living clinician review workflow. Pending items still need review,
              approved items have already surfaced into workflow, and rejected items stay out of
              active workflow in this current queue context.
            </p>
          </div>
          <div className="insights-workspace-note__facts" aria-live="polite">
            <span className="insights-workspace-note__fact">{pendingCountLabel}</span>
            <span className="insights-workspace-note__fact">{approvedCountLabel}</span>
            <span className="insights-workspace-note__fact">{rejectedCountLabel}</span>
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
            <span className="insights-workspace-card__title-count">
              {activeQuery.error ? '--' : activeItems.length}
            </span>
            <span className="insights-workspace-card__title-meta">{viewConfig.titleMeta}</span>
          </span>
        }
      >
        <div className="insights-queue-context">
          <div className="insights-queue-context__copy">
            <p className="insights-queue-context__eyebrow">Review path</p>
            <p className="insights-queue-context__text">{viewConfig.contextHint}</p>
          </div>
          <div className="insights-queue-context__facts" aria-live="polite">
            {viewConfig.facts.map((fact) => (
              <span key={fact} className="insights-queue-context__fact">
                {fact}
              </span>
            ))}
          </div>
        </div>

        <div className="insights-lifecycle-tabs">
          <Tabs
            tabs={tabs}
            value={activeView}
            onValueChange={(id) => setActiveView(id as QueueView)}
            getTabTestId={(id) => `insights-tab-${id}`}
          />
        </div>

        <p className="insights-queue-intro">{viewConfig.intro}</p>

        {activeQuery.error && activeItems.length === 0 ? (
          <div className="insights-page__error">
            <AlertBanner variant="error" title={viewConfig.errorTitle}>
              {toUserMessage(activeQuery.error)}
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
        ) : activeQuery.isLoading && activeItems.length === 0 ? (
          <div className="patient-detail-skeleton-grid" aria-label="Insights queue loading placeholder">
            <Skeleton height={52} />
            <Skeleton height={100} />
            <Skeleton height={100} />
          </div>
        ) : activeItems.length === 0 ? (
          <div className="insights-empty-state" role="status" aria-live="polite">
            <div className="insights-empty-state__title-row">
              <span className="insights-empty-state__icon" aria-hidden="true">
                ✓
              </span>
              <h3 className="insights-empty-state__title">{viewConfig.emptyTitle}</h3>
            </div>
            <p className="insights-empty-state__description">{viewConfig.emptyDescription}</p>
            <div className="insights-empty-state__footer">
              <div className="insights-empty-state__meta-group">
                <p className="insights-empty-state__meta">Last updated {updatedAtLabel}</p>
                <p className="insights-empty-state__meta insights-empty-state__meta--quiet">
                  {viewConfig.emptyMeta}
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
            {activeItems.map((item) => renderInsightCard(item))}
          </div>
        )}
      </Card>
    </div>
  );
}
