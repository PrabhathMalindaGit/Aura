import { useEffect, useState } from 'react';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { DashboardV2ExplanationDrawer } from '../../patterns/ExplanationDrawer';
import { DashboardV2PatientWorkspaceLayout } from '../../patterns/PatientWorkspaceLayout';
import { DashboardV2Surface } from '../../primitives/Surface';
import { DashboardV2Text } from '../../primitives/Text';
import { PatientGovernanceRail } from './components/PatientGovernanceRail';
import { PatientCommunicationsPane } from './components/PatientCommunicationsPane';
import { PatientDecisionStrip } from './components/PatientDecisionStrip';
import { PatientGuidancePane } from './components/PatientGuidancePane';
import { PatientHistoryPane } from './components/PatientHistoryPane';
import { PatientOverviewPane } from './components/PatientOverviewPane';
import { PatientSubrouteNav } from './components/PatientSubrouteNav';
import { PatientSupportDrawer } from './components/PatientSupportDrawer';
import { PatientWorkspaceHeader } from './components/PatientWorkspaceHeader';
import { usePatientWorkspaceViewModel } from './usePatientWorkspaceViewModel';
import './patient-workspace.css';

const MEDIUM_LAYOUT_QUERY = '(max-width: 1279px)';
const NARROW_LAYOUT_QUERY = '(max-width: 1023px)';

