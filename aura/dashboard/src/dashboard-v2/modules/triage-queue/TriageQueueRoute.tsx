import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { DashboardV2Drawer } from '../../primitives/Drawer';
import { DashboardV2ExplanationDrawer } from '../../patterns/ExplanationDrawer';
import { DashboardV2Surface } from '../../primitives/Surface';
import { DashboardV2Text } from '../../primitives/Text';
import { DashboardV2TriageWorkbenchLayout } from '../../patterns/TriageWorkbenchLayout';
import { useTriageQueueUiStore } from '../../state/useTriageQueueUiStore';
import { ActiveReviewWorkspace } from './components/ActiveReviewWorkspace';
import { QueuePane } from './components/QueuePane';
import { QueueStatusBar } from './components/QueueStatusBar';
import { TriageGovernanceRail } from './components/TriageGovernanceRail';
import { useTriageQueueViewModel } from './useTriageQueueViewModel';
import './triage-queue.css';

const MEDIUM_LAYOUT_QUERY = '(max-width: 1279px)';
const NARROW_LAYOUT_QUERY = '(max-width: 1023px)';
const VERY_NARROW_LAYOUT_QUERY = '(max-width: 599px)';

export function TriageQueueRoute(): JSX.Element {
  const isMediumLayout = useMediaQuery(MEDIUM_LAYOUT_QUERY);
  const isNarrowLayout = useMediaQuery(NARROW_LAYOUT_QUERY);
  const isVeryNarrow = useMediaQuery(VERY_NARROW_LAYOUT_QUERY);
  const governanceOpen = useTriageQueueUiStore((state) => state.governanceOpen);
  const queueSheetOpen = useTriageQueueUiStore((state) => state.queueSheetOpen);
  const queueScrollTop = useTriageQueueUiStore((state) => state.queueScrollTop);
  const focusMode = useTriageQueueUiStore((state) => state.focusMode);
  const setGovernanceOpen = useTriageQueueUiStore((state) => state.setGovernanceOpen);
  const setQueueSheetOpen = useTriageQueueUiStore((state) => state.setQueueSheetOpen);
  const setQueueScrollTop = useTriageQueueUiStore((state) => state.setQueueScrollTop);
  const queueRef = useRef<HTMLDivElement | null>(null);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const {
    activeFilterConstraints,
    activeFilterCount,
    blockingOfflineVisible,
    cases,
    clearSavedWorklistState,
    clearSelectionToQueue,
    errorView,
    guidanceLine,
    queueScopeLabel,
    queueViewLabel,
    retryWorklist,
    runWorkspaceAction,
    selectCase,
    selectedCase,
    setSearch,
    setSort,
    setStatus,
    showInitialLoading,
    staleErrorBannerVisible,
    toggleFilter,
    total,
    updatedAtLabel,
    visibleSelectionKey,
    worklistQuery,
    filters,
  } = useTriageQueueViewModel({ isNarrowLayout });

  const showInlineRail = !isMediumLayout;
  const showQueueOnly = isNarrowLayout && (!selectedCase || focusMode === 'queue');
  const showGovernanceAction = isMediumLayout;
  const queueDisabled = worklistQuery.isFetching && cases.length === 0;

  useEffect(() => {
    if (showInlineRail) {
      setGovernanceOpen(false);
    }
  }, [setGovernanceOpen, showInlineRail]);

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
  }, [queueScrollTop, cases.length]);

  const queueStatus = useMemo(() => {
    if (errorView) {
      return {
        title: 'Unable to load queue',
        description: errorView.description,
      };
    }

    if (blockingOfflineVisible) {
      return {
        title: 'Offline',
        description: 'No cached worklist snapshot is available yet. Reconnect and retry.',
      };
    }

    return null;
  }, [blockingOfflineVisible, errorView]);

  const emptyState = useMemo(() => {
    if (cases.length > 0 || showInitialLoading || queueStatus) {
      return null;
    }

    if (activeFilterConstraints) {
      return {
        title: 'No patients match this view',
        description: 'Clear filters to return to the active triage queue.',
        actionLabel: 'Reset filters',
        onAction: clearSavedWorklistState,
      };
    }

    return {
      title: 'No patients need active review',
      description: 'Safety, adherence, communication, and follow-up items will appear here as the queue changes.',
      actionLabel: worklistQuery.isFetching ? 'Refreshing...' : 'Refresh queue',
      onAction: retryWorklist,
    };
  }, [
    activeFilterConstraints,
    cases.length,
    clearSavedWorklistState,
    queueStatus,
    retryWorklist,
    showInitialLoading,
    worklistQuery.isFetching,
  ]);

  const queuePane = (
    <QueuePane
      filters={filters}
      activeFilterCount={activeFilterCount}
      disabled={queueDisabled}
      isVeryNarrow={isVeryNarrow}
      rows={cases.map((item) => item.row)}
      selectedKey={visibleSelectionKey}
      onSelect={(key) => {
        selectCase(key);
        setQueueSheetOpen(false);
      }}
      onSearchChange={setSearch}
      onToggleFilter={toggleFilter}
      onStatusChange={setStatus}
      onSortChange={setSort}
      onReset={clearSavedWorklistState}
      loading={showInitialLoading}
      emptyTitle={emptyState?.title}
      emptyDescription={emptyState?.description}
      emptyActionLabel={emptyState?.actionLabel}
      onEmptyAction={emptyState?.onAction}
      statusTitle={queueStatus?.title}
      statusDescription={queueStatus?.description}
      onRetry={queueStatus ? retryWorklist : undefined}
      queueRef={showQueueOnly || !isNarrowLayout ? queueRef : undefined}
      onQueueScroll={setQueueScrollTop}
    />
  );

  const workspace = (
    <ActiveReviewWorkspace
      selectedCase={selectedCase}
      queueScopeLabel={queueScopeLabel}
      onRunAction={runWorkspaceAction}
      showGovernanceAction={showGovernanceAction}
      onOpenGovernance={() => setGovernanceOpen(true)}
      showBackToQueue={isNarrowLayout}
      onBackToQueue={clearSelectionToQueue}
      showQueueSheetAction={isNarrowLayout && Boolean(selectedCase)}
      onOpenQueueSheet={() => setQueueSheetOpen(true)}
      loading={showInitialLoading}
      statusTitle={queueStatus?.title}
      statusDescription={queueStatus?.description}
      onRetry={queueStatus ? retryWorklist : undefined}
    />
  );

  const governance = (
    <TriageGovernanceRail
      governance={selectedCase?.governance ?? null}
      queueScopeLabel={queueScopeLabel}
      onOpenExplanation={() => setExplanationOpen(true)}
    />
  );

  return (
    <>
      <div className="triage-queue-route" data-testid="triage-queue-route">
        <QueueStatusBar
          queueViewLabel={queueViewLabel}
          guidanceLine={guidanceLine}
          total={total}
          updatedAtLabel={updatedAtLabel}
          activeFilterCount={activeFilterCount}
          isRefreshing={worklistQuery.isFetching}
          onRefresh={retryWorklist}
          onClearView={clearSavedWorklistState}
        />

        {staleErrorBannerVisible ? (
          <DashboardV2Surface className="triage-route-banner triage-route-banner--warning" tone="muted">
            <AlertTriangle size={16} />
            <DashboardV2Text tone="strong">
              Service temporarily unavailable.
            </DashboardV2Text>
            <DashboardV2Text tone="muted">
              Showing the last known queue snapshot from {updatedAtLabel}.
            </DashboardV2Text>
          </DashboardV2Surface>
        ) : null}

        {showQueueOnly ? (
          queuePane
        ) : (
          <DashboardV2TriageWorkbenchLayout
            queue={isNarrowLayout ? null : queuePane}
            workspace={workspace}
            rail={showInlineRail ? governance : null}
          />
        )}
      </div>

      <DashboardV2Drawer
        open={!showInlineRail && governanceOpen}
        onOpenChange={setGovernanceOpen}
        title="Governance"
        description="Audit, provenance, and priority context"
        placement={isNarrowLayout ? 'bottom' : 'right'}
      >
        {governance}
      </DashboardV2Drawer>

      <DashboardV2Drawer
        open={isNarrowLayout && queueSheetOpen}
        onOpenChange={setQueueSheetOpen}
        title="Triage queue"
        description="Switch patients without losing the current review context"
        placement="bottom"
      >
        {queuePane}
      </DashboardV2Drawer>

      <DashboardV2ExplanationDrawer
        open={explanationOpen}
        onOpenChange={setExplanationOpen}
        title="Queue explanation"
      >
        <DashboardV2Text tone="muted">
          Queue priority remains server-calculated from the current worklist signals shown here. This route does not expose AI-authored prioritization metadata, so unsupported provenance is kept conservative.
        </DashboardV2Text>
      </DashboardV2ExplanationDrawer>
    </>
  );
}
