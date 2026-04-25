import { Camera, LayoutGrid, UserRound } from "lucide-react";
import { useRef } from "react";
import { ClinicianAvatar } from "../../../../components/ui/ClinicianAvatar";
import { DashboardV2Badge } from "../../../primitives/Badge";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Icon } from "../../../primitives/Icon";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";
import {
  AVAILABILITY_STATUS_OPTIONS,
  CLINICIAN_PROFILE_LIMITS,
  COMMUNICATION_THREAD_VIEW_OPTIONS,
  LANDING_ROUTE_OPTIONS,
  PATIENT_TRIAGE_PRESETS,
  WORKING_DAY_OPTIONS,
  type SettingsProfileSectionVm,
} from "../useSettingsViewModel";

interface SettingsProfileSectionProps {
  profileSection: SettingsProfileSectionVm;
}

function renderAvailabilityTone(
  tone: "positive" | "attention" | "muted",
): "success" | "warning" | "neutral" {
  if (tone === "positive") {
    return "success";
  }
  if (tone === "attention") {
    return "warning";
  }
  return "neutral";
}

export function SettingsProfileSection({
  profileSection,
}: SettingsProfileSectionProps): JSX.Element {
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const { draftProfile, draftIdentityPreview, summary, validation } =
    profileSection;

  return (
    <DashboardV2Surface
      className="v2-settings-section v2-settings-section--profile"
      tone="elevated"
      data-testid="v2-settings-profile-section"
    >
      <div className="v2-settings-section__header">
        <div className="v2-settings-section__title-copy">
          <DashboardV2Text tone="label">Primary settings</DashboardV2Text>
          <DashboardV2Heading as="h2">Workspace profile</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            Saved clinician identity, local handoff context, and opening
            defaults live together here.
          </DashboardV2Text>
        </div>
        <DashboardV2Badge tone={renderAvailabilityTone(summary.availabilityTone)}>
          {summary.availabilityLabel}
        </DashboardV2Badge>
      </div>

      <div className="v2-settings-profile__lead">
        <section
          className="v2-settings-profile__summary"
          aria-label="Saved clinician profile summary"
        >
          <ClinicianAvatar
            identity={{
              displayName: summary.displayName,
              initials: summary.initials,
              photo: summary.photo,
            }}
            className="v2-settings-profile__avatar"
            decorative
            size="lg"
          />
          <div className="v2-settings-profile__summary-copy">
            <DashboardV2Text as="strong" tone="strong">
              {summary.displayName}
            </DashboardV2Text>
            <DashboardV2Text tone="muted">{summary.secondaryLine}</DashboardV2Text>

            <div className="v2-settings-chip-row">
              {summary.identityFacts.map((fact) => (
                <span key={fact} className="v2-settings-chip">
                  {fact}
                </span>
              ))}
            </div>
            <div className="v2-settings-chip-row">
              {summary.workspaceFacts.map((fact) => (
                <span key={fact} className="v2-settings-chip">
                  {fact}
                </span>
              ))}
            </div>

            {summary.workspaceDefaults.length ? (
              <DashboardV2Text tone="muted">
                {summary.workspaceDefaults.join(" · ")}
              </DashboardV2Text>
            ) : null}
            {summary.bio ? (
              <DashboardV2Text>{summary.bio}</DashboardV2Text>
            ) : null}
            {summary.contactNote ? (
              <DashboardV2Text tone="muted">{summary.contactNote}</DashboardV2Text>
            ) : null}
            <DashboardV2Text tone="muted">
              Saved locally for this clinician in this browser. Changes do not
              sync across devices.
            </DashboardV2Text>
          </div>
        </section>

        <aside className="v2-settings-profile__photo" aria-label="Profile photo">
          <div className="v2-settings-profile__photo-preview">
            <ClinicianAvatar
              identity={draftIdentityPreview}
              className="v2-settings-profile__photo-avatar"
              decorative
              size="lg"
            />
            <div className="v2-settings-profile__photo-copy">
              <DashboardV2Text as="strong" tone="strong">
                Profile photo
              </DashboardV2Text>
              <DashboardV2Text tone="muted">
                Profile photo stays in this browser after you save it. Use JPG,
                PNG, or WebP up to 500 KB.
              </DashboardV2Text>
            </div>
          </div>
          <div className="v2-settings-inline-actions">
            <DashboardV2Button
              tone="secondary"
              size="sm"
              leadingIcon={<Camera size={16} />}
              onPress={() => photoInputRef.current?.click()}
            >
              {draftProfile.photo ? "Replace photo" : "Choose photo"}
            </DashboardV2Button>
            <DashboardV2Button
              tone="ghost"
              size="sm"
              onPress={profileSection.onRemovePhoto}
              isDisabled={!draftProfile.photo}
            >
              Remove photo
            </DashboardV2Button>
          </div>
          <input
            ref={photoInputRef}
            className="v2-settings-file-input"
            type="file"
            accept={profileSection.photoAccept}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.currentTarget.value = "";
              void profileSection.onPhotoSelected(file);
            }}
          />
        </aside>
      </div>

      <div className="v2-settings-subsection v2-settings-subsection--card">
        <div className="v2-settings-subsection__header">
          <DashboardV2Icon icon={UserRound} size={16} />
          <div>
            <DashboardV2Text as="strong" tone="strong">
              Clinician details
            </DashboardV2Text>
            <DashboardV2Text tone="muted">
              Identity and handoff notes shown across this workspace.
            </DashboardV2Text>
          </div>
        </div>

        <div className="v2-settings-list" role="group" aria-label="Workspace profile fields">
          <label className="v2-settings-row" htmlFor="v2-clinician-display-name">
            <span className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Display name</span>
              <span className="v2-settings-row__helper">
                {validation.displayName ?? "Shown in local clinician surfaces."}
              </span>
            </span>
            <input
              id="v2-clinician-display-name"
              type="text"
              aria-label="Clinician display name"
              value={draftProfile.displayName}
              maxLength={CLINICIAN_PROFILE_LIMITS.displayName}
              onChange={(event) =>
                profileSection.onProfileFieldChange(
                  "displayName",
                  event.target.value,
                )
              }
            />
          </label>

          <label className="v2-settings-row" htmlFor="v2-clinician-id">
            <span className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Clinician ID</span>
              <span className="v2-settings-row__helper">
                {validation.clinicianId ??
                  "Editable label for this browser workspace."}
              </span>
            </span>
            <input
              id="v2-clinician-id"
              type="text"
              aria-label="Clinician ID"
              value={draftProfile.clinicianId}
              maxLength={CLINICIAN_PROFILE_LIMITS.clinicianId}
              onChange={(event) =>
                profileSection.onProfileFieldChange(
                  "clinicianId",
                  event.target.value,
                )
              }
            />
          </label>

          <label className="v2-settings-row" htmlFor="v2-clinician-role">
            <span className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Role / title</span>
              <span className="v2-settings-row__helper">Local operational title.</span>
            </span>
            <input
              id="v2-clinician-role"
              type="text"
              aria-label="Clinician role or title"
              value={draftProfile.roleTitle}
              maxLength={CLINICIAN_PROFILE_LIMITS.roleTitle}
              onChange={(event) =>
                profileSection.onProfileFieldChange("roleTitle", event.target.value)
              }
            />
          </label>

          <label className="v2-settings-row" htmlFor="v2-clinician-specialty">
            <span className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Specialty</span>
              <span className="v2-settings-row__helper">Short clinical label.</span>
            </span>
            <input
              id="v2-clinician-specialty"
              type="text"
              aria-label="Clinician specialty"
              value={draftProfile.specialty}
              maxLength={CLINICIAN_PROFILE_LIMITS.specialty}
              onChange={(event) =>
                profileSection.onProfileFieldChange("specialty", event.target.value)
              }
            />
          </label>

          <label className="v2-settings-row" htmlFor="v2-clinician-bio">
            <span className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Care focus</span>
              <span className="v2-settings-row__helper">
                Short local framing note.
              </span>
            </span>
            <input
              id="v2-clinician-bio"
              type="text"
              aria-label="Short bio or care focus"
              value={draftProfile.bio}
              maxLength={CLINICIAN_PROFILE_LIMITS.bio}
              onChange={(event) =>
                profileSection.onProfileFieldChange("bio", event.target.value)
              }
            />
          </label>

          <label className="v2-settings-row" htmlFor="v2-clinician-pronouns">
            <span className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Pronouns</span>
              <span className="v2-settings-row__helper">Optional.</span>
            </span>
            <input
              id="v2-clinician-pronouns"
              type="text"
              aria-label="Preferred pronouns"
              value={draftProfile.preferredPronouns ?? ""}
              maxLength={CLINICIAN_PROFILE_LIMITS.preferredPronouns}
              onChange={(event) =>
                profileSection.onProfileFieldChange(
                  "preferredPronouns",
                  event.target.value || undefined,
                )
              }
            />
          </label>

          <label
            className="v2-settings-row v2-settings-row--textarea"
            htmlFor="v2-clinician-note"
          >
            <span className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Local handoff note</span>
              <span className="v2-settings-row__helper">
                Handoff context for this workstation.
              </span>
            </span>
            <textarea
              id="v2-clinician-note"
              aria-label="Contact or handoff note"
              value={draftProfile.contactNote}
              maxLength={CLINICIAN_PROFILE_LIMITS.contactNote}
              onChange={(event) =>
                profileSection.onProfileFieldChange("contactNote", event.target.value)
              }
            />
          </label>
        </div>
      </div>

      <div className="v2-settings-subsection v2-settings-subsection--card">
        <div className="v2-settings-subsection__header">
          <DashboardV2Icon icon={LayoutGrid} size={16} />
          <div>
            <DashboardV2Text as="strong" tone="strong">
              Daily context and opening defaults
            </DashboardV2Text>
            <DashboardV2Text tone="muted">
              Availability, hours, and opening defaults stay local to this
              browser.
            </DashboardV2Text>
          </div>
        </div>

        <div className="v2-settings-list">
          <label className="v2-settings-row" htmlFor="v2-availability-status">
            <span className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Availability</span>
              <span className="v2-settings-row__helper">
                Local workspace status only.
              </span>
            </span>
            <select
              id="v2-availability-status"
              aria-label="Availability status"
              value={draftProfile.workspacePreferences.availabilityStatus}
              onChange={(event) =>
                profileSection.onWorkspaceFieldChange(
                  "availabilityStatus",
                  event.target.value as ClinicianAvailabilityStatus,
                )
              }
            >
              {AVAILABILITY_STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="v2-settings-row" htmlFor="v2-team-label">
            <span className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Team / clinic</span>
              <span className="v2-settings-row__helper">
                Optional local context.
              </span>
            </span>
            <input
              id="v2-team-label"
              type="text"
              aria-label="Team or clinic label"
              value={draftProfile.workspacePreferences.teamLabel}
              maxLength={CLINICIAN_PROFILE_LIMITS.teamLabel}
              onChange={(event) =>
                profileSection.onWorkspaceFieldChange(
                  "teamLabel",
                  event.target.value,
                )
              }
            />
          </label>

          <label className="v2-settings-row" htmlFor="v2-timezone">
            <span className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Timezone</span>
              <span className="v2-settings-row__helper">
                Falls back to the browser timezone if needed.
              </span>
            </span>
            <input
              id="v2-timezone"
              type="text"
              list="v2-settings-timezone-options"
              aria-label="Workspace timezone"
              value={draftProfile.workspacePreferences.timezone}
              maxLength={CLINICIAN_PROFILE_LIMITS.timezone}
              onChange={(event) =>
                profileSection.onWorkspaceFieldChange(
                  "timezone",
                  event.target.value,
                )
              }
            />
          </label>

          <label className="v2-settings-row" htmlFor="v2-default-landing">
            <span className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Default landing route</span>
              <span className="v2-settings-row__helper">
                Used only when Aura opens without a stronger redirect.
              </span>
            </span>
            <select
              id="v2-default-landing"
              aria-label="Default landing route"
              value={draftProfile.workspacePreferences.defaultLandingRoute}
              onChange={(event) =>
                profileSection.onWorkspaceFieldChange(
                  "defaultLandingRoute",
                  event.target.value as ClinicianProfile["workspacePreferences"]["defaultLandingRoute"],
                )
              }
            >
              {LANDING_ROUTE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="v2-settings-row v2-settings-row--stacked">
            <div className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Working hours</span>
              <span className="v2-settings-row__helper">
                {validation.workingHours ??
                  "Local context only. Aura does not derive scheduling from this automatically."}
              </span>
            </div>
            <div className="v2-settings-working-hours">
              <div
                className="v2-settings-working-hours__days"
                role="group"
                aria-label="Working days"
              >
                {WORKING_DAY_OPTIONS.map((day) => {
                  const checked = draftProfile.workspacePreferences.workingHours.enabledDays.includes(
                    day.id,
                  );

                  return (
                    <label
                      key={day.id}
                      className="v2-settings-working-hours__day"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        aria-label={day.label}
                        onChange={(event) =>
                          profileSection.onWorkingDayToggle(
                            day.id,
                            event.target.checked,
                          )
                        }
                      />
                      <span>{day.shortLabel}</span>
                    </label>
                  );
                })}
              </div>

              <div className="v2-settings-working-hours__times">
                <label htmlFor="v2-working-start">
                  <span>Start</span>
                  <input
                    id="v2-working-start"
                    type="time"
                    aria-label="Working hours start time"
                    value={draftProfile.workspacePreferences.workingHours.startTime}
                    onChange={(event) =>
                      profileSection.onWorkingTimeChange(
                        "startTime",
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label htmlFor="v2-working-end">
                  <span>End</span>
                  <input
                    id="v2-working-end"
                    type="time"
                    aria-label="Working hours end time"
                    value={draftProfile.workspacePreferences.workingHours.endTime}
                    onChange={(event) =>
                      profileSection.onWorkingTimeChange(
                        "endTime",
                        event.target.value,
                      )
                    }
                  />
                </label>
              </div>
            </div>
          </div>

          <label className="v2-settings-row" htmlFor="v2-default-patients">
            <span className="v2-settings-row__copy">
              <span className="v2-settings-row__label">Default patient preset</span>
              <span className="v2-settings-row__helper">
                Applied only on a clean Patients entry.
              </span>
            </span>
            <select
              id="v2-default-patients"
              aria-label="Default Patients preset"
              value={draftProfile.workspacePreferences.defaultPatientsPreset}
              onChange={(event) =>
                profileSection.onWorkspaceFieldChange(
                  "defaultPatientsPreset",
                  event.target.value as ClinicianProfile["workspacePreferences"]["defaultPatientsPreset"],
                )
              }
            >
              <option value="">No default preset</option>
              {PATIENT_TRIAGE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <label className="v2-settings-row" htmlFor="v2-default-communication">
            <span className="v2-settings-row__copy">
              <span className="v2-settings-row__label">
                Default communication filter
              </span>
              <span className="v2-settings-row__helper">
                Applied only when Communication opens without a route filter.
              </span>
            </span>
            <select
              id="v2-default-communication"
              aria-label="Default Communication filter"
              value={draftProfile.workspacePreferences.defaultCommunicationFilter}
              onChange={(event) =>
                profileSection.onWorkspaceFieldChange(
                  "defaultCommunicationFilter",
                  event.target.value as ClinicianProfile["workspacePreferences"]["defaultCommunicationFilter"],
                )
              }
            >
              {COMMUNICATION_THREAD_VIEW_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <datalist id="v2-settings-timezone-options">
          {profileSection.supportedTimeZones.map((timeZone) => (
            <option key={timeZone} value={timeZone} />
          ))}
        </datalist>
      </div>

      <div className="v2-settings-section__footer">
        <DashboardV2Text tone="muted">
          {profileSection.dirty
            ? "Identity and opening defaults save together in this browser."
            : "This saved profile is local to this browser and does not sync across devices."}
        </DashboardV2Text>
        <DashboardV2Button
          onPress={profileSection.onSave}
          isDisabled={!profileSection.dirty}
          leadingIcon={<UserRound size={16} />}
        >
          Save profile
        </DashboardV2Button>
      </div>

      {profileSection.error ? (
        <DashboardV2Text
          className="v2-settings-notice v2-settings-notice--error"
          role="alert"
        >
          {profileSection.error}
        </DashboardV2Text>
      ) : null}

      {profileSection.notice ? (
        <DashboardV2Text className="v2-settings-notice" role="status">
          {profileSection.notice}
        </DashboardV2Text>
      ) : null}
    </DashboardV2Surface>
  );
}
