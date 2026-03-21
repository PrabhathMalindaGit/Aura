import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ClinicianAvatar } from '../components/ui/ClinicianAvatar';
import { Section } from '../components/ui/Section';
import { useClinicianIdentity } from '../hooks/useClinicianIdentity';
import {
  CLINICIAN_PROFILE_LIMITS,
  CLINICIAN_PROFILE_PHOTO_MIME_TYPES,
  MAX_CLINICIAN_PROFILE_PHOTO_BYTES,
  getClinicianProfile,
  getDefaultClinicianProfileForAuthIdentity,
  setClinicianProfile,
  type ClinicianProfile,
  type ClinicianProfilePhotoMime,
} from '../services/clinicianProfile';
import {
  getClinicianInitials,
} from '../services/clinicianIdentity';
import {
  DEFAULT_SESSION_SETTINGS,
  getSessionSettings,
  setSessionSettings,
  type SessionSettings,
} from '../services/sessionSettings';
import {
  getThemeMode,
  setThemeMode,
  subscribeThemeMode,
  type ThemeMode,
} from '../services/theme';

interface ProfileValidationState {
  displayName?: string;
  clinicianId?: string;
}

function profilesEqual(left: ClinicianProfile, right: ClinicianProfile): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateProfile(profile: ClinicianProfile): ProfileValidationState {
  const next: ProfileValidationState = {};

  if (!profile.displayName.trim()) {
    next.displayName = 'Display name is required before saving.';
  }

  if (!profile.clinicianId.trim()) {
    next.clinicianId = 'Clinician ID is required before saving.';
  }

  return next;
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
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getThemeMode());
  const [themeNotice, setThemeNotice] = useState<string | null>(null);
  const [savedProfile, setSavedProfile] = useState<ClinicianProfile>(() => initialProfile);
  const [draftProfile, setDraftProfile] = useState<ClinicianProfile>(() => initialProfile);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileValidation, setProfileValidation] = useState<ProfileValidationState>({});
  const [sessionSettings, setLocalSessionSettings] = useState<SessionSettings>(() =>
    getSessionSettings(),
  );
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);

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

  async function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!CLINICIAN_PROFILE_PHOTO_MIME_TYPES.includes(file.type as ClinicianProfilePhotoMime)) {
      setProfileError('Choose a JPG, PNG, or WebP image up to 500 KB.');
      setProfileNotice(null);
      return;
    }

    if (file.size > MAX_CLINICIAN_PROFILE_PHOTO_BYTES) {
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
      setProfileNotice('Photo added to the form. Save to keep it in this browser.');
    } catch {
      setProfileError('The selected image could not be read in this browser.');
      setProfileNotice(null);
    }
  }

  function handleSaveProfile(): void {
    const nextValidation = validateProfile(draftProfile);
    setProfileValidation(nextValidation);

    if (nextValidation.displayName || nextValidation.clinicianId) {
      setProfileError('Display name and clinician ID are required before saving.');
      setProfileNotice(null);
      return;
    }

    const result = setClinicianProfile(draftProfile);
    setDraftProfile(result.profile);

    if (!result.saved) {
      setProfileError('Profile could not be saved in this browser right now.');
      setProfileNotice(null);
      return;
    }

    setSavedProfile(result.profile);
    setProfileError(null);
    setProfileNotice('Profile saved in this browser.');
  }

  function handleRestoreProfileDefaults(): void {
    setDraftProfile(getDefaultClinicianProfileForAuthIdentity());
    setProfileValidation({});
    setProfileError(null);
    setProfileNotice('Defaults restored in the form. Save to keep them in this browser.');
  }

  function handleRemovePhoto(): void {
    updateDraftProfile('photo', null);
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

  const identitySummaryLabel =
    savedProfile.displayName.trim() || savedProfile.clinicianId.trim() || 'Not configured';
  const preferencesSummaryLabel = 'Theme preference stored locally';
  const securityStateLabel = sessionSettings.enabled ? 'Session guard on' : 'Session guard off';
  const identityStateLabel =
    [savedProfile.roleTitle.trim(), savedProfile.specialty.trim()].filter(Boolean).join(' · ') ||
    'Saved locally in this browser';
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
  const savedIdentitySupportLine = clinicianIdentity.secondaryLine || 'Local clinician profile';
  const profileDirty = useMemo(() => !profilesEqual(savedProfile, draftProfile), [draftProfile, savedProfile]);

  return (
    <div className="page-stack settings-page">
      <Section
        className="dashboard-page-header settings-page-header"
        eyebrow="Workspace"
        title="Settings"
        subtitle="Configure this local clinician workspace for profile identity, appearance, and session protection."
        meta={
          <span className="settings-page__meta" aria-live="polite">
            <span className="settings-page__meta-pill settings-page__meta-pill--count">
              {themeSummaryLabel} mode
            </span>
            <span className="settings-page__meta-pill settings-page__meta-pill--local">
              This browser only
            </span>
            <span
              className={`settings-page__meta-pill settings-page__meta-pill--status ${
                sessionSettings.enabled
                  ? 'settings-page__meta-pill--status-safe'
                  : 'settings-page__meta-pill--status-attention'
              }`}
            >
              {securityStateLabel}
            </span>
            <span className="settings-page__meta-pill settings-page__meta-pill--updated">
              {identitySummaryLabel}
            </span>
          </span>
        }
      />

      <div className="settings-overview-stack">
        <section className="settings-summary-strip" aria-label="Settings summary">
          <article className="settings-summary-strip__item settings-summary-strip__item--appearance">
            <p className="settings-summary-strip__label">Appearance</p>
            <p className="settings-summary-strip__value">{themeSummaryLabel}</p>
            <p className="settings-summary-strip__hint">{preferencesSummaryLabel}</p>
          </article>
          <article className="settings-summary-strip__item settings-summary-strip__item--security">
            <p className="settings-summary-strip__label">Session security</p>
            <p className="settings-summary-strip__value">{sessionSummaryLabel}</p>
            <p className="settings-summary-strip__hint">
              {sessionSettings.enabled
                ? 'Auto-lock warning enabled'
                : 'Enable guard for unattended sessions'}
            </p>
          </article>
          <article className="settings-summary-strip__item settings-summary-strip__item--identity">
            <p className="settings-summary-strip__label">Clinician profile</p>
            <p className="settings-summary-strip__value">{identitySummaryLabel}</p>
            <p className="settings-summary-strip__hint">{identityStateLabel}</p>
          </article>
        </section>

        <section className="settings-workspace-note" aria-label="Settings workspace guidance">
          <div className="settings-workspace-note__copy">
            <p className="settings-workspace-note__eyebrow">Local workspace scope</p>
            <p className="settings-workspace-note__text">
              Keep this page aligned with the rest of Aura Clinician while staying truthful:
              profile, appearance, and session changes here stay local to this browser.
            </p>
          </div>
          <div className="settings-workspace-note__facts" aria-live="polite">
            <span className="settings-workspace-note__fact">{themeSummaryLabel} mode</span>
            <span className="settings-workspace-note__fact">{securityStateLabel}</span>
            <span className="settings-workspace-note__fact">{identityStateLabel}</span>
          </div>
        </section>
      </div>

      <section className="settings-groups" aria-label="Settings groups">
        <section
          className="settings-groups__column settings-groups__column--primary settings-column-shell settings-column-shell--workspace"
          aria-label="Workspace defaults settings"
        >
          <div className="settings-column-shell__intro">
            <p className="settings-column-shell__eyebrow">Workspace defaults</p>
            <h3 className="settings-column-shell__title">Personal workspace controls</h3>
            <p className="settings-column-shell__text">
              Keep appearance, clinician identity, and assignment labels consistent for the
              clinician using this browser.
            </p>
          </div>
          <Card
            className="settings-group-card settings-group-card--preferences"
            title={
              <span className="settings-group-card__title">
                Appearance & preferences
                <span className="settings-group-card__title-meta">Workspace defaults</span>
              </span>
            }
          >
            <div className="settings-group-card__context">
              <span className="settings-group-card__context-pill">Personal defaults</span>
              <p className="settings-group-card__context-note">
                Only real browser-backed preferences are interactive here.
              </p>
            </div>
            <p className="settings-group-card__intro">
              Keep the workspace comfortable to review without drifting away from Aura&apos;s shared
              operational style. Browser-backed preferences stay interactive here, while shared
              workspace behaviors remain read-only on this device.
            </p>
            <div className="settings-list settings-list--refined">
              <fieldset className="setting-item setting-item--field setting-item--theme" aria-label="Theme mode">
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

              <div className="setting-item setting-item--note" aria-label="Offline warning banner setting status">
                <span>
                  <strong>Offline warning banner</strong>
                  <small>
                    Warning display follows the live connection state in Aura&apos;s shared shell for
                    this browser.
                  </small>
                </span>
                <span className="setting-item__status-note">Shared shell default</span>
              </div>

              <div className="setting-item setting-item--note" aria-label="Compact table density setting status">
                <span>
                  <strong>Compact table mode</strong>
                  <small>
                    Table density currently follows Aura Clinician&apos;s shared workspace default in
                    this browser.
                  </small>
                </span>
                <span className="setting-item__status-note">Shared workspace default</span>
              </div>
            </div>

            <div className="settings-card-footer settings-card-footer--quiet">
              <p className="settings-card-footer__note">
                Theme changes apply immediately. Other appearance settings in this section stay
                aligned with current browser defaults.
              </p>
            </div>

            {themeNotice ? (
              <p className="settings-inline-notice muted-text" role="status" aria-live="polite">
                {themeNotice}
              </p>
            ) : null}
          </Card>

          <Card
            className="settings-group-card settings-group-card--identity"
            title={
              <span className="settings-group-card__title">
                Clinician profile
                <span className="settings-group-card__title-meta">Browser-local identity workspace</span>
              </span>
            }
          >
            <div className="settings-group-card__context">
              <span className="settings-group-card__context-pill">This browser only</span>
              <p className="settings-group-card__context-note">
                Saved locally for this clinician in this browser. Changes do not sync across
                devices.
              </p>
            </div>
            <p className="settings-group-card__intro">
              Set how this clinician workspace appears for assignment ownership, handoff context,
              and local identity surfaces on this device.
            </p>

            <section className="settings-profile-summary" aria-label="Saved clinician profile summary">
              <ClinicianAvatar
                identity={clinicianIdentity}
                className="settings-profile-summary__avatar"
                decorative
                size="lg"
              />
              <div className="settings-profile-summary__copy">
                <p className="settings-profile-summary__name">{clinicianIdentity.displayName}</p>
                <p className="settings-profile-summary__meta">{savedIdentitySupportLine}</p>
                <div className="settings-profile-summary__facts" aria-label="Saved clinician profile facts">
                  {savedIdentityFacts.map((fact) => (
                    <span key={fact} className="settings-profile-summary__fact">
                      {fact}
                    </span>
                  ))}
                </div>
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

            <div className="settings-list settings-list--refined">
              <div className="settings-profile-section-label">Identity</div>
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
                    Editable for workspace labeling. It does not change which clinician profile this
                    browser is currently using.
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

              <div className="settings-profile-section-label">Care focus & handoff</div>
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

            <div className="settings-card-footer">
              <p className="settings-card-footer__note">
                {profileDirty
                  ? 'Changes stay local to this browser after you save them.'
                  : 'This saved profile is local to this browser and does not sync across devices.'}
              </p>
              <div className="inline-actions settings-actions settings-actions--primary settings-actions--identity">
                <Button onClick={handleSaveProfile} disabled={!profileDirty}>
                  Save profile
                </Button>
                <Button variant="ghost" onClick={handleRestoreProfileDefaults}>
                  Restore defaults
                </Button>
              </div>
            </div>

            {profileError ? (
              <p
                className="settings-inline-notice settings-inline-notice--error"
                role="alert"
                aria-live="assertive"
              >
                {profileError}
              </p>
            ) : null}

            {profileNotice ? (
              <p className="settings-inline-notice muted-text" role="status" aria-live="polite">
                {profileNotice}
              </p>
            ) : null}
          </Card>
        </section>

        <section
          className="settings-groups__column settings-groups__column--secondary settings-column-shell settings-column-shell--protection"
          aria-label="Session protection settings"
        >
          <div className="settings-column-shell__intro">
            <p className="settings-column-shell__eyebrow">Protection</p>
            <h3 className="settings-column-shell__title">Session safety controls</h3>
            <p className="settings-column-shell__text">
              Keep unattended access risk low while preserving the local scope of this browser.
            </p>
          </div>
          <Card
            className="settings-group-card settings-group-card--security"
            title={
              <span className="settings-group-card__title">
                Session & security
                <span className="settings-group-card__title-meta">Browser protection</span>
              </span>
            }
          >
            <div className="settings-group-card__context">
              <span className="settings-group-card__context-pill">Local protection</span>
              <p className="settings-group-card__context-note">
                Takes effect immediately in this browser.
              </p>
            </div>
            <p className="settings-group-card__intro">
              Session safeguards apply immediately to this browser and do not publish a shared
              organization-wide policy.
            </p>
            <div className="settings-list settings-list--refined">
              <label className="setting-item setting-item--toggle" htmlFor="idle-timeout-enabled-toggle">
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

              <label className="setting-item setting-item--field form-field" htmlFor="idle-timeout-minutes">
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

              <label className="setting-item setting-item--field form-field" htmlFor="absolute-timeout-hours">
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
            </div>

            <div className="settings-card-footer">
              <div className="inline-actions settings-actions settings-actions--security">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const reset = setSessionSettings(DEFAULT_SESSION_SETTINGS);
                    setLocalSessionSettings(reset);
                    setSessionNotice('Session security settings reset to defaults.');
                  }}
                >
                  Restore session defaults
                </Button>
              </div>
              <p className="settings-card-footer__note">
                Auto-logout timing updates the current browser session manager right away.
              </p>
            </div>

            {sessionNotice ? (
              <p className="settings-inline-notice muted-text" role="status" aria-live="polite">
                {sessionNotice}
              </p>
            ) : null}
          </Card>

          <section className="settings-column-shell__support" aria-label="Workspace guidance">
            <p className="settings-column-shell__support-label">Workspace guidance</p>
            <p className="settings-column-shell__support-text">
              Use these reminders to keep the local scope of this browser clear for the clinician
              using it.
            </p>
            <AlertBanner className="settings-guidance-banner" variant="info" title="Local workspace guidance">
              Settings on this page are browser-backed. They change how this clinician workspace
              behaves on this device, but they do not publish shared product-wide preferences.
            </AlertBanner>
          </section>
        </section>
      </section>
    </div>
  );
}
