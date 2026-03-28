/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { CommunicationPage } from '../pages/CommunicationPage';
import { SettingsPage } from '../pages/SettingsPage';
import { createJsonResponse } from '../test/mocks';
import { clearClinicianProfileForTests } from '../services/clinicianProfile';

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

function matchesWidthQuery(query: string, width: number): boolean {
  const minMatch = query.match(/\(min-width:\s*([0-9.]+)px\)/);
  const maxMatch = query.match(/\(max-width:\s*([0-9.]+)px\)/);

  const minWidth = minMatch ? Number.parseFloat(minMatch[1]) : null;
  const maxWidth = maxMatch ? Number.parseFloat(maxMatch[1]) : null;

  if (minWidth !== null && width < minWidth) {
    return false;
  }

  if (maxWidth !== null && width > maxWidth) {
    return false;
  }

  return true;
}

function installResponsiveViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });

  Object.defineProperty(window, 'outerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matchesWidthQuery(query, width),
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

const communicationOverview = {
  counts: {
    needsResponseCount: 1,
    flaggedBySafetyCount: 0,
    followUpRequestedCount: 0,
  },
  items: [
    {
      id: 'comm-1',
      patientId: 'patient-1',
      patientName: 'Jordan Lee',
      messageId: 'msg-1',
      needsResponse: true,
      flaggedBySafety: false,
      followUpRequested: false,
      messageCreatedAt: '2026-03-09T11:15:00.000Z',
      messagePreview: 'Can someone confirm whether tomorrow still works?',
    },
  ],
};

function installCommunicationFetchMock(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));

    if (url.pathname === '/clinician/dashboard/communication-overview') {
      return createJsonResponse({ ok: true, overview: communicationOverview });
    }

    return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
  });
}

function renderApp(initialEntry: string = '/communication?patientId=patient-1'): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/communication?patientId=patient-1" replace />} />
            <Route path="dashboard" element={<div>Dashboard workspace</div>} />
            <Route path="communication" element={<CommunicationPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="patients/:patientId" element={<div>Patient detail workspace</div>} />
            <Route path="alerts" element={<div>Alerts workspace</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell identity reactivity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
    signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });
    installResponsiveViewport(1680);
    installCommunicationFetchMock();
  });

  afterEach(() => {
    cleanup();
  });

  it(
    'updates the shell and communication identity surfaces in the same tab after saving profile changes',
    async () => {
    const user = userEvent.setup();
    renderApp();

    expect(
      await screen.findByRole('link', {
        name: 'Open clinician profile settings for Dr Rivera. Local availability: Available.',
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Local clinician identity')).toBeInTheDocument();
    expect(screen.getAllByText('Dr Rivera').length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole('link', {
        name: 'Open clinician profile settings for Dr Rivera. Local availability: Available.',
      }),
    );

    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    await user.clear(screen.getByLabelText('Clinician display name'));
    await user.type(screen.getByLabelText('Clinician display name'), 'Dr Elena Hall');
    await user.clear(screen.getByLabelText('Clinician role or title'));
    await user.type(screen.getByLabelText('Clinician role or title'), 'Lead rehab clinician');
    await user.clear(screen.getByLabelText('Clinician specialty'));
    await user.type(screen.getByLabelText('Clinician specialty'), 'Post-op recovery');
    await user.selectOptions(screen.getByLabelText('Availability status'), 'in-review');
    await user.clear(screen.getByLabelText('Workspace timezone'));
    await user.type(screen.getByLabelText('Workspace timezone'), 'America/New_York');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => {
      expect(
        screen.getByRole('link', {
          name: 'Open clinician profile settings for Dr Elena Hall. Local availability: In review.',
        }),
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Workspace time in America/New_York')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Inbox' }));

    expect(await screen.findByText('Local clinician identity')).toBeInTheDocument();
    expect(screen.getAllByText('Dr Elena Hall').length).toBeGreaterThan(0);
    expect(
      within(screen.getByLabelText('Local clinician identity')).getByText(
        'Lead rehab clinician · Post-op recovery',
      ),
    ).toBeInTheDocument();
    },
    30_000,
  );
});
