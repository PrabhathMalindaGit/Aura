import { useEffect, useRef } from 'react';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { DashboardV2Drawer } from '../../primitives/Drawer';
import { FollowUpWorkbenchLayout } from '../../patterns/FollowUpWorkbenchLayout';
import { useAppointmentsUiStore } from '../../state/useAppointmentsUiStore';
import { AppointmentsGovernanceRail } from './components/AppointmentsGovernanceRail';
import { AppointmentsPlannerWorkspace } from './components/AppointmentsPlannerWorkspace';
import { AppointmentsRequestPane } from './components/AppointmentsRequestPane';
import { AppointmentsStatusBar } from './components/AppointmentsStatusBar';
import { AppointmentsSupportDrawer } from './components/AppointmentsSupportDrawer';
import { useAppointmentsViewModel } from './useAppointmentsViewModel';
import './appointments.css';

const MEDIUM_LAYOUT_QUERY = '(max-width: 1279px)';
const NARROW_LAYOUT_QUERY = '(max-width: 1023px)';
const VERY_NARROW_LAYOUT_QUERY = '(max-width: 599px)';

export function AppointmentsRoute(): JSX.Element {
  const isMediumLayout = useMediaQuery(MEDIUM_LAYOUT_QUERY);
  const isNarrowLayout = useMediaQuery(NARROW_LAYOUT_QUERY);
  const isVeryNarrow = useMediaQuery(VERY_NARROW_LAYOUT_QUERY);
  const governanceOpen = useAppointmentsUiStore((state) => state.governanceOpen);
  const requestSheetOpen = useAppointmentsUiStore((state) => state.requestSheetOpen);
  const requestScrollTop = useAppointmentsUiStore((state) => state.requestScrollTop);
  const setGovernanceOpen = useAppointmentsUiStore((state) => state.setGovernanceOpen);
  const setRequestSheetOpen = useAppointmentsUiStore((state) => state.setRequestSheetOpen);
  const setRequestScrollTop = useAppointmentsUiStore((state) => state.setRequestScrollTop);
  const requestRef = useRef<HTMLDivElement | null>(null);
  const viewModel = useAppointmentsViewModel({ isNarrowLayout });

  useEffect(() => {
    if (!isMediumLayout) {
      setGovernanceOpen(false);
    }
  }, [isMediumLayout, setGovernanceOpen]);

  useEffect(() => {
    if (!isNarrowLayout) {
      setRequestSheetOpen(false);
    }
  }, [isNarrowLayout, setRequestSheetOpen]);

  useEffect(() => {
    const element = requestRef.current;
    if (!element) {
      return;
    }

    element.scrollTop = requestScrollTop;
  }, [requestScrollTop, viewModel.requestRows.length]);

  const requestPane = (
    <AppointmentsRequestPane
      rows={viewModel.requestRows}
      selectedRequestId={viewModel.selectedRequestId}
      loading={viewModel.loading}
      emptyTitle={viewModel.requestEmptyState.title}
      emptyDescription={viewModel.requestEmptyState.description}
      isVeryNarrow={isVeryNarrow}
      requestRef={viewModel.showQueueOnly || !isNarrowLayout ? requestRef : undefined}
      onRequestScroll={setRequestScrollTop}
      onSelectRequest={(requestId) => {
        viewModel.selectRequest(requestId);
        setRequestSheetOpen(false);
      }}
    />
  );

  const workspace = (
    <AppointmentsPlannerWorkspace
      header={viewModel.activeHeader}
      request={viewModel.activeRequest}
      planner={viewModel.planner}
      capacity={viewModel.capacity}
      reviewOutcome={viewModel.lastRequestReviewOutcome}
      reviewErrorMessage={viewModel.errorNotice?.scope === 'review' ? viewModel.errorNotice.message : null}
      mutationPending={viewModel.mutationPending}
      onApprove={() => viewModel.handleReview('approved')}
      onReject={() => viewModel.handleReview('rejected')}
      onOpenPatient={() => viewModel.openPatientFromRequest()}
      onOpenSupport={() => setGovernanceOpen(true)}
      showSupportAction={isMediumLayout}
      showBackToQueue={isNarrowLayout && viewModel.requestRows.length > 0}
      onBackToQueue={viewModel.clearSelectionToQueue}
      showQueueSheetAction={isNarrowLayout && viewModel.requestRows.length > 0 && Boolean(viewModel.activeRequest)}
      onOpenQueueSheet={() => setRequestSheetOpen(true)}
      onScheduleViewChange={viewModel.handleScheduleViewChange}
      onPreviousRange={() => viewModel.handleScheduleDateShift('previous')}
      onNextRange={() => viewModel.handleScheduleDateShift('next')}
      onToday={viewModel.handleScheduleToday}
      onSlotStatusChange={viewModel.handleSlotStatusChange}
    />
  );

  const governance = (
    <AppointmentsGovernanceRail
      governance={viewModel.governance}
      publishVm={viewModel.publishVm}
      publishErrorMessage={viewModel.errorNotice?.scope === 'publish' ? viewModel.errorNotice.message : null}
      onStartsAtChange={viewModel.setStartsAtInput}
      onEndsAtChange={viewModel.setEndsAtInput}
      onMeetingLinkChange={viewModel.setMeetingLinkInput}
      onPublish={viewModel.handleCreateSlot}
    />
  );

  return (
    <>
      <div className="v2-appointments-route" data-testid="v2-appointments-route">
        <AppointmentsStatusBar
          statusBar={viewModel.statusBar}
          activeRequestStatus={viewModel.requestStatus}
          isRefreshing={viewModel.isRefreshing}
          onRefresh={viewModel.handleRefresh}
          onRequestStatusChange={viewModel.handleRequestStatusChange}
        />

        {viewModel.showQueueOnly ? (
          requestPane
        ) : (
          <FollowUpWorkbenchLayout
            className="v2-appointments-workbench"
            lane={isNarrowLayout ? null : requestPane}
            workspace={workspace}
            rail={!isMediumLayout ? governance : null}
          />
        )}
      </div>

      <AppointmentsSupportDrawer
        open={isMediumLayout && governanceOpen}
        onOpenChange={setGovernanceOpen}
        governance={viewModel.governance}
        publishVm={viewModel.publishVm}
        publishErrorMessage={viewModel.errorNotice?.scope === 'publish' ? viewModel.errorNotice.message : null}
        onStartsAtChange={viewModel.setStartsAtInput}
        onEndsAtChange={viewModel.setEndsAtInput}
        onMeetingLinkChange={viewModel.setMeetingLinkInput}
        onPublish={viewModel.handleCreateSlot}
        placement={isNarrowLayout ? 'bottom' : 'right'}
      />

      <DashboardV2Drawer
        open={isNarrowLayout && requestSheetOpen}
        onOpenChange={setRequestSheetOpen}
        title="Request review lane"
        description="Switch appointment requests without losing the current scheduling context."
        placement="bottom"
      >
        {requestPane}
      </DashboardV2Drawer>
    </>
  );
}
