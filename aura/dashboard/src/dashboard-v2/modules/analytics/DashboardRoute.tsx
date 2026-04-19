import { DashboardAttentionPanel } from "./components/DashboardAttentionPanel";
import { DashboardDataContextPanel } from "./components/DashboardDataContextPanel";
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
        isRefreshing={viewModel.isRefreshing}
        onRefresh={viewModel.onRefresh}
      />

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
            note={viewModel.priorityQueuePressureNote}
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
            loading={viewModel.scheduleLoading}
            error={viewModel.scheduleError}
            isRefreshing={viewModel.isRefreshing}
            onRefresh={viewModel.onRefresh}
            onOpenSchedule={() => viewModel.navigateTo("/appointments")}
            onOpenPatient={viewModel.openPatient}
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
          />
        </div>

        <div className="v2-dashboard-route__overview-area v2-dashboard-route__overview-area--context">
          <DashboardDataContextPanel
            dataContext={viewModel.dataContext}
            priorityQueuePressureNote={viewModel.priorityQueuePressureNote}
          />
        </div>
      </div>
    </div>
  );
}
