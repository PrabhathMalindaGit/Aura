import { Activity } from "lucide-react";
import type { DashboardStatusBarVm } from "../../../adapters/dashboard";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";

interface DashboardStatusBarProps {
  statusBar: DashboardStatusBarVm;
}

export function DashboardStatusBar({
  statusBar,
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
          <DashboardV2Heading as="h1">{statusBar.title}</DashboardV2Heading>
          <DashboardV2Text
            tone="caption"
            className="v2-dashboard-status-bar__subtitle"
          >
            {statusBar.guidanceLine}
          </DashboardV2Text>
        </div>

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
      </div>
    </DashboardV2Surface>
  );
}
