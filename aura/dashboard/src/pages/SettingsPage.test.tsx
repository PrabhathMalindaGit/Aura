/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLINICIAN_ID_STORAGE_KEY,
  CLINICIAN_NAME_STORAGE_KEY,
  clearDashboardSessionData,
} from '../utils/storageKeys';
import {
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

    expect(screen.getByRole('radio', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restore defaults' })).toBeInTheDocument();
    expect(
      screen.getByText('Saved locally for this clinician in this browser. Changes do not sync across devices.'),
    ).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(screen.getByText('Profile saved in this browser.')).toBeInTheDocument();
    expect(window.localStorage.getItem(CLINICIAN_ID_STORAGE_KEY)).toBe('elena-hall-local');
    expect(window.localStorage.getItem(CLINICIAN_NAME_STORAGE_KEY)).toBe('Dr Elena Hall');

    const stored = window.localStorage.getItem(getClinicianProfileStorageKey('auth-clinician-2'));
    expect(stored).toContain('"authScopeId":"auth-clinician-2"');
    expect(stored).toContain('"displayName":"Dr Elena Hall"');
    expect(stored).toContain('"clinicianId":"elena-hall-local"');

    view.unmount();
    render(<SettingsPage />);

    expect(screen.getByLabelText('Clinician display name')).toHaveValue('Dr Elena Hall');
    expect(screen.getByLabelText('Clinician ID')).toHaveValue('elena-hall-local');
  });

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

  it('keeps scoped clinician profiles separate across sign-out and later sign-in', async () => {
    const user = userEvent.setup();

    signInAs({ sub: 'auth-clinician-a', name: 'Clinician A' });
    let view = render(<SettingsPage />);

    await user.clear(screen.getByLabelText('Clinician display name'));
    await user.type(screen.getByLabelText('Clinician display name'), 'Clinician A Saved');
    await user.clear(screen.getByLabelText('Clinician ID'));
    await user.type(screen.getByLabelText('Clinician ID'), 'clinician-a-local');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(screen.getByText('Profile saved in this browser.')).toBeInTheDocument();
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
});
