import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClinicianIdentity } from "../../../hooks/useClinicianIdentity";
import { useClinicianWorkspacePreferences } from "../../../hooks/useClinicianWorkspacePreferences";
import {
  CLINICIAN_COMMUNICATION_AUTHORING_LIMITS,
  CLINICIAN_PROFILE_LIMITS,
  CLINICIAN_PROFILE_PHOTO_MIME_TYPES,
  MAX_CLINICIAN_PROFILE_PHOTO_BYTES,
  getClinicianProfile,
  getDefaultClinicianProfileForAuthIdentity,
  setClinicianProfile,
  type ClinicianCommunicationAuthoring,
  type ClinicianCommunicationTemplate,
  type ClinicianNotificationPreferences,
  type ClinicianProfile,
  type ClinicianProfilePhotoMime,
  type ClinicianWorkingDayToken,
} from "../../../services/clinicianProfile";
import {
  AVAILABILITY_STATUS_OPTIONS,
  LANDING_ROUTE_OPTIONS,
  WORKING_DAY_OPTIONS,
  getSupportedTimeZoneOptions,
} from "../../../services/clinicianWorkspacePreferences";
import {
  DEFAULT_SESSION_SETTINGS,
  getSessionSettings,
  setSessionSettings,
  type SessionSettings,
} from "../../../services/sessionSettings";
import {
  COMMUNICATION_THREAD_VIEW_OPTIONS,
} from "../../../services/communicationWorkspace";
import {
  getThemeMode,
  setThemeMode,
  subscribeThemeMode,
  type ThemeMode,
} from "../../../services/theme";
import { PATIENT_TRIAGE_PRESETS } from "../../../utils/patientFilters";
import {
  clinicianQueryKeys,
  getPresentationSeedStatus,
  invalidatePresentationDashboardQueries,
  loadPresentationSeed,
  resetPresentationSeed,
  type PresentationSeedStatus,
} from "../../../services/clinicianApi";
import { toUserMessage } from "../../../utils/errors";
import {
  buildDraftIdentityPreview,
  buildNotificationSummaryPills,
  buildPhotoAcceptValue,
  buildReferenceMetadata,
  buildSettingsProfileSummary,
  buildSettingsStatusBar,
  createCommunicationTemplateDraft,
  hasTemplateValidationErrors,
  profileWorkspaceSectionsEqual,
  readFileAsDataUrl,
  validateSettingsProfile,
  type SettingsCommunicationTemplateValidationState,
  type SettingsProfileSummaryVm,
  type SettingsProfileValidationState,
  type SettingsStatusBarVm,
} from "../../adapters/settings";
import type { DashboardV2MetadataItem } from "../../patterns/MetadataList";

type ProfileFeedbackScope =
  | "profile"
  | "communication"
  | "notifications"
  | "maintenance";

export interface SettingsProfileSectionVm {
  summary: SettingsProfileSummaryVm;
  draftProfile: ClinicianProfile;
  draftIdentityPreview: {
    displayName: string;
    initials: string;
    photo: ClinicianProfile["photo"];
  };
  validation: SettingsProfileValidationState;
  dirty: boolean;
  notice: string | null;
  error: string | null;
  supportedTimeZones: string[];
  photoAccept: string;
  onProfileFieldChange: <K extends keyof ClinicianProfile>(
    key: K,
    value: ClinicianProfile[K],
  ) => void;
  onWorkspaceFieldChange: <
    K extends keyof ClinicianProfile["workspacePreferences"],
  >(
    key: K,
    value: ClinicianProfile["workspacePreferences"][K],
  ) => void;
  onWorkingDayToggle: (
    day: ClinicianWorkingDayToken,
    checked: boolean,
  ) => void;
  onWorkingTimeChange: (key: "startTime" | "endTime", value: string) => void;
  onPhotoSelected: (file: File | null) => Promise<void>;
  onRemovePhoto: () => void;
  onSave: () => void;
}

export interface SettingsCommunicationSectionVm {
  draft: ClinicianCommunicationAuthoring;
  dirty: boolean;
  notice: string | null;
  error: string | null;
  templateValidation?:
    | SettingsCommunicationTemplateValidationState[]
    | undefined;
  summaryFacts: string[];
  onSignatureChange: (value: string) => void;
  onAutoAppendChange: (checked: boolean) => void;
  onTemplateFieldChange: (
    templateId: string,
    key: keyof Pick<ClinicianCommunicationTemplate, "title" | "body">,
    value: string,
  ) => void;
  onAddTemplate: () => void;
  onRemoveTemplate: (templateId: string) => void;
  onSave: () => void;
}

