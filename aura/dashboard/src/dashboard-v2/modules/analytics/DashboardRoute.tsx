import { DashboardAttentionPanel } from "./components/DashboardAttentionPanel";
import { DashboardDataContextPanel } from "./components/DashboardDataContextPanel";
import { DashboardDemoTools } from "./components/DashboardDemoTools";
import { DashboardOperationalLoadSection } from "./components/DashboardOperationalLoadSection";
import { DashboardScheduleSection } from "./components/DashboardScheduleSection";
import { DashboardSignalsSection } from "./components/DashboardSignalsSection";
import { DashboardStatusBar } from "./components/DashboardStatusBar";
import { DashboardSummaryStrip } from "./components/DashboardSummaryStrip";
import { useDashboardViewModel } from "./useDashboardViewModel";
import "./analytics.css";

export function DashboardRoute(): JSX.Element {
  const viewModel = useDashboardViewModel();

  return (
    <div className="v2-dashboard-route" data-testid="v2-dashboard-route">
      <DashboardStatusBar
        statusBar={viewModel.statusBar}
      />

      {viewModel.demoTools.visible ? (
        <DashboardDemoTools
          selectedScenarioId={viewModel.demoTools.selectedScenarioId}
          scenarios={viewModel.demoTools.scenarios}
          onSelectScenario={viewModel.demoTools.selectScenario}
          onSelectRealMode={viewModel.demoTools.selectRealMode}
        />
      ) : null}

      <DashboardAttentionPanel
        attention={viewModel.attention}
        onOpenRoute={viewModel.navigateTo}
      />

      <DashboardSummaryStrip
        metrics={viewModel.summaryMetrics}
        loading={viewModel.summaryLoading}
        error={viewModel.summaryError}
        isRefreshing={viewModel.isRefreshing}
        onRefresh={viewModel.onRefresh}
        onOpenRoute={viewModel.navigateTo}
      />

      <div className="v2-dashboard-route__overview-grid">
        <div className="v2-dashboard-route__overview-area v2-dashboard-route__overview-area--operational">
          <DashboardOperationalLoadSection
            rows={viewModel.operationalLoadRows}
            loading={viewModel.operationalLoading}
            error={viewModel.operationalError}
            isRefreshing={viewModel.isRefreshing}
            onRefresh={viewModel.onRefresh}
            onOpenRoute={viewModel.navigateTo}
          />
        </div>

        <div className="v2-dashboard-route__overview-area v2-dashboard-route__overview-area--schedule">
          <DashboardScheduleSection
            timeline={viewModel.scheduleTimeline}
            items={viewModel.scheduleItems}
            nextOpenSlotValue={viewModel.nextOpenSlotValue}
            schedulingFootnote={viewModel.schedulingFootnote}
            pendingRequestCount={viewModel.schedulePendingRequestCount}
            availableSlotsCount={viewModel.scheduleAvailableSlotsCount}
            loading={viewModel.scheduleLoading}
            error={viewModel.scheduleError}
            isRefreshing={viewModel.isRefreshing}
            onRefresh={viewModel.onRefresh}
            onOpenSchedule={() => viewModel.navigateTo("/appointments")}
            onOpenPatient={viewModel.openPatient}
            guardPatientActions={viewModel.guardPatientActions}
          />
        </div>

        <div className="v2-dashboard-route__overview-area v2-dashboard-route__overview-area--signals">
          <DashboardSignalsSection
            safetyItems={viewModel.safetySignals}
            communicationItems={viewModel.communicationSignals}
            loading={viewModel.signalsLoading}
            error={viewModel.signalsError}
            isRefreshing={viewModel.isRefreshing}
            onRefresh={viewModel.onRefresh}
            onOpenAlerts={() => viewModel.navigateTo("/alerts")}
            onOpenInbox={() => viewModel.navigateTo("/communication")}
            onOpenPatient={viewModel.openPatient}
            onOpenThread={viewModel.openThread}
            guardPatientActions={viewModel.guardPatientActions}
            guardThreadActions={viewModel.guardThreadActions}
          />
        </div>

        <div className="v2-dashboard-route__overview-area v2-dashboard-route__overview-area--context">
          <DashboardDataContextPanel
            dataContext={viewModel.dataContext}
          />
        </div>
      </div>
    </div>
  );
}
