/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { SessionEndedPage } from '../pages/SessionEndedPage';
import { DEFAULT_SESSION_SETTINGS, getSessionSettingsStorageKey, type SessionSettings } from '../services/sessionSettings';
import {
  ASSIGNMENTS_STORAGE_KEY,
  CLINICIAN_ID_STORAGE_KEY,
  CLINICIAN_NAME_STORAGE_KEY,
  RISK_OVERRIDES_STORAGE_KEY,
  SEEN_ALERTS_STORAGE_PREFIX,
} from '../utils/storageKeys';

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderShell(settings?: Partial<SessionSettings>): void {
  window.localStorage.setItem(
    getSessionSettingsStorageKey(),
    JSON.stringify({ ...DEFAULT_SESSION_SETTINGS, ...settings }),
  );

  render(
    <MemoryRouter initialEntries={['/alerts']}>
      <Routes>
        <Route path="/session-ended" element={<SessionEndedPage />} />
        <Route path="/login" element={<div>Login workspace</div>} />
        <Route path="/" element={<AppShell />}>
          <Route index element={<Navigate to="/alerts" replace />} />
          <Route path="alerts" element={<div>Alerts workspace</div>} />
          <Route path="patients" element={<div>Patients workspace</div>} />
          <Route path="settings" element={<div>Settings workspace</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell session timeout behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-20T00:00:00.000Z'));
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('idle timeout shows warning modal at expected time', () => {
    renderShell({ idleMinutes: 1, warningSeconds: 10, absoluteHours: 12 });

    expect(screen.getByText('Alerts workspace')).toBeInTheDocument();

    advance(49_000);
    expect(screen.queryByRole('dialog', { name: 'Session will end soon' })).not.toBeInTheDocument();

    advance(1_000);
    expect(screen.getByRole('dialog', { name: 'Session will end soon' })).toBeInTheDocument();
    expect(screen.getByText(/Locks in/)).toBeInTheDocument();
  });

  it('continue session hides warning and resets idle timer', () => {
    renderShell({ idleMinutes: 1, warningSeconds: 10, absoluteHours: 12 });

    advance(50_000);
    expect(screen.getByRole('dialog', { name: 'Session will end soon' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue session' }));
    expect(screen.queryByRole('dialog', { name: 'Session will end soon' })).not.toBeInTheDocument();

    advance(49_000);
    expect(screen.queryByRole('dialog', { name: 'Session will end soon' })).not.toBeInTheDocument();

    advance(1_000);
    expect(screen.getByRole('dialog', { name: 'Session will end soon' })).toBeInTheDocument();
  });

  it('auto-logout clears known dashboard keys and routes to session-ended page', async () => {
    renderShell({ idleMinutes: 1, warningSeconds: 10, absoluteHours: 12 });

    window.localStorage.setItem(`${SEEN_ALERTS_STORAGE_PREFIX}:anon`, '{"alt-1":"2026-02-20T00:00:00.000Z"}');
    window.localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, '{}');
    window.localStorage.setItem(RISK_OVERRIDES_STORAGE_KEY, '{}');
    window.localStorage.setItem(CLINICIAN_ID_STORAGE_KEY, 'clinician-1');
    window.localStorage.setItem(CLINICIAN_NAME_STORAGE_KEY, 'Clinician 1');
    window.localStorage.setItem('aura_auth_token', 'token-value');
    window.localStorage.setItem('preserve_me', 'yes');

    advance(60_000);

    expect(screen.getByText('Session ended due to inactivity.')).toBeInTheDocument();

    expect(window.localStorage.getItem(`${SEEN_ALERTS_STORAGE_PREFIX}:anon`)).toBeNull();
    expect(window.localStorage.getItem(ASSIGNMENTS_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(RISK_OVERRIDES_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(CLINICIAN_ID_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(CLINICIAN_NAME_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem('aura_auth_token')).toBeNull();
    expect(window.localStorage.getItem('preserve_me')).toBe('yes');
    expect(window.localStorage.getItem(getSessionSettingsStorageKey())).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(screen.getByText('Login workspace')).toBeInTheDocument();
  });

  it('absolute timeout warning appears even with activity', () => {
    renderShell({
      idleMinutes: 10,
      warningSeconds: 10,
      absoluteHours: 0.001,
      absoluteWarningSeconds: 2,
      activityDebounceSeconds: 0.1,
    });

    for (let index = 0; index < 5; index += 1) {
      advance(400);
      fireEvent.click(document);
    }

    expect(screen.getByRole('dialog', { name: 'Session will end soon' })).toBeInTheDocument();
    expect(
      screen.getByText('This session reached its maximum duration. For patient safety, the dashboard will lock soon.'),
    ).toBeInTheDocument();
  });
});
