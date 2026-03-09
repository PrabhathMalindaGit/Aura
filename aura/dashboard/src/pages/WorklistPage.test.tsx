/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorklistPage } from './WorklistPage';
import { createJsonResponse, installMatchMediaMock } from '../test/mocks';
import type { WorklistRecord } from '../types/models';

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

function renderWorklistPage(): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/worklist']}>
        <Routes>
          <Route path="/worklist" element={<WorklistPage />} />
          <Route path="/patients/:patientId" element={<div>Patient detail workspace</div>} />
          <Route path="/alerts" element={<div>Alerts workspace</div>} />
          <Route path="/appointments" element={<div>Appointments workspace</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const WORKLIST_ITEMS: WorklistRecord[] = [
  {
    patientId: 'p1',
    patientName: 'Jordan Lee',
    patientStatus: 'active',
    rehabPhase: 'Strength & Control',
    lastCheckinAt: '2026-03-09T08:00:00.000Z',
    openAlertsCount: 2,
    latestRiskLevel: 'high',
    lastPainScore: 8,
    adherenceSummary: {
      exercisesPct: 0.4,
      medicationTaken: false,
    },
    nextAppointmentAt: '2026-03-09T14:00:00.000Z',
    missedCheckins: {
      flag: false,
      count: 0,
    },
    communicationNeedsResponse: true,
    activeTaskCount: 2,
    topIssue: 'High pain escalation',
    reviewReason: 'Patient chat and safety review both need follow-up.',
    priorityScore: 92,
    updatedAt: '2026-03-09T09:00:00.000Z',
  },
  {
    patientId: 'p2',
    patientName: 'Avery Chen',
    patientStatus: 'on_hold',
    rehabPhase: 'Return to mobility',
    lastCheckinAt: '2026-03-05T08:00:00.000Z',
    openAlertsCount: 0,
    latestRiskLevel: 'low',
    lastPainScore: 3,
    adherenceSummary: {
      exercisesPct: 0.75,
      medicationTaken: true,
    },
    missedCheckins: {
      flag: true,
      count: 2,
    },
    communicationNeedsResponse: false,
    activeTaskCount: 1,
    topIssue: 'Missed daily check-ins',
    reviewReason: 'Follow-up is needed before the next rehab step.',
    priorityScore: 48,
    updatedAt: '2026-03-08T10:00:00.000Z',
  },
];

function installWorklistFetchMock(): { requests: URL[] } {
  const requests: URL[] = [];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));

    if (url.pathname === '/clinician/worklist') {
      requests.push(url);
      let items = [...WORKLIST_ITEMS];

      const search = url.searchParams.get('search')?.trim().toLowerCase();
      if (search) {
        items = items.filter(
          (item) =>
            item.patientName.toLowerCase().includes(search) ||
            item.patientId.toLowerCase().includes(search),
        );
      }

      if (url.searchParams.get('highRiskOnly') === 'true') {
        items = items.filter((item) => item.latestRiskLevel === 'high');
      }

      if (url.searchParams.get('hasOpenAlerts') === 'true') {
        items = items.filter((item) => item.openAlertsCount > 0);
      }

      if (url.searchParams.get('needsResponse') === 'true') {
        items = items.filter((item) => item.communicationNeedsResponse);
      }

      if (url.searchParams.get('missedCheckins') === 'true') {
        items = items.filter((item) => item.missedCheckins.flag);
      }

      if (url.searchParams.get('assignedToMe') === 'true') {
        items = items.filter((item) => item.patientId === 'p1');
      }

      const status = url.searchParams.get('status');
      if (status) {
        items = items.filter((item) => item.patientStatus === status);
      }

      const sort = url.searchParams.get('sort');
      if (sort === 'patientName') {
        items.sort((left, right) => left.patientName.localeCompare(right.patientName));
      }

      return createJsonResponse({
        ok: true,
        items,
        total: items.length,
      });
    }

    return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
  });

  return { requests };
}

describe('WorklistPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('aura_access_token', 'TEST_TOKEN');
    installMatchMediaMock(() => false);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders operational worklist rows and routes safely to patient detail', async () => {
    installWorklistFetchMock();

    renderWorklistPage();

    expect(await screen.findByRole('heading', { name: 'Worklist' })).toBeInTheDocument();
    expect(screen.getByText('High pain escalation')).toBeInTheDocument();
    expect(screen.getByText('Missed daily check-ins')).toBeInTheDocument();
    expect(within(screen.getByTestId('worklist-row-p1')).getByText('Needs response')).toBeInTheDocument();

    const jordanRow = screen.getByTestId('worklist-row-p1');
    await userEvent.click(within(jordanRow).getByRole('button', { name: 'Open patient' }));

    await waitFor(() => {
      expect(screen.getByText('Patient detail workspace')).toBeInTheDocument();
    });
  }, 10000);

  it('applies backend-backed filters and sort selections', async () => {
    const { requests } = installWorklistFetchMock();
    renderWorklistPage();

    expect(await screen.findByText('Jordan Lee')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'High risk' }));

    await waitFor(() => {
      expect(requests.some((request) => request.searchParams.get('highRiskOnly') === 'true')).toBe(true);
    });
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.queryByText('Avery Chen')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Sort worklist'), {
      target: { value: 'patientName' },
    });

    await waitFor(() => {
      expect(requests.some((request) => request.searchParams.get('sort') === 'patientName')).toBe(true);
    });
  });

  it('renders filtered empty state and reset flow correctly', async () => {
    installWorklistFetchMock();
    renderWorklistPage();

    expect(await screen.findByText('Jordan Lee')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search worklist'), {
      target: { value: 'zzz' },
    });

    await waitFor(
      () => {
        expect(screen.getByRole('heading', { name: 'No patients match this view' })).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(await screen.findByText('Jordan Lee')).toBeInTheDocument();
  });
});
