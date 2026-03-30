import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ClinicianAvatar } from '../components/ui/ClinicianAvatar';
import { Section } from '../components/ui/Section';
import { useClinicianIdentity } from '../hooks/useClinicianIdentity';
import { useClinicianWorkspacePreferences } from '../hooks/useClinicianWorkspacePreferences';
import {
  CLINICIAN_COMMUNICATION_AUTHORING_LIMITS,
  CLINICIAN_PROFILE_LIMITS,
  CLINICIAN_PROFILE_PHOTO_MIME_TYPES,
  MAX_CLINICIAN_PROFILE_PHOTO_BYTES,
  getClinicianProfile,
  getDefaultClinicianProfileForAuthIdentity,
  setClinicianProfile,
  type ClinicianAvailabilityStatus,
  type ClinicianCommunicationAuthoring,
  type ClinicianCommunicationTemplate,
  type ClinicianNotificationPreferences,
  type ClinicianProfile,
  type ClinicianProfilePhotoMime,
  type ClinicianWorkingDayToken,
} from '../services/clinicianProfile';
import {
  getClinicianInitials,
} from '../services/clinicianIdentity';
import {
  AVAILABILITY_STATUS_OPTIONS,
  LANDING_ROUTE_OPTIONS,
  WORKING_DAY_OPTIONS,
  getSupportedTimeZoneOptions,
} from '../services/clinicianWorkspacePreferences';
import {
  DEFAULT_SESSION_SETTINGS,
  getSessionSettings,
  setSessionSettings,
  type SessionSettings,
} from '../services/sessionSettings';
import { COMMUNICATION_THREAD_VIEW_OPTIONS } from '../services/communicationWorkspace';
import {
  getThemeMode,
  setThemeMode,
  subscribeThemeMode,
  type ThemeMode,
} from '../services/theme';
import { PATIENT_TRIAGE_PRESETS } from '../utils/patientFilters';

interface ProfileValidationState {
  displayName?: string;
  clinicianId?: string;
  workingHours?: string;
  communicationTemplates?: CommunicationTemplateValidationState[];
  notificationQuietHours?: string;
}

interface CommunicationTemplateValidationState {
  title?: string;
  body?: string;
}

function profileWorkspaceSectionsEqual(left: ClinicianProfile, right: ClinicianProfile): boolean {
  return JSON.stringify({
    ...left,
    communicationAuthoring: null,
    notificationPreferences: null,
  }) === JSON.stringify({
    ...right,
    communicationAuthoring: null,
    notificationPreferences: null,
  });
}

function validateProfile(profile: ClinicianProfile): ProfileValidationState {
  const next: ProfileValidationState = {};

  if (!profile.displayName.trim()) {
    next.displayName = 'Display name is required before saving.';
  }

  if (!profile.clinicianId.trim()) {
    next.clinicianId = 'Clinician ID is required before saving.';
  }

  const workingHours = profile.workspacePreferences.workingHours;
  const [startHours, startMinutes] = workingHours.startTime.split(':').map((value) => Number(value));
  const [endHours, endMinutes] = workingHours.endTime.split(':').map((value) => Number(value));
  const startSortValue = startHours * 60 + startMinutes;
  const endSortValue = endHours * 60 + endMinutes;

  if (workingHours.enabledDays.length === 0) {
    next.workingHours = 'Select at least one working day before saving.';
  } else if (!Number.isFinite(startSortValue) || !Number.isFinite(endSortValue)) {
    next.workingHours = 'Enter a valid start and end time before saving.';
  } else if (endSortValue <= startSortValue) {
    next.workingHours = 'End time must be later than the start time.';
  }

  const templateValidation = profile.communicationAuthoring.templates.map((template) => {
    const templateErrors: CommunicationTemplateValidationState = {};

    if (!template.title.trim()) {
      templateErrors.title = 'Template title is required.';
    }

    if (!template.body.trim()) {
      templateErrors.body = 'Template body is required.';
    }

    return templateErrors;
  });

  if (templateValidation.some((template) => template.title || template.body)) {
    next.communicationTemplates = templateValidation;
  }

  const quietHours = profile.notificationPreferences.quietHours;
  if (quietHours.enabled && quietHours.startTime === quietHours.endTime) {
    next.notificationQuietHours = 'Quiet hours start and end times must be different.';
  }

  return next;
}

function hasTemplateValidationErrors(validation: ProfileValidationState): boolean {
  return Boolean(
    validation.communicationTemplates?.some((template) => template.title || template.body),
  );
}

