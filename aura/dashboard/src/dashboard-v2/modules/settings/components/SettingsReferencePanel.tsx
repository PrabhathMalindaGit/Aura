import { DashboardV2Disclosure } from "../../../primitives/Disclosure";
import { DashboardV2MetadataList } from "../../../patterns/MetadataList";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";
import type { SettingsReferencePanelVm } from "../useSettingsViewModel";

interface SettingsReferencePanelProps {
  referencePanel: SettingsReferencePanelVm;
  isVeryNarrow: boolean;
}

export function SettingsReferencePanel({
  referencePanel,
  isVeryNarrow,
}: SettingsReferencePanelProps): JSX.Element {
  return (
    <DashboardV2Surface
      className="v2-settings-panel v2-settings-panel--quiet"
      tone="muted"
      data-testid="v2-settings-reference-panel"
    >
      <div className="v2-settings-panel__header">
        <DashboardV2Text tone="label">Reference</DashboardV2Text>
        <DashboardV2Heading as="h3">Workspace scope and reference</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Keep shared-shell defaults and immediate browser protection scope
          visible without interrupting configuration work.
        </DashboardV2Text>
      </div>

      <DashboardV2MetadataList items={referencePanel.metadata} />

      <div className="v2-settings-reference-stack">
        <DashboardV2Disclosure
          title="Shared shell state"
          summary="Offline warning banner"
          defaultExpanded={!isVeryNarrow}
        >
          <div className="v2-settings-reference-item">
            <DashboardV2Text as="strong" tone="strong">
              Offline warning banner
            </DashboardV2Text>
            <DashboardV2Text tone="muted">
              Warning display follows the live connection state in Aura&apos;s
              shared shell for this browser.
            </DashboardV2Text>
            <span className="v2-settings-reference-item__status">
              Shared shell default
            </span>
          </div>
        </DashboardV2Disclosure>

        <DashboardV2Disclosure
          title="Workspace density"
          summary="Compact table mode"
          defaultExpanded={!isVeryNarrow}
        >
          <div className="v2-settings-reference-item">
            <DashboardV2Text as="strong" tone="strong">
              Compact table mode
            </DashboardV2Text>
            <DashboardV2Text tone="muted">
              Table density currently follows Aura Clinician&apos;s shared
              workspace default in this browser.
            </DashboardV2Text>
            <span className="v2-settings-reference-item__status">
              Shared workspace default
            </span>
          </div>
        </DashboardV2Disclosure>
      </div>
    </DashboardV2Surface>
  );
}
