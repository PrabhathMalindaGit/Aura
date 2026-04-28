import { Database, RefreshCcw, RotateCcw } from "lucide-react";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Icon } from "../../../primitives/Icon";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";
import type { SettingsPresentationToolsPanelVm } from "../useSettingsViewModel";

interface SettingsPresentationToolsPanelProps {
  presentationToolsPanel: SettingsPresentationToolsPanelVm;
}

export function SettingsPresentationToolsPanel({
  presentationToolsPanel,
}: SettingsPresentationToolsPanelProps): JSX.Element {
  const statusLabel = presentationToolsPanel.loading
    ? "Checking presentation status"
    : presentationToolsPanel.error && !presentationToolsPanel.status
      ? "Status unavailable"
    : presentationToolsPanel.disabled
      ? "Backend disabled"
      : presentationToolsPanel.loaded
        ? "Presentation data loaded"
        : "Presentation data not loaded";

  return (
    <DashboardV2Surface
      className="v2-settings-panel v2-settings-panel--presentation"
      tone="muted"
      data-testid="v2-settings-presentation-tools-panel"
    >
      <div className="v2-settings-panel__header">
        <DashboardV2Text tone="label">Presentation</DashboardV2Text>
        <DashboardV2Heading as="h3">Presentation tools</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Load or reset safe presentation records for local demo walkthroughs.
          These tools are hidden unless presentation tooling is enabled.
        </DashboardV2Text>
      </div>

      <div className="v2-settings-presentation-status" aria-live="polite">
        <span className="v2-settings-presentation-status__chip">
          <DashboardV2Icon icon={Database} size={14} />
          {statusLabel}
        </span>
        {presentationToolsPanel.disabled ? (
          <>
            <DashboardV2Text tone="strong">
              Presentation seed is not enabled on the backend.
            </DashboardV2Text>
            <DashboardV2Text tone="muted">
              Set AURA_PRESENTATION_SEED_ENABLED=true on the server to use these
              tools.
            </DashboardV2Text>
          </>
        ) : null}
        {presentationToolsPanel.error ? (
          <DashboardV2Text className="v2-settings-notice v2-settings-notice--error" role="alert">
            {presentationToolsPanel.error}
          </DashboardV2Text>
        ) : null}
      </div>

      {presentationToolsPanel.seedId || presentationToolsPanel.lastLoadedAtLabel ? (
        <div className="v2-settings-presentation-facts">
          {presentationToolsPanel.seedId ? (
            <span className="v2-settings-chip">
              Seed ID <strong>{presentationToolsPanel.seedId}</strong>
            </span>
          ) : null}
          {presentationToolsPanel.lastLoadedAtLabel ? (
            <span className="v2-settings-chip">
              Last loaded <strong>{presentationToolsPanel.lastLoadedAtLabel}</strong>
            </span>
          ) : null}
        </div>
      ) : null}

      {presentationToolsPanel.countsSummary.length > 0 ? (
        <div className="v2-settings-presentation-counts" aria-label="Presentation seed counts">
          {presentationToolsPanel.countsSummary.map((item) => (
            <span key={item} className="v2-settings-reference-item__status">
              {item}
            </span>
          ))}
        </div>
      ) : null}

      <DashboardV2Text tone="muted">
        Presentation data is for local demo walkthroughs only. Seeded records
        are marked by the backend and reset removes only presentation-seed
        records.
      </DashboardV2Text>

      <div className="v2-settings-inline-actions">
        <DashboardV2Button
          tone="secondary"
          size="sm"
          leadingIcon={<RefreshCcw size={16} />}
          isDisabled={presentationToolsPanel.loadDisabled}
          onPress={presentationToolsPanel.onLoad}
        >
          {presentationToolsPanel.loadLabel}
        </DashboardV2Button>
        <DashboardV2Button
          tone="caution"
          size="sm"
          leadingIcon={<RotateCcw size={16} />}
          isDisabled={presentationToolsPanel.resetDisabled}
          onPress={presentationToolsPanel.onReset}
        >
          {presentationToolsPanel.resetLabel}
        </DashboardV2Button>
      </div>

      {presentationToolsPanel.notice ? (
        <DashboardV2Text className="v2-settings-notice" role="status">
          {presentationToolsPanel.notice}
        </DashboardV2Text>
      ) : null}
    </DashboardV2Surface>
  );
}
