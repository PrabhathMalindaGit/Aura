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
      className="v2-settings-panel"
      tone="base"
      data-testid="v2-settings-session-panel"
    >
      <div className="v2-settings-panel__header">
        <DashboardV2Text tone="label">Secondary settings</DashboardV2Text>
        <DashboardV2Heading as="h3">Session protection</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Session protection changes apply to this browser right away.
        </DashboardV2Text>
      </div>

      <DashboardV2Badge tone="info">{sessionPanel.badgeLabel}</DashboardV2Badge>

      <div className="v2-settings-list">
        <label className="v2-settings-row v2-settings-row--toggle" htmlFor="v2-session-enabled">
          <span className="v2-settings-row__copy">
            <span className="v2-settings-row__label">Enable idle auto-logout</span>
            <span className="v2-settings-row__helper">
              Lock unattended sessions for patient safety.
            </span>
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

        <label className="v2-settings-row" htmlFor="v2-idle-timeout">
          <span className="v2-settings-row__copy">
            <span className="v2-settings-row__label">Idle timeout</span>
            <span className="v2-settings-row__helper">
              Show warning 60 seconds before lock.
            </span>
          </span>
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

        <label className="v2-settings-row" htmlFor="v2-absolute-timeout">
          <span className="v2-settings-row__copy">
            <span className="v2-settings-row__label">
              Absolute session timeout
            </span>
            <span className="v2-settings-row__helper">
              Show warning 5 minutes before maximum session duration.
            </span>
          </span>
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

      <div className="v2-settings-note-grid" aria-label="Local protection notes">
        <article className="v2-settings-note-card">
          <DashboardV2Text tone="label">Current session timing</DashboardV2Text>
          <DashboardV2Text as="strong" tone="strong">
            {sessionPanel.summaryLabel}
          </DashboardV2Text>
          <DashboardV2Text tone="muted">
            Auto-logout timing updates the current browser session manager right
            away.
          </DashboardV2Text>
        </article>
        <article className="v2-settings-note-card">
          <DashboardV2Text tone="label">Warning ladder</DashboardV2Text>
          <DashboardV2Text as="strong" tone="strong">
            {sessionPanel.warningLabel}
          </DashboardV2Text>
          <DashboardV2Text tone="muted">
            Quiet hours reduce secondary emphasis only and never remove core
            alert visibility.
          </DashboardV2Text>
        </article>
      </div>

      <DashboardV2Button
        tone="secondary"
        size="sm"
        leadingIcon={<TimerReset size={16} />}
        onPress={sessionPanel.onRestoreDefaults}
      >
        Restore session defaults
      </DashboardV2Button>

      {sessionPanel.notice ? (
        <DashboardV2Text className="v2-settings-notice" role="status">
          {sessionPanel.notice}
        </DashboardV2Text>
      ) : null}
    </DashboardV2Surface>
  );
}
