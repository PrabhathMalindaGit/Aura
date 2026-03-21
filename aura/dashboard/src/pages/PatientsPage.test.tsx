/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientsPage } from './PatientsPage';
import {
  clearClinicianProfileForTests,
  getClinicianProfile,
  setClinicianProfile,
} from '../services/clinicianProfile';
import { writeWorkspaceState } from '../services/workspaceState';

function createJsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function installMatchMediaMock(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
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

function renderPatientsPage(initialEntry: string = '/patients') {
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/patients/:patientId" element={<div>Patient detail workspace</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function buildPatientFixtures(nowMs: number = Date.now()) {
  return [
    {
      id: 'patient-42',
      displayName: 'Taylor Moss',
      status: 'active',
      lastCheckinAt: new Date(nowMs - 24 * 60 * 60 * 1000).toISOString(),
      openAlertCount: 3,
      lastPain: 7.2,
    },
    {
      id: 'patient-77',
      displayName: 'Jordan Lee',
      status: 'active',
      lastCheckinAt: new Date(nowMs - 5 * 24 * 60 * 60 * 1000).toISOString(),
      openAlertCount: 0,
      lastPain: 2.1,
    },
    {
      id: 'patient-88',
      displayName: 'Casey Brown',
      status: 'on_hold',
      lastCheckinAt: new Date(nowMs - 6 * 60 * 60 * 1000).toISOString(),
      openAlertCount: 1,
      lastPain: 5.4,
    },
  ];
}

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

function installPatientsFetchMock(patients = buildPatientFixtures()): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);

    if (url.includes('/clinician/patients')) {
      return createJsonResponse(
        {
          ok: true,
          patients,
        },
        200,
      );
    }

    return createJsonResponse({ ok: true, patients: [] });
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  installMatchMediaMock();
  window.localStorage.clear();
  window.sessionStorage.clear();
  clearClinicianProfileForTests();
  signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });
});

afterEach(() => {
  cleanup();
});

