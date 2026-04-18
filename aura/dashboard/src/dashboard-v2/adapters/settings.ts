import type {
  ClinicianCommunicationTemplate,
  ClinicianNotificationPreferences,
  ClinicianProfile,
  ClinicianProfilePhotoMime,
} from "../../services/clinicianProfile";
import {
  getClinicianInitials,
  type ClinicianIdentity,
} from "../../services/clinicianIdentity";
import type { ClinicianWorkspacePreferencesSnapshot } from "../../services/clinicianWorkspacePreferences";
import type { DashboardV2MetadataItem } from "../patterns/MetadataList";

export interface SettingsCommunicationTemplateValidationState {
  title?: string;
  body?: string;
}

export interface SettingsProfileValidationState {
  displayName?: string;
  clinicianId?: string;
  workingHours?: string;
  communicationTemplates?: SettingsCommunicationTemplateValidationState[];
  notificationQuietHours?: string;
}

export interface SettingsStatusBarVm {
  title: string;
  guidanceLine: string;
  facts: Array<{
    key: string;
    label: string;
    value: string;
  }>;
}

export interface SettingsProfileSummaryVm {
  displayName: string;
  secondaryLine: string;
  initials: string;
  photo: ClinicianIdentity["photo"];
  identityFacts: string[];
  workspaceFacts: string[];
  workspaceDefaults: string[];
  bio?: string;
  contactNote?: string;
  availabilityLabel: string;
  availabilityTone: "positive" | "attention" | "muted";
}

export function profileWorkspaceSectionsEqual(
  left: ClinicianProfile,
  right: ClinicianProfile,
): boolean {
  return (
    JSON.stringify({
      ...left,
      communicationAuthoring: null,
      notificationPreferences: null,
    }) ===
    JSON.stringify({
      ...right,
      communicationAuthoring: null,
      notificationPreferences: null,
    })
  );
}

export function validateSettingsProfile(
  profile: ClinicianProfile,
): SettingsProfileValidationState {
  const next: SettingsProfileValidationState = {};

  if (!profile.displayName.trim()) {
    next.displayName = "Display name is required before saving.";
  }

  if (!profile.clinicianId.trim()) {
    next.clinicianId = "Clinician ID is required before saving.";
  }

  const workingHours = profile.workspacePreferences.workingHours;
  const [startHours, startMinutes] = workingHours.startTime
    .split(":")
    .map((value) => Number(value));
  const [endHours, endMinutes] = workingHours.endTime
    .split(":")
    .map((value) => Number(value));
  const startSortValue = startHours * 60 + startMinutes;
  const endSortValue = endHours * 60 + endMinutes;

  if (workingHours.enabledDays.length === 0) {
    next.workingHours = "Select at least one working day before saving.";
  } else if (
    !Number.isFinite(startSortValue) ||
    !Number.isFinite(endSortValue)
  ) {
    next.workingHours = "Enter a valid start and end time before saving.";
  } else if (endSortValue <= startSortValue) {
    next.workingHours = "End time must be later than the start time.";
  }

  const templateValidation = profile.communicationAuthoring.templates.map(
    (template) => {
      const templateErrors: SettingsCommunicationTemplateValidationState = {};

      if (!template.title.trim()) {
        templateErrors.title = "Template title is required.";
      }

      if (!template.body.trim()) {
        templateErrors.body = "Template body is required.";
      }

      return templateErrors;
    },
  );

  if (templateValidation.some((template) => template.title || template.body)) {
    next.communicationTemplates = templateValidation;
  }

  const quietHours = profile.notificationPreferences.quietHours;
  if (quietHours.enabled && quietHours.startTime === quietHours.endTime) {
    next.notificationQuietHours =
      "Quiet hours start and end times must be different.";
  }

  return next;
}

export function hasTemplateValidationErrors(
  validation: SettingsProfileValidationState,
): boolean {
  return Boolean(
    validation.communicationTemplates?.some(
      (template) => template.title || template.body,
    ),
  );
}

