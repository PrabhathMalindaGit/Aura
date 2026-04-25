import { RotateCcw } from "lucide-react";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";
import type { SettingsMaintenancePanelVm } from "../useSettingsViewModel";

interface SettingsMaintenancePanelProps {
  maintenancePanel: SettingsMaintenancePanelVm;
}

export function SettingsMaintenancePanel({
  maintenancePanel,
}: SettingsMaintenancePanelProps): JSX.Element {
  return (
    <DashboardV2Surface
      className="v2-settings-panel v2-settings-panel--maintenance"
      tone="muted"
      data-testid="v2-settings-maintenance-panel"
    >
      <div className="v2-settings-panel__header">
        <DashboardV2Text tone="label">Maintenance</DashboardV2Text>
        <DashboardV2Heading as="h3">Restore workspace profile defaults</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Reset the editable profile form. Saved settings do not change until
          you save again.
        </DashboardV2Text>
      </div>

      <DashboardV2Button
        tone="secondary"
        size="sm"
        leadingIcon={<RotateCcw size={16} />}
        onPress={maintenancePanel.onRestoreDefaults}
      >
        Restore defaults
      </DashboardV2Button>

      {maintenancePanel.notice ? (
        <DashboardV2Text className="v2-settings-notice" role="status">
          {maintenancePanel.notice}
        </DashboardV2Text>
      ) : null}
    </DashboardV2Surface>
  );
}
