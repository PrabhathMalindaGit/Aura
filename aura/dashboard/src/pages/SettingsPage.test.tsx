/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLINICIAN_ID_STORAGE_KEY,
  CLINICIAN_NAME_STORAGE_KEY,
  clearDashboardSessionData,
} from '../utils/storageKeys';
import {
  CLINICIAN_COMMUNICATION_AUTHORING_LIMITS,
  MAX_CLINICIAN_PROFILE_PHOTO_BYTES,
  clearClinicianProfileForTests,
  getClinicianProfile,
  getClinicianProfileStorageKey,
  setClinicianProfile,
} from '../services/clinicianProfile';
import { SettingsPage } from './SettingsPage';

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildToken(input: { sub: string; name?: string; exp?: number }): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: input.sub,
      name: input.name,
      exp: input.exp ?? Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  );

  return `${header}.${payload}.signature`;
}

function signInAs(input: { sub: string; name?: string }): void {
  window.localStorage.setItem('aura_access_token', buildToken(input));
}

describe('SettingsPage clinician profile workspace', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the profile workspace truthful and browser-local', () => {
    signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });

    render(<SettingsPage />);
    const savedSummary = screen.getByLabelText('Saved clinician profile summary');

    expect(screen.getByRole('radio', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save communication settings' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save notification settings' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restore defaults' })).toBeInTheDocument();
    expect(screen.getByText('Communication authoring')).toBeInTheDocument();
    expect(screen.getByText('Notification preferences')).toBeInTheDocument();
    expect(screen.getByLabelText('Default signature')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add template' })).toBeInTheDocument();
    expect(screen.getByLabelText('Communication attention cues')).toBeInTheDocument();
    expect(screen.getByLabelText('Safety alert arrival cues')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Quiet hours/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Availability status')).toBeInTheDocument();
    expect(screen.getByLabelText('Team or clinic label')).toBeInTheDocument();
    expect(screen.getByLabelText('Workspace timezone')).toBeInTheDocument();
    expect(screen.getByLabelText('Default landing route')).toBeInTheDocument();
    expect(screen.getByLabelText('Default Patients preset')).toBeInTheDocument();
    expect(screen.getByLabelText('Default Communication filter')).toBeInTheDocument();
    expect(within(savedSummary).getByText('Dr Rivera')).toBeInTheDocument();
    expect(within(savedSummary).getByText('ID: auth-clinician-1')).toBeInTheDocument();
    expect(within(savedSummary).getByText('Rehab clinician')).toBeInTheDocument();
    expect(within(savedSummary).getByText('Recovery follow-up')).toBeInTheDocument();
    expect(within(savedSummary).getByText('Available')).toBeInTheDocument();
    expect(within(savedSummary).getByText(/Opens to Home/)).toBeInTheDocument();
    expect(
      screen.getAllByText(
        'Saved locally for this clinician in this browser. Changes do not sync across devices.',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText('Profile photo stays in this browser after you save it. Use JPG, PNG, or WebP up to 500 KB.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Warning display follows the live connection state in Aura's shared shell for this browser.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Table density currently follows Aura Clinician's shared workspace default in this browser.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Local attention cues in this browser only. They do not affect core alert visibility and do not send notifications to other devices.',
      ),
    ).toBeInTheDocument();
  });

  it('saves a scoped clinician profile locally and syncs legacy identity outputs', async () => {
    signInAs({ sub: 'auth-clinician-2', name: 'Dr Hall' });
    const user = userEvent.setup();

    const view = render(<SettingsPage />);

    const displayNameInput = screen.getByLabelText('Clinician display name');
    const clinicianIdInput = screen.getByLabelText('Clinician ID');

    await user.clear(displayNameInput);
    await user.type(displayNameInput, 'Dr Elena Hall');
    await user.clear(clinicianIdInput);
    await user.type(clinicianIdInput, 'elena-hall-local');
    await user.clear(screen.getByLabelText('Clinician role or title'));
    await user.type(screen.getByLabelText('Clinician role or title'), 'Lead rehab clinician');
    await user.selectOptions(screen.getByLabelText('Availability status'), 'in-review');
    await user.type(screen.getByLabelText('Team or clinic label'), 'North Clinic');
    await user.clear(screen.getByLabelText('Workspace timezone'));
    await user.type(screen.getByLabelText('Workspace timezone'), 'America/New_York');
    await user.click(screen.getByLabelText('Friday'));
    await user.selectOptions(screen.getByLabelText('Default landing route'), '/communication');
    await user.selectOptions(screen.getByLabelText('Default Patients preset'), 'active-alerts');
    await user.selectOptions(screen.getByLabelText('Default Communication filter'), 'needs-response');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(screen.getByText('Settings saved in this browser.')).toBeInTheDocument();
    expect(window.localStorage.getItem(CLINICIAN_ID_STORAGE_KEY)).toBe('elena-hall-local');
    expect(window.localStorage.getItem(CLINICIAN_NAME_STORAGE_KEY)).toBe('Dr Elena Hall');
    expect(screen.getByText('ID: elena-hall-local')).toBeInTheDocument();
    expect(screen.getByText('Lead rehab clinician')).toBeInTheDocument();
    const savedSummary = screen.getByLabelText('Saved clinician profile summary');
    expect(within(savedSummary).getByText('In review')).toBeInTheDocument();
    expect(within(savedSummary).getByText('North Clinic')).toBeInTheDocument();
    expect(within(savedSummary).getByText(/Opens to Communication/)).toBeInTheDocument();
    expect(within(savedSummary).getByText(/Patients: Active alerts/)).toBeInTheDocument();
    expect(within(savedSummary).getByText(/Communication: Needs response/)).toBeInTheDocument();

    const stored = window.localStorage.getItem(getClinicianProfileStorageKey('auth-clinician-2'));
    expect(stored).toContain('"authScopeId":"auth-clinician-2"');
    expect(stored).toContain('"displayName":"Dr Elena Hall"');
    expect(stored).toContain('"clinicianId":"elena-hall-local"');
    expect(stored).toContain('"availabilityStatus":"in-review"');
    expect(stored).toContain('"teamLabel":"North Clinic"');
    expect(stored).toContain('"timezone":"America/New_York"');
    expect(stored).toContain('"defaultLandingRoute":"/communication"');
    expect(stored).toContain('"defaultPatientsPreset":"active-alerts"');
    expect(stored).toContain('"defaultCommunicationFilter":"needs-response"');

    view.unmount();
    render(<SettingsPage />);

    expect(screen.getByLabelText('Clinician display name')).toHaveValue('Dr Elena Hall');
    expect(screen.getByLabelText('Clinician ID')).toHaveValue('elena-hall-local');
    expect(screen.getByLabelText('Availability status')).toHaveValue('in-review');
    expect(screen.getByLabelText('Team or clinic label')).toHaveValue('North Clinic');
    expect(screen.getByLabelText('Default landing route')).toHaveValue('/communication');
  }, 30_000);

  it('restores defaults into the draft only until the clinician saves them', async () => {
    signInAs({ sub: 'auth-clinician-3', name: 'Dr Chen' });
    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: 'Dr Saved Chen',
      clinicianId: 'saved-chen-local',
    });
    const user = userEvent.setup();

    render(<SettingsPage />);

    await user.click(screen.getByRole('button', { name: 'Restore defaults' }));

    expect(screen.getByLabelText('Clinician display name')).toHaveValue('Dr Chen');
    expect(screen.getByLabelText('Clinician ID')).toHaveValue('auth-clinician-3');
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled();
    expect(
      screen.getByText('Defaults restored in the form. Save to keep them in this browser.'),
    ).toBeInTheDocument();

    const stored = window.localStorage.getItem(getClinicianProfileStorageKey('auth-clinician-3'));
    expect(stored).toContain('"displayName":"Dr Saved Chen"');
    expect(stored).toContain('"clinicianId":"saved-chen-local"');
  });

  it('rejects invalid and oversized profile photos calmly', () => {
    signInAs({ sub: 'auth-clinician-4', name: 'Dr Lopez' });
    const view = render(<SettingsPage />);
    const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement | null;

    expect(fileInput).not.toBeNull();

    const invalidFile = new File(['gif-data'], 'avatar.gif', { type: 'image/gif' });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [invalidFile] },
    });

    expect(screen.getByText('Choose a JPG, PNG, or WebP image up to 500 KB.')).toBeInTheDocument();

    const oversizedFile = new File(
      [new Uint8Array(MAX_CLINICIAN_PROFILE_PHOTO_BYTES + 1)],
      'avatar.png',
      { type: 'image/png' },
    );
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [oversizedFile] },
    });

    expect(screen.getByText('Choose a JPG, PNG, or WebP image up to 500 KB.')).toBeInTheDocument();
  });

  it('keeps optional summary fields compact by rendering them only when present', () => {
    signInAs({ sub: 'auth-clinician-5', name: 'Dr Alvarez' });
    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: 'Dr Marta Alvarez',
      roleTitle: 'Lead rehab clinician',
      specialty: 'Post-op recovery',
      preferredPronouns: 'she/her',
      bio: 'Safety-aware post-op review with a focus on handoff clarity.',
      contactNote: 'Local handoff note for urgent follow-up coverage.',
    });

    render(<SettingsPage />);
    const savedSummary = screen.getByLabelText('Saved clinician profile summary');

    expect(within(savedSummary).getByText('Dr Marta Alvarez')).toBeInTheDocument();
    expect(within(savedSummary).getByText('ID: auth-clinician-5')).toBeInTheDocument();
    expect(within(savedSummary).getByText('Lead rehab clinician')).toBeInTheDocument();
    expect(within(savedSummary).getByText('Post-op recovery')).toBeInTheDocument();
    expect(within(savedSummary).getByText('she/her')).toBeInTheDocument();
    expect(
      within(savedSummary).getByText('Safety-aware post-op review with a focus on handoff clarity.'),
    ).toBeInTheDocument();
    expect(
      within(savedSummary).getByText('Local handoff note for urgent follow-up coverage.'),
    ).toBeInTheDocument();
  });

  it('keeps scoped clinician profiles separate across sign-out and later sign-in', async () => {
    const user = userEvent.setup();

    signInAs({ sub: 'auth-clinician-a', name: 'Clinician A' });
    let view = render(<SettingsPage />);

    await user.clear(screen.getByLabelText('Clinician display name'));
    await user.type(screen.getByLabelText('Clinician display name'), 'Clinician A Saved');
    await user.clear(screen.getByLabelText('Clinician ID'));
    await user.type(screen.getByLabelText('Clinician ID'), 'clinician-a-local');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(screen.getByText('Settings saved in this browser.')).toBeInTheDocument();
    view.unmount();

    clearDashboardSessionData();
    signInAs({ sub: 'auth-clinician-b', name: 'Clinician B' });
    view = render(<SettingsPage />);

    expect(screen.getByLabelText('Clinician display name')).toHaveValue('Clinician B');
    expect(screen.getByLabelText('Clinician ID')).toHaveValue('auth-clinician-b');

    view.unmount();
    clearDashboardSessionData();
    signInAs({ sub: 'auth-clinician-a', name: 'Clinician A' });
    render(<SettingsPage />);

    expect(screen.getByLabelText('Clinician display name')).toHaveValue('Clinician A Saved');
    expect(screen.getByLabelText('Clinician ID')).toHaveValue('clinician-a-local');
  });

  it('saves browser-local communication authoring settings and keeps template order stable', async () => {
    signInAs({ sub: 'auth-clinician-comm', name: 'Dr Authoring' });
    const user = userEvent.setup();

    const view = render(<SettingsPage />);

    await user.type(
      screen.getByLabelText('Default signature'),
      'Dr Authoring\nLead rehab clinician',
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: /Auto-append signature on fresh Communication drafts/i,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Add template' }));
    await user.type(screen.getByLabelText('Template 1 title'), 'Reviewed');
    await user.type(
      screen.getByLabelText('Template 1 body'),
      'Thanks, I have reviewed this update.',
    );
    await user.click(screen.getByRole('button', { name: 'Add template' }));
    await user.type(screen.getByLabelText('Template 2 title'), 'Follow-up');
    await user.type(
      screen.getByLabelText('Template 2 body'),
      'Please keep checking in and update the next rehab note.',
    );
    await user.click(screen.getByRole('button', { name: 'Save communication settings' }));

    expect(screen.getByText('Settings saved in this browser.')).toBeInTheDocument();
    expect(screen.getByText('Saved signature on')).toBeInTheDocument();
    expect(screen.getByText('2 saved templates')).toBeInTheDocument();
    expect(getClinicianProfile().communicationAuthoring).toEqual({
      defaultSignature: 'Dr Authoring\nLead rehab clinician',
      autoAppendSignature: true,
      templates: [
        expect.objectContaining({
          title: 'Reviewed',
          body: 'Thanks, I have reviewed this update.',
        }),
        expect.objectContaining({
          title: 'Follow-up',
          body: 'Please keep checking in and update the next rehab note.',
        }),
      ],
    });

    view.unmount();
    render(<SettingsPage />);

    expect(screen.getByLabelText('Default signature')).toHaveValue(
      'Dr Authoring\nLead rehab clinician',
    );
    expect(
      screen.getByRole('checkbox', {
        name: /Auto-append signature on fresh Communication drafts/i,
      }),
    ).toBeChecked();
    expect(screen.getByLabelText('Template 1 title')).toHaveValue('Reviewed');
    expect(screen.getByLabelText('Template 2 title')).toHaveValue('Follow-up');
  });

  it('rejects blank templates and normalizes whitespace-only signatures to empty', async () => {
    signInAs({ sub: 'auth-clinician-validation', name: 'Dr Validation' });
    const user = userEvent.setup();

    render(<SettingsPage />);

    await user.type(screen.getByLabelText('Default signature'), '   \n   ');
    await user.click(screen.getByRole('button', { name: 'Add template' }));
    await user.type(screen.getByLabelText('Template 1 title'), '   ');
    await user.type(screen.getByLabelText('Template 1 body'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save communication settings' }));

    expect(
      screen.getByText('Complete or remove any blank communication templates before saving.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Template title is required.')).toBeInTheDocument();
    expect(screen.getByText('Template body is required.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove template 1' }));
    await user.click(screen.getByRole('button', { name: 'Save communication settings' }));

    expect(screen.getByText('Settings saved in this browser.')).toBeInTheDocument();
    expect(getClinicianProfile().communicationAuthoring.defaultSignature).toBe('');
    expect(getClinicianProfile().communicationAuthoring.templates).toEqual([]);
  });

  it('caps saved communication templates at the configured local limit', async () => {
    signInAs({ sub: 'auth-clinician-template-cap', name: 'Dr Template Cap' });
    const user = userEvent.setup();

    render(<SettingsPage />);

    for (let index = 0; index < CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templates; index += 1) {
      await user.click(screen.getByRole('button', { name: 'Add template' }));
    }

    expect(screen.getByRole('button', { name: 'Add template' })).toBeDisabled();
    expect(screen.getAllByLabelText(/Template \d+ title/)).toHaveLength(
      CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templates,
    );
  });

  it('saves browser-local notification preferences and keeps quiet hours local to this browser', async () => {
    signInAs({ sub: 'auth-clinician-notify', name: 'Dr Notify' });
    const user = userEvent.setup();

    render(<SettingsPage />);

    await user.selectOptions(screen.getByLabelText('Communication attention cues'), 'reduced');
    await user.selectOptions(screen.getByLabelText('Safety alert arrival cues'), 'reduced');
    await user.click(screen.getByRole('checkbox', { name: /Quiet hours/i }));
    fireEvent.change(screen.getByLabelText('Quiet hours start time'), {
      target: { value: '21:30' },
    });
    fireEvent.change(screen.getByLabelText('Quiet hours end time'), {
      target: { value: '06:45' },
    });

    await user.click(screen.getByRole('button', { name: 'Save notification settings' }));

    expect(screen.getByText('Settings saved in this browser.')).toBeInTheDocument();
    expect(getClinicianProfile().notificationPreferences).toEqual({
      communication: {
        cueMode: 'reduced',
      },
      safety: {
        cueMode: 'reduced',
      },
      quietHours: {
        enabled: true,
        startTime: '21:30',
        endTime: '06:45',
      },
    });
    expect(screen.getByText('Communication cues reduced')).toBeInTheDocument();
    expect(screen.getByText('Safety cues reduced')).toBeInTheDocument();
    expect(screen.getByText('Quiet hours 21:30 - 06:45')).toBeInTheDocument();
  });

  it('blocks equal quiet-hours values with an accessible validation error', async () => {
    signInAs({ sub: 'auth-clinician-quiet-hours', name: 'Dr Quiet Hours' });
    const user = userEvent.setup();

    render(<SettingsPage />);

    await user.click(screen.getByRole('checkbox', { name: /Quiet hours/i }));
    fireEvent.change(screen.getByLabelText('Quiet hours start time'), {
      target: { value: '22:00' },
    });
    fireEvent.change(screen.getByLabelText('Quiet hours end time'), {
      target: { value: '22:00' },
    });

    await user.click(screen.getByRole('button', { name: 'Save notification settings' }));

    expect(
      screen.getAllByText('Quiet hours start and end times must be different.'),
    ).toHaveLength(2);
    expect(screen.getByLabelText('Quiet hours start time')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Quiet hours end time')).toHaveAttribute('aria-invalid', 'true');
    expect(getClinicianProfile().notificationPreferences.quietHours.enabled).toBe(false);
  });
});
