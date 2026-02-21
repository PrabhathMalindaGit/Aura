/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertItem } from '../types/models';
import { PatientDetailPage } from './PatientDetailPage';

const patientId = 'patient-42';
const TODAY_KEY = new Date().toISOString().slice(0, 10);
const PREV_KEY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const basePatientAlert: AlertItem = {
  _id: 'alt-patient-1',
  patientId,
  risk: 'high',
  reason: 'Escalating pain',
  source: { type: 'checkin', sourceId: 'checkin-01' },
  status: 'open',
  createdAt: `${TODAY_KEY}T10:00:00.000Z`,
  updatedAt: `${TODAY_KEY}T10:00:00.000Z`,
};

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

function installWindowMocks(): void {
  class ResizeObserverMock {
    observe(): void {
      // noop for chart container tests
    }

    unobserve(): void {
      // noop for chart container tests
    }

    disconnect(): void {
      // noop for chart container tests
    }
  }

  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverMock,
  });

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

function renderPatientDetail(initialEntry: string = `/patients/${patientId}?days=14`): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/patients/:patientId" element={<PatientDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function installFetchMock() {
  const otherPatientAlert: AlertItem = {
    ...basePatientAlert,
    _id: 'alt-other-1',
    patientId: 'patient-other',
  };

  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);

    if (url.includes(`/clinician/patients/${patientId}/trends`) && url.includes('days=14')) {
      return createJsonResponse({
        ok: true,
        trends: [
          {
            date: TODAY_KEY,
            pain: 8,
            mood: 4,
            adherence: {
              exercises: 0.5,
              medication: true,
            },
            notes: 'Hard day with mobility limits.',
          },
        ],
      });
    }

    if (url.includes(`/clinician/patients/${patientId}/trends`) && url.includes('days=30')) {
      return createJsonResponse({
        ok: true,
        trends: [
          {
            date: PREV_KEY,
            pain: 6,
            mood: 5,
            adherence: {
              exercises: 0.7,
              medication: false,
            },
          },
        ],
      });
    }

    if (url.includes('/clinician/alerts?status=open')) {
      return createJsonResponse({
        ok: true,
        alerts: [basePatientAlert, otherPatientAlert],
      });
    }

    if (url.includes('/clinician/alerts?status=acknowledged')) {
      return createJsonResponse({ ok: true, alerts: [] });
    }

    if (url.includes('/clinician/alerts?status=resolved')) {
      return createJsonResponse({ ok: true, alerts: [] });
    }

    if (url.endsWith('/clinician/patients')) {
      return createJsonResponse({
        ok: true,
        patients: [
          {
            id: patientId,
            displayName: 'Taylor Moss',
            status: 'active',
          },
        ],
      });
    }

    return createJsonResponse({ ok: true });
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  installWindowMocks();
});

afterEach(() => {
  cleanup();
});

describe('PatientDetailPage', () => {
  it('click-through day detail opens with selected date content', async () => {
    installFetchMock();

    const user = userEvent.setup();
    renderPatientDetail();

    await screen.findByText('alt-patient-1');
    const detailButtons = await screen.findAllByRole('button', {
      name: /View details|Open day detail/i,
    });
    await user.click(detailButtons[0]);

    expect(await screen.findByRole('dialog', { name: /Day detail/i })).toBeInTheDocument();
    expect(screen.getByText('Check-in snapshot')).toBeInTheDocument();
    expect(screen.getByText('Alerts on this day')).toBeInTheDocument();
  });

  it('switching 14/30 refetches trends and closes day detail panel', async () => {
    const fetchMock = installFetchMock();

    const user = userEvent.setup();
    renderPatientDetail(`/patients/${patientId}?days=14`);

    await screen.findByText('alt-patient-1');
    const detailButtons = await screen.findAllByRole('button', {
      name: /View details|Open day detail/i,
    });
    await user.click(detailButtons[0]);
    expect(await screen.findByRole('dialog', { name: /Day detail/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '30 days' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Day detail/i })).not.toBeInTheDocument();
    });

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(calls.some((url) => url.includes(`/clinician/patients/${patientId}/trends?days=30`))).toBe(true);
    });
  });

  it('renders only alerts that belong to the selected patient', async () => {
    installFetchMock();

    renderPatientDetail();

    expect(await screen.findByText('alt-patient-1')).toBeInTheDocument();
    expect(screen.queryByText('alt-other-1')).not.toBeInTheDocument();
  });
});
