import { DashboardAttentionPanel } from "./components/DashboardAttentionPanel";
import { DashboardDemoTools } from "./components/DashboardDemoTools";
import { DashboardSignalsSection } from "./components/DashboardSignalsSection";
import { DashboardSummaryStrip } from "./components/DashboardSummaryStrip";
import { DashboardUrgentQueueSection } from "./components/DashboardUrgentQueueSection";
import { useDashboardViewModel } from "./useDashboardViewModel";
import "./analytics.css";

export function DashboardRoute(): JSX.Element {
  const viewModel = useDashboardViewModel();

  return (
    <div className="v2-dashboard-route" data-testid="v2-dashboard-route">
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
    </div>
  );
}