export interface SettingsNotificationSectionVm {
  draft: ClinicianNotificationPreferences;
  dirty: boolean;
  notice: string | null;
  error: string | null;
  quietHoursError?: string;
  summaryFacts: string[];
  onCueModeChange: (
    key: keyof Pick<
      ClinicianNotificationPreferences,
      "communication" | "safety"
    >,
    value: ClinicianNotificationPreferences["communication"]["cueMode"],
  ) => void;
  onQuietHoursChange: <
    K extends keyof ClinicianNotificationPreferences["quietHours"],
  >(
    key: K,
    value: ClinicianNotificationPreferences["quietHours"][K],
  ) => void;
  onSave: () => void;
}

export interface SettingsAppearancePanelVm {
  themeMode: ThemeMode;
  themeSummaryLabel: string;
  notice: string | null;
  onThemeModeChange: (mode: ThemeMode) => void;
}

export interface SettingsSessionPanelVm {
  settings: SessionSettings;
  badgeLabel: string;
  summaryLabel: string;
  warningLabel: string;
  notice: string | null;
  onUpdate: (update: Partial<SessionSettings>) => void;
  onRestoreDefaults: () => void;
}

export interface SettingsReferencePanelVm {
  metadata: DashboardV2MetadataItem[];
}

export interface SettingsMaintenancePanelVm {
  notice: string | null;
  onRestoreDefaults: () => void;
}

export interface SettingsPresentationToolsPanelVm {
  status: PresentationSeedStatus | null;
  loading: boolean;
  disabled: boolean;
  loaded: boolean;
  seedId: string | null;
  lastLoadedAtLabel: string | null;
  countsSummary: string[];
  notice: string | null;
  error: string | null;
  loadLabel: string;
  resetLabel: string;
  loadDisabled: boolean;
  resetDisabled: boolean;
  onLoad: () => void;
  onReset: () => void;
}

export interface UseSettingsViewModelResult {
  statusBar: SettingsStatusBarVm;
  profileSection: SettingsProfileSectionVm;
  communicationSection: SettingsCommunicationSectionVm;
  notificationSection: SettingsNotificationSectionVm;
  appearancePanel: SettingsAppearancePanelVm;
  sessionPanel: SettingsSessionPanelVm;
  referencePanel: SettingsReferencePanelVm;
  presentationToolsPanel: SettingsPresentationToolsPanelVm | null;
  maintenancePanel: SettingsMaintenancePanelVm;
}

function normalizeProfileFeedback(
  scope: ProfileFeedbackScope,
  activeScope: ProfileFeedbackScope,
  value: string | null,
): string | null {
  return scope === activeScope ? value : null;
}

