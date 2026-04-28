import { useEffect, useRef } from 'react';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { useAppointmentsUiStore } from '../../state/useAppointmentsUiStore';
import { AppointmentCapacityPanel } from './components/AppointmentCapacityPanel';
import { AppointmentPublishPanel } from './components/AppointmentPublishPanel';
import { AppointmentsPlannerWorkspace } from './components/AppointmentsPlannerWorkspace';
import { AppointmentsRequestPane } from './components/AppointmentsRequestPane';
import { AppointmentsStatusBar } from './components/AppointmentsStatusBar';
import { useAppointmentsViewModel } from './useAppointmentsViewModel';
import './appointments.css';

const NARROW_LAYOUT_QUERY = '(max-width: 1023px)';
const VERY_NARROW_LAYOUT_QUERY = '(max-width: 599px)';

export function AppointmentsRoute(): JSX.Element {
  const isNarrowLayout = useMediaQuery(NARROW_LAYOUT_QUERY);
  const isVeryNarrow = useMediaQuery(VERY_NARROW_LAYOUT_QUERY);
  const requestScrollTop = useAppointmentsUiStore((state) => state.requestScrollTop);
  const setRequestScrollTop = useAppointmentsUiStore((state) => state.setRequestScrollTop);
  const requestRef = useRef<HTMLDivElement | null>(null);
  const viewModel = useAppointmentsViewModel({ isNarrowLayout });

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
      requestRef={requestRef}
      onRequestScroll={setRequestScrollTop}
      onSelectRequest={(requestId) => {
        viewModel.selectRequest(requestId);
      }}
      selectedContext={{
        header: viewModel.activeHeader,
        request: viewModel.activeRequest,
        governance: viewModel.governance,
        reviewOutcome: viewModel.lastRequestReviewOutcome,
        reviewErrorMessage: viewModel.errorNotice?.scope === 'review' ? viewModel.errorNotice.message : null,
        mutationPending: viewModel.mutationPending,
        onApprove: () => viewModel.handleReview('approved'),
        onReject: () => viewModel.handleReview('rejected'),
        onOpenPatient: () => viewModel.openPatientFromRequest(),
      }}
    />
  );

  const workspace = (
    <AppointmentsPlannerWorkspace
      planner={viewModel.planner}
      onScheduleViewChange={viewModel.handleScheduleViewChange}
      onPreviousRange={() => viewModel.handleScheduleDateShift('previous')}
      onNextRange={() => viewModel.handleScheduleDateShift('next')}
      onToday={viewModel.handleScheduleToday}
    />
  );

  return (
    <div className="v2-appointments-route" data-testid="v2-appointments-route">
      <AppointmentsStatusBar
        statusBar={viewModel.statusBar}
        activeRequestStatus={viewModel.requestStatus}
        isRefreshing={viewModel.isRefreshing}
        onRefresh={viewModel.handleRefresh}
        onRequestStatusChange={viewModel.handleRequestStatusChange}
      />

      <section className="v2-appointments-workflow" aria-label="Scheduling workflow">
        <div className="v2-appointments-workflow__planner">{workspace}</div>
        <div className="v2-appointments-workflow__request-rail">{requestPane}</div>
        <div className="v2-appointments-workflow__operations-row">
          <AppointmentCapacityPanel
            capacity={viewModel.capacity}
            onSlotStatusChange={viewModel.handleSlotStatusChange}
          />
          <AppointmentPublishPanel
            publishVm={viewModel.publishVm}
            errorMessage={viewModel.errorNotice?.scope === 'publish' ? viewModel.errorNotice.message : null}
            onStartsAtChange={viewModel.setStartsAtInput}
            onEndsAtChange={viewModel.setEndsAtInput}
            onMeetingLinkChange={viewModel.setMeetingLinkInput}
            onPublish={viewModel.handleCreateSlot}
          />
        </div>
      </section>
    </div>
  );
}
