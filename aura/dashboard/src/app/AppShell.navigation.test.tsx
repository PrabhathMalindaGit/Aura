/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import {
  clearClinicianProfileForTests,
  getClinicianProfile,
  getClinicianProfileStorageKey,
  setClinicianProfile,
} from '../services/clinicianProfile';
import { getPreferredDashboardLandingPath } from '../services/clinicianWorkspacePreferences';

type BreakpointPreset = 'mobile' | 'desktop';

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

function installMatchMediaPreset(preset: BreakpointPreset): void {
  const mobileMap = new Map<string, boolean>([
    ['(max-width: 899px)', true],
    ['(min-width: 900px) and (max-width: 1199px)', false],
    ['(min-width: 1200px)', false],
  ]);

  const desktopMap = new Map<string, boolean>([
    ['(max-width: 899px)', false],
    ['(min-width: 900px) and (max-width: 1199px)', false],
    ['(min-width: 1200px)', true],
  ]);

  const activeMap = preset === 'mobile' ? mobileMap : desktopMap;

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: activeMap.get(query) ?? false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function RouteEcho(): JSX.Element {
  const location = useLocation();

  return <div>{`${location.pathname}${location.search}`}</div>;
}

function LandingRedirect(): JSX.Element {
  return <Navigate to={getPreferredDashboardLandingPath()} replace />;
}

function renderShell(entry: string): void {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<LandingRedirect />} />
          <Route path="dashboard" element={<div>Dashboard workspace</div>} />
          <Route path="worklist" element={<div>Worklist workspace</div>} />
          <Route path="communication" element={<div>Communication workspace</div>} />
          <Route path="alerts" element={<RouteEcho />} />
          <Route path="patients" element={<RouteEcho />} />
          <Route path="appointments" element={<div>Appointments workspace</div>} />
          <Route path="insights" element={<div>Insights workspace</div>} />
          <Route path="settings" element={<div>Settings workspace</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell navigation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearClinicianProfileForTests();
    signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });
    installMatchMediaPreset('desktop');
  });

  afterEach(() => {
    cleanup();
  });

  it('opens and closes mobile nav sheet with menu button and Escape', async () => {
    installMatchMediaPreset('mobile');
    const user = userEvent.setup();

    renderShell('/alerts');

    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
    await user.click(menuButton);

    expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
    });

    expect(menuButton).toHaveFocus();
  });

  it('highlights the active sidebar item on desktop', () => {
    installMatchMediaPreset('desktop');
    renderShell('/patients');

    const activeLink = screen.getByRole('link', { name: 'Patients' });
    expect(activeLink).toHaveClass('sidebar-item--active');
  });

  it('highlights the worklist nav item when the worklist route is active', () => {
    installMatchMediaPreset('desktop');
    renderShell('/worklist');

    const activeLink = screen.getByRole('link', { name: 'Worklist' });
    expect(activeLink).toHaveClass('sidebar-item--active');
    expect(screen.getByText('Worklist workspace')).toBeInTheDocument();
  });

  it('shows the alerts title and subtitle for the alerts workspace', () => {
    installMatchMediaPreset('desktop');
    renderShell('/alerts');

    expect(screen.getByRole('heading', { name: 'Alerts' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Triage safety alerts with assignment, acknowledgment, and follow-up context.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the communication title and subtitle for the communication workspace', () => {
    installMatchMediaPreset('desktop');
    renderShell('/communication');

    expect(screen.getByRole('heading', { name: 'Communication' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Patient-linked communication review with response-needed and safety-aware follow-through.',
      ),
    ).toBeInTheDocument();

    const activeLink = screen.getByRole('link', { name: 'Communication' });
    expect(activeLink).toHaveClass('sidebar-item--active');
  });

  it('quick open routes patient-like searches into the patients workspace filter', async () => {
    installMatchMediaPreset('desktop');
    const user = userEvent.setup();
    renderShell('/dashboard');

    const quickOpen = screen.getByRole('searchbox', {
      name: 'Quick open: page, patient ID, or alert ID',
    });

    await user.type(quickOpen, 'patient-42');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('/patients?search=patient-42')).toBeInTheDocument();
    });
    expect(quickOpen).toHaveValue('');
  });

  it('quick open routes alert-like searches into the alerts workspace filter', async () => {
    installMatchMediaPreset('desktop');
    const user = userEvent.setup();
    renderShell('/dashboard');

    const quickOpen = screen.getByRole('searchbox', {
      name: 'Quick open: page, patient ID, or alert ID',
    });

    await user.type(quickOpen, 'alt-001');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('/alerts?search=alt-001')).toBeInTheDocument();
    });
  });

  it('redirects the shell index route to dashboard workspace', async () => {
    installMatchMediaPreset('desktop');
    renderShell('/');

    await waitFor(() => {
      expect(screen.getByText('Dashboard workspace')).toBeInTheDocument();
    });

    const activeLink = screen.getByRole('link', { name: 'Dashboard' });
    expect(activeLink).toHaveClass('sidebar-item--active');
  });

  it('redirects the shell index route to the saved preferred landing when present', async () => {
    installMatchMediaPreset('desktop');
    setClinicianProfile({
      ...getClinicianProfile(),
      workspacePreferences: {
        ...getClinicianProfile().workspacePreferences,
        defaultLandingRoute: '/communication',
      },
    });

    renderShell('/');

    await waitFor(() => {
      expect(screen.getByText('Communication workspace')).toBeInTheDocument();
    });
  });

  it('falls back to dashboard when the saved preferred landing is invalid', async () => {
    installMatchMediaPreset('desktop');
    const profile = getClinicianProfile();
    window.localStorage.setItem(
      getClinicianProfileStorageKey('auth-clinician-1'),
      JSON.stringify({
        version: 2,
        authScopeId: 'auth-clinician-1',
        updatedAt: new Date().toISOString(),
        profile: {
          ...profile,
          workspacePreferences: {
            ...profile.workspacePreferences,
            defaultLandingRoute: '/invalid-route',
          },
        },
      }),
    );

    renderShell('/');

    await waitFor(() => {
      expect(screen.getByText('Dashboard workspace')).toBeInTheDocument();
    });
  });

  it('does not let the saved landing override an explicit deep link', () => {
    installMatchMediaPreset('desktop');
    setClinicianProfile({
      ...getClinicianProfile(),
      workspacePreferences: {
        ...getClinicianProfile().workspacePreferences,
        defaultLandingRoute: '/communication',
      },
    });

    renderShell('/patients');

    expect(screen.getByText('/patients')).toBeInTheDocument();
  });

  it('renders the clinician identity entry with initials fallback and accessible settings label', () => {
    installMatchMediaPreset('desktop');
    renderShell('/dashboard');

    const identityEntry = screen.getByRole('link', {
      name: 'Open clinician profile settings for Dr Rivera. Local availability: Available.',
    });

    expect(identityEntry).toBeInTheDocument();
    expect(screen.getByText('Dr Rivera')).toBeInTheDocument();
    expect(screen.getByText('Rehab clinician · Recovery follow-up')).toBeInTheDocument();
  });

  it('renders the saved clinician photo inside the topbar identity entry when available', () => {
    installMatchMediaPreset('desktop');
    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: 'Dr Elena Hall',
      photo: {
        dataUrl: 'data:image/png;base64,abc123',
        mimeType: 'image/png',
        fileName: 'avatar.png',
        sizeBytes: 42,
      },
    });

    renderShell('/dashboard');

    const identityEntry = screen.getByRole('link', {
      name: 'Open clinician profile settings for Dr Elena Hall. Local availability: Available.',
    });
    const avatarImage = identityEntry.querySelector('img');

    expect(avatarImage).not.toBeNull();
    expect(avatarImage).toHaveAttribute('alt', '');
    expect(avatarImage).toHaveAttribute('src', 'data:image/png;base64,abc123');
  });
});
