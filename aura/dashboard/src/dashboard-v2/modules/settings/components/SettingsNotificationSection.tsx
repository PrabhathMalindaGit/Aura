import { BellRing } from "lucide-react";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";
import type { SettingsNotificationSectionVm } from "../useSettingsViewModel";

interface SettingsNotificationSectionProps {
  notificationSection: SettingsNotificationSectionVm;
}

export function SettingsNotificationSection({
  notificationSection,
}: SettingsNotificationSectionProps): JSX.Element {
  const quietHoursValidationId = "v2-settings-quiet-hours-error";

  return (
    <DashboardV2Surface
      className="v2-settings-section v2-settings-section--notifications"
      tone="elevated"
      data-testid="v2-settings-notification-section"
    >
      <div className="v2-settings-section__header">
        <div className="v2-settings-section__title-copy">
          <DashboardV2Text tone="label">Primary settings</DashboardV2Text>
          <DashboardV2Heading as="h2">Notification preferences</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            Tune local in-app attention cues without changing alert safety.
          </DashboardV2Text>
        </div>
      </div>

      <div className="v2-settings-chip-row" aria-live="polite">
        {notificationSection.summaryFacts.map((fact) => (
          <span key={fact} className="v2-settings-chip">
            {fact}
          </span>
        ))}
      </div>

      <div className="v2-settings-list v2-settings-list--split">
        <label className="v2-settings-row" htmlFor="v2-notification-communication-cue">
          <span className="v2-settings-row__copy">
            <span className="v2-settings-row__label">
              Communication attention cues
            </span>
            <span className="v2-settings-row__helper">
              Reduce extra page emphasis only.
            </span>
          </span>
          <select
            id="v2-notification-communication-cue"
            aria-label="Communication attention cues"
            value={notificationSection.draft.communication.cueMode}
            onChange={(event) =>
              notificationSection.onCueModeChange(
                "communication",
                event.target.value as "default" | "reduced",
              )
            }
          >
            <option value="default">Default</option>
            <option value="reduced">Reduced</option>
          </select>
        </label>

        <label className="v2-settings-row" htmlFor="v2-notification-safety-cue">
          <span className="v2-settings-row__copy">
            <span className="v2-settings-row__label">
              Safety alert arrival cues
            </span>
            <span className="v2-settings-row__helper">
              Reduce transient arrival emphasis only.
            </span>
          </span>
          <select
            id="v2-notification-safety-cue"
            aria-label="Safety alert arrival cues"
            value={notificationSection.draft.safety.cueMode}
            onChange={(event) =>
              notificationSection.onCueModeChange(
                "safety",
                event.target.value as "default" | "reduced",
              )
            }
          >
            <option value="default">Default</option>
            <option value="reduced">Reduced</option>
          </select>
        </label>

        <label className="v2-settings-row v2-settings-row--toggle" htmlFor="v2-quiet-hours">
          <span className="v2-settings-row__copy">
            <span className="v2-settings-row__label">Quiet hours</span>
            <span className="v2-settings-row__helper">
              Reduce secondary in-app emphasis on this device.
            </span>
          </span>
          <input
            id="v2-quiet-hours"
            type="checkbox"
            checked={notificationSection.draft.quietHours.enabled}
            onChange={(event) =>
              notificationSection.onQuietHoursChange(
                "enabled",
                event.target.checked,
              )
            }
          />
        </label>

        {notificationSection.draft.quietHours.enabled ? (
          <div className="v2-settings-row v2-settings-row--stacked">
            <div className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Quiet-hours window</span>
              <span className="v2-settings-row__helper">
                Local browser time only.
              </span>
            </div>
            <div className="v2-settings-time-grid">
              <label htmlFor="v2-quiet-hours-start">
                <span>Start</span>
                <input
                  id="v2-quiet-hours-start"
                  type="time"
                  aria-label="Quiet hours start time"
                  aria-invalid={
                    notificationSection.quietHoursError ? "true" : undefined
                  }
                  aria-describedby={
                    notificationSection.quietHoursError
                      ? quietHoursValidationId
                      : undefined
                  }
                  value={notificationSection.draft.quietHours.startTime}
                  onChange={(event) =>
                    notificationSection.onQuietHoursChange(
                      "startTime",
                      event.target.value,
                    )
                  }
                />
              </label>
              <label htmlFor="v2-quiet-hours-end">
                <span>End</span>
                <input
                  id="v2-quiet-hours-end"
                  type="time"
                  aria-label="Quiet hours end time"
                  aria-invalid={
                    notificationSection.quietHoursError ? "true" : undefined
                  }
                  aria-describedby={
                    notificationSection.quietHoursError
                      ? quietHoursValidationId
                      : undefined
                  }
                  value={notificationSection.draft.quietHours.endTime}
                  onChange={(event) =>
                    notificationSection.onQuietHoursChange(
                      "endTime",
                      event.target.value,
                    )
                  }
                />
              </label>
            </div>
            {notificationSection.quietHoursError ? (
              <DashboardV2Text
                id={quietHoursValidationId}
                className="v2-settings-notice v2-settings-notice--error v2-settings-notice--inline"
                role="alert"
              >
                {notificationSection.quietHoursError}
              </DashboardV2Text>
            ) : null}
          </div>
        ) : (
          <div className="v2-settings-row v2-settings-row--stacked">
            <DashboardV2Text tone="muted">
              Quiet hours are currently off. Turn them on here
              to set a local window.
            </DashboardV2Text>
          </div>
        )}
      </div>

      <div className="v2-settings-section__footer">
        <DashboardV2Text tone="muted">
          These settings do not affect core alert visibility or unread state.
        </DashboardV2Text>
        <DashboardV2Button
          onPress={notificationSection.onSave}
          isDisabled={!notificationSection.dirty}
          leadingIcon={<BellRing size={16} />}
        >
          Save notification settings
        </DashboardV2Button>
      </div>

      {notificationSection.error ? (
        <DashboardV2Text
          className="v2-settings-notice v2-settings-notice--error"
          role="alert"
        >
          {notificationSection.error}
        </DashboardV2Text>
      ) : null}

      {notificationSection.notice ? (
        <DashboardV2Text className="v2-settings-notice" role="status">
          {notificationSection.notice}
        </DashboardV2Text>
      ) : null}
    </DashboardV2Surface>
  );
}
