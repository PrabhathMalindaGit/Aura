import { Settings, Shield } from "lucide-react";
import type { SettingsStatusBarVm } from "../../../adapters/settings";
import { DashboardV2Icon } from "../../../primitives/Icon";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";

interface SettingsStatusBarProps {
  statusBar: SettingsStatusBarVm;
}

export function SettingsStatusBar({
  statusBar,
}: SettingsStatusBarProps): JSX.Element {
  return (
    <DashboardV2Surface
      className="v2-settings-status-bar"
      tone="elevated"
      data-testid="v2-settings-status-bar"
    >
      <div className="v2-settings-status-bar__header">
        <DashboardV2Text tone="label">Workspace preferences</DashboardV2Text>
        <div className="v2-settings-status-bar__title-row">
          <DashboardV2Icon icon={Settings} size={18} />
          <DashboardV2Heading as="h2">{statusBar.title}</DashboardV2Heading>
        </div>
        <DashboardV2Text tone="muted">{statusBar.guidanceLine}</DashboardV2Text>
      </div>

      <div className="v2-settings-status-bar__facts" aria-live="polite">
        {statusBar.facts.map((fact) => (
          <span key={fact.key} className="v2-settings-status-bar__fact">
            <DashboardV2Icon icon={Shield} size={14} />
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </span>
        ))}
      </div>
    </DashboardV2Surface>
  );
}
