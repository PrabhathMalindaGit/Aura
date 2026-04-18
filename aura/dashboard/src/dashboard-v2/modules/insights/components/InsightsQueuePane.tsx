import type { RefObject } from 'react';
import type { InsightQueueSectionVm, InsightsView } from '../../../adapters/insights';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { InsightQueueRow } from './InsightQueueRow';

interface InsightsQueuePaneProps {
  activeView: InsightsView;
  sections: InsightQueueSectionVm[];
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  selectedInsightId: string | null;
  selectedLowPriorityIds: Set<string>;
  selectedLowPriorityCount: number;
  allVisibleLowPrioritySelected: boolean;
  batchActionStatus: 'approved' | 'rejected' | null;
  isVeryNarrow: boolean;
  queueRef?: RefObject<HTMLDivElement | null>;
  onQueueScroll?: (scrollTop: number) => void;
  onSelectInsight: (insightId: string) => void;
  onToggleLowPrioritySelection: (insightId: string, checked: boolean) => void;
  onSelectAllVisibleLowPriority: () => void;
  onClearLowPrioritySelection: () => void;
  onApproveSelected: () => void;
  onRejectSelected: () => void;
}

export function InsightsQueuePane({
  activeView,
  sections,
  loading,
  emptyTitle,
  emptyDescription,
  selectedInsightId,
  selectedLowPriorityIds,
  selectedLowPriorityCount,
  allVisibleLowPrioritySelected,
  batchActionStatus,
  isVeryNarrow,
  queueRef,
  onQueueScroll,
  onSelectInsight,
  onToggleLowPrioritySelection,
  onSelectAllVisibleLowPriority,
  onClearLowPrioritySelection,
  onApproveSelected,
  onRejectSelected,
}: InsightsQueuePaneProps): JSX.Element {
  const hasBatchableSection = activeView === 'pending' && sections.some((section) => section.selectable);

  return (
    <DashboardV2Surface className="v2-insights-queue-pane" tone="base">
      <div className="v2-insights-queue-pane__header">
        <div>
          <DashboardV2Text tone="label">Scan the review lane</DashboardV2Text>
          <DashboardV2Heading as="h2">Follow-up lane</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            Pending review stays grouped so clinicians can work from individual follow-up down to routine batch review without losing context.
          </DashboardV2Text>
        </div>
      </div>

      <div
        ref={queueRef}
        className="v2-insights-queue-pane__body"
        onScroll={(event) => onQueueScroll?.(event.currentTarget.scrollTop)}
        data-testid="v2-insights-queue-pane"
      >
        {loading ? (
          <div className="v2-insights-queue-pane__skeleton" aria-label="Insights queue loading">
            <div className="v2-insights-skeleton v2-insights-skeleton--row" />
            <div className="v2-insights-skeleton v2-insights-skeleton--row" />
            <div className="v2-insights-skeleton v2-insights-skeleton--row" />
          </div>
        ) : sections.length === 0 ? (
          <DashboardV2Surface className="v2-insights-queue-pane__empty" tone="muted">
            <DashboardV2Heading as="h3">{emptyTitle}</DashboardV2Heading>
            <DashboardV2Text tone="muted">{emptyDescription}</DashboardV2Text>
          </DashboardV2Surface>
        ) : (
          <div className="v2-insights-queue-pane__sections">
            {sections.map((section) => (
              <section key={section.key} className="v2-insights-queue-pane__section">
                <div className="v2-insights-queue-pane__section-header">
                  <DashboardV2Heading as="h3">{section.title}</DashboardV2Heading>
                  <DashboardV2Text tone="muted">{section.description}</DashboardV2Text>
                </div>

                <div className="v2-insights-queue-pane__list" role="list" aria-label={section.title}>
                  {section.rows.map((row) => (
                    <InsightQueueRow
                      key={row.key}
                      row={row}
                      selected={row.insightId === selectedInsightId}
                      checked={selectedLowPriorityIds.has(row.insightId)}
                      isVeryNarrow={isVeryNarrow}
                      onSelect={() => onSelectInsight(row.insightId)}
                      onToggle={
                        section.selectable
                          ? (checked) => onToggleLowPrioritySelection(row.insightId, checked)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {hasBatchableSection ? (
        <div className="v2-insights-queue-pane__footer">
          {selectedLowPriorityCount > 0 ? (
            <DashboardV2Surface
              className="v2-insights-batch-bar"
              tone="elevated"
              data-testid="v2-insights-batch-bar"
            >
              <div className="v2-insights-batch-bar__copy">
                <DashboardV2Text tone="label">Batch review</DashboardV2Text>
                <DashboardV2Text tone="muted">
                  {selectedLowPriorityCount} low-priority suggestion{selectedLowPriorityCount === 1 ? '' : 's'} selected
                </DashboardV2Text>
              </div>
              <div className="v2-insights-batch-bar__actions">
                <DashboardV2Button tone="ghost" size="sm" onPress={onClearLowPrioritySelection}>
                  Clear
                </DashboardV2Button>
                <DashboardV2Button
                  tone="secondary"
                  size="sm"
                  onPress={onApproveSelected}
                >
                  {batchActionStatus === 'approved' ? 'Approving...' : 'Approve selected'}
                </DashboardV2Button>
                <DashboardV2Button tone="ghost" size="sm" onPress={onRejectSelected}>
                  {batchActionStatus === 'rejected' ? 'Rejecting...' : 'Reject selected'}
                </DashboardV2Button>
              </div>
            </DashboardV2Surface>
          ) : (
            <div className="v2-insights-queue-pane__footer-actions">
              <DashboardV2Button tone="ghost" size="sm" onPress={onSelectAllVisibleLowPriority}>
                {allVisibleLowPrioritySelected ? 'All visible selected' : 'Select all visible low-priority'}
              </DashboardV2Button>
            </div>
          )}
        </div>
      ) : null}
    </DashboardV2Surface>
  );
}