function createCommunicationTemplateDraft(): ClinicianCommunicationTemplate {
  return {
    id: `communication-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    body: '',
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('file-read-failed'));
    };

    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.trim()) {
        resolve(reader.result);
        return;
      }

      reject(new Error('file-read-empty'));
    };

    reader.readAsDataURL(file);
  });
}

export function SettingsPage(): JSX.Element {
  const initialProfile = useMemo(() => getClinicianProfile(), []);
  const clinicianIdentity = useClinicianIdentity();
  const workspacePreferences = useClinicianWorkspacePreferences();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getThemeMode());
  const [themeNotice, setThemeNotice] = useState<string | null>(null);
  const [savedProfile, setSavedProfile] = useState<ClinicianProfile>(() => initialProfile);
  const [draftProfile, setDraftProfile] = useState<ClinicianProfile>(() => initialProfile);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileFeedbackScope, setProfileFeedbackScope] = useState<
    'profile' | 'communication' | 'notifications'
  >('profile');
  const [profileValidation, setProfileValidation] = useState<ProfileValidationState>({});
  const [sessionSettings, setLocalSessionSettings] = useState<SessionSettings>(() =>
    getSessionSettings(),
  );
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const supportedTimeZones = useMemo(() => getSupportedTimeZoneOptions(), []);

  useEffect(() => {
    return subscribeThemeMode((mode) => {
      setThemeModeState(mode);
    });
  }, []);

  function applySessionSettings(update: Partial<SessionSettings>): void {
    const next = setSessionSettings(update);
    setLocalSessionSettings(next);
    setSessionNotice('Session security settings updated.');
  }

  function handleRestoreSessionDefaults(): void {
    const reset = setSessionSettings(DEFAULT_SESSION_SETTINGS);
    setLocalSessionSettings(reset);
    setSessionNotice('Session security settings reset to defaults.');
  }

  function updateDraftProfile<K extends keyof ClinicianProfile>(
    key: K,
    value: ClinicianProfile[K],
  ): void {
    setDraftProfile((current) => ({
      ...current,
      [key]: value,
    }));
    setProfileNotice(null);
    setProfileError(null);
    setProfileValidation((current) => ({
      ...current,
      [key]: undefined,
    }));
  }

  function updateDraftWorkspacePreference<
    K extends keyof ClinicianProfile['workspacePreferences'],
  >(
    key: K,
    value: ClinicianProfile['workspacePreferences'][K],
  ): void {
    setDraftProfile((current) => ({
      ...current,
      workspacePreferences: {
        ...current.workspacePreferences,
        [key]: value,
      },
    }));
    setProfileNotice(null);
    setProfileError(null);
    setProfileValidation((current) => ({
      ...current,
      workingHours: undefined,
    }));
  }

  function updateDraftCommunicationAuthoring<
    K extends keyof ClinicianCommunicationAuthoring,
  >(
    key: K,
    value: ClinicianCommunicationAuthoring[K],
  ): void {
    setDraftProfile((current) => ({
      ...current,
      communicationAuthoring: {
        ...current.communicationAuthoring,
        [key]: value,
      },
    }));
    setProfileNotice(null);
    setProfileError(null);
    setProfileValidation((current) => ({
      ...current,
      communicationTemplates: undefined,
    }));
  }

  function updateDraftCommunicationTemplate(
    templateId: string,
    key: keyof Pick<ClinicianCommunicationTemplate, 'title' | 'body'>,
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
    setProfileNotice(null);
    setProfileError(null);
    setProfileValidation((current) => ({
      ...current,
      communicationTemplates: undefined,
    }));
  }

  function updateDraftNotificationCueMode(
    key: keyof Pick<ClinicianNotificationPreferences, 'communication' | 'safety'>,
    value: ClinicianNotificationPreferences['communication']['cueMode'],
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
    setProfileNotice(null);
    setProfileError(null);
  }

  function updateDraftNotificationQuietHours(
    key: keyof ClinicianNotificationPreferences['quietHours'],
    value: ClinicianNotificationPreferences['quietHours'][typeof key],
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
    setProfileNotice(null);
    setProfileError(null);
    setProfileValidation((current) => ({
      ...current,
      notificationQuietHours: undefined,
    }));
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
    setProfileNotice(null);
    setProfileError(null);
    setProfileValidation((current) => ({
      ...current,
      communicationTemplates: undefined,
    }));
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
    setProfileNotice(null);
    setProfileError(null);
    setProfileValidation((current) => ({
      ...current,
      communicationTemplates: undefined,
    }));
  }

  function updateDraftWorkingDays(day: ClinicianWorkingDayToken, checked: boolean): void {
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
    setProfileNotice(null);
    setProfileError(null);
    setProfileValidation((current) => ({
      ...current,
      workingHours: undefined,
    }));
  }

  function updateDraftWorkingTime(
    key: 'startTime' | 'endTime',
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
    setProfileNotice(null);
    setProfileError(null);
    setProfileValidation((current) => ({
      ...current,
      workingHours: undefined,
    }));
  }

  async function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!CLINICIAN_PROFILE_PHOTO_MIME_TYPES.includes(file.type as ClinicianProfilePhotoMime)) {
      setProfileFeedbackScope('profile');
      setProfileError('Choose a JPG, PNG, or WebP image up to 500 KB.');
      setProfileNotice(null);
      return;
    }

    if (file.size > MAX_CLINICIAN_PROFILE_PHOTO_BYTES) {
      setProfileFeedbackScope('profile');
      setProfileError('Choose a JPG, PNG, or WebP image up to 500 KB.');
      setProfileNotice(null);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);

      updateDraftProfile('photo', {
        dataUrl,
        mimeType: file.type as ClinicianProfilePhotoMime,
        fileName: file.name,
        sizeBytes: file.size,
      });
      setProfileFeedbackScope('profile');
      setProfileNotice('Photo added to the form. Save to keep it in this browser.');
    } catch {
      setProfileFeedbackScope('profile');
      setProfileError('The selected image could not be read in this browser.');
      setProfileNotice(null);
    }
  }

  function handleSaveProfile(scope: 'profile' | 'communication' | 'notifications'): void {
    const nextValidation = validateProfile(draftProfile);
    setProfileValidation(nextValidation);

    if (scope === 'profile' && (nextValidation.displayName || nextValidation.clinicianId)) {
      setProfileFeedbackScope('profile');
      setProfileError('Display name and clinician ID are required before saving.');
      setProfileNotice(null);
      return;
    }

    if (scope === 'profile' && nextValidation.workingHours) {
      setProfileFeedbackScope('profile');
      setProfileError(nextValidation.workingHours);
      setProfileNotice(null);
      return;
    }

    if (scope === 'communication' && hasTemplateValidationErrors(nextValidation)) {
      setProfileFeedbackScope('communication');
      setProfileError('Complete or remove any blank communication templates before saving.');
      setProfileNotice(null);
      return;
    }

    if (scope === 'notifications' && nextValidation.notificationQuietHours) {
      setProfileFeedbackScope('notifications');
      setProfileError(nextValidation.notificationQuietHours);
      setProfileNotice(null);
      return;
    }

    const nextProfileToSave =
      scope === 'communication'
        ? {
            ...savedProfile,
            communicationAuthoring: draftProfile.communicationAuthoring,
          }
        : scope === 'notifications'
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
      setProfileError('Settings could not be saved in this browser right now.');
      setProfileNotice(null);
      return;
    }

    setSavedProfile(result.profile);
    setDraftProfile((current) =>
      scope === 'communication'
        ? {
            ...current,
            communicationAuthoring: result.profile.communicationAuthoring,
          }
        : scope === 'notifications'
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
      scope === 'communication'
        ? {
            ...current,
            communicationTemplates: undefined,
          }
        : scope === 'notifications'
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
    setProfileNotice('Settings saved in this browser.');
  }

  function handleRestoreProfileDefaults(): void {
    setDraftProfile(getDefaultClinicianProfileForAuthIdentity());
    setProfileValidation({});
    setProfileFeedbackScope('profile');
    setProfileError(null);
    setProfileNotice('Defaults restored in the form. Save to keep them in this browser.');
  }

  function handleRemovePhoto(): void {
    updateDraftProfile('photo', null);
    setProfileFeedbackScope('profile');
    setProfileNotice('Photo removed from the form. Save to keep the change.');
  }

  const themeSummaryLabel = useMemo(() => {
    if (themeMode === 'system') {
      return 'System';
    }
    if (themeMode === 'light') {
      return 'Light';
    }
    return 'Dark';
  }, [themeMode]);

  const sessionSummaryLabel = sessionSettings.enabled
    ? `${sessionSettings.idleMinutes}m idle · ${sessionSettings.absoluteHours}h max`
    : 'Auto-logout off';

  const draftIdentityPreview = {
    displayName:
      draftProfile.displayName.trim() ||
      draftProfile.clinicianId.trim() ||
      clinicianIdentity.displayName,
    initials: getClinicianInitials(draftProfile.displayName, draftProfile.clinicianId),
    photo: draftProfile.photo,
  };
  const savedIdentityFacts = [
    `ID: ${clinicianIdentity.clinicianId}`,
    clinicianIdentity.roleTitle,
    clinicianIdentity.specialty,
    clinicianIdentity.preferredPronouns,
  ].filter(Boolean) as string[];
  const savedWorkspaceFacts = [
    workspacePreferences.availabilityLabel,
    workspacePreferences.teamLabel || undefined,
    workspacePreferences.resolvedTimezone,
    workspacePreferences.workingHoursSummary,
  ].filter(Boolean) as string[];
  const savedWorkspaceDefaults = [
    `Opens to ${workspacePreferences.defaultLandingLabel}`,
    workspacePreferences.defaultPatientsPreset
      ? `Patients: ${workspacePreferences.defaultPatientsPresetLabel}`
      : undefined,
    workspacePreferences.defaultCommunicationFilter !== 'all'
      ? `Inbox: ${workspacePreferences.defaultCommunicationFilterLabel}`
      : undefined,
  ].filter(Boolean) as string[];
  const savedIdentitySupportLine = clinicianIdentity.secondaryLine || 'Local clinician profile';
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
  const savedTemplateCount = savedProfile.communicationAuthoring.templates.length;
  const hasSavedSignature = savedProfile.communicationAuthoring.defaultSignature.length > 0;
  const quietHoursValidationId = 'notification-quiet-hours-error';
  const savedCommunicationCueLabel =
    savedProfile.notificationPreferences.communication.cueMode === 'reduced'
      ? 'Communication cues reduced'
      : 'Communication cues default';
  const savedSafetyCueLabel =
    savedProfile.notificationPreferences.safety.cueMode === 'reduced'
      ? 'Safety cues reduced'
      : 'Safety cues default';
  const savedQuietHoursLabel = savedProfile.notificationPreferences.quietHours.enabled
    ? `Quiet hours ${savedProfile.notificationPreferences.quietHours.startTime} - ${savedProfile.notificationPreferences.quietHours.endTime}`
    : 'Quiet hours off';
  const communicationSummaryBadgeLabel = `${savedTemplateCount} ${savedTemplateCount === 1 ? 'template' : 'templates'}`;
  const notificationSummaryBadgeLabel = savedProfile.notificationPreferences.quietHours.enabled
    ? 'Quiet hours on'
    : 'Quiet hours off';
  const sessionProtectionBadgeLabel = sessionSettings.enabled ? 'Auto-logout on' : 'Auto-logout off';
  const workspaceStateSummaryLabel =
    profileWorkspaceDirty || communicationAuthoringDirty || notificationPreferencesDirty
      ? 'Draft changes pending'
      : 'Workspace state saved';
  const timeoutWarningLabel = sessionSettings.enabled
    ? 'Warns 1m before idle lock and 5m before max session.'
    : 'Protection warnings resume when session guard is on.';

  return (
    <div className="page-stack dashboard-page-shell dashboard-page-shell--settings settings-page settings-page--workspace-phase4">
      <Section
        className="dashboard-page-header dashboard-page-header--settings settings-page-header"
        eyebrow="Workspace"
        title="Workspace"
        subtitle="Local clinician controls for this workstation."
      />

      <section className="settings-control-bar" aria-label="Workspace control bar">
        <div className="settings-control-bar__status" aria-live="polite">
          <span className="settings-control-bar__pill settings-control-bar__pill--state">
            {workspaceStateSummaryLabel}
          </span>
          <span className="settings-control-bar__pill">{`${themeSummaryLabel} mode`}</span>
          <span className="settings-control-bar__pill">{sessionProtectionBadgeLabel}</span>
          <span className="settings-control-bar__pill">{notificationSummaryBadgeLabel}</span>
          <span className="settings-control-bar__pill settings-control-bar__pill--local">
            This browser only
          </span>
        </div>

        <div className="settings-control-bar__controls">
          <fieldset
            className="setting-item setting-item--field setting-item--theme settings-control-bar__control settings-control-bar__control--theme"
            aria-label="Theme mode"
          >
            <legend>
              <strong>Theme mode</strong>
              <small>System follows your OS preference by default.</small>
            </legend>
            <div className="theme-mode-group" role="radiogroup" aria-label="Theme mode">
              <label className="theme-mode-option" htmlFor="theme-mode-system">
                <input
                  id="theme-mode-system"
                  type="radio"
                  name="theme-mode"
                  value="system"
                  checked={themeMode === 'system'}
                  onChange={(event) => {
                    if (event.target.checked) {
                      const nextMode = setThemeMode('system');
                      setThemeModeState(nextMode);
                      setThemeNotice('Theme set to system preference.');
                    }
                  }}
                />
                <span>System</span>
              </label>

              <label className="theme-mode-option" htmlFor="theme-mode-light">
                <input
                  id="theme-mode-light"
                  type="radio"
                  name="theme-mode"
                  value="light"
                  checked={themeMode === 'light'}
                  onChange={(event) => {
                    if (event.target.checked) {
                      const nextMode = setThemeMode('light');
                      setThemeModeState(nextMode);
                      setThemeNotice('Theme set to light.');
                    }
                  }}
                />
                <span>Light</span>
              </label>

              <label className="theme-mode-option" htmlFor="theme-mode-dark">
                <input
                  id="theme-mode-dark"
                  type="radio"
                  name="theme-mode"
                  value="dark"
                  checked={themeMode === 'dark'}
                  onChange={(event) => {
                    if (event.target.checked) {
                      const nextMode = setThemeMode('dark');
                      setThemeModeState(nextMode);
                      setThemeNotice('Theme set to dark.');
                    }
                  }}
                />
                <span>Dark</span>
              </label>
            </div>
          </fieldset>

          <label
            className="setting-item setting-item--toggle settings-control-bar__control"
            htmlFor="idle-timeout-enabled-toggle"
          >
            <span>
              <strong>Enable idle auto-logout</strong>
              <small>Lock unattended sessions for patient safety.</small>
            </span>
            <input
              id="idle-timeout-enabled-toggle"
              type="checkbox"
              checked={sessionSettings.enabled}
              onChange={(event) => {
                applySessionSettings({ enabled: event.target.checked });
              }}
            />
          </label>

          <label
            className="setting-item setting-item--field form-field settings-control-bar__control"
            htmlFor="idle-timeout-minutes"
          >
            <span>
              <strong>Idle timeout</strong>
              <small>Show warning 60 seconds before lock.</small>
            </span>
            <select
              id="idle-timeout-minutes"
              value={String(sessionSettings.idleMinutes)}
              onChange={(event) => {
                applySessionSettings({ idleMinutes: Number(event.target.value) });
              }}
              aria-label="Idle timeout minutes"
            >
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
            </select>
          </label>

          <label
            className="setting-item setting-item--field form-field settings-control-bar__control"
            htmlFor="absolute-timeout-hours"
          >
            <span>
              <strong>Absolute session timeout</strong>
              <small>Show warning 5 minutes before maximum session duration.</small>
            </span>
            <select
              id="absolute-timeout-hours"
              value={String(sessionSettings.absoluteHours)}
              onChange={(event) => {
                applySessionSettings({ absoluteHours: Number(event.target.value) });
              }}
              aria-label="Absolute timeout hours"
            >
              <option value="2">2 hours</option>
              <option value="4">4 hours</option>
              <option value="8">8 hours</option>
            </select>
          </label>

          <label
            className="setting-item setting-item--toggle settings-control-bar__control"
            htmlFor="notification-quiet-hours-enabled"
          >
            <span>
              <strong>Quiet hours</strong>
              <small>Reduce secondary in-app emphasis only in this browser.</small>
            </span>
            <input
              id="notification-quiet-hours-enabled"
              type="checkbox"
              checked={draftProfile.notificationPreferences.quietHours.enabled}
              onChange={(event) =>
                updateDraftNotificationQuietHours('enabled', event.target.checked)
              }
            />
          </label>
        </div>

        {(themeNotice || sessionNotice) ? (
          <div className="settings-control-bar__notices" aria-live="polite">
            {themeNotice ? (
              <p className="settings-inline-notice muted-text" role="status">
                {themeNotice}
              </p>
            ) : null}
            {sessionNotice ? (
              <p className="settings-inline-notice muted-text" role="status">
                {sessionNotice}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="settings-workspace-layout" aria-label="Workspace control center">
        <section className="settings-workspace-main" aria-label="Primary workspace settings">
          <Card
            className="settings-group-card settings-group-card--identity settings-group-card--primary"
            title={
              <span className="settings-group-card__title">
                Clinician profile and workspace defaults
                <span className="settings-group-card__title-meta">
                  Browser-local identity and opening defaults
                </span>
              </span>
            }
            action={<Badge variant="default">{workspacePreferences.availabilityLabel}</Badge>}
          >
            <div className="settings-group-card__context">
              <span className="settings-group-card__context-pill">This browser only</span>
              <p className="settings-group-card__context-note">
                Saved locally for this clinician in this browser.
              </p>
            </div>

            <div className="settings-profile-reference-grid">
              <section
                className="settings-profile-summary settings-profile-summary--reference"
                aria-label="Saved clinician profile summary"
              >
                <ClinicianAvatar
                  identity={clinicianIdentity}
                  className="settings-profile-summary__avatar"
                  decorative
                  size="lg"
                />
                <div className="settings-profile-summary__copy">
                  <p className="settings-profile-summary__name">{clinicianIdentity.displayName}</p>
                  <p className="settings-profile-summary__meta">{savedIdentitySupportLine}</p>
                  <div
                    className="settings-profile-summary__facts"
                    aria-label="Saved clinician profile facts"
                  >
                    {savedIdentityFacts.map((fact) => (
                      <span key={fact} className="settings-profile-summary__fact">
                        {fact}
                      </span>
                    ))}
                  </div>
                  <div
                    className="settings-profile-summary__facts"
                    aria-label="Saved workspace preference facts"
                  >
                    {savedWorkspaceFacts.map((fact) => (
                      <span key={fact} className="settings-profile-summary__fact">
                        {fact}
                      </span>
                    ))}
                  </div>
                  {savedWorkspaceDefaults.length > 0 ? (
                    <p className="settings-profile-summary__body settings-profile-summary__body--secondary">
                      {savedWorkspaceDefaults.join(' · ')}
                    </p>
                  ) : null}
                  {clinicianIdentity.bio ? (
                    <p className="settings-profile-summary__body">{clinicianIdentity.bio}</p>
                  ) : null}
                  {clinicianIdentity.contactNote ? (
                    <p className="settings-profile-summary__body settings-profile-summary__body--secondary">
                      {clinicianIdentity.contactNote}
                    </p>
                  ) : null}
                  <p className="settings-profile-summary__note">
                    Saved locally for this clinician in this browser. Changes do not sync across
                    devices.
                  </p>
                </div>
              </section>

              <section className="settings-profile-photo" aria-label="Profile photo">
                <ClinicianAvatar
                  identity={draftIdentityPreview}
                  className="settings-profile-photo__preview"
                  decorative
                  size="lg"
                />
                <div className="settings-profile-photo__copy">
                  <p className="settings-profile-photo__title">Profile photo</p>
                  <p className="settings-profile-photo__text">
                    Profile photo stays in this browser after you save it. Use JPG, PNG, or WebP up
                    to 500 KB.
                  </p>
                  <div className="inline-actions settings-actions settings-actions--profile-photo">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => profilePhotoInputRef.current?.click()}
                    >
                      {draftProfile.photo ? 'Replace photo' : 'Choose photo'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemovePhoto}
                      disabled={!draftProfile.photo}
                    >
                      Remove photo
                    </Button>
                  </div>
                </div>
                <input
                  ref={profilePhotoInputRef}
                  className="visually-hidden"
                  type="file"
                  accept={CLINICIAN_PROFILE_PHOTO_MIME_TYPES.join(',')}
                  onChange={(event) => {
                    void handlePhotoSelection(event);
                  }}
                />
              </section>
            </div>

            <div className="settings-profile-editor settings-profile-editor--workspace">
              <section
                className="workspace-form-zone workspace-form-zone--profile"
                aria-label="Profile settings"
              >
                <div className="workspace-form-zone__header">
                  <h4 className="workspace-form-zone__title">Clinician identity and handoff</h4>
                  <p className="workspace-form-zone__text">
                    Edit the local clinician identity and handoff context used on this workstation.
                  </p>
                </div>

                <section className="settings-field-cluster settings-field-cluster--identity">
                  <div className="settings-profile-section-label">Identity</div>
                  <div className="settings-field-cluster__grid settings-field-cluster__grid--identity">
                  <label className="setting-item setting-item--field form-field" htmlFor="clinician-display-name-input">
                    <span>
                      <strong>Display name</strong>
                      <small>Shown in browser-local clinician identity surfaces.</small>
                      {profileValidation.displayName ? (
                        <small className="validation-text">{profileValidation.displayName}</small>
                      ) : null}
                    </span>
                    <input
                      id="clinician-display-name-input"
                      type="text"
                      value={draftProfile.displayName}
                      maxLength={CLINICIAN_PROFILE_LIMITS.displayName}
                      onChange={(event) => updateDraftProfile('displayName', event.target.value)}
                      placeholder="Clinician 1"
                      aria-label="Clinician display name"
                    />
                  </label>

                  <label className="setting-item setting-item--field form-field" htmlFor="clinician-id-input">
                    <span>
                      <strong>Clinician ID</strong>
                      <small>
                        Editable for workspace labeling. It does not change which clinician profile this browser is currently using.
                      </small>
                      {profileValidation.clinicianId ? (
                        <small className="validation-text">{profileValidation.clinicianId}</small>
                      ) : null}
                    </span>
                    <input
                      id="clinician-id-input"
                      type="text"
                      value={draftProfile.clinicianId}
                      maxLength={CLINICIAN_PROFILE_LIMITS.clinicianId}
                      onChange={(event) => updateDraftProfile('clinicianId', event.target.value)}
                      placeholder="clinician-1"
                      aria-label="Clinician ID"
                    />
                  </label>

                  <label className="setting-item setting-item--field form-field" htmlFor="clinician-role-title-input">
                    <span>
                      <strong>Role / title</strong>
                      <small>Use a local operational title for this clinician workspace.</small>
                    </span>
                    <input
                      id="clinician-role-title-input"
                      type="text"
                      value={draftProfile.roleTitle}
                      maxLength={CLINICIAN_PROFILE_LIMITS.roleTitle}
                      onChange={(event) => updateDraftProfile('roleTitle', event.target.value)}
                      placeholder="Rehab clinician"
                      aria-label="Clinician role or title"
                    />
                  </label>

                  <label className="setting-item setting-item--field form-field" htmlFor="clinician-specialty-input">
                    <span>
                      <strong>Specialty</strong>
                      <small>Keep the specialty label brief and clinically relevant.</small>
                    </span>
                    <input
                      id="clinician-specialty-input"
                      type="text"
                      value={draftProfile.specialty}
                      maxLength={CLINICIAN_PROFILE_LIMITS.specialty}
                      onChange={(event) => updateDraftProfile('specialty', event.target.value)}
                      placeholder="Recovery follow-up"
                      aria-label="Clinician specialty"
                    />
                  </label>
                  </div>
                </section>

                <section className="settings-field-cluster settings-field-cluster--context">
                  <div className="settings-profile-section-label">Care focus & handoff</div>
                  <div className="settings-field-cluster__grid settings-field-cluster__grid--context">
                  <label className="setting-item setting-item--field form-field" htmlFor="clinician-bio-input">
                    <span>
                      <strong>Short bio / care focus</strong>
                      <small>Use a concise note for how this clinician workspace is framed locally.</small>
                    </span>
                    <textarea
                      id="clinician-bio-input"
                      value={draftProfile.bio}
                      maxLength={CLINICIAN_PROFILE_LIMITS.bio}
                      onChange={(event) => updateDraftProfile('bio', event.target.value)}
                      placeholder="Safety-aware rehab follow-up and review."
                      aria-label="Short bio or care focus"
                    />
                  </label>

                  <label className="setting-item setting-item--field form-field" htmlFor="clinician-pronouns-input">
                    <span>
                      <strong>Preferred pronouns</strong>
                      <small>Optional. Stored only in this browser.</small>
                    </span>
                    <input
                      id="clinician-pronouns-input"
                      type="text"
                      value={draftProfile.preferredPronouns ?? ''}
                      maxLength={CLINICIAN_PROFILE_LIMITS.preferredPronouns}
                      onChange={(event) => updateDraftProfile('preferredPronouns', event.target.value || undefined)}
                      placeholder="Optional"
                      aria-label="Preferred pronouns"
                    />
                  </label>

                  <label className="setting-item setting-item--field form-field" htmlFor="clinician-contact-note-input">
                    <span>
                      <strong>Contact / handoff note</strong>
                      <small>Use this for local handoff context, not shared contact management.</small>
                    </span>
                    <textarea
                      id="clinician-contact-note-input"
                      value={draftProfile.contactNote}
                      maxLength={CLINICIAN_PROFILE_LIMITS.contactNote}
                      onChange={(event) => updateDraftProfile('contactNote', event.target.value)}
                      placeholder="Local handoff note for this browser workspace."
                      aria-label="Contact or handoff note"
                    />
                  </label>
                  </div>
                </section>
              </section>

              <section
                className="workspace-form-zone workspace-form-zone--defaults"
                aria-label="Workspace defaults settings"
              >
                <div className="workspace-form-zone__header">
                  <h4 className="workspace-form-zone__title">Daily context and opening defaults</h4>
                  <p className="workspace-form-zone__text">
                    Set local availability, working context, and fallback opening defaults for this
                    browser.
                  </p>
                </div>

                <section className="settings-field-cluster settings-field-cluster--workspace">
                  <div className="settings-profile-section-label">Workspace context</div>
                  <div className="settings-field-cluster__grid settings-field-cluster__grid--workspace">
                  <label className="setting-item setting-item--field form-field" htmlFor="workspace-availability-select">
                    <span>
                      <strong>Availability status</strong>
                      <small>Local workspace status only. It does not broadcast to other clinicians.</small>
                    </span>
                    <select
                      id="workspace-availability-select"
                      value={draftProfile.workspacePreferences.availabilityStatus}
                      onChange={(event) =>
                        updateDraftWorkspacePreference(
                          'availabilityStatus',
                          event.target.value as ClinicianAvailabilityStatus,
                        )
                      }
                      aria-label="Availability status"
                    >
                      {AVAILABILITY_STATUS_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="setting-item setting-item--field form-field" htmlFor="workspace-team-label-input">
                    <span>
                      <strong>Team / clinic label</strong>
                      <small>Optional local context for this clinician workspace.</small>
                    </span>
                    <input
                      id="workspace-team-label-input"
                      type="text"
                      value={draftProfile.workspacePreferences.teamLabel}
                      maxLength={CLINICIAN_PROFILE_LIMITS.teamLabel}
                      onChange={(event) => updateDraftWorkspacePreference('teamLabel', event.target.value)}
                      placeholder="Optional team or clinic"
                      aria-label="Team or clinic label"
                    />
                  </label>

                  <label className="setting-item setting-item--field form-field" htmlFor="workspace-timezone-input">
                    <span>
                      <strong>Timezone</strong>
                      <small>
                        Used for this browser workspace. Aura falls back safely to the current browser timezone if needed.
                      </small>
                    </span>
                    <input
                      id="workspace-timezone-input"
                      type="text"
                      list="settings-timezone-options"
                      value={draftProfile.workspacePreferences.timezone}
                      maxLength={CLINICIAN_PROFILE_LIMITS.timezone}
                      onChange={(event) => updateDraftWorkspacePreference('timezone', event.target.value)}
                      placeholder={workspacePreferences.resolvedTimezone}
                      aria-label="Workspace timezone"
                    />
                  </label>

                  <fieldset
                    className="setting-item setting-item--field form-field settings-working-hours"
                    aria-label="Working hours"
                  >
                    <legend>
                      <strong>Working hours</strong>
                      <small>
                        Simple local context only. Aura does not derive availability or scheduling from this automatically.
                      </small>
                      {profileValidation.workingHours ? (
                        <small className="validation-text">{profileValidation.workingHours}</small>
                      ) : null}
                    </legend>
                    <div className="settings-working-hours__days" role="group" aria-label="Working days">
                      {WORKING_DAY_OPTIONS.map((day) => {
                        const checked = draftProfile.workspacePreferences.workingHours.enabledDays.includes(day.id);

                        return (
                          <label key={day.id} className="settings-working-hours__day">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => updateDraftWorkingDays(day.id, event.target.checked)}
                              aria-label={day.label}
                            />
                            <span>{day.shortLabel}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="settings-working-hours__times">
                      <label className="settings-working-hours__time-field" htmlFor="workspace-start-time">
                        <span>Start</span>
                        <input
                          id="workspace-start-time"
                          type="time"
                          value={draftProfile.workspacePreferences.workingHours.startTime}
                          onChange={(event) => updateDraftWorkingTime('startTime', event.target.value)}
                          aria-label="Working hours start time"
                        />
                      </label>
                      <label className="settings-working-hours__time-field" htmlFor="workspace-end-time">
                        <span>End</span>
                        <input
                          id="workspace-end-time"
                          type="time"
                          value={draftProfile.workspacePreferences.workingHours.endTime}
                          onChange={(event) => updateDraftWorkingTime('endTime', event.target.value)}
                          aria-label="Working hours end time"
                        />
                      </label>
                    </div>
                  </fieldset>
                  </div>
                </section>

                <section className="settings-field-cluster settings-field-cluster--defaults">
                  <div className="settings-profile-section-label">Daily defaults</div>
                  <div className="settings-field-cluster__grid settings-field-cluster__grid--defaults">
                  <label className="setting-item setting-item--field form-field" htmlFor="workspace-default-landing-select">
                    <span>
                      <strong>Default landing route</strong>
                      <small>Used only when Aura opens without a stronger redirect or deep link intent.</small>
                    </span>
                    <select
                      id="workspace-default-landing-select"
                      value={draftProfile.workspacePreferences.defaultLandingRoute}
                      onChange={(event) =>
                        updateDraftWorkspacePreference('defaultLandingRoute', event.target.value as ClinicianProfile['workspacePreferences']['defaultLandingRoute'])
                      }
                      aria-label="Default landing route"
                    >
                      {LANDING_ROUTE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="setting-item setting-item--field form-field" htmlFor="workspace-default-patients-preset-select">
                    <span>
                      <strong>Default Patients preset</strong>
                      <small>Applied only on a clean Patients entry when no stronger saved roster state exists.</small>
                    </span>
                    <select
                      id="workspace-default-patients-preset-select"
                      value={draftProfile.workspacePreferences.defaultPatientsPreset}
                      onChange={(event) =>
                        updateDraftWorkspacePreference(
                          'defaultPatientsPreset',
                          event.target.value as ClinicianProfile['workspacePreferences']['defaultPatientsPreset'],
                        )
                      }
                      aria-label="Default Patients preset"
                    >
                      <option value="">No default preset</option>
                      {PATIENT_TRIAGE_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="setting-item setting-item--field form-field" htmlFor="workspace-default-communication-filter-select">
                    <span>
                      <strong>Default Communication filter</strong>
                      <small>Applied only when Communication opens without an explicit filter in the route.</small>
                    </span>
                    <select
                      id="workspace-default-communication-filter-select"
                      value={draftProfile.workspacePreferences.defaultCommunicationFilter}
                      onChange={(event) =>
                        updateDraftWorkspacePreference(
                          'defaultCommunicationFilter',
                          event.target.value as ClinicianProfile['workspacePreferences']['defaultCommunicationFilter'],
                        )
                      }
                      aria-label="Default Communication filter"
                    >
                      {COMMUNICATION_THREAD_VIEW_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  </div>
                </section>
              </section>
            </div>

            <datalist id="settings-timezone-options">
              {supportedTimeZones.map((timeZone) => (
                <option key={timeZone} value={timeZone} />
              ))}
            </datalist>

            <div className="settings-card-footer">
              <p className="settings-card-footer__note">
                {profileWorkspaceDirty
                  ? 'Changes stay local to this browser after you save them.'
                  : 'This saved profile is local to this browser and does not sync across devices.'}
              </p>
              <div className="inline-actions settings-actions settings-actions--primary settings-actions--identity">
                <Button onClick={() => handleSaveProfile('profile')} disabled={!profileWorkspaceDirty}>
                  Save profile
                </Button>
              </div>
            </div>

            {profileFeedbackScope === 'profile' && profileError ? (
              <p
                className="settings-inline-notice settings-inline-notice--error"
                role="alert"
                aria-live="assertive"
              >
                {profileError}
              </p>
            ) : null}

            {profileFeedbackScope === 'profile' && profileNotice ? (
              <p className="settings-inline-notice muted-text" role="status" aria-live="polite">
                {profileNotice}
              </p>
            ) : null}
          </Card>

          <Card
            className="settings-group-card settings-group-card--communication-authoring settings-group-card--primary"
            title={
              <span className="settings-group-card__title">
                Communication authoring
                <span className="settings-group-card__title-meta">
                  Browser-local reply helpers
                </span>
              </span>
            }
            action={<Badge variant="default">{communicationSummaryBadgeLabel}</Badge>}
          >
            <div className="settings-group-card__context">
              <span className="settings-group-card__context-pill">This browser only</span>
              <p className="settings-group-card__context-note">
                Signature and templates stay local to this clinician in this browser.
              </p>
            </div>

            <div className="settings-communication-authoring__summary" aria-live="polite">
              <span className="settings-profile-summary__fact">
                {hasSavedSignature ? 'Saved signature on' : 'No saved signature'}
              </span>
              <span className="settings-profile-summary__fact">
                {savedTemplateCount}{' '}
                {savedTemplateCount === 1 ? 'saved template' : 'saved templates'}
              </span>
            </div>

            <div className="settings-list settings-list--refined">
              <label
                className="setting-item setting-item--field form-field"
                htmlFor="communication-default-signature"
              >
                <span>
                  <strong>Default signature</strong>
                  <small>Plain text only. Whitespace-only signatures save as empty.</small>
                </span>
                <textarea
                  id="communication-default-signature"
                  value={draftProfile.communicationAuthoring.defaultSignature}
                  maxLength={CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.signature}
                  onChange={(event) =>
                    updateDraftCommunicationAuthoring('defaultSignature', event.target.value)
                  }
                  placeholder="Optional local signature for clinician replies."
                  aria-label="Default signature"
                />
              </label>

              <label
                className="setting-item setting-item--toggle"
                htmlFor="communication-auto-append-signature"
              >
                <span>
                  <strong>Auto-append signature on fresh Communication drafts</strong>
                  <small>
                    Only applies when a Communication thread opens with a genuinely fresh empty
                    draft in this browser.
                  </small>
                </span>
                <input
                  id="communication-auto-append-signature"
                  type="checkbox"
                  checked={draftProfile.communicationAuthoring.autoAppendSignature}
                  onChange={(event) =>
                    updateDraftCommunicationAuthoring(
                      'autoAppendSignature',
                      event.target.checked,
                    )
                  }
                />
              </label>

              <div className="settings-profile-section-label">Quick reply templates</div>
              <div
                className="settings-communication-authoring__templates"
                aria-label="Communication templates"
              >
                {draftProfile.communicationAuthoring.templates.length === 0 ? (
                  <p className="settings-communication-authoring__empty muted-text">
                    No saved templates yet. Add only the reply starters you actually reuse here.
                  </p>
                ) : null}

                {draftProfile.communicationAuthoring.templates.map((template, index) => {
                  const templateValidation = profileValidation.communicationTemplates?.[index];
                  const titleId = `communication-template-title-${template.id}`;
                  const bodyId = `communication-template-body-${template.id}`;

                  return (
                    <article
                      key={template.id}
                      className="settings-communication-template"
                      aria-label={`Template ${index + 1}`}
                    >
                      <div className="settings-communication-template__fields">
                        <label className="form-field" htmlFor={titleId}>
                          <span>
                            <strong>{`Template ${index + 1} title`}</strong>
                            {templateValidation?.title ? (
                              <small className="validation-text">{templateValidation.title}</small>
                            ) : (
                              <small>Short internal label for the picker.</small>
                            )}
                          </span>
                          <input
                            id={titleId}
                            type="text"
                            value={template.title}
                            maxLength={CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templateTitle}
                            onChange={(event) =>
                              updateDraftCommunicationTemplate(
                                template.id,
                                'title',
                                event.target.value,
                              )
                            }
                            aria-label={`Template ${index + 1} title`}
                          />
                        </label>

                        <label className="form-field" htmlFor={bodyId}>
                          <span>
                            <strong>{`Template ${index + 1} body`}</strong>
                            {templateValidation?.body ? (
                              <small className="validation-text">{templateValidation.body}</small>
                            ) : (
                              <small>Editable plain-text draft starter only.</small>
                            )}
                          </span>
                          <textarea
                            id={bodyId}
                            value={template.body}
                            maxLength={CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templateBody}
                            onChange={(event) =>
                              updateDraftCommunicationTemplate(
                                template.id,
                                'body',
                                event.target.value,
                              )
                            }
                            aria-label={`Template ${index + 1} body`}
                          />
                        </label>
                      </div>

                      <div className="settings-communication-template__actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDraftCommunicationTemplate(template.id)}
                          aria-label={`Remove template ${index + 1}`}
                        >
                          Remove template
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="settings-card-footer">
              <p className="settings-card-footer__note">
                Templates stay in saved order, new templates append to the end, and inserted text
                remains editable before sending.
              </p>
              <div className="inline-actions settings-actions settings-actions--primary settings-actions--communication">
                <Button
                  variant="secondary"
                  onClick={addDraftCommunicationTemplate}
                  disabled={
                    draftProfile.communicationAuthoring.templates.length >=
                    CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templates
                  }
                >
                  Add template
                </Button>
                <Button
                  onClick={() => handleSaveProfile('communication')}
                  disabled={!communicationAuthoringDirty}
                >
                  Save communication settings
                </Button>
              </div>
            </div>

            {profileFeedbackScope === 'communication' && profileError ? (
              <p
                className="settings-inline-notice settings-inline-notice--error"
                role="alert"
                aria-live="assertive"
              >
                {profileError}
              </p>
            ) : null}

            {profileFeedbackScope === 'communication' && profileNotice ? (
              <p className="settings-inline-notice muted-text" role="status" aria-live="polite">
                {profileNotice}
              </p>
            ) : null}
          </Card>
        </section>

        <aside className="settings-workspace-support" aria-label="Workspace support rail">
          <Card
            className="settings-group-card settings-group-card--notification-preferences settings-group-card--support"
            title={
              <span className="settings-group-card__title">
                Notification preferences
                <span className="settings-group-card__title-meta">Local attention cues</span>
              </span>
            }
            action={<Badge variant="default">{notificationSummaryBadgeLabel}</Badge>}
          >
            <div className="settings-group-card__context">
              <span className="settings-group-card__context-pill">This browser only</span>
              <p className="settings-group-card__context-note">
                Local attention cues in this browser only.
              </p>
            </div>

            <div className="settings-notification-preferences__summary" aria-live="polite">
              <span className="settings-profile-summary__fact">{savedCommunicationCueLabel}</span>
              <span className="settings-profile-summary__fact">{savedSafetyCueLabel}</span>
              <span className="settings-profile-summary__fact">{savedQuietHoursLabel}</span>
            </div>

            <div className="settings-list settings-list--refined">
              <label
                className="setting-item setting-item--field form-field"
                htmlFor="notification-communication-cue-mode"
              >
                <span>
                  <strong>Communication attention cues</strong>
                  <small>
                    Reduce extra Communication-page and Home communication emphasis only. Thread
                    badges and current content stay visible.
                  </small>
                </span>
                <select
                  id="notification-communication-cue-mode"
                  value={draftProfile.notificationPreferences.communication.cueMode}
                  onChange={(event) =>
                    updateDraftNotificationCueMode('communication', event.target.value as 'default' | 'reduced')
                  }
                  aria-label="Communication attention cues"
                >
                  <option value="default">Default</option>
                  <option value="reduced">Reduced</option>
                </select>
              </label>

              <label
                className="setting-item setting-item--field form-field"
                htmlFor="notification-safety-cue-mode"
              >
                <span>
                  <strong>Safety alert arrival cues</strong>
                  <small>
                    Reduce transient new-alert emphasis only. Unseen state, filters, and alert
                    visibility stay intact.
                  </small>
                </span>
                <select
                  id="notification-safety-cue-mode"
                  value={draftProfile.notificationPreferences.safety.cueMode}
                  onChange={(event) =>
                    updateDraftNotificationCueMode('safety', event.target.value as 'default' | 'reduced')
                  }
                  aria-label="Safety alert arrival cues"
                >
                  <option value="default">Default</option>
                  <option value="reduced">Reduced</option>
                </select>
              </label>

              <div className="settings-notification-preferences__quiet-panel">
                <div className="settings-notification-preferences__quiet-copy">
                  <p className="settings-profile-section-label">Quiet hours window</p>
                  <p className="settings-group-card__context-note">
                    Quiet hours stay controlled from the quick band above so session protection remains easy to reach early.
                  </p>
                </div>

                {draftProfile.notificationPreferences.quietHours.enabled ? (
                  <div className="settings-notification-preferences__quiet-hours">
                    <label
                      className="setting-item setting-item--field form-field"
                      htmlFor="notification-quiet-hours-start"
                    >
                      <span>
                        <strong>Quiet hours start</strong>
                        <small>Local browser time.</small>
                      </span>
                      <input
                        id="notification-quiet-hours-start"
                        type="time"
                        value={draftProfile.notificationPreferences.quietHours.startTime}
                        onChange={(event) =>
                          updateDraftNotificationQuietHours('startTime', event.target.value)
                        }
                        aria-label="Quiet hours start time"
                        aria-invalid={profileValidation.notificationQuietHours ? 'true' : undefined}
                        aria-describedby={
                          profileValidation.notificationQuietHours
                            ? quietHoursValidationId
                            : undefined
                        }
                      />
                    </label>

                    <label
                      className="setting-item setting-item--field form-field"
                      htmlFor="notification-quiet-hours-end"
                    >
                      <span>
                        <strong>Quiet hours end</strong>
                        <small>Local browser time.</small>
                      </span>
                      <input
                        id="notification-quiet-hours-end"
                        type="time"
                        value={draftProfile.notificationPreferences.quietHours.endTime}
                        onChange={(event) =>
                          updateDraftNotificationQuietHours('endTime', event.target.value)
                        }
                        aria-label="Quiet hours end time"
                        aria-invalid={profileValidation.notificationQuietHours ? 'true' : undefined}
                        aria-describedby={
                          profileValidation.notificationQuietHours
                            ? quietHoursValidationId
                            : undefined
                        }
                      />
                    </label>
                  </div>
                ) : (
                  <div className="settings-notification-preferences__quiet-empty">
                    <p className="muted-text">
                      Quiet hours are currently off for this browser. Turn them on in quick controls to set a local window.
                    </p>
                  </div>
                )}
              </div>

              {profileValidation.notificationQuietHours ? (
                <p
                  id={quietHoursValidationId}
                  className="validation-text"
                  role="alert"
                  aria-live="assertive"
                >
                  {profileValidation.notificationQuietHours}
                </p>
              ) : null}
            </div>

            <div className="settings-card-footer">
              <p className="settings-card-footer__note">
                These settings tune local in-app attention cues only. They do not affect core alert
                visibility, unread state, or anything outside this browser.
              </p>
              <div className="inline-actions settings-actions settings-actions--primary settings-actions--notifications">
                <Button
                  onClick={() => handleSaveProfile('notifications')}
                  disabled={!notificationPreferencesDirty}
                >
                  Save notification settings
                </Button>
              </div>
            </div>

            {profileFeedbackScope === 'notifications' && profileError ? (
              <p
                className="settings-inline-notice settings-inline-notice--error"
                role="alert"
                aria-live="assertive"
              >
                {profileError}
              </p>
            ) : null}

            {profileFeedbackScope === 'notifications' && profileNotice ? (
              <p className="settings-inline-notice muted-text" role="status" aria-live="polite">
                {profileNotice}
              </p>
            ) : null}
          </Card>

          <section className="settings-support-panel" aria-label="Workspace scope and reference">
            <div className="settings-support-panel__intro">
              <p className="settings-support-panel__eyebrow">Reference context</p>
              <h3 className="settings-support-panel__title">Scope and workspace references</h3>
              <p className="settings-support-panel__text">
                Keep shared-shell defaults and immediate browser protection scope visible without
                interrupting configuration work.
              </p>
            </div>

            <section className="settings-display-context" aria-label="Workspace display alignment">
              <article
                className="settings-display-context__item"
                aria-label="Offline warning banner setting status"
              >
                <div>
                  <p className="settings-display-context__label">Shared shell state</p>
                  <strong>Offline warning banner</strong>
                  <p className="settings-display-context__text">
                    Warning display follows the live connection state in Aura&apos;s shared shell for
                    this browser.
                  </p>
                </div>
                <span className="setting-item__status-note">Shared shell default</span>
              </article>

              <article
                className="settings-display-context__item"
                aria-label="Compact table density setting status"
              >
                <div>
                  <p className="settings-display-context__label">Workspace density</p>
                  <strong>Compact table mode</strong>
                  <p className="settings-display-context__text">
                    Table density currently follows Aura Clinician&apos;s shared workspace default in
                    this browser.
                  </p>
                </div>
                <span className="setting-item__status-note">Shared workspace default</span>
              </article>
            </section>

            <div className="settings-support-notes" aria-label="Local protection notes">
              <article className="settings-support-note">
                <p className="settings-support-note__label">Current session timing</p>
                <p className="settings-support-note__value">{sessionSummaryLabel}</p>
                <p className="settings-support-note__text">
                  Auto-logout timing updates the current browser session manager right away.
                </p>
              </article>

              <article className="settings-support-note">
                <p className="settings-support-note__label">Warning ladder</p>
                <p className="settings-support-note__value">{timeoutWarningLabel}</p>
                <p className="settings-support-note__text">
                  Quiet hours reduce secondary emphasis only and never remove core alert visibility.
                </p>
              </article>
            </div>

            <AlertBanner
              className="settings-guidance-banner"
              variant="info"
              title="Local workspace guidance"
            >
              Settings on this page are browser-backed. They change how this clinician workspace
              behaves on this device, but they do not publish shared product-wide preferences.
            </AlertBanner>
          </section>

          <section className="settings-maintenance-zone" aria-label="Restore and maintenance actions">
            <div className="settings-maintenance-zone__intro">
              <p className="settings-support-panel__eyebrow">Maintenance</p>
              <h3 className="settings-support-panel__title">Lower-priority resets</h3>
              <p className="settings-support-panel__text">
                Keep resets available without letting them compete with day-to-day workspace
                changes.
              </p>
            </div>

            <div className="settings-admin-zone__actions settings-admin-zone__actions--support">
              <article className="settings-admin-action">
                <div className="settings-admin-action__copy">
                  <p className="settings-admin-action__eyebrow">Profile draft</p>
                  <h4 className="settings-admin-action__title">
                    Restore workspace profile defaults
                  </h4>
                  <p className="settings-admin-action__text">
                    Reset the editable profile form to Aura&apos;s local defaults. The saved browser
                    profile does not change until you save again.
                  </p>
                </div>
                <Button variant="ghost" onClick={handleRestoreProfileDefaults}>
                  Restore defaults
                </Button>
              </article>

              <article className="settings-admin-action settings-admin-action--protection">
                <div className="settings-admin-action__copy">
                  <p className="settings-admin-action__eyebrow">Session protection</p>
                  <h4 className="settings-admin-action__title">Restore session defaults</h4>
                  <p className="settings-admin-action__text">
                    Return this browser&apos;s idle and absolute session timing to the default
                    protection policy.
                  </p>
                </div>
                <Button variant="secondary" onClick={handleRestoreSessionDefaults}>
                  Restore session defaults
                </Button>
              </article>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
