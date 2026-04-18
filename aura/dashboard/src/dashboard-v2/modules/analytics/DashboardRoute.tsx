import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { DashboardAttentionPanel } from "./components/DashboardAttentionPanel";
import { DashboardDataContextPanel } from "./components/DashboardDataContextPanel";
import { DashboardOperationalLoadSection } from "./components/DashboardOperationalLoadSection";
import { DashboardScheduleSection } from "./components/DashboardScheduleSection";
import { DashboardSignalsSection } from "./components/DashboardSignalsSection";
import { DashboardStatusBar } from "./components/DashboardStatusBar";
import { DashboardSummaryStrip } from "./components/DashboardSummaryStrip";
import { useDashboardViewModel } from "./useDashboardViewModel";
import "./analytics.css";

const VERY_NARROW_LAYOUT_QUERY = "(max-width: 599px)";

export function DashboardRoute(): JSX.Element {
  const isVeryNarrow = useMediaQuery(VERY_NARROW_LAYOUT_QUERY);
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
        <div className="v2-dashboard-route__main-column">
          <DashboardOperationalLoadSection
            rows={viewModel.operationalLoadRows}
            note={viewModel.priorityQueuePressureNote}
            loading={viewModel.operationalLoading}
            error={viewModel.operationalError}
            isRefreshing={viewModel.isRefreshing}
            onRefresh={viewModel.onRefresh}
            onOpenRoute={viewModel.navigateTo}
          />

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

        <div className="v2-dashboard-route__secondary-column">
          <DashboardScheduleSection
            timeline={viewModel.scheduleTimeline}
            items={viewModel.scheduleItems}
            nextOpenSlotValue={viewModel.nextOpenSlotValue}
            schedulingFootnote={viewModel.schedulingFootnote}
            loading={viewModel.scheduleLoading}
            error={viewModel.scheduleError}
            isRefreshing={viewModel.isRefreshing}
            isVeryNarrow={isVeryNarrow}
            onRefresh={viewModel.onRefresh}
            onOpenSchedule={() => viewModel.navigateTo("/appointments")}
            onOpenPatient={viewModel.openPatient}
          />

          <DashboardDataContextPanel
            dataContext={viewModel.dataContext}
            priorityQueuePressureNote={viewModel.priorityQueuePressureNote}
            isVeryNarrow={isVeryNarrow}
          />
        </div>
      </div>
    </div>
  );
}