export function createCommunicationTemplateDraft(): ClinicianCommunicationTemplate {
  return {
    id: `communication-template-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    title: "",
    body: "",
  };
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error("file-read-failed"));
    };

    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result.trim()) {
        resolve(reader.result);
        return;
      }

      reject(new Error("file-read-empty"));
    };

    reader.readAsDataURL(file);
  });
}

export function buildDraftIdentityPreview(
  draftProfile: ClinicianProfile,
  fallbackDisplayName: string,
): {
  displayName: string;
  initials: string;
  photo: ClinicianProfile["photo"];
} {
  return {
    displayName:
      draftProfile.displayName.trim() ||
      draftProfile.clinicianId.trim() ||
      fallbackDisplayName,
    initials: getClinicianInitials(
      draftProfile.displayName,
      draftProfile.clinicianId,
    ),
    photo: draftProfile.photo,
  };
}

export function buildSettingsStatusBar(input: {
  workspaceStateSummaryLabel: string;
  availabilityLabel: string;
  themeSummaryLabel: string;
  sessionProtectionBadgeLabel: string;
}): SettingsStatusBarVm {
  return {
    title: "Workspace preferences",
    guidanceLine:
      "Save profile, communication, and notification changes here. Theme and session protection apply right away in this browser.",
    facts: [
      {
        key: "state",
        label: "State",
        value: input.workspaceStateSummaryLabel,
      },
      {
        key: "availability",
        label: "Availability",
        value: input.availabilityLabel,
      },
      {
        key: "protection",
        label: "Protection",
        value: input.sessionProtectionBadgeLabel,
      },
      {
        key: "theme",
        label: "Theme",
        value: input.themeSummaryLabel,
      },
      {
        key: "scope",
        label: "Scope",
        value: "This browser only",
      },
    ],
  };
}

export function buildSettingsProfileSummary(input: {
  clinicianIdentity: ClinicianIdentity;
  workspacePreferences: ClinicianWorkspacePreferencesSnapshot;
}): SettingsProfileSummaryVm {
  const { clinicianIdentity, workspacePreferences } = input;

  return {
    displayName: clinicianIdentity.displayName,
    secondaryLine:
      clinicianIdentity.secondaryLine || "Local clinician profile",
    initials: clinicianIdentity.initials,
    photo: clinicianIdentity.photo,
    identityFacts: [
      `ID: ${clinicianIdentity.clinicianId}`,
      clinicianIdentity.roleTitle,
      clinicianIdentity.specialty,
      clinicianIdentity.preferredPronouns,
    ].filter(Boolean) as string[],
    workspaceFacts: [
      workspacePreferences.availabilityLabel,
      workspacePreferences.teamLabel || undefined,
      workspacePreferences.resolvedTimezone,
      workspacePreferences.workingHoursSummary,
    ].filter(Boolean) as string[],
    workspaceDefaults: [
      `Opens to ${workspacePreferences.defaultLandingLabel}`,
      workspacePreferences.defaultPatientsPreset
        ? `Patients: ${workspacePreferences.defaultPatientsPresetLabel}`
        : undefined,
      workspacePreferences.defaultCommunicationFilter !== "all"
        ? `Inbox: ${workspacePreferences.defaultCommunicationFilterLabel}`
        : undefined,
    ].filter(Boolean) as string[],
    bio: clinicianIdentity.bio.trim() || undefined,
    contactNote: clinicianIdentity.contactNote.trim() || undefined,
    availabilityLabel: workspacePreferences.availabilityLabel,
    availabilityTone: workspacePreferences.availabilityTone,
  };
}

export function buildNotificationSummaryPills(
  preferences: ClinicianNotificationPreferences,
): string[] {
  const communicationLabel =
    preferences.communication.cueMode === "reduced"
      ? "Communication cues reduced"
      : "Communication cues default";
  const safetyLabel =
    preferences.safety.cueMode === "reduced"
      ? "Safety cues reduced"
      : "Safety cues default";
  const quietHoursLabel = preferences.quietHours.enabled
    ? `Quiet hours ${preferences.quietHours.startTime} - ${preferences.quietHours.endTime}`
    : "Quiet hours off";

  return [communicationLabel, safetyLabel, quietHoursLabel];
}

export function buildReferenceMetadata(input: {
  authScopeId: string | null;
  resolvedTimezone: string | undefined;
  workingHoursSummary: string;
}): DashboardV2MetadataItem[] {
  return [
    {
      label: "Authenticated scope",
      value: input.authScopeId ?? undefined,
    },
    {
      label: "Resolved timezone",
      value: input.resolvedTimezone?.trim() || undefined,
    },
    {
      label: "Storage scope",
      value: "This browser only",
    },
    {
      label: "Working-hours summary",
      value: input.workingHoursSummary,
    },
  ];
}

export function buildPhotoAcceptValue(
  mimeTypes: ClinicianProfilePhotoMime[],
): string {
  return mimeTypes.join(",");
}
