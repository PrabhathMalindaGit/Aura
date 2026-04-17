import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { DashboardV2ExplanationDrawer } from '../../patterns/ExplanationDrawer';
import { DashboardV2InboxWorkbenchLayout } from '../../patterns/InboxWorkbenchLayout';
import { DashboardV2Drawer } from '../../primitives/Drawer';
import { DashboardV2Surface } from '../../primitives/Surface';
import { DashboardV2Text } from '../../primitives/Text';
import { useInboxUiStore } from '../../state/useInboxUiStore';
import { ActiveThreadWorkspace } from './components/ActiveThreadWorkspace';
import { InboxStatusBar } from './components/InboxStatusBar';
import { SupportContextDrawer } from './components/SupportContextDrawer';
import { SharedCoordinationRail } from './components/SharedCoordinationRail';
import { ThreadQueuePane } from './components/ThreadQueuePane';
import { useInboxViewModel } from './useInboxViewModel';
import './inbox.css';

const MEDIUM_LAYOUT_QUERY = '(max-width: 1279px)';
const NARROW_LAYOUT_QUERY = '(max-width: 1023px)';
const VERY_NARROW_LAYOUT_QUERY = '(max-width: 599px)';

export function InboxRoute(): JSX.Element {
  const isMediumLayout = useMediaQuery(MEDIUM_LAYOUT_QUERY);
  const isNarrowLayout = useMediaQuery(NARROW_LAYOUT_QUERY);
  const isVeryNarrow = useMediaQuery(VERY_NARROW_LAYOUT_QUERY);
  const supportDrawerOpen = useInboxUiStore((state) => state.supportDrawerOpen);
  const queueSheetOpen = useInboxUiStore((state) => state.queueSheetOpen);
  const queueScrollTop = useInboxUiStore((state) => state.queueScrollTop);
  const setSupportDrawerOpen = useInboxUiStore((state) => state.setSupportDrawerOpen);
  const setQueueSheetOpen = useInboxUiStore((state) => state.setQueueSheetOpen);
  const setQueueScrollTop = useInboxUiStore((state) => state.setQueueScrollTop);
  const queueRef = useRef<HTMLDivElement | null>(null);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const viewModel = useInboxViewModel({ isNarrowLayout });

  useEffect(() => {
    if (!isMediumLayout) {
      setSupportDrawerOpen(false);
    }
  }, [isMediumLayout, setSupportDrawerOpen]);

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

  const showInlineRail = !isMediumLayout;
  const showQueueOnly = isNarrowLayout && viewModel.focusMode === 'queue';

  const queuePane = (
    <ThreadQueuePane
      currentView={viewModel.currentView}
      counts={viewModel.viewCounts}
      isVeryNarrow={isVeryNarrow}
      loading={viewModel.showInitialLoading}
      rows={viewModel.queueRows}
      selectedKey={showQueueOnly ? viewModel.selectedKey : viewModel.selectedKey}
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
        setQueueSheetOpen(false);
      }}
      queueRef={showQueueOnly || !isNarrowLayout ? queueRef : undefined}
      onQueueScroll={setQueueScrollTop}
    />
  );

  const workspace = (
    <ActiveThreadWorkspace
      workspace={viewModel.activeWorkspace}
      clinicianIdentity={viewModel.clinicianIdentity}
      authoring={viewModel.authoring}
      selectedTemplateId={viewModel.selectedTemplateId}
      draftReply={viewModel.draftReply}
      draftDisabled={!viewModel.activeWorkspace?.patientId}
      loading={viewModel.showInitialLoading}
      statusTitle={viewModel.statusTitle}
      statusDescription={viewModel.statusDescription}
      showBackToQueue={isNarrowLayout}
      showQueueSheetAction={isNarrowLayout && Boolean(viewModel.activeWorkspace)}
      showSupportAction={isMediumLayout && Boolean(viewModel.support)}
      onBackToQueue={viewModel.clearSelectionToQueue}
      onOpenQueueSheet={() => setQueueSheetOpen(true)}
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

  const inlineRail = viewModel.support ? (
    <SharedCoordinationRail
      support={viewModel.support}
      coordinationLoading={viewModel.coordinationLoading}
      coordinationError={viewModel.coordinationError}
      sharedNoteDraft={viewModel.sharedNoteDraft}
      sharedNoteNotice={viewModel.sharedNoteNotice}
      sharedNoteError={viewModel.sharedNoteError}
      sharedNotePending={viewModel.sharedNotePending}
      onSharedNoteChange={viewModel.setSharedNoteDraft}
      onSubmitSharedNote={viewModel.submitSharedNote}
      onOpenStructuredCoordination={viewModel.openStructuredCoordination}
      onOpenExplanation={() => setExplanationOpen(true)}
    />
  ) : null;

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

        {showQueueOnly ? (
          queuePane
        ) : (
          <DashboardV2InboxWorkbenchLayout
            queue={isNarrowLayout ? null : queuePane}
            workspace={workspace}
            rail={showInlineRail ? inlineRail : null}
          />
        )}
      </div>

      <SupportContextDrawer
        open={isMediumLayout && supportDrawerOpen}
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

      <DashboardV2Drawer
        open={isNarrowLayout && queueSheetOpen}
        onOpenChange={setQueueSheetOpen}
        title="Message queue"
        description="Switch threads without losing the current review context"
        placement="bottom"
      >
        {queuePane}
      </DashboardV2Drawer>

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
