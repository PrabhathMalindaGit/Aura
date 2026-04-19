import { Activity, RefreshCcw } from "lucide-react";
import type { DashboardStatusBarVm } from "../../../adapters/dashboard";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";

interface DashboardStatusBarProps {
  statusBar: DashboardStatusBarVm;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function DashboardStatusBar({
  statusBar,
  isRefreshing,
  onRefresh,
}: DashboardStatusBarProps): JSX.Element {
  return (
    <DashboardV2Surface
      className="v2-dashboard-status-bar"
      tone="elevated"
      data-testid="v2-dashboard-status-bar"
    >
      <div className="v2-dashboard-status-bar__title-row">
        <div className="v2-dashboard-status-bar__copy">
          <DashboardV2Text tone="label">Operations overview</DashboardV2Text>
          <DashboardV2Heading as="h1">{statusBar.title}</DashboardV2Heading>
          <DashboardV2Text
            tone="muted"
            className="v2-dashboard-status-bar__guidance"
          >
            {statusBar.guidanceLine}
          </DashboardV2Text>
        </div>

        <div className="v2-dashboard-status-bar__fact-strip">
          <div className="v2-dashboard-status-bar__facts" aria-live="polite">
            {statusBar.facts.map((fact) => (
              <span key={fact.key} className="v2-dashboard-status-bar__fact">
                <span className="v2-dashboard-status-bar__fact-label">
                  <Activity size={12} />
                  <span>{fact.label}</span>
                </span>
                <strong>{fact.value}</strong>
              </span>
            ))}
          </div>
          <DashboardV2Button
            tone="ghost"
            size="sm"
            onPress={onRefresh}
            leadingIcon={<RefreshCcw size={16} />}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </DashboardV2Button>
        </div>
      </div>
    </DashboardV2Surface>
  );
}
