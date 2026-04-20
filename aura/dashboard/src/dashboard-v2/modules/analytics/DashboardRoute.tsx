import { DashboardAttentionPanel } from "./components/DashboardAttentionPanel";
import { DashboardDataContextPanel } from "./components/DashboardDataContextPanel";
import { DashboardDemoTools } from "./components/DashboardDemoTools";
import { DashboardScheduleSection } from "./components/DashboardScheduleSection";
import { DashboardSignalsSection } from "./components/DashboardSignalsSection";
import { DashboardStatusBar } from "./components/DashboardStatusBar";
import { DashboardSummaryStrip } from "./components/DashboardSummaryStrip";
import { DashboardUrgentQueueSection } from "./components/DashboardUrgentQueueSection";
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
        attention={viewModel.shiftBrief}
        loading={viewModel.overviewLoading}
        error={viewModel.overviewError}
        isRefreshing={viewModel.isRefreshing}
        onRefresh={viewModel.onRefresh}
        onOpenRoute={viewModel.navigateTo}
      />

      <div className="v2-dashboard-route__hero-grid">
        <div className="v2-dashboard-route__hero-main">
          <DashboardSummaryStrip
            metrics={viewModel.operationalSummary}
            loading={viewModel.overviewLoading}
            error={viewModel.overviewError}
            isRefreshing={viewModel.isRefreshing}
            onRefresh={viewModel.onRefresh}
            onOpenRoute={viewModel.navigateTo}
          />

          <DashboardUrgentQueueSection
            rows={viewModel.urgentQueue}
            loading={viewModel.queueLoading}
            error={viewModel.queueError}
            isRefreshing={viewModel.isRefreshing}
            onRefresh={viewModel.onRefresh}
            onOpenRoute={viewModel.navigateTo}
            onOpenPatient={viewModel.openPatient}
            onOpenThread={viewModel.openThread}
            guardPatientActions={viewModel.guardPatientActions}
            guardThreadActions={viewModel.guardThreadActions}
          />
        </div>

        <div className="v2-dashboard-route__hero-rail">
          <DashboardScheduleSection
            rail={viewModel.capacityRail}
            loading={viewModel.capacityLoading}
            error={viewModel.capacityError}
            isRefreshing={viewModel.isRefreshing}
            onRefresh={viewModel.onRefresh}
            onOpenSchedule={() => viewModel.navigateTo("/appointments")}
            onOpenPatient={viewModel.openPatient}
            guardPatientActions={viewModel.guardPatientActions}
          />
        </div>
      </div>

      <DashboardSignalsSection
        safetyItems={viewModel.safetyActivity}
        communicationItems={viewModel.communicationPressure}
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

      <DashboardDataContextPanel dataContext={viewModel.freshnessTrust} />
    </div>
  );
}