export function PatientWorkspaceRoute(): JSX.Element {
  const isMediumLayout = useMediaQuery(MEDIUM_LAYOUT_QUERY);
  const isNarrowLayout = useMediaQuery(NARROW_LAYOUT_QUERY);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const viewModel = usePatientWorkspaceViewModel();
  const latestMessageId = viewModel.communicationItems[0]?.messageId;
  const setSupportDrawerOpen = viewModel.setSupportDrawerOpen;

  useEffect(() => {
    if (!isMediumLayout) {
      setSupportDrawerOpen(false);
    }
  }, [isMediumLayout, setSupportDrawerOpen]);

  const inlineRail = !isMediumLayout ? (
    <PatientGovernanceRail
      patientId={viewModel.patientId}
      latestMessageId={latestMessageId}
      taskSnapshot={viewModel.patientTasks}
      governance={viewModel.governance}
      onOpenNextAction={(action) => viewModel.onDecisionAction(action)}
      onOpenExplanation={() => setExplanationOpen(true)}
    />
  ) : null;

  const activePane =
    viewModel.activeTab === 'communications' ? (
      <PatientCommunicationsPane
        communications={viewModel.communications}
        items={viewModel.communicationItems}
        timeline={viewModel.communicationTimeline}
        patientQuickReply={viewModel.patientQuickReply}
        selectedQuickReplyTemplateId={viewModel.selectedQuickReplyTemplateId}
        canQuickReplyFromPatientDetail={viewModel.canQuickReplyFromPatientDetail}
        patientCommunicationBlockedBySafety={viewModel.patientCommunicationBlockedBySafety}
        communicationAuthoring={viewModel.communicationAuthoring}
        tasks={viewModel.patientActiveTasks}
        completedTasks={viewModel.patientRecentCompletedTasks}
        completingTaskId={viewModel.completingTaskId}
        appointments={viewModel.patientAppointments}
        tasksFreshnessLabel={viewModel.tasksFreshnessLabel}
        appointmentsFreshnessLabel={viewModel.appointmentsFreshnessLabel}
        onRetry={viewModel.refreshCommunications}
        onOpenCommunicationWorkspace={viewModel.onOpenCommunicationWorkspace}
        onOpenAlertsWorkspace={viewModel.onOpenAlertsWorkspace}
        onOpenAppointmentsWorkspace={viewModel.onOpenAppointmentsWorkspace}
        onQuickReplyChange={viewModel.setPatientQuickReply}
        onSendQuickReply={viewModel.handlePatientQuickReply}
        onSelectedQuickReplyTemplateChange={viewModel.setSelectedQuickReplyTemplateId}
        onInsertTemplate={viewModel.handleInsertPatientQuickReplyTemplate}
        onInsertSignature={viewModel.handleInsertPatientQuickReplySignature}
        onCompleteTask={viewModel.handleCompleteTask}
      />
    ) : viewModel.activeTab === 'guidance' ? (
      <PatientGuidancePane
        guidance={viewModel.guidance}
        rehab={viewModel.rehab}
        selectedRehabKey={viewModel.selectedRehabKey}
        onSelectedRehabKeyChange={viewModel.setSelectedRehabKey}
        onSaveRehab={viewModel.handleRehabSave}
        rehabSaveError={viewModel.rehabSaveError}
        isSavingRehab={viewModel.isSavingRehab}
        promDue={viewModel.promDue}
        completedProms={viewModel.completedProms}
        promTemplateKey={viewModel.promTemplateKey}
        onPromTemplateKeyChange={viewModel.setPromTemplateKey}
        promDueAt={viewModel.promDueAt}
        onPromDueAtChange={viewModel.setPromDueAt}
        onAssignProm={viewModel.handleAssignProm}
        promSaveError={viewModel.promSaveError}
        isAssigningProm={viewModel.isAssigningProm}
        pendingInsights={viewModel.pendingInsights}
        approvedInsights={viewModel.approvedInsights}
        onGenerateInsights={viewModel.handleGenerateInsights}
        onReviewInsight={viewModel.handleReviewPatientInsight}
        isGeneratingInsights={viewModel.isGeneratingInsights}
        insightReviewingId={viewModel.insightReviewingId}
        insightActionError={viewModel.insightActionError}
        insightActionNotice={viewModel.insightActionNotice}
        patientPlan={viewModel.patientPlan}
        patientRecoverySupport={viewModel.patientRecoverySupport}
        recoverySupportDraft={viewModel.recoverySupportDraft}
        onRecoverySupportCheckinModeChange={viewModel.setRecoverySupportCheckinMode}
        onRecoverySupportNudgesEnabledChange={viewModel.setRecoverySupportNudgesEnabled}
        onRecoverySupportRationaleChange={viewModel.setRecoverySupportRationale}
        onRecoverySupportTemporaryFullFlowOptionChange={viewModel.setRecoverySupportTemporaryFullFlowOption}
        onSaveRecoverySupport={viewModel.handleSaveRecoverySupport}
        recoverySupportError={viewModel.recoverySupportError}
        recoverySupportNotice={viewModel.recoverySupportNotice}
        isSavingRecoverySupport={viewModel.isSavingRecoverySupport}
        activeCaregiverAccessItems={viewModel.activeCaregiverAccessItems}
        onRetry={viewModel.refreshGuidance}
      />
    ) : viewModel.activeTab === 'history' ? (
      <PatientHistoryPane
        history={viewModel.history}
        normalizedTrends={viewModel.normalizedTrends}
        showTrendsLoading={viewModel.showTrendsLoading}
        expandedTrendMetric={viewModel.expandedTrendMetric}
        onExpandedTrendMetricChange={viewModel.setExpandedTrendMetric}
        selectedDayPoint={viewModel.selectedDayPoint}
        selectedDayAlerts={viewModel.selectedDayAlerts}
        chronologyItems={viewModel.chronologyItems}
        recentSleepRows={viewModel.recentSleepRows}
        recentBodyMapSummary={viewModel.recentBodyMapSummary}
        recentHydrationSummary={viewModel.recentHydrationSummary}
        recentNutritionSummary={viewModel.recentNutritionSummary}
        recentWearablesSummary={viewModel.recentWearablesSummary}
        recentMedicationSummary={viewModel.recentMedicationSummary}
        recentPhotos={viewModel.recentPhotos}
        onSelectDayKey={viewModel.setSelectedDayKey}
        onRetry={viewModel.refreshHistory}
      />
    ) : (
      <PatientOverviewPane
        overview={viewModel.overview}
        priorities={viewModel.patientPriorities}
        recommendedActions={viewModel.recommendedActions}
        prioritiesError={viewModel.patientPrioritiesError}
        recommendedActionsError={viewModel.recommendedActionsError}
        alerts={viewModel.alerts}
        seenAlertMap={viewModel.seenAlertMap}
        alertsFreshnessLabel={viewModel.alertsFreshnessLabel}
        alertMutationPending={viewModel.alertMutationPending}
        onAction={viewModel.onDecisionAction}
        onRetry={viewModel.refreshOverview}
        onAcknowledgeAlert={(alert) => viewModel.handleAlertStatusUpdate('acknowledged', alert)}
        onResolveAlert={(alert) => viewModel.handleAlertStatusUpdate('resolved', alert)}
        onViewAllAlerts={viewModel.onOpenAlertsWorkspace}
      />
    );

  return (
    <>
      <div className="v2-patient-route" data-testid="v2-patient-workspace-route">
        <div className="v2-patient-workspace-command">
          <PatientWorkspaceHeader
            header={viewModel.header}
            selectedDays={viewModel.selectedDays}
            onSelectDays={viewModel.setSelectedDays}
            showSupportAction={isMediumLayout}
            onOpenSupport={() => viewModel.openSupportView('coordination')}
          >
            <PatientSubrouteNav
              items={viewModel.header.navLinks}
              activeTab={viewModel.activeTab}
            />
          </PatientWorkspaceHeader>

          {viewModel.headerNotices.length > 0 ? (
            <div className="v2-patient-route__notices">
              {viewModel.headerNotices.map((notice) => (
                <DashboardV2Surface
                  key={notice.key}
                  className={`v2-patient-route__notice v2-patient-route__notice--${notice.tone}`}
                  tone={notice.tone === 'critical' ? 'critical' : 'muted'}
                >
                  <DashboardV2Text tone="strong">{notice.title}</DashboardV2Text>
                  <DashboardV2Text tone="muted">{notice.body}</DashboardV2Text>
                </DashboardV2Surface>
              ))}
            </div>
          ) : null}

          <div className="v2-patient-route__decision-strip">
            <PatientDecisionStrip
              strip={viewModel.decisionStrip}
              onAction={viewModel.onDecisionAction}
            />
          </div>
        </div>

        <DashboardV2PatientWorkspaceLayout
          main={activePane}
          rail={inlineRail}
        />
      </div>

      <PatientSupportDrawer
        open={isMediumLayout && viewModel.supportDrawerOpen}
        onOpenChange={viewModel.setSupportDrawerOpen}
        activeView={viewModel.activeSupportView}
        onViewChange={viewModel.setActiveSupportView}
        governance={viewModel.governance}
        patientId={viewModel.patientId}
        communicationItems={viewModel.communicationItems}
        taskSnapshot={viewModel.patientTasks}
        onOpenNextAction={(action) => viewModel.onDecisionAction(action)}
        onOpenExplanation={() => setExplanationOpen(true)}
        placement={isNarrowLayout ? 'bottom' : 'right'}
      />

      <DashboardV2ExplanationDrawer
        open={explanationOpen}
        onOpenChange={setExplanationOpen}
        title="Patient workspace explanation"
      >
        <DashboardV2Text tone="muted">
          Shared coordination, workflow context, review provenance, and patient communication remain separate here. Unsupported ownership, patient-facing send state, and AI-authorship claims are intentionally omitted.
        </DashboardV2Text>
      </DashboardV2ExplanationDrawer>
    </>
  );
}
