/* @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicianLoginPage } from './ClinicianLoginPage';
import { getClinicianProfileStorageKey } from '../services/clinicianProfile';

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

function renderPage(initialState?: unknown): void {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: initialState }]}>
      <Routes>
        <Route path="/login" element={<ClinicianLoginPage />} />
        <Route path="/dashboard" element={<div>Dashboard home</div>} />
        <Route path="/alerts" element={<div>Alerts workspace</div>} />
        <Route path="/communication" element={<div>Communication workspace</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function seedPreferredLandingRoute(
  authScopeId: string,
  route: '/dashboard' | '/worklist' | '/alerts' | '/patients' | '/communication',
): void {
  window.localStorage.setItem(
    getClinicianProfileStorageKey(authScopeId),
    JSON.stringify({
      version: 2,
      authScopeId,
      updatedAt: new Date().toISOString(),
      profile: {
        displayName: 'Clinician One',
        clinicianId: authScopeId,
        roleTitle: 'Rehab clinician',
        specialty: 'Recovery follow-up',
        bio: '',
        preferredPronouns: undefined,
        contactNote: '',
        photo: null,
        workspacePreferences: {
          availabilityStatus: 'available',
          teamLabel: '',
          timezone: 'UTC',
          workingHours: {
            enabledDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
            startTime: '09:00',
            endTime: '17:00',
          },
          defaultLandingRoute: route,
          defaultPatientsPreset: '',
          defaultCommunicationFilter: 'all',
        },
      },
    }),
  );
}

describe('ClinicianLoginPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('shows session-expired recovery guidance', () => {
    renderPage({ reason: 'expired' });

    expect(screen.getByText('Your clinician session expired. Sign in again to continue.')).toBeInTheDocument();
  });

  it('supports password visibility and inline recovery guidance without exposing debug text', async () => {
    renderPage();

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(screen.queryByText(/Backend login endpoint/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(
      await screen.findByText(
        "Password recovery is handled outside this dashboard right now. Use your clinic administrator's recovery process before trying again.",
      ),
    ).toBeInTheDocument();
  });

  it('signs in and routes to alerts on valid credentials', async () => {
    seedPreferredLandingRoute('auth-clinician-1', '/communication');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          token: buildToken({ sub: 'auth-clinician-1', name: 'Clinician One' }),
          clinician: {
            id: 'clinician-1',
            name: 'Clinician One',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    renderPage({ from: '/alerts' });

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'clinician1@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'devpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Alerts workspace')).toBeInTheDocument();
    });

    expect(window.localStorage.getItem('aura_access_token')).toBe(
      buildToken({ sub: 'auth-clinician-1', name: 'Clinician One' }),
    );
  });

  it('uses the saved preferred landing when no redirect source is provided', async () => {
    seedPreferredLandingRoute('auth-clinician-1', '/communication');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          token: buildToken({ sub: 'auth-clinician-1', name: 'Clinician One' }),
          clinician: {
            id: 'clinician-1',
            name: 'Clinician One',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    renderPage();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'clinician1@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'devpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Communication workspace')).toBeInTheDocument();
    });
  });
});
