import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { SettingsAppearancePanel } from "./components/SettingsAppearancePanel";
import { SettingsCommunicationSection } from "./components/SettingsCommunicationSection";
import { SettingsMaintenancePanel } from "./components/SettingsMaintenancePanel";
import { SettingsNotificationSection } from "./components/SettingsNotificationSection";
import { SettingsProfileSection } from "./components/SettingsProfileSection";
import { SettingsReferencePanel } from "./components/SettingsReferencePanel";
import { SettingsSessionPanel } from "./components/SettingsSessionPanel";
import { SettingsStatusBar } from "./components/SettingsStatusBar";
import { useSettingsViewModel } from "./useSettingsViewModel";
import "./settings.css";

const VERY_NARROW_QUERY = "(max-width: 599px)";

export function SettingsRoute(): JSX.Element {
  const isVeryNarrow = useMediaQuery(VERY_NARROW_QUERY);
  const viewModel = useSettingsViewModel();

  return (
    <div className="v2-settings-route" data-testid="v2-settings-route">
      <SettingsStatusBar statusBar={viewModel.statusBar} />

      <div className="v2-settings-route__layout">
        <div className="v2-settings-route__main">
          <SettingsProfileSection profileSection={viewModel.profileSection} />
          <SettingsCommunicationSection
            communicationSection={viewModel.communicationSection}
            isVeryNarrow={isVeryNarrow}
          />
          <SettingsNotificationSection
            notificationSection={viewModel.notificationSection}
          />
        </div>

        <div className="v2-settings-route__secondary">
          <SettingsAppearancePanel appearancePanel={viewModel.appearancePanel} />
          <SettingsSessionPanel sessionPanel={viewModel.sessionPanel} />
          <SettingsReferencePanel
            referencePanel={viewModel.referencePanel}
            isVeryNarrow={isVeryNarrow}
          />
          <SettingsMaintenancePanel
            maintenancePanel={viewModel.maintenancePanel}
          />
        </div>
      </div>
    </div>
  );
}
