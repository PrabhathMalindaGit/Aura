/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorklistPage } from './WorklistPage';
import { getWorkspaceStateStorageKey } from '../services/workspaceState';
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

function AlertsWorkspaceRoute(): JSX.Element {
  const location = useLocation();

  return <div>{`Alerts workspace${location.search}`}</div>;
}

function PatientDetailRoute(): JSX.Element {
  const location = useLocation();

  return (
    <div>
      <div>Patient detail workspace</div>
      <pre data-testid="patient-detail-route-state">
        {JSON.stringify(location.state ?? null)}
      </pre>
    </div>
  );
}

function renderWorklistPage(): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/worklist']}>
        <Routes>
          <Route path="/worklist" element={<WorklistPage />} />
          <Route path="/patients/:patientId" element={<PatientDetailRoute />} />
          <Route path="/alerts" element={<AlertsWorkspaceRoute />} />
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

function installWorklistFetchMock(itemsSeed: WorklistRecord[] = WORKLIST_ITEMS): { requests: URL[] } {
  const requests: URL[] = [];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));

    if (url.pathname === '/clinician/worklist') {
      requests.push(url);
      let items = [...itemsSeed];

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
    expect(screen.getByTestId('patient-detail-route-state')).toHaveTextContent('"source":"worklist"');
    expect(screen.getByTestId('patient-detail-route-state')).toHaveTextContent('"focus":"workflow"');
    expect(screen.getByTestId('patient-detail-route-state')).toHaveTextContent('"returnTo":"/worklist"');
  }, 10000);

  it('shows high-risk guidance when high-risk review leads the current queue', async () => {
    installWorklistFetchMock();

    renderWorklistPage();

    expect(await screen.findByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText('High-risk review still leads this current queue.')).toBeInTheDocument();
  });

  it('shows response-follow-up guidance when that leads the current queue view', async () => {
    installWorklistFetchMock([
      {
        ...WORKLIST_ITEMS[0],
        patientId: 'p-response',
        patientName: 'Morgan Diaz',
        latestRiskLevel: 'medium',
        openAlertsCount: 0,
        communicationNeedsResponse: true,
        topIssue: 'Message follow-up needed',
      },
    ]);

    renderWorklistPage();

    expect(await screen.findByText('Morgan Diaz')).toBeInTheDocument();
    expect(screen.getByText('Response follow-up still leads this current queue.')).toBeInTheDocument();
  });

  it('shows alert-linked guidance when alerts are the remaining review signal', async () => {
    installWorklistFetchMock([
      {
        ...WORKLIST_ITEMS[0],
        patientId: 'p-alert',
        patientName: 'Casey Brown',
        latestRiskLevel: 'low',
        openAlertsCount: 1,
        communicationNeedsResponse: false,
        topIssue: 'Alert follow-up needed',
      },
    ]);

    renderWorklistPage();

    expect(await screen.findByText('Casey Brown')).toBeInTheDocument();
    expect(screen.getByText('Alert-linked review still remains in this current queue.')).toBeInTheDocument();
  });

  it('shows calm clear guidance when the unfiltered queue is empty', async () => {
    installWorklistFetchMock([]);

    renderWorklistPage();

    expect(await screen.findByText('No patients need active review')).toBeInTheDocument();
    expect(screen.getByText('Active review is clear right now.')).toBeInTheDocument();
  });

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

  it('restores saved workspace filters and clears local continuity on clear view', async () => {
    const { requests } = installWorklistFetchMock();
    window.localStorage.setItem(
      getWorkspaceStateStorageKey('worklist', 'clinician-1'),
      JSON.stringify({
        search: 'Jordan',
        highRiskOnly: true,
        hasOpenAlerts: false,
        needsResponse: false,
        missedCheckins: false,
        assignedToMe: false,
        status: 'all',
        sort: 'patientName',
      }),
    );

    renderWorklistPage();

    const searchInput = await screen.findByRole('searchbox', { name: 'Search worklist' });
    expect(searchInput).toHaveValue('Jordan');

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.searchParams.get('search') === 'Jordan' &&
            request.searchParams.get('highRiskOnly') === 'true' &&
            request.searchParams.get('sort') === 'patientName',
        ),
      ).toBe(true);
    });

    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.queryByText('Avery Chen')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear view' }));

    expect(window.localStorage.getItem(getWorkspaceStateStorageKey('worklist', 'clinician-1'))).toBeNull();

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Search worklist' })).toHaveValue('');
      expect(screen.getByText('Avery Chen')).toBeInTheDocument();
    });
  });

  it('routes Open alerts with patient context when available and falls back safely otherwise', async () => {
    installWorklistFetchMock([
      WORKLIST_ITEMS[0],
      {
        ...WORKLIST_ITEMS[1],
        openAlertsCount: 1,
        patientId: '   ',
        patientName: 'Fallback Patient',
      },
    ]);

    renderWorklistPage();

    const jordanRow = await screen.findByTestId('worklist-row-p1');
    await userEvent.click(within(jordanRow).getByRole('button', { name: 'Open alerts' }));

    await waitFor(() => {
      expect(screen.getByText('Alerts workspace?patientId=p1')).toBeInTheDocument();
    });

    cleanup();
    renderWorklistPage();

    const fallbackPatientName = await screen.findByText('Fallback Patient');
    const fallbackRow = fallbackPatientName.closest('tr');
    expect(fallbackRow).not.toBeNull();
    await userEvent.click(within(fallbackRow as HTMLElement).getByRole('button', { name: 'Open alerts' }));

    await waitFor(() => {
      expect(screen.getByText('Alerts workspace')).toBeInTheDocument();
    });
    expect(screen.queryByText('Alerts workspace?patientId=%20%20%20')).not.toBeInTheDocument();
  });
});
