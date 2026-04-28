import { Activity, AlertTriangle } from 'lucide-react';
import type {
  InsightItem,
} from '../../../../types/models';
import type {
  InsightReviewHeaderVm,
  InsightReviewSummaryVm,
  InsightsGovernanceVm,
} from '../../../adapters/insights';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { InsightReviewHeader } from './InsightReviewHeader';

interface ReviewErrorState {
  title: string;
  message: string;
}

interface ReviewOutcomeState {
  kind: 'single' | 'batch';
  tone: 'success' | 'warning';
  title: string;
  message: string;
  ctaLabel?: string;
  patientId?: string;
}

interface InsightsReviewWorkspaceProps {
  insight: InsightItem | null;
  header: InsightReviewHeaderVm | null;
  summary: InsightReviewSummaryVm | null;
  governance: InsightsGovernanceVm | null;
  mutationPending: boolean;
  reviewError: ReviewErrorState | null;
  reviewOutcome: ReviewOutcomeState | null;
  loading: boolean;
  onApprove: () => void;
  onReject: () => void;
  onOpenPatient: () => void;
  onOpenOutcomePatient: () => void;
  onViewOutcome: () => void;
  onOpenSupport: () => void;
  showSupportAction: boolean;
  showBackToQueue: boolean;
  onBackToQueue: () => void;
  showQueueSheetAction: boolean;
  onOpenQueueSheet: () => void;
}