function parseEnvBoolean(value: unknown): boolean {
  return value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

function isPresentationToolsEnabled(): boolean {
  return parseEnvBoolean(import.meta.env.VITE_AURA_PRESENTATION_TOOLS_ENABLED);
}

function formatPresentationDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatCountLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildCountsSummary(status: PresentationSeedStatus | null): string[] {
  if (!status?.counts) {
    return [];
  }

  const preferredKeys = [
    "patients",
    "checkIns",
    "alerts",
    "tasks",
    "appointmentRequests",
    "insightSuggestions",
  ];

  return preferredKeys
    .map((key) => {
      const value = status.counts[key];
      return typeof value === "number" ? `${formatCountLabel(key)} ${value}` : null;
    })
    .filter((value): value is string => Boolean(value));
}

export function useSettingsViewModel(): UseSettingsViewModelResult {
  const queryClient = useQueryClient();
  const initialProfile = useMemo(() => getClinicianProfile(), []);
  const presentationToolsEnabled = isPresentationToolsEnabled();
  const clinicianIdentity = useClinicianIdentity();
  const workspacePreferences = useClinicianWorkspacePreferences();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getThemeMode());
  const [themeNotice, setThemeNotice] = useState<string | null>(null);
  const [savedProfile, setSavedProfile] = useState<ClinicianProfile>(() => initialProfile);
  const [draftProfile, setDraftProfile] = useState<ClinicianProfile>(() => initialProfile);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileFeedbackScope, setProfileFeedbackScope] =
    useState<ProfileFeedbackScope>("profile");
  const [profileValidation, setProfileValidation] =
    useState<SettingsProfileValidationState>({});
  const [sessionSettings, setLocalSessionSettings] = useState<SessionSettings>(() =>
    getSessionSettings(),
  );
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const supportedTimeZones = useMemo(() => getSupportedTimeZoneOptions(), []);
  const [presentationNotice, setPresentationNotice] = useState<string | null>(null);

  const presentationStatusQuery = useQuery({
    queryKey: clinicianQueryKeys.presentationSeedStatus(),
    queryFn: getPresentationSeedStatus,
    enabled: presentationToolsEnabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const loadPresentationMutation = useMutation({
    mutationFn: loadPresentationSeed,
    onMutate: () => {
      setPresentationNotice(null);
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(clinicianQueryKeys.presentationSeedStatus(), result);
      setPresentationNotice("Presentation data loaded.");
      await invalidatePresentationDashboardQueries(queryClient);
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: clinicianQueryKeys.presentationSeedStatus(),
      });
    },
  });

  const resetPresentationMutation = useMutation({
    mutationFn: resetPresentationSeed,
    onMutate: () => {
      setPresentationNotice(null);
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(clinicianQueryKeys.presentationSeedStatus(), result);
      setPresentationNotice("Presentation data reset.");
      await invalidatePresentationDashboardQueries(queryClient);
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: clinicianQueryKeys.presentationSeedStatus(),
      });
    },
  });

  useEffect(() => {
    return subscribeThemeMode((mode) => {
      setThemeModeState(mode);
    });
  }, []);

  function applySessionSettings(update: Partial<SessionSettings>): void {
    const next = setSessionSettings(update);
    setLocalSessionSettings(next);
    setSessionNotice("Session security settings updated.");
  }

  function handleRestoreSessionDefaults(): void {
    const reset = setSessionSettings(DEFAULT_SESSION_SETTINGS);
    setLocalSessionSettings(reset);
    setSessionNotice("Session security settings reset to defaults.");
  }

  function clearProfileFeedback(validationKey?: keyof SettingsProfileValidationState): void {
    setProfileNotice(null);
    setProfileError(null);
    if (validationKey) {
      setProfileValidation((current) => ({
        ...current,
        [validationKey]: undefined,
      }));
    }
  }

  function updateDraftProfile<K extends keyof ClinicianProfile>(
    key: K,
    value: ClinicianProfile[K],
  ): void {
    setDraftProfile((current) => ({
      ...current,
      [key]: value,
    }));
    clearProfileFeedback(
      key === "displayName"
        ? "displayName"
        : key === "clinicianId"
          ? "clinicianId"
          : undefined,
    );
  }

  function updateDraftWorkspacePreference<
    K extends keyof ClinicianProfile["workspacePreferences"],
  >(
    key: K,
    value: ClinicianProfile["workspacePreferences"][K],
  ): void {
    setDraftProfile((current) => ({
      ...current,
      workspacePreferences: {
        ...current.workspacePreferences,
        [key]: value,
      },
    }));
    clearProfileFeedback("workingHours");
  }

  function updateDraftCommunicationAuthoring<
    K extends keyof ClinicianCommunicationAuthoring,
  >(key: K, value: ClinicianCommunicationAuthoring[K]): void {
    setDraftProfile((current) => ({
      ...current,
      communicationAuthoring: {
        ...current.communicationAuthoring,
        [key]: value,
      },
    }));
    clearProfileFeedback("communicationTemplates");
  }

  function updateDraftCommunicationTemplate(
    templateId: string,
    key: keyof Pick<ClinicianCommunicationTemplate, "title" | "body">,
    value: string,
  ): void {
    setDraftProfile((current) => ({
      ...current,
      communicationAuthoring: {
        ...current.communicationAuthoring,
        templates: current.communicationAuthoring.templates.map((template) =>
          template.id === templateId
            ? {
                ...template,
                [key]: value,
              }
            : template,
        ),
      },
    }));
    clearProfileFeedback("communicationTemplates");
  }

  function updateDraftNotificationCueMode(
    key: keyof Pick<
      ClinicianNotificationPreferences,
      "communication" | "safety"
    >,
    value: ClinicianNotificationPreferences["communication"]["cueMode"],
  ): void {
    setDraftProfile((current) => ({
      ...current,
      notificationPreferences: {
        ...current.notificationPreferences,
        [key]: {
          cueMode: value,
        },
      },
    }));
    clearProfileFeedback();
  }

  function updateDraftNotificationQuietHours<
    K extends keyof ClinicianNotificationPreferences["quietHours"],
  >(
    key: K,
    value: ClinicianNotificationPreferences["quietHours"][K],
  ): void {
    setDraftProfile((current) => ({
      ...current,
      notificationPreferences: {
        ...current.notificationPreferences,
        quietHours: {
          ...current.notificationPreferences.quietHours,
          [key]: value,
        },
      },
    }));
    clearProfileFeedback("notificationQuietHours");
  }

  function addDraftCommunicationTemplate(): void {
    setDraftProfile((current) => {
      if (
        current.communicationAuthoring.templates.length >=
        CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templates
      ) {
        return current;
      }

      return {
        ...current,
        communicationAuthoring: {
          ...current.communicationAuthoring,
          templates: [
            ...current.communicationAuthoring.templates,
            createCommunicationTemplateDraft(),
          ],
        },
      };
    });
    clearProfileFeedback("communicationTemplates");
  }

  function removeDraftCommunicationTemplate(templateId: string): void {
    setDraftProfile((current) => ({
      ...current,
      communicationAuthoring: {
        ...current.communicationAuthoring,
        templates: current.communicationAuthoring.templates.filter(
          (template) => template.id !== templateId,
        ),
      },
    }));
    clearProfileFeedback("communicationTemplates");
  }

  function updateDraftWorkingDays(
    day: ClinicianWorkingDayToken,
    checked: boolean,
  ): void {
    setDraftProfile((current) => {
      const currentDays = current.workspacePreferences.workingHours.enabledDays;
      const nextDays = checked
        ? [...new Set([...currentDays, day])]
        : currentDays.filter((entry) => entry !== day);

      return {
        ...current,
        workspacePreferences: {
          ...current.workspacePreferences,
          workingHours: {
            ...current.workspacePreferences.workingHours,
            enabledDays: nextDays,
          },
        },
      };
    });
    clearProfileFeedback("workingHours");
  }

  function updateDraftWorkingTime(
    key: "startTime" | "endTime",
    value: string,
  ): void {
    setDraftProfile((current) => ({
      ...current,
      workspacePreferences: {
        ...current.workspacePreferences,
        workingHours: {
          ...current.workspacePreferences.workingHours,
          [key]: value,
        },
      },
    }));
    clearProfileFeedback("workingHours");
  }

  async function handlePhotoSelected(file: File | null): Promise<void> {
    if (!file) {
      return;
    }

    if (
      !CLINICIAN_PROFILE_PHOTO_MIME_TYPES.includes(
        file.type as ClinicianProfilePhotoMime,
      )
    ) {
      setProfileFeedbackScope("profile");
      setProfileError("Choose a JPG, PNG, or WebP image up to 500 KB.");
      setProfileNotice(null);
      return;
    }

    if (file.size > MAX_CLINICIAN_PROFILE_PHOTO_BYTES) {
      setProfileFeedbackScope("profile");
      setProfileError("Choose a JPG, PNG, or WebP image up to 500 KB.");
      setProfileNotice(null);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);

      updateDraftProfile("photo", {
        dataUrl,
        mimeType: file.type as ClinicianProfilePhotoMime,
        fileName: file.name,
        sizeBytes: file.size,
      });
      setProfileFeedbackScope("profile");
      setProfileNotice(
        "Photo added to the form. Save to keep it in this browser.",
      );
    } catch {
      setProfileFeedbackScope("profile");
      setProfileError("The selected image could not be read in this browser.");
      setProfileNotice(null);
    }
  }

  function handleSaveProfile(
    scope: "profile" | "communication" | "notifications",
  ): void {
    const nextValidation = validateSettingsProfile(draftProfile);
    setProfileValidation(nextValidation);

    if (
      scope === "profile" &&
      (nextValidation.displayName || nextValidation.clinicianId)
    ) {
      setProfileFeedbackScope("profile");
      setProfileError(
        "Display name and clinician ID are required before saving.",
      );
      setProfileNotice(null);
      return;
    }

    if (scope === "profile" && nextValidation.workingHours) {
      setProfileFeedbackScope("profile");
      setProfileError(nextValidation.workingHours);
      setProfileNotice(null);
      return;
    }

    if (scope === "communication" && hasTemplateValidationErrors(nextValidation)) {
      setProfileFeedbackScope("communication");
      setProfileError(
        "Complete or remove any blank communication templates before saving.",
      );
      setProfileNotice(null);
      return;
    }

    if (scope === "notifications" && nextValidation.notificationQuietHours) {
      setProfileFeedbackScope("notifications");
      setProfileError(nextValidation.notificationQuietHours);
      setProfileNotice(null);
      return;
    }

    const nextProfileToSave =
      scope === "communication"
        ? {
            ...savedProfile,
            communicationAuthoring: draftProfile.communicationAuthoring,
          }
        : scope === "notifications"
          ? {
              ...savedProfile,
              notificationPreferences: draftProfile.notificationPreferences,
            }
          : {
              ...savedProfile,
              ...draftProfile,
              communicationAuthoring: savedProfile.communicationAuthoring,
              notificationPreferences: savedProfile.notificationPreferences,
            };

    const result = setClinicianProfile(nextProfileToSave);

    if (!result.saved) {
      setProfileFeedbackScope(scope);
      setProfileError("Settings could not be saved in this browser right now.");
      setProfileNotice(null);
      return;
    }

    setSavedProfile(result.profile);
    setDraftProfile((current) =>
      scope === "communication"
        ? {
            ...current,
            communicationAuthoring: result.profile.communicationAuthoring,
          }
        : scope === "notifications"
          ? {
              ...current,
              notificationPreferences: result.profile.notificationPreferences,
            }
          : {
              ...result.profile,
              communicationAuthoring: current.communicationAuthoring,
              notificationPreferences: current.notificationPreferences,
            },
    );
    setProfileValidation((current) =>
      scope === "communication"
        ? {
            ...current,
            communicationTemplates: undefined,
          }
        : scope === "notifications"
          ? {
              ...current,
              notificationQuietHours: undefined,
            }
          : {
              ...current,
              displayName: undefined,
              clinicianId: undefined,
              workingHours: undefined,
            },
    );
    setProfileFeedbackScope(scope);
    setProfileError(null);
    setProfileNotice("Settings saved in this browser.");
  }

  function handleRestoreProfileDefaults(): void {
    setDraftProfile(getDefaultClinicianProfileForAuthIdentity());
    setProfileValidation({});
    setProfileFeedbackScope("maintenance");
    setProfileError(null);
    setProfileNotice(
      "Defaults restored in the form. Save to keep them in this browser.",
    );
  }

  function handleRemovePhoto(): void {
    updateDraftProfile("photo", null);
    setProfileFeedbackScope("profile");
    setProfileNotice("Photo removed from the form. Save to keep the change.");
  }

  const themeSummaryLabel = useMemo(() => {
    if (themeMode === "system") {
      return "System";
    }
    if (themeMode === "light") {
      return "Light";
    }
    return "Dark";
  }, [themeMode]);

  const sessionSummaryLabel = sessionSettings.enabled
    ? `${sessionSettings.idleMinutes}m idle · ${sessionSettings.absoluteHours}h max`
    : "Auto-logout off";
  const timeoutWarningLabel = sessionSettings.enabled
    ? "Warns 1m before idle lock and 5m before max session."
    : "Protection warnings resume when session guard is on.";

  const profileWorkspaceDirty = useMemo(() => {
    return !profileWorkspaceSectionsEqual(savedProfile, draftProfile);
  }, [draftProfile, savedProfile]);

  const communicationAuthoringDirty = useMemo(
    () =>
      JSON.stringify(savedProfile.communicationAuthoring) !==
      JSON.stringify(draftProfile.communicationAuthoring),
    [draftProfile.communicationAuthoring, savedProfile.communicationAuthoring],
  );
  const notificationPreferencesDirty = useMemo(
    () =>
      JSON.stringify(savedProfile.notificationPreferences) !==
      JSON.stringify(draftProfile.notificationPreferences),
    [draftProfile.notificationPreferences, savedProfile.notificationPreferences],
  );
  const workspaceStateSummaryLabel =
    profileWorkspaceDirty ||
    communicationAuthoringDirty ||
    notificationPreferencesDirty
      ? "Draft changes pending"
      : "Workspace state saved";

  const statusBar = useMemo(
    () =>
      buildSettingsStatusBar({
        workspaceStateSummaryLabel,
        availabilityLabel: workspacePreferences.availabilityLabel,
        themeSummaryLabel,
        sessionProtectionBadgeLabel: sessionSettings.enabled
          ? "Auto-logout on"
          : "Auto-logout off",
      }),
    [
      sessionSettings.enabled,
      themeSummaryLabel,
      workspacePreferences.availabilityLabel,
      workspaceStateSummaryLabel,
    ],
  );

  const profileSummary = useMemo(
    () =>
      buildSettingsProfileSummary({
        clinicianIdentity,
        workspacePreferences,
      }),
    [clinicianIdentity, workspacePreferences],
  );
  const draftIdentityPreview = useMemo(
    () =>
      buildDraftIdentityPreview(draftProfile, clinicianIdentity.displayName),
    [clinicianIdentity.displayName, draftProfile],
  );
  const communicationSummaryFacts = useMemo(() => {
    const savedTemplateCount = savedProfile.communicationAuthoring.templates.length;
    const hasSavedSignature =
      savedProfile.communicationAuthoring.defaultSignature.length > 0;

    return [
      hasSavedSignature ? "Saved signature on" : "No saved signature",
      `${savedTemplateCount} ${
        savedTemplateCount === 1 ? "saved template" : "saved templates"
      }`,
    ];
  }, [savedProfile.communicationAuthoring]);

  const notificationSummaryFacts = useMemo(
    () => buildNotificationSummaryPills(savedProfile.notificationPreferences),
    [savedProfile.notificationPreferences],
  );
  const referenceMetadata = useMemo(
    () =>
      buildReferenceMetadata({
        authScopeId: clinicianIdentity.authScopeId,
        resolvedTimezone: workspacePreferences.resolvedTimezone,
        workingHoursSummary: workspacePreferences.workingHoursSummary,
      }),
    [
      clinicianIdentity.authScopeId,
      workspacePreferences.resolvedTimezone,
      workspacePreferences.workingHoursSummary,
    ],
  );

  function handleThemeModeChange(mode: ThemeMode): void {
    const nextMode = setThemeMode(mode);
    setThemeModeState(nextMode);
    setThemeNotice(
      nextMode === "system"
        ? "Theme set to system preference."
        : nextMode === "light"
          ? "Theme set to light."
          : "Theme set to dark.",
    );
  }

  const presentationStatus = presentationStatusQuery.data ?? null;
  const presentationBusy =
    loadPresentationMutation.isPending || resetPresentationMutation.isPending;
  const presentationError =
    presentationStatusQuery.error ??
    loadPresentationMutation.error ??
    resetPresentationMutation.error ??
    null;
  const presentationStatusUnavailable = Boolean(presentationStatusQuery.error);
  const presentationToolsPanel: SettingsPresentationToolsPanelVm | null =
    presentationToolsEnabled
      ? {
          status: presentationStatus,
          loading: presentationStatusQuery.isLoading,
          disabled: presentationStatus?.enabled === false,
          loaded: presentationStatus?.loaded === true,
          seedId: presentationStatus?.seedId ?? null,
          lastLoadedAtLabel: formatPresentationDate(
            presentationStatus?.lastLoadedAt ?? null,
          ),
          countsSummary: buildCountsSummary(presentationStatus),
          notice: presentationNotice,
          error: presentationError
            ? toUserMessage(presentationError)
            : null,
          loadLabel: loadPresentationMutation.isPending
            ? "Loading presentation data..."
            : "Load presentation data",
          resetLabel: resetPresentationMutation.isPending
            ? "Resetting presentation data..."
            : "Reset presentation data",
          loadDisabled:
            presentationBusy ||
            presentationStatusQuery.isLoading ||
            presentationStatusUnavailable ||
            !presentationStatus ||
            presentationStatus?.enabled === false,
          resetDisabled:
            presentationBusy ||
            presentationStatusQuery.isLoading ||
            presentationStatusUnavailable ||
            !presentationStatus ||
            presentationStatus?.enabled === false ||
            presentationStatus?.loaded !== true,
          onLoad: () => loadPresentationMutation.mutate(),
          onReset: () => resetPresentationMutation.mutate(),
        }
      : null;

  return {
    statusBar,
    profileSection: {
      summary: profileSummary,
      draftProfile,
      draftIdentityPreview,
      validation: profileValidation,
      dirty: profileWorkspaceDirty,
      notice: normalizeProfileFeedback(
        profileFeedbackScope,
        "profile",
        profileNotice,
      ),
      error: normalizeProfileFeedback(
        profileFeedbackScope,
        "profile",
        profileError,
      ),
      supportedTimeZones,
      photoAccept: buildPhotoAcceptValue(CLINICIAN_PROFILE_PHOTO_MIME_TYPES),
      onProfileFieldChange: updateDraftProfile,
      onWorkspaceFieldChange: updateDraftWorkspacePreference,
      onWorkingDayToggle: updateDraftWorkingDays,
      onWorkingTimeChange: updateDraftWorkingTime,
      onPhotoSelected: handlePhotoSelected,
      onRemovePhoto: handleRemovePhoto,
      onSave: () => handleSaveProfile("profile"),
    },
    communicationSection: {
      draft: draftProfile.communicationAuthoring,
      dirty: communicationAuthoringDirty,
      notice: normalizeProfileFeedback(
        profileFeedbackScope,
        "communication",
        profileNotice,
      ),
      error: normalizeProfileFeedback(
        profileFeedbackScope,
        "communication",
        profileError,
      ),
      templateValidation: profileValidation.communicationTemplates,
      summaryFacts: communicationSummaryFacts,
      onSignatureChange: (value) =>
        updateDraftCommunicationAuthoring("defaultSignature", value),
      onAutoAppendChange: (checked) =>
        updateDraftCommunicationAuthoring("autoAppendSignature", checked),
      onTemplateFieldChange: updateDraftCommunicationTemplate,
      onAddTemplate: addDraftCommunicationTemplate,
      onRemoveTemplate: removeDraftCommunicationTemplate,
      onSave: () => handleSaveProfile("communication"),
    },
    notificationSection: {
      draft: draftProfile.notificationPreferences,
      dirty: notificationPreferencesDirty,
      notice: normalizeProfileFeedback(
        profileFeedbackScope,
        "notifications",
        profileNotice,
      ),
      error: normalizeProfileFeedback(
        profileFeedbackScope,
        "notifications",
        profileError,
      ),
      quietHoursError: profileValidation.notificationQuietHours,
      summaryFacts: notificationSummaryFacts,
      onCueModeChange: updateDraftNotificationCueMode,
      onQuietHoursChange: updateDraftNotificationQuietHours,
      onSave: () => handleSaveProfile("notifications"),
    },
    appearancePanel: {
      themeMode,
      themeSummaryLabel,
      notice: themeNotice,
      onThemeModeChange: handleThemeModeChange,
    },
    sessionPanel: {
      settings: sessionSettings,
      badgeLabel: sessionSettings.enabled ? "Auto-logout on" : "Auto-logout off",
      summaryLabel: sessionSummaryLabel,
      warningLabel: timeoutWarningLabel,
      notice: sessionNotice,
      onUpdate: applySessionSettings,
      onRestoreDefaults: handleRestoreSessionDefaults,
    },
    referencePanel: {
      metadata: referenceMetadata,
    },
    presentationToolsPanel,
    maintenancePanel: {
      notice: normalizeProfileFeedback(
        profileFeedbackScope,
        "maintenance",
        profileNotice,
      ),
      onRestoreDefaults: handleRestoreProfileDefaults,
    },
  };
}

export {
  AVAILABILITY_STATUS_OPTIONS,
  CLINICIAN_COMMUNICATION_AUTHORING_LIMITS,
  CLINICIAN_PROFILE_LIMITS,
  COMMUNICATION_THREAD_VIEW_OPTIONS,
  LANDING_ROUTE_OPTIONS,
  PATIENT_TRIAGE_PRESETS,
  WORKING_DAY_OPTIONS,
};
