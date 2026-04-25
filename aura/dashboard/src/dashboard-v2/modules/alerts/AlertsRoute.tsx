import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { DashboardV2ExplanationDrawer } from '../../patterns/ExplanationDrawer';
import { DashboardV2AlertsWorkbenchLayout } from '../../patterns/AlertsWorkbenchLayout';
import { DashboardV2Drawer } from '../../primitives/Drawer';
import { DashboardV2Surface } from '../../primitives/Surface';
import { DashboardV2Text } from '../../primitives/Text';
import { useAlertsUiStore } from '../../state/useAlertsUiStore';
import { AlertReviewWorkspace } from './components/AlertReviewWorkspace';
import { AlertsQueuePane } from './components/AlertsQueuePane';
import { AlertsStatusBar } from './components/AlertsStatusBar';
import {
  AlertsSupportDrawer,
  type AlertsSupportView,
} from './components/AlertsSupportDrawer';
import { useAlertsViewModel } from './useAlertsViewModel';
import './alerts.css';

const MEDIUM_LAYOUT_QUERY = '(max-width: 1279px)';
const NARROW_LAYOUT_QUERY = '(max-width: 1023px)';
const VERY_NARROW_LAYOUT_QUERY = '(max-width: 599px)';

export function AlertsRoute(): JSX.Element {
  const isMediumLayout = useMediaQuery(MEDIUM_LAYOUT_QUERY);
  const isNarrowLayout = useMediaQuery(NARROW_LAYOUT_QUERY);
  const isVeryNarrow = useMediaQuery(VERY_NARROW_LAYOUT_QUERY);
  const governanceOpen = useAlertsUiStore((state) => state.governanceOpen);
  const queueSheetOpen = useAlertsUiStore((state) => state.queueSheetOpen);
  const queueScrollTop = useAlertsUiStore((state) => state.queueScrollTop);
  const focusMode = useAlertsUiStore((state) => state.focusMode);
  const setGovernanceOpen = useAlertsUiStore((state) => state.setGovernanceOpen);
  const setQueueSheetOpen = useAlertsUiStore((state) => state.setQueueSheetOpen);
  const setQueueScrollTop = useAlertsUiStore((state) => state.setQueueScrollTop);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [supportView, setSupportView] = useState<AlertsSupportView>('governance');
  const queueRef = useRef<HTMLDivElement | null>(null);
  const viewModel = useAlertsViewModel({ isNarrowLayout });

  useEffect(() => {
    if (!isMediumLayout) {
      setGovernanceOpen(false);
    }
  }, [isMediumLayout, setGovernanceOpen]);

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
  }, [queueScrollTop, viewModel.queueRows.length]);

  const showQueueOnly = isNarrowLayout && (!viewModel.activeAlert || focusMode === 'queue');

  const queueStatus = useMemo(() => {
    if (viewModel.blockingErrorVisible) {
      return {
        title: 'Unable to load alerts',
        description:
          viewModel.errorView?.description ??
          'Alert review cannot continue until the queue is available again.',
      };
    }

    if (viewModel.blockingOfflineVisible) {
      return {
        title: 'Offline',
        description: 'No cached alert snapshot is available yet. Reconnect and retry.',
      };
    }

    return null;
  }, [viewModel.blockingErrorVisible, viewModel.blockingOfflineVisible, viewModel.errorView?.description]);

  const staleBanner = viewModel.notices.find((notice) => notice.key === 'stale-data') ?? null;
  const workspaceNotices = viewModel.notices.filter((notice) => notice.key !== 'stale-data');

  const emptyState = useMemo(() => {
    if (viewModel.queueRows.length > 0 || viewModel.showInitialLoading || queueStatus) {
      return null;
    }

    if (viewModel.filterCount > 0) {
      return {
        title: 'No alerts match this view',
        description: 'Reset filters to return to the full governance queue.',
      };
    }

    return {
      title:
        viewModel.status === 'open'
          ? 'No open alerts need review'
          : `No ${viewModel.status} alerts are available`,
      description:
        viewModel.status === 'open'
          ? 'When clinically relevant alerts fire, they will appear here for governance review.'
          : 'Change the status view or refresh the queue to continue review.',
    };
  }, [
    queueStatus,
    viewModel.filterCount,
    viewModel.queueRows.length,
    viewModel.showInitialLoading,
    viewModel.status,
  ]);

  const queuePane = (
    <AlertsQueuePane
      status={viewModel.status}
      searchValue={viewModel.searchValue}
      sourceFilter={viewModel.sourceFilter}
      timeRange={viewModel.timeRange}
      sortOrder={viewModel.sortOrder}
      unseenOnly={viewModel.unseenOnly}
      assignedToMeOnly={viewModel.assignedToMeOnly}
      unassignedOnly={viewModel.unassignedOnly}
      overriddenOnly={viewModel.overriddenOnly}
      disabled={viewModel.isRefreshing && viewModel.queueRows.length === 0}
      loading={viewModel.showInitialLoading}
      isVeryNarrow={isVeryNarrow}
      chatOriginNote={viewModel.chatOriginNote}
      rows={viewModel.queueRows}
      selectedAlertId={viewModel.selectedAlertId}
      statusTitle={queueStatus?.title}
      statusDescription={queueStatus?.description}
      emptyTitle={emptyState?.title}
      emptyDescription={emptyState?.description}
      onRetry={queueStatus ? viewModel.retryAlerts : undefined}
      onSearchChange={viewModel.setSearchValue}
      onSourceFilterChange={viewModel.setSourceFilter}
      onTimeRangeChange={viewModel.setTimeRange}
      onSortOrderChange={viewModel.setSortOrder}
      onUnseenOnlyChange={viewModel.setUnseenOnly}
      onAssignedToMeOnlyChange={viewModel.setAssignedToMeOnly}
      onUnassignedOnlyChange={viewModel.setUnassignedOnly}
      onOverriddenOnlyChange={viewModel.setOverriddenOnly}
      onReset={viewModel.resetFilters}
      onSelect={(alertId) => {
        viewModel.selectAlert(alertId, { markSeen: true });
        setQueueSheetOpen(false);
      }}
      queueRef={showQueueOnly || !isNarrowLayout ? queueRef : undefined}
      onQueueScroll={setQueueScrollTop}
    />
  );

  const workspace = (
    <AlertReviewWorkspace
      alert={viewModel.activeAlert}
      header={viewModel.activeHeader}
      summary={viewModel.activeReviewSummary}
      context={viewModel.activeContext}
      contextLoading={viewModel.activeContextLoading}
      contextError={viewModel.activeContextError}
      governance={viewModel.governance}
      notices={workspaceNotices}
      clinicianId={viewModel.clinicianId}
      mutationPending={viewModel.mutationPending}
      assignmentPending={viewModel.assignmentPending}
      overridePending={viewModel.overridePending}
      loading={viewModel.showInitialLoading}
      statusTitle={queueStatus?.title}
      statusDescription={queueStatus?.description}
      onRetry={queueStatus ? viewModel.retryAlerts : undefined}
      onAcknowledge={() => viewModel.handleStatusUpdate('acknowledged')}
      onResolve={() => viewModel.handleStatusUpdate('resolved')}
      onAssignToMe={() => viewModel.handleAssignToMe()}
      onTakeOver={() => viewModel.handleTakeOver()}
      onUnassign={() => viewModel.handleUnassign()}
      onSaveRiskOverride={viewModel.handleSaveRiskOverride}
      onClearRiskOverride={() => viewModel.handleClearRiskOverride()}
      onOpenPatient={() =>
        viewModel.activeAlert ? viewModel.openPatientFromAlert(viewModel.activeAlert.patientId) : undefined
      }
      onOpenGovernance={() => {
        setSupportView('governance');
        setGovernanceOpen(true);
      }}
      showGovernanceAction={Boolean(viewModel.activeAlert)}
      showBackToQueue={isNarrowLayout}
      onBackToQueue={viewModel.clearSelectionToQueue}
      showQueueSheetAction={isNarrowLayout && Boolean(viewModel.activeAlert)}
      onOpenQueueSheet={() => setQueueSheetOpen(true)}
      onRefetchContext={viewModel.refetchAlertContext}
    />
  );

  return (
    <>
      <div className="v2-alerts-route" data-testid="v2-alerts-route">
        <AlertsStatusBar
          statusBar={viewModel.statusBar}
          activeStatus={viewModel.status}
          filterCount={viewModel.filterCount}
          isRefreshing={viewModel.isRefreshing}
          onRefresh={viewModel.retryAlerts}
          onStatusChange={viewModel.handleStatusChange}
          onClearView={viewModel.resetFilters}
        />

        {staleBanner ? (
          <DashboardV2Surface className="v2-alerts-banner v2-alerts-banner--warning" tone="muted">
            <AlertTriangle size={16} />
            <DashboardV2Text tone="strong">{staleBanner.title}</DashboardV2Text>
            <DashboardV2Text tone="muted">{staleBanner.message}</DashboardV2Text>
          </DashboardV2Surface>
        ) : null}

        {showQueueOnly ? (
          queuePane
        ) : (
          <DashboardV2AlertsWorkbenchLayout
            queue={isNarrowLayout ? null : queuePane}
            workspace={workspace}
            rail={null}
          />
        )}
      </div>

      <AlertsSupportDrawer
        open={governanceOpen}
        onOpenChange={setGovernanceOpen}
        activeView={supportView}
        onViewChange={setSupportView}
        governance={viewModel.governance}
        placement={isNarrowLayout ? 'bottom' : 'right'}
        onOpenExplanation={() => setExplanationOpen(true)}
      />

      <DashboardV2Drawer
        open={isNarrowLayout && queueSheetOpen}
        onOpenChange={setQueueSheetOpen}
        title="Alert queue"
        description="Switch alerts without losing the current review context"
        placement="bottom"
      >
        {queuePane}
      </DashboardV2Drawer>

      <DashboardV2ExplanationDrawer
        open={explanationOpen}
        onOpenChange={setExplanationOpen}
        title="Alert governance explanation"
      >
        <DashboardV2Text tone="muted">
          This route shows only supported alert governance truth: basis, override state, assignment, timestamps, and notification metadata. Unsupported AI authorship, rule ownership, patient delivery state, and global owner claims remain intentionally omitted.
        </DashboardV2Text>
      </DashboardV2ExplanationDrawer>
    </>
  );
}
