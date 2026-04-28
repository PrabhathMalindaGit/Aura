import { useEffect, useRef } from 'react';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { DashboardV2Drawer } from '../../primitives/Drawer';
import { FollowUpWorkbenchLayout } from '../../patterns/FollowUpWorkbenchLayout';
import { useInsightsUiStore } from '../../state/useInsightsUiStore';
import { InsightsQueuePane } from './components/InsightsQueuePane';
import { InsightsReviewWorkspace } from './components/InsightsReviewWorkspace';
import { InsightsStatusBar } from './components/InsightsStatusBar';
import { InsightsSupportDrawer } from './components/InsightsSupportDrawer';
import { useInsightsViewModel } from './useInsightsViewModel';
import './insights.css';

const NARROW_LAYOUT_QUERY = '(max-width: 1023px)';

export function InsightsRoute(): JSX.Element {
  const isNarrowLayout = useMediaQuery(NARROW_LAYOUT_QUERY);
  const governanceOpen = useInsightsUiStore((state) => state.governanceOpen);
  const queueSheetOpen = useInsightsUiStore((state) => state.queueSheetOpen);
  const queueScrollTop = useInsightsUiStore((state) => state.queueScrollTop);
  const setGovernanceOpen = useInsightsUiStore((state) => state.setGovernanceOpen);
  const setQueueSheetOpen = useInsightsUiStore((state) => state.setQueueSheetOpen);
  const setQueueScrollTop = useInsightsUiStore((state) => state.setQueueScrollTop);
  const queueRef = useRef<HTMLDivElement | null>(null);
  const viewModel = useInsightsViewModel({ isNarrowLayout });

  useEffect(() => {
    if (!isNarrowLayout) {
      setQueueSheetOpen(false);
    }
  }, [isNarrowLayout, setQueueSheetOpen]);

  useEffect(() => {
    const element = queueRef.current;
    if (!element) {
      return;
    }

    element.scrollTop = queueScrollTop;
  }, [queueScrollTop, viewModel.queueSections.length]);

  const queuePane = (
    <InsightsQueuePane
      activeView={viewModel.activeView}
      sections={viewModel.queueSections}
      loading={viewModel.loading}
      emptyTitle={viewModel.emptyState.title}
      emptyDescription={viewModel.emptyState.description}
      selectedInsightId={viewModel.selectedInsightId}
      selectedLowPriorityIds={viewModel.selectedLowPriorityIds}
      selectedLowPriorityCount={viewModel.selectedLowPriorityCount}
      allVisibleLowPrioritySelected={viewModel.allVisibleLowPrioritySelected}
      batchActionStatus={viewModel.batchActionStatus}
      queueRef={viewModel.showQueueOnly || !isNarrowLayout ? queueRef : undefined}
      onQueueScroll={setQueueScrollTop}
      onSelectInsight={(insightId) => {
        viewModel.selectInsight(insightId);
        setQueueSheetOpen(false);
      }}
      onToggleLowPrioritySelection={viewModel.handleToggleLowPrioritySelection}
      onSelectAllVisibleLowPriority={viewModel.selectAllVisibleLowPriority}
      onClearLowPrioritySelection={viewModel.clearLowPrioritySelection}
      onApproveSelected={() => viewModel.handleBatchReview('approved')}
      onRejectSelected={() => viewModel.handleBatchReview('rejected')}
    />
  );

  const workspace = (
    <InsightsReviewWorkspace
      insight={viewModel.activeInsight}
      header={viewModel.activeHeader}
      summary={viewModel.activeSummary}
      governance={viewModel.activeGovernance}
      mutationPending={viewModel.mutationPending}
      reviewError={viewModel.reviewError}
      reviewOutcome={viewModel.reviewOutcome}
      loading={viewModel.loading}
      onApprove={() => viewModel.handleReview('approved')}
      onReject={() => viewModel.handleReview('rejected')}
      onOpenPatient={viewModel.openPatientFromActiveInsight}
      onOpenOutcomePatient={viewModel.openPatientFromOutcome}
      onViewOutcome={() => {
        if (viewModel.reviewOutcome) {
          viewModel.persistActiveView(viewModel.reviewOutcome.status);
        }
      }}
      onOpenSupport={() => setGovernanceOpen(true)}
      showSupportAction={Boolean(viewModel.activeGovernance)}
      showBackToQueue={isNarrowLayout}
      onBackToQueue={viewModel.clearSelectionToQueue}
      showQueueSheetAction={isNarrowLayout && Boolean(viewModel.activeInsight)}
      onOpenQueueSheet={() => setQueueSheetOpen(true)}
    />
  );

  return (
    <>
      <div className="v2-insights-route" data-testid="v2-insights-route">
        <InsightsStatusBar
          statusBar={viewModel.statusBar}
          activeView={viewModel.activeView}
          isRefreshing={viewModel.isRefreshing}
          onRefresh={viewModel.handleRefresh}
          onViewChange={viewModel.persistActiveView}
        />

        {viewModel.showQueueOnly ? (
          queuePane
        ) : (
          <>
            {queuePane}
            <FollowUpWorkbenchLayout
              className="v2-insights-workbench"
              workspace={workspace}
              rail={null}
            />
          </>
        )}
      </div>

      <InsightsSupportDrawer
        open={governanceOpen}
        onOpenChange={setGovernanceOpen}
        governance={viewModel.activeGovernance}
        placement={isNarrowLayout ? 'bottom' : 'right'}
      />

      <DashboardV2Drawer
        open={isNarrowLayout && queueSheetOpen}
        onOpenChange={setQueueSheetOpen}
        title="Insight review lane"
        description="Switch follow-up suggestions without losing the current review context."
        placement="bottom"
      >
        {queuePane}
      </DashboardV2Drawer>
    </>
  );
}