describe('PatientsPage endpoint handling', () => {
  it('renders endpoint not ready empty state when /clinician/patients is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/patients')) {
        return createJsonResponse({ ok: false }, 404);
      }

      return createJsonResponse({ ok: true, patients: [] });
    });

    renderPatientsPage();

    expect(await screen.findByText('Patients list not available yet')).toBeInTheDocument();
    expect(screen.getByText('The backend endpoint /clinician/patients is not implemented.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show developer hint'));
    expect(screen.getByText('Add GET /clinician/patients returning { ok: true, patients: [...] }')).toBeInTheDocument();
    expect(screen.getByLabelText('Search patients')).toBeInTheDocument();
  });

  it('hydrates the roster search from the URL query string', async () => {
    installPatientsFetchMock([
      {
        id: 'patient-42',
        displayName: 'Taylor Moss',
        status: 'active',
        lastCheckinAt: '2026-03-13T09:00:00.000Z',
        openAlertCount: 1,
        lastPain: 7.2,
      },
      {
        id: 'patient-77',
        displayName: 'Jordan Lee',
        status: 'active',
        lastCheckinAt: '2026-03-13T10:00:00.000Z',
        openAlertCount: 0,
        lastPain: 2.1,
      },
    ]);

    renderPatientsPage('/patients?search=Taylor');

    const searchInput = await screen.findByRole('searchbox', { name: 'Search patients' });
    expect(searchInput).toHaveValue('Taylor');

    await waitFor(() => {
      expect(screen.getByLabelText('Patient Taylor Moss')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Patient Jordan Lee')).not.toBeInTheDocument();
  });

  it('renders truthful alert burden and pain level cues without trend language', async () => {
    installPatientsFetchMock([
      {
        id: 'patient-42',
        displayName: 'Taylor Moss',
        status: 'active',
        lastCheckinAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        openAlertCount: 3,
        lastPain: 7.2,
      },
    ]);

    const { container } = renderPatientsPage();

    expect(await screen.findByText('Pain level')).toBeInTheDocument();
    expect(screen.queryByText('Pain trend')).not.toBeInTheDocument();
    expect(screen.getByText('3 active alerts')).toBeInTheDocument();
    expect(screen.getByLabelText('Alert burden: 3 active alerts')).toBeInTheDocument();
    expect(screen.getByText('Elevated')).toBeInTheDocument();
    expect(screen.queryByText(/improving|worsening|stable/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll('.patient-alert-burden__step--filled')).toHaveLength(3);
  });

  it('applies exact-match triage presets without clearing search', async () => {
    installPatientsFetchMock();
    const user = userEvent.setup();

    renderPatientsPage('/patients?search=Taylor');

    const searchInput = await screen.findByRole('searchbox', { name: 'Search patients' });
    const activeAlertsPreset = screen.getByRole('button', { name: 'Active alerts' });

    expect(searchInput).toHaveValue('Taylor');
    expect(activeAlertsPreset).toHaveAttribute('aria-pressed', 'false');

    await user.click(activeAlertsPreset);

    expect(searchInput).toHaveValue('Taylor');
    expect(activeAlertsPreset).toHaveAttribute('aria-pressed', 'true');

    await waitFor(() => {
      expect(screen.getByLabelText('Patient Taylor Moss')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Patient Jordan Lee')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort patients' }), 'name-asc');

    expect(activeAlertsPreset).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies the saved default Patients preset only on a clean entry', async () => {
    setClinicianProfile({
      ...getClinicianProfile(),
      workspacePreferences: {
        ...getClinicianProfile().workspacePreferences,
        defaultPatientsPreset: 'active-alerts',
      },
    });
    installPatientsFetchMock();

    renderPatientsPage();

    const activeAlertsPreset = await screen.findByRole('button', { name: 'Active alerts' });
    expect(activeAlertsPreset).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Patient Taylor Moss')).toBeInTheDocument();
    expect(screen.getByLabelText('Patient Casey Brown')).toBeInTheDocument();
    expect(screen.queryByLabelText('Patient Jordan Lee')).not.toBeInTheDocument();
  });

  it('does not let the saved default Patients preset override existing saved roster state', async () => {
    setClinicianProfile({
      ...getClinicianProfile(),
      workspacePreferences: {
        ...getClinicianProfile().workspacePreferences,
        defaultPatientsPreset: 'active-alerts',
      },
    });
    writeWorkspaceState('patients', {
      search: '',
      status: 'all',
      hasOpenAlertsOnly: false,
      missedCheckinsOnly: false,
      recentlyActive: 'all',
      sort: 'name-asc',
    });
    installPatientsFetchMock();

    renderPatientsPage();

    const activeAlertsPreset = await screen.findByRole('button', { name: 'Active alerts' });
    expect(activeAlertsPreset).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Patient Jordan Lee')).toBeInTheDocument();
  });

  it('renders preset-aware filtered empty states for the current exact view', async () => {
    installPatientsFetchMock([
      {
        id: 'patient-42',
        displayName: 'Taylor Moss',
        status: 'active',
        lastCheckinAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        openAlertCount: 0,
        lastPain: 3.2,
      },
    ]);
    const user = userEvent.setup();

    renderPatientsPage('/patients?search=Taylor');

    await screen.findByRole('searchbox', { name: 'Search patients' });
    await user.click(screen.getByRole('button', { name: 'Active alerts' }));

    expect(
      screen.getByText(
        'No patients with active alerts match this exact roster view. Search "Taylor" further narrowed the current view.',
      ),
    ).toBeInTheDocument();
  });

  it('preserves the existing open review patient flow', async () => {
    installPatientsFetchMock();
    const user = userEvent.setup();

    renderPatientsPage();

    await screen.findByLabelText('Patient Taylor Moss');
    await user.click(screen.getAllByRole('button', { name: 'Open review' })[0]);

    await waitFor(() => {
      expect(screen.getByText('Patient detail workspace')).toBeInTheDocument();
    });
  });
});
