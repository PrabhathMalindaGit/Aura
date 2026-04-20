import type { DashboardStatusBarVm } from "../../../adapters/dashboard";
import { DashboardV2Text } from "../../../primitives/Text";

interface DashboardStatusBarProps {
  statusBar: DashboardStatusBarVm;
}

export function DashboardStatusBar({
  statusBar,
}: DashboardStatusBarProps): JSX.Element {
  return (
    <div
      className="v2-dashboard-status-bar"
      data-testid="v2-dashboard-status-bar"
    >
      <div className="v2-dashboard-status-bar__meta">
        <DashboardV2Text tone="caption" className="v2-dashboard-status-bar__window">
          Review window {statusBar.windowLabel}
        </DashboardV2Text>
        {statusBar.modeIndicator ? (
          <div
            className="v2-dashboard-status-bar__mode-indicator"
            data-testid="v2-dashboard-demo-indicator"
          >
            <span className="v2-dashboard-status-bar__mode-label">
              {statusBar.modeIndicator.label}
            </span>
            <span className="v2-dashboard-status-bar__mode-detail">
              {statusBar.modeIndicator.detail}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
