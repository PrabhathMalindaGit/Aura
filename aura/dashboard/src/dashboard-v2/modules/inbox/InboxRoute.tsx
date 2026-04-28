import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { DashboardV2ExplanationDrawer } from '../../patterns/ExplanationDrawer';
import { DashboardV2Surface } from '../../primitives/Surface';
import { DashboardV2Text } from '../../primitives/Text';
import { useInboxUiStore } from '../../state/useInboxUiStore';
import { ActiveThreadWorkspace } from './components/ActiveThreadWorkspace';
import { InboxStatusBar } from './components/InboxStatusBar';
import { SupportContextDrawer } from './components/SupportContextDrawer';
import { ThreadQueuePane } from './components/ThreadQueuePane';
import { useInboxViewModel } from './useInboxViewModel';
import './inbox.css';

const NARROW_LAYOUT_QUERY = '(max-width: 1023px)';
const VERY_NARROW_LAYOUT_QUERY = '(max-width: 599px)';

export function InboxRoute(): JSX.Element {
  const isNarrowLayout = useMediaQuery(NARROW_LAYOUT_QUERY);
  const isVeryNarrow = useMediaQuery(VERY_NARROW_LAYOUT_QUERY);
  const supportDrawerOpen = useInboxUiStore((state) => state.supportDrawerOpen);
  const queueScrollTop = useInboxUiStore((state) => state.queueScrollTop);
  const setSupportDrawerOpen = useInboxUiStore((state) => state.setSupportDrawerOpen);
  const setQueueScrollTop = useInboxUiStore((state) => state.setQueueScrollTop);
  const queueRef = useRef<HTMLDivElement | null>(null);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const viewModel = useInboxViewModel({ isNarrowLayout: false });

  useEffect(() => {
    const element = queueRef.current;
    if (!element) {
      return;
    }

    element.scrollTop = queueScrollTop;
  }, [queueScrollTop, viewModel.queueRows.length]);

  const queuePane = (
    <ThreadQueuePane
      currentView={viewModel.currentView}
      counts={viewModel.viewCounts}
      isVeryNarrow={isVeryNarrow}
      loading={viewModel.showInitialLoading}
      rows={viewModel.queueRows}
      selectedKey={viewModel.selectedKey}
      statusTitle={viewModel.statusTitle}
      statusDescription={viewModel.statusDescription}
      emptyTitle={viewModel.emptyTitle}
      emptyDescription={viewModel.emptyDescription}
      emptyActionLabel={viewModel.emptyActionLabel}
      onEmptyAction={
        viewModel.currentView === 'all'
          ? viewModel.refreshInbox
          : () => viewModel.setCurrentView('all')
      }
      onRetry={viewModel.refreshInbox}
      onViewChange={viewModel.setCurrentView}
      onSelect={(key) => {
        viewModel.selectThread(key);
      }}
      queueRef={queueRef}
      onQueueScroll={setQueueScrollTop}
    />
  );

  const workspace = (
    <ActiveThreadWorkspace
      workspace={viewModel.activeWorkspace}
      support={viewModel.support}
      clinicianIdentity={viewModel.clinicianIdentity}
      authoring={viewModel.authoring}
      selectedTemplateId={viewModel.selectedTemplateId}
      draftReply={viewModel.draftReply}
      draftDisabled={!viewModel.activeWorkspace?.patientId}
      loading={viewModel.showInitialLoading}
      statusTitle={viewModel.statusTitle}
      statusDescription={viewModel.statusDescription}
      showBackToQueue={false}
      showQueueSheetAction={false}
      showSupportAction={Boolean(viewModel.support)}
      onBackToQueue={viewModel.clearSelectionToQueue}
      onOpenQueueSheet={viewModel.clearSelectionToQueue}
      onOpenSupport={() => setSupportDrawerOpen(true)}
      onTemplateChange={viewModel.setSelectedTemplateId}
      onDraftChange={viewModel.setDraftReply}
      onInsertTemplate={viewModel.handleInsertTemplate}
      onInsertSignature={viewModel.handleInsertSignature}
      onSaveDraft={viewModel.handleSaveLocalDraft}
      onOpenAlerts={viewModel.openAlerts}
      onOpenPatient={viewModel.openPatient}
      onOpenStructuredCoordination={viewModel.openStructuredCoordination}
      onRefresh={viewModel.refreshInbox}
    />
  );

  const statusBanner = useMemo(() => {
    if (!viewModel.staleErrorBannerVisible) {
      return null;
    }

    return (
      <DashboardV2Surface className="v2-inbox-banner v2-inbox-banner--warning" tone="muted">
        <AlertTriangle size={16} />
        <DashboardV2Text tone="strong">
          Service temporarily unavailable.
        </DashboardV2Text>
        <DashboardV2Text tone="muted">
          Showing the last known inbox snapshot from {viewModel.updatedAtLabel}.
        </DashboardV2Text>
      </DashboardV2Surface>
    );
  }, [viewModel.staleErrorBannerVisible, viewModel.updatedAtLabel]);

  return (
    <>
      <div className="v2-inbox-route" data-testid="v2-inbox-route">
        <InboxStatusBar
          currentViewLabel={viewModel.currentViewLabel}
          currentViewCount={viewModel.currentViewCount}
          totalThreads={viewModel.totalThreads}
          updatedAtLabel={viewModel.updatedAtLabel}
          guidanceLine={viewModel.guidanceLine}
          isRefreshing={viewModel.isRefreshing}
          onRefresh={viewModel.refreshInbox}
        />

        {statusBanner}

        <section className="v2-inbox-stacked-workspace" aria-label="Communication inbox workspace">
          {queuePane}
          {workspace}
        </section>
      </div>

      <SupportContextDrawer
        open={supportDrawerOpen}
        onOpenChange={setSupportDrawerOpen}
        support={viewModel.support}
        activeView={viewModel.activeSupportView}
        onViewChange={viewModel.setActiveSupportView}
        coordinationLoading={viewModel.coordinationLoading}
        coordinationError={viewModel.coordinationError}
        sharedNoteDraft={viewModel.sharedNoteDraft}
        sharedNoteNotice={viewModel.sharedNoteNotice}
        sharedNoteError={viewModel.sharedNoteError}
        sharedNotePending={viewModel.sharedNotePending}
        placement={isNarrowLayout ? 'bottom' : 'right'}
        onSharedNoteChange={viewModel.setSharedNoteDraft}
        onSubmitSharedNote={viewModel.submitSharedNote}
        onOpenStructuredCoordination={viewModel.openStructuredCoordination}
        onOpenExplanation={() => setExplanationOpen(true)}
      />

      <DashboardV2ExplanationDrawer
        open={explanationOpen}
        onOpenChange={setExplanationOpen}
        title="Inbox explanation"
      >
        <DashboardV2Text tone="muted">
          Server-reviewed state, delay state, patient communication, local drafts, and shared coordination remain separate here. Unsupported provenance such as AI authorship, delivery status, or read receipts is intentionally not claimed in this route.
        </DashboardV2Text>
      </DashboardV2ExplanationDrawer>
    </>
  );
}