export function InsightsReviewWorkspace({
  insight,
  header,
  summary,
  governance,
  mutationPending,
  reviewError,
  reviewOutcome,
  loading,
  onApprove,
  onReject,
  onOpenPatient,
  onOpenOutcomePatient,
  onViewOutcome,
  onOpenSupport,
  showSupportAction,
  showBackToQueue,
  onBackToQueue,
  showQueueSheetAction,
  onOpenQueueSheet,
}: InsightsReviewWorkspaceProps): JSX.Element {
  if (loading) {
    return (
      <DashboardV2Surface className="v2-insights-review-workspace" tone="elevated">
        <div className="v2-insights-review-workspace__skeleton">
          <div className="v2-insights-skeleton v2-insights-skeleton--header" />
          <div className="v2-insights-skeleton v2-insights-skeleton--panel" />
          <div className="v2-insights-skeleton v2-insights-skeleton--panel" />
        </div>
      </DashboardV2Surface>
    );
  }

  if (!insight || !header || !summary) {
    return (
      <DashboardV2Surface className="v2-insights-review-workspace__idle" tone="muted">
        <DashboardV2Heading as="h2">Select a follow-up item to begin review</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Choose a suggestion from the lane to understand why it matters, inspect the supported follow-up context, and decide the next action without leaving your place.
        </DashboardV2Text>
      </DashboardV2Surface>
    );
  }

  return (
    <div className="v2-insights-review-workspace" data-testid="v2-insights-review-workspace">
      {reviewError ? (
        <DashboardV2Surface className="v2-insights-review-workspace__notice v2-insights-review-workspace__notice--warning" tone="muted">
          <AlertTriangle size={16} />
          <div>
            <DashboardV2Text tone="strong">{reviewError.title}</DashboardV2Text>
            <DashboardV2Text tone="muted">{reviewError.message}</DashboardV2Text>
          </div>
        </DashboardV2Surface>
      ) : null}

      {reviewOutcome ? (
        <DashboardV2Surface
          className={`v2-insights-review-workspace__notice v2-insights-review-workspace__notice--${reviewOutcome.tone}`}
          tone={reviewOutcome.tone === 'success' ? 'elevated' : 'muted'}
          data-testid="v2-insights-review-outcome"
        >
          <div>
            <DashboardV2Text tone="strong">{reviewOutcome.title}</DashboardV2Text>
            <DashboardV2Text tone="muted">{reviewOutcome.message}</DashboardV2Text>
          </div>
          <div className="v2-insights-review-workspace__notice-actions">
            {reviewOutcome.ctaLabel ? (
              <DashboardV2Button tone="secondary" size="sm" onPress={onViewOutcome}>
                {reviewOutcome.ctaLabel}
              </DashboardV2Button>
            ) : null}
            {reviewOutcome.kind === 'single' && reviewOutcome.patientId ? (
              <DashboardV2Button tone="ghost" size="sm" onPress={onOpenOutcomePatient}>
                Open patient
              </DashboardV2Button>
            ) : null}
          </div>
        </DashboardV2Surface>
      ) : null}

      <div className="v2-insights-review-workspace__layout">
        <section className="v2-insights-selected-review" aria-label="Selected insight review">
          <InsightReviewHeader
            header={header}
            pending={insight.status === 'pending'}
            mutationPending={mutationPending}
            onApprove={onApprove}
            onReject={onReject}
            onOpenPatient={onOpenPatient}
            showBackToQueue={showBackToQueue}
            onBackToQueue={onBackToQueue}
            showQueueSheetAction={showQueueSheetAction}
            onOpenQueueSheet={onOpenQueueSheet}
          />

          <div className="v2-insights-selected-review__why">
            <span className="v2-insights-selected-review__icon" aria-hidden="true">
              <Activity size={22} />
            </span>
            <DashboardV2Heading as="h3">{summary.summary}</DashboardV2Heading>
          </div>

          <div className="v2-insights-selected-review__basis-layout">
            <DashboardV2Surface className="v2-insights-selected-review__basis-panel" tone="muted">
              <DashboardV2Text tone="label">Review basis</DashboardV2Text>
              <div className="v2-insights-selected-review__basis-grid" role="list" aria-label="Review basis fields">
                {[
                  { label: 'Category', value: header.categoryLabel },
                  { label: 'Confidence', value: header.confidenceLabel },
                  { label: 'Priority', value: header.priorityLabel },
                  { label: 'Review window', value: header.reviewWindowLabel },
                  { label: 'Reviewed state', value: header.reviewedLabel },
                  { label: 'Created', value: header.createdLabel },
                ].map((fact) => (
                  <article key={fact.label} className="v2-insights-selected-review__basis-fact" role="listitem">
                    <DashboardV2Text as="span" tone="label">{fact.label}</DashboardV2Text>
                    <DashboardV2Text as="span" tone="strong">{fact.value}</DashboardV2Text>
                  </article>
                ))}
              </div>
            </DashboardV2Surface>
          </div>
        </section>

        <aside className="v2-insights-support-rail" aria-label="Follow-up review support">
          {governance ? (
            <DashboardV2Surface
              className="v2-insights-support-card v2-insights-support-card--context"
              tone="elevated"
            >
              <div className="v2-insights-support-card__header">
                <div>
                  <DashboardV2Text tone="label">Support context</DashboardV2Text>
                  <DashboardV2Heading as="h3">{governance.patientTitle}</DashboardV2Heading>
                </div>
                {showSupportAction ? (
                  <DashboardV2Button tone="secondary" size="sm" onPress={onOpenSupport}>
                    Support context
                  </DashboardV2Button>
                ) : null}
              </div>
              <DashboardV2Text tone="muted">{governance.patientSubtitle}</DashboardV2Text>
              <div className="v2-insights-support-card__facts" role="list" aria-label="Support context facts">
                {[...governance.patientFacts.slice(0, 2), ...governance.reviewFacts.slice(0, 2)].map((fact) => (
                  <article key={`${fact.label}-${fact.value}`} className="v2-insights-support-card__fact" role="listitem">
                    <DashboardV2Text as="span" tone="label">{fact.label}</DashboardV2Text>
                    <DashboardV2Text as="span" tone="strong">{fact.value}</DashboardV2Text>
                  </article>
                ))}
              </div>
            </DashboardV2Surface>
          ) : null}

          <DashboardV2Surface className="v2-insights-support-card v2-insights-support-card--reason" tone="elevated">
            <DashboardV2Heading as="h3">{summary.title}</DashboardV2Heading>
            <DashboardV2Text tone="muted">{summary.summary}</DashboardV2Text>
            <div className="v2-insights-review-workspace__facts" role="list" aria-label="Insight review facts">
              {summary.supportingFacts.map((fact) => (
                <article key={fact.label} className="v2-insights-review-workspace__fact v2-insights-review-workspace__fact--compact" role="listitem">
                  <DashboardV2Text as="span" tone="label">{fact.label}</DashboardV2Text>
                  <DashboardV2Text as="span" tone="strong">{fact.value}</DashboardV2Text>
                </article>
              ))}
            </div>
          </DashboardV2Surface>

          <DashboardV2Surface className="v2-insights-support-card v2-insights-support-card--support" tone="elevated">
            <DashboardV2Heading as="h3">
              {insight.status === 'pending' ? 'Review support' : 'Outcome context'}
            </DashboardV2Heading>
            <ul className="v2-insights-review-workspace__basis-list">
              {summary.basisItems.map((item) => (
                <li key={item}>
                  <DashboardV2Text tone="muted">{item}</DashboardV2Text>
                </li>
              ))}
            </ul>
          </DashboardV2Surface>
        </aside>
      </div>
    </div>
  );
}
