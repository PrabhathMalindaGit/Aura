import { MonitorSmartphone, MoonStar, Sun } from "lucide-react";
import { DashboardV2Icon } from "../../../primitives/Icon";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";
import type { SettingsAppearancePanelVm } from "../useSettingsViewModel";

interface SettingsAppearancePanelProps {
  appearancePanel: SettingsAppearancePanelVm;
}

export function SettingsAppearancePanel({
  appearancePanel,
}: SettingsAppearancePanelProps): JSX.Element {
  return (
    <DashboardV2Surface
      className="v2-settings-panel"
      tone="base"
      data-testid="v2-settings-appearance-panel"
    >
      <div className="v2-settings-panel__header">
        <DashboardV2Text tone="label">Secondary settings</DashboardV2Text>
        <DashboardV2Heading as="h3">Appearance</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          System follows your OS preference by default.
        </DashboardV2Text>
      </div>

      <div className="v2-settings-segmented" role="radiogroup" aria-label="Theme mode">
        <label className="v2-settings-segmented__option" htmlFor="v2-theme-system">
          <input
            id="v2-theme-system"
            type="radio"
            name="v2-theme-mode"
            value="system"
            checked={appearancePanel.themeMode === "system"}
            onChange={(event) => {
              if (event.target.checked) {
                appearancePanel.onThemeModeChange("system");
              }
            }}
          />
          <span>
            <DashboardV2Icon icon={MonitorSmartphone} size={14} />
            <span>System</span>
          </span>
        </label>

        <label className="v2-settings-segmented__option" htmlFor="v2-theme-light">
          <input
            id="v2-theme-light"
            type="radio"
            name="v2-theme-mode"
            value="light"
            checked={appearancePanel.themeMode === "light"}
            onChange={(event) => {
              if (event.target.checked) {
                appearancePanel.onThemeModeChange("light");
              }
            }}
          />
          <span>
            <DashboardV2Icon icon={Sun} size={14} />
            <span>Light</span>
          </span>
        </label>

        <label className="v2-settings-segmented__option" htmlFor="v2-theme-dark">
          <input
            id="v2-theme-dark"
            type="radio"
            name="v2-theme-mode"
            value="dark"
            checked={appearancePanel.themeMode === "dark"}
            onChange={(event) => {
              if (event.target.checked) {
                appearancePanel.onThemeModeChange("dark");
              }
            }}
          />
          <span>
            <DashboardV2Icon icon={MoonStar} size={14} />
            <span>Dark</span>
          </span>
        </label>
      </div>

      <DashboardV2Text tone="muted">
        Active mode: {appearancePanel.themeSummaryLabel}.
      </DashboardV2Text>

      {appearancePanel.notice ? (
        <DashboardV2Text className="v2-settings-notice" role="status">
          {appearancePanel.notice}
        </DashboardV2Text>
      ) : null}
    </DashboardV2Surface>
  );
}
