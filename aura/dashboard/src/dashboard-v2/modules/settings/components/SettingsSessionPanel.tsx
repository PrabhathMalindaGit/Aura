import { TimerReset } from "lucide-react";
import { DashboardV2Badge } from "../../../primitives/Badge";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";
import type { SettingsSessionPanelVm } from "../useSettingsViewModel";

interface SettingsSessionPanelProps {
  sessionPanel: SettingsSessionPanelVm;
}

export function SettingsSessionPanel({
  sessionPanel,
}: SettingsSessionPanelProps): JSX.Element {
  return (
    <DashboardV2Surface
      className="v2-settings-panel v2-settings-panel--session"
      tone="base"
      data-testid="v2-settings-session-panel"
    >
      <div className="v2-settings-panel__header">
        <DashboardV2Text tone="label">Secondary settings</DashboardV2Text>
        <DashboardV2Heading as="h3">Session protection</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Auto-logout timing applies right away on this device.
        </DashboardV2Text>
      </div>

      <div className="v2-settings-session-summary" aria-label="Current session protection">
        <DashboardV2Badge tone="info">{sessionPanel.badgeLabel}</DashboardV2Badge>
        <div>
          <DashboardV2Text as="strong" tone="strong">
            {sessionPanel.summaryLabel}
          </DashboardV2Text>
          <DashboardV2Text tone="muted">{sessionPanel.warningLabel}</DashboardV2Text>
        </div>
      </div>

      <div className="v2-settings-session-controls">
        <label className="v2-settings-session-toggle" htmlFor="v2-session-enabled">
          <span>
            <strong>Enable idle auto-logout</strong>
            <small>Lock unattended sessions for patient safety.</small>
          </span>
          <input
            id="v2-session-enabled"
            type="checkbox"
            checked={sessionPanel.settings.enabled}
            onChange={(event) =>
              sessionPanel.onUpdate({ enabled: event.target.checked })
            }
          />
        </label>

        <div className="v2-settings-session-selects">
          <label htmlFor="v2-idle-timeout">
            <span>Idle timeout</span>
            <select
              id="v2-idle-timeout"
              aria-label="Idle timeout minutes"
              value={String(sessionPanel.settings.idleMinutes)}
              onChange={(event) =>
                sessionPanel.onUpdate({ idleMinutes: Number(event.target.value) })
              }
            >
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
            </select>
          </label>

          <label htmlFor="v2-absolute-timeout">
            <span>Maximum session</span>
            <select
              id="v2-absolute-timeout"
              aria-label="Absolute timeout hours"
              value={String(sessionPanel.settings.absoluteHours)}
              onChange={(event) =>
                sessionPanel.onUpdate({
                  absoluteHours: Number(event.target.value),
                })
              }
            >
              <option value="2">2 hours</option>
              <option value="4">4 hours</option>
              <option value="8">8 hours</option>
            </select>
          </label>
        </div>
      </div>

      <div className="v2-settings-panel__footer">
        <DashboardV2Text tone="muted">
          Warnings appear before idle lock and before the maximum session limit.
        </DashboardV2Text>
        <DashboardV2Button
          tone="secondary"
          size="sm"
          leadingIcon={<TimerReset size={16} />}
          onPress={sessionPanel.onRestoreDefaults}
        >
          Restore session defaults
        </DashboardV2Button>
      </div>

      {sessionPanel.notice ? (
        <DashboardV2Text className="v2-settings-notice" role="status">
          {sessionPanel.notice}
        </DashboardV2Text>
      ) : null}
    </DashboardV2Surface>
  );
}
