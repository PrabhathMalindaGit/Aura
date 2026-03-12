import { useEffect, useMemo, useState } from 'react';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import {
  getClinicianId,
  getClinicianName,
  setClinicianIdentity,
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

export function SettingsPage(): JSX.Element {
  const [showOfflineWarning, setShowOfflineWarning] = useState(true);
  const [compactTableMode, setCompactTableMode] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getThemeMode());
  const [themeNotice, setThemeNotice] = useState<string | null>(null);
  const [clinicianId, setClinicianId] = useState(() => getClinicianId());
  const [clinicianName, setClinicianName] = useState(() => getClinicianName());
  const [identityNotice, setIdentityNotice] = useState<string | null>(null);
  const [sessionSettings, setLocalSessionSettings] = useState<SessionSettings>(() =>
    getSessionSettings(),
  );
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

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

  const identitySummaryLabel = clinicianName.trim() || clinicianId.trim() || 'Not configured';
  const preferencesSummaryLabel = compactTableMode ? 'Compact density' : 'Comfortable density';
  const securityStateLabel = sessionSettings.enabled ? 'Session guard on' : 'Session guard off';
  const identityStateLabel =
    clinicianId.trim().length > 0 && clinicianName.trim().length > 0
      ? 'Ready for assignments'
      : 'Needs setup';

  return (
    <div className="page-stack settings-page">
      <Section
        className="dashboard-page-header settings-page-header"
        eyebrow="Workspace"
        title="Settings"
        subtitle="Configure this browser workspace for appearance, local identity, and session protection."
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
              {sessionSummaryLabel}
            </span>
          </span>
        }
      />

      <section className="settings-overview-stack" aria-label="Settings overview">
        <section className="settings-summary-strip" aria-label="Settings summary">
          <article className="settings-summary-strip__item settings-summary-strip__item--appearance">
            <p className="settings-summary-strip__label">Appearance</p>
            <p className="settings-summary-strip__value">{themeSummaryLabel}</p>
            <p className="settings-summary-strip__hint">
              {preferencesSummaryLabel} · Offline warning {showOfflineWarning ? 'on' : 'off'}
            </p>
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
            <p className="settings-summary-strip__label">Identity</p>
            <p className="settings-summary-strip__value">{identitySummaryLabel}</p>
            <p className="settings-summary-strip__hint">{identityStateLabel}</p>
          </article>
        </section>

        <section className="settings-workspace-note" aria-label="How settings apply">
          <div className="settings-workspace-note__copy">
            <p className="settings-workspace-note__eyebrow">Local workspace scope</p>
            <p className="settings-workspace-note__text">
              These controls affect this browser workspace, not a shared clinician profile. Use them to
              adjust appearance, ownership labels, and session protection on this device.
            </p>
          </div>
          <div className="settings-workspace-note__facts" aria-label="Settings behavior facts">
            <span className="settings-workspace-note__fact">Applies immediately</span>
            <span className="settings-workspace-note__fact">Stored locally</span>
            <span className="settings-workspace-note__fact">No shared profile sync</span>
          </div>
        </section>
      </section>

      <section className="settings-groups" aria-label="Settings groups">
        <section
          className="settings-groups__column settings-groups__column--primary settings-column-shell settings-column-shell--workspace"
          aria-labelledby="settings-workspace-shell-heading"
        >
          <div className="settings-column-shell__intro">
            <p className="settings-column-shell__eyebrow">Workspace defaults</p>
            <h3 id="settings-workspace-shell-heading" className="settings-column-shell__title">
              Appearance and local identity
            </h3>
            <p className="settings-column-shell__text">
              Set how this workspace looks and which clinician identity appears in ownership labels on
              this device.
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
                Stored locally for this browser workspace.
              </p>
            </div>
            <div className="settings-group-card__intro">
              Adjust appearance and daily workspace behavior for this browser without changing shared
              product data.
            </div>
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

              <label className="setting-item setting-item--toggle" htmlFor="offline-warning-toggle">
                <span>
                  <strong>Offline warning banner</strong>
                  <small>Show a warning when API connection drops.</small>
                </span>
                <input
                  id="offline-warning-toggle"
                  type="checkbox"
                  checked={showOfflineWarning}
                  onChange={(event) => setShowOfflineWarning(event.target.checked)}
                />
              </label>

              <label className="setting-item setting-item--toggle" htmlFor="compact-table-toggle">
                <span>
                  <strong>Compact table mode</strong>
                  <small>Reduce vertical spacing for denser patient lists.</small>
                </span>
                <input
                  id="compact-table-toggle"
                  type="checkbox"
                  checked={compactTableMode}
                  onChange={(event) => setCompactTableMode(event.target.checked)}
                />
              </label>
            </div>

            <div className="settings-card-footer">
              <div className="inline-actions settings-actions settings-actions--primary settings-actions--preferences">
                <Button>Save preferences</Button>
                <Button variant="ghost">Restore defaults</Button>
              </div>
              <p className="settings-card-footer__note">
                Theme, density, and warning preferences stay in this browser workspace.
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
                Clinician identity
                <span className="settings-group-card__title-meta">Assignment ownership</span>
              </span>
            }
          >
            <div className="settings-group-card__context">
              <span className="settings-group-card__context-pill">Assignment labels</span>
              <p className="settings-group-card__context-note">
                Used for assignments and review actions in this browser.
              </p>
            </div>
            <div className="settings-group-card__intro">
              Set the local clinician identity shown for assignments and review activity in this browser
              workspace.
            </div>
            <div className="settings-list settings-list--refined">
              <label className="setting-item setting-item--field form-field" htmlFor="clinician-id-input">
                <span>
                  <strong>My Clinician ID</strong>
                  <small>Used for alert assignment ownership in this browser.</small>
                </span>
                <input
                  id="clinician-id-input"
                  type="text"
                  value={clinicianId}
                  onChange={(event) => setClinicianId(event.target.value)}
                  placeholder="clinician-1"
                  aria-label="My Clinician ID"
                />
              </label>

              <label className="setting-item setting-item--field form-field" htmlFor="clinician-name-input">
                <span>
                  <strong>Display name</strong>
                  <small>Shown when alerts are assigned to you.</small>
                </span>
                <input
                  id="clinician-name-input"
                  type="text"
                  value={clinicianName}
                  onChange={(event) => setClinicianName(event.target.value)}
                  placeholder="Clinician 1"
                  aria-label="My Clinician display name"
                />
              </label>
            </div>

            <div className="settings-card-footer">
              <div className="inline-actions settings-actions settings-actions--primary settings-actions--identity">
                <Button
                  onClick={() => {
                    setClinicianIdentity(clinicianId, clinicianName);
                    setClinicianId(getClinicianId());
                    setClinicianName(getClinicianName());
                    setIdentityNotice('Clinician identity saved.');
                  }}
                >
                  Save identity
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setClinicianId('clinician-1');
                    setClinicianName('Clinician 1');
                    setClinicianIdentity('clinician-1', 'Clinician 1');
                    setIdentityNotice('Clinician identity reset to defaults.');
                  }}
                >
                  Restore identity
                </Button>
              </div>
              <p className="settings-card-footer__note">
                This only changes how you appear in this browser workspace.
              </p>
            </div>

            {identityNotice ? (
              <p className="settings-inline-notice muted-text" role="status" aria-live="polite">
                {identityNotice}
              </p>
            ) : null}
          </Card>
        </section>

        <section
          className="settings-groups__column settings-groups__column--secondary settings-column-shell settings-column-shell--protection"
          aria-labelledby="settings-protection-shell-heading"
        >
          <div className="settings-column-shell__intro">
            <p className="settings-column-shell__eyebrow">Local protection</p>
            <h3 id="settings-protection-shell-heading" className="settings-column-shell__title">
              Session safety and workspace guidance
            </h3>
            <p className="settings-column-shell__text">
              Keep patient context protected in this browser and make the local session behavior clear to
              the clinician using it.
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
                Takes effect immediately in this workspace.
              </p>
            </div>
            <div className="settings-group-card__intro">
              Session controls protect patient context in this browser and reduce risk during unattended
              workstation use.
            </div>
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
