/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorklistRouteFacade } from '../../config/routeFacades';
import { resetDashboardV2GatesForTests, writeDashboardV2Gates } from '../../config/migrationGates';
import { resetTriageQueueUiStore } from '../../state/useTriageQueueUiStore';
import type { WorklistRecord } from '../../../types/models';
import {
  createJsonResponse,
  installMatchMediaMock,
  installResizeObserverMock,
} from '../../../test/mocks';

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

function CommunicationWorkspaceRoute(): JSX.Element {
  const location = useLocation();

  return <div>{`Communication workspace${location.search}`}</div>;
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

function renderWorklistRoute(): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/worklist']}>
        <Routes>
          <Route path="/worklist" element={<WorklistRouteFacade />} />
          <Route path="/patients/:patientId" element={<PatientDetailRoute />} />
          <Route path="/communication" element={<CommunicationWorkspaceRoute />} />
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
    proms: {
      dueCount: 2,
      overdueCount: 1,
      nextDueAt: '2026-03-09T06:00:00.000Z',
    },
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
    proms: {
      dueCount: 1,
      overdueCount: 1,
      nextDueAt: '2026-03-07T08:00:00.000Z',
    },
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

      if (url.searchParams.get('needsPromReview') === 'true') {
        items = items.filter((item) => (item.proms?.dueCount ?? 0) > 0);
      }

      if (url.searchParams.get('assignedToMe') === 'true') {
        items = items.filter((item) => item.patientId === 'p1');
      }

      const status = url.searchParams.get('status');
      if (status) {
        items = items.filter((item) => item.patientStatus === status);
      }

      if (url.searchParams.get('sort') === 'patientName') {
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

function enableWorklistV2(): void {
  writeDashboardV2Gates({
    shell: false,
    routes: {
      dashboard: false,
      worklist: true,
      communication: false,
      'patient-workspace': false,
      alerts: false,
      insights: false,
      appointments: false,
      settings: false,
    },
  });
}

describe('TriageQueueRoute', () => {
  const asyncQueryTimeout = { timeout: 5000 };

  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('aura_access_token', 'TEST_TOKEN');
    installResizeObserverMock();
    installMatchMediaMock(() => false);
    resetDashboardV2GatesForTests();
    resetTriageQueueUiStore();
  });

  afterEach(() => {
    cleanup();
    resetDashboardV2GatesForTests();
    resetTriageQueueUiStore();
  });

  it('keeps the legacy worklist as the default fallback when the gate is off', async () => {
    installWorklistFetchMock();

    renderWorklistRoute();

    expect(await screen.findByRole('heading', { name: 'Queue' }, asyncQueryTimeout)).toBeInTheDocument();
    expect(screen.queryByTestId('triage-queue-route')).not.toBeInTheDocument();
    expect(await screen.findByTestId('worklist-row-p1', undefined, asyncQueryTimeout)).toBeInTheDocument();
  });

  it('renders the v2 triage route behind the gate and keeps row selection in-route', async () => {
    enableWorklistV2();
    installWorklistFetchMock();

    renderWorklistRoute();

    expect(await screen.findByTestId('triage-queue-route', undefined, asyncQueryTimeout)).toBeInTheDocument();
    expect(await screen.findByTestId('triage-active-workspace', undefined, asyncQueryTimeout)).toHaveTextContent('Jordan Lee');

    const averyRow = screen.getByTestId('triage-queue-row-p2');
    await userEvent.click(averyRow);

    expect(screen.queryByText('Patient detail workspace')).not.toBeInTheDocument();
    expect(screen.getByTestId('triage-active-workspace')).toHaveTextContent('Avery Chen');

    fireEvent.focus(screen.getByTestId('triage-queue-row-p1'));
    fireEvent.keyDown(screen.getByTestId('triage-queue-row-p1'), { key: 'ArrowDown' });
    expect(screen.getByTestId('triage-queue-row-p2')).toHaveFocus();
  });

  it('preserves query semantics for v2 filters', async () => {
    enableWorklistV2();
    const { requests } = installWorklistFetchMock();

    renderWorklistRoute();

    expect(await screen.findByTestId('triage-queue-row-p1', undefined, asyncQueryTimeout)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'High risk' }));

    await waitFor(() => {
      expect(requests.some((request) => request.searchParams.get('highRiskOnly') === 'true')).toBe(true);
    });

    expect(screen.queryByText('Avery Chen')).not.toBeInTheDocument();
  });

  it('preserves CTA destinations and shows Unknown governance metadata conservatively', async () => {
    enableWorklistV2();
    installWorklistFetchMock();

    renderWorklistRoute();

    const averyRow = await screen.findByTestId('triage-queue-row-p2');
    await userEvent.click(averyRow);

    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(1);

    await userEvent.click(screen.getByRole('button', { name: 'Open patient' }));

    await waitFor(() => {
      expect(screen.getByText('Patient detail workspace')).toBeInTheDocument();
    });
    expect(screen.getByTestId('patient-detail-route-state')).toHaveTextContent('"source":"worklist"');
    expect(screen.getByTestId('patient-detail-route-state')).toHaveTextContent('"focus":"workflow"');
    expect(screen.getByTestId('patient-detail-route-state')).toHaveTextContent('"returnTo":"/worklist"');
  });

  it('restores the selected case across remounts while the v2 gate stays enabled', async () => {
    enableWorklistV2();
    installWorklistFetchMock();

    renderWorklistRoute();

    const averyRow = await screen.findByTestId('triage-queue-row-p2');
    await userEvent.click(averyRow);
    expect(screen.getByTestId('triage-active-workspace')).toHaveTextContent('Avery Chen');

    cleanup();
    renderWorklistRoute();

    expect(await screen.findByTestId('triage-active-workspace')).toHaveTextContent('Avery Chen');
  });

  it('switches to queue-first focus on narrow layouts until a case is selected', async () => {
    installMatchMediaMock((query) => {
      if (query === '(max-width: 1279px)') {
        return true;
      }

      if (query === '(max-width: 1023px)') {
        return true;
      }

      if (query === '(max-width: 599px)') {
        return false;
      }

      return false;
    });
    enableWorklistV2();
    installWorklistFetchMock();

    renderWorklistRoute();

    expect(await screen.findByTestId('triage-queue-row-p1')).toBeInTheDocument();
    expect(screen.queryByTestId('triage-active-workspace')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('triage-queue-row-p1'));
    expect(await screen.findByTestId('triage-active-workspace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to queue' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back to queue' }));
    expect(screen.queryByTestId('triage-active-workspace')).not.toBeInTheDocument();
    expect(screen.getByTestId('triage-queue-row-p1')).toBeInTheDocument();
  });
});
