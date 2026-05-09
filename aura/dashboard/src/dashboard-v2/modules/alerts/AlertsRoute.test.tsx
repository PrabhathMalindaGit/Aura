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
import { AlertsRouteFacade } from '../../config/routeFacades';
import {
  getDefaultDashboardV2Gates,
  resetDashboardV2GatesForTests,
  writeDashboardV2Gates,
} from '../../config/migrationGates';
import { resetAlertsUiStore } from '../../state/useAlertsUiStore';
import {
  createJsonResponse,
  installMatchMediaMock,
  installResizeObserverMock,
} from '../../../test/mocks';
import type {
  AlertItem,
  AlertStatus,
  PatientSummary,
} from '../../../types/models';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ROUTE_LOAD_TIMEOUT_MS = 3_000;

function recentIso(hoursAgo: number, minutesAgo = 0): string {
  return new Date(Date.now() - hoursAgo * HOUR_MS - minutesAgo * 60 * 1000).toISOString();
}

function recentDay(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

const OPEN_ALERTS: AlertItem[] = [
  {
    _id: 'alert-1',
    patientId: 'patient-1',
    risk: 'high',
    riskAuto: 'high',
    reason: ['PAIN_GE_THRESHOLD'],
    reasonsAuto: ['Pain threshold reached'],
    source: {
      type: 'checkin',
      sourceId: 'checkin-1',
    },
    status: 'open',
    createdAt: recentIso(2, 15),
    updatedAt: recentIso(2, 15),
    notificationChannel: 'telegram',
    notificationStatus: 'failed',
    notificationFailedAt: recentIso(2, 14),
    notificationError: 'Delivery failed.',
  },
  {
    _id: 'alert-2',
    patientId: 'patient-2',
    risk: 'medium',
    riskAuto: 'medium',
    reason: 'MISSED_CHECKIN_THRESHOLD',
    source: {
      type: 'chat',
      sourceId: 'message-2',
    },
    status: 'open',
    createdAt: recentIso(3),
    updatedAt: recentIso(3),
    assignedTo: 'clinician-2',
    assignedToName: 'Dr Other Clinician',
    assignedAt: recentIso(2, 59),
    assignmentSource: 'manual',
  },
];

const ACKNOWLEDGED_ALERTS: AlertItem[] = [
  {
    ...OPEN_ALERTS[0],
    _id: 'alert-ack-1',
    patientId: 'patient-3',
    status: 'acknowledged',
    updatedAt: recentIso(1, 20),
    acknowledgedAt: recentIso(1, 20),
  },
];

const RESOLVED_ALERTS: AlertItem[] = [];

const PATIENTS: PatientSummary[] = [
  {
    id: 'patient-1',
    displayName: 'Jordan Lee',
    status: 'active',
    lastCheckinAt: recentIso(5),
  },
  {
    id: 'patient-2',
    displayName: 'Avery Chen',
  },
];

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

function PatientWorkspaceEcho(): JSX.Element {
  const location = useLocation();
  return <div>{`Patient workspace ${JSON.stringify(location.state)}`}</div>;
}

function renderAlertsRoute(initialEntry: string = '/alerts'): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/alerts" element={<AlertsRouteFacade />} />
          <Route path="/patients/:patientId" element={<PatientWorkspaceEcho />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function installAlertsFetchMock(): void {
  const alertsByStatus: Record<AlertStatus, AlertItem[]> = {
    open: [...OPEN_ALERTS],
    acknowledged: [...ACKNOWLEDGED_ALERTS],
    resolved: [...RESOLVED_ALERTS],
  };

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');

    if (url.pathname === '/clinician/alerts') {
      const status = (url.searchParams.get('status') ?? 'open') as AlertStatus;
      return createJsonResponse({
        ok: true,
        alerts: alertsByStatus[status] ?? [],
      });
    }

    if (url.pathname === '/clinician/patients') {
      return createJsonResponse({
        ok: true,
        patients: PATIENTS,
      });
    }

    if (url.pathname.match(/^\/clinician\/alerts\/[^/]+\/context$/)) {
      const alertId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const alert = [...alertsByStatus.open, ...alertsByStatus.acknowledged, ...alertsByStatus.resolved].find(
        (item) => item._id === alertId,
      );
      if (!alert) {
        return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      return createJsonResponse({
        ok: true,
        alert,
        timeline: [
          {
            type: 'ALERT_CREATED',
            at: alert.createdAt,
            label: 'Alert created',
            status: 'ok',
          },
        ],
        triggeringEvent:
          alert.source.type === 'chat'
            ? {
                type: 'chat',
                id: alert.source.sourceId,
                text: 'Patient asked whether tomorrow still works.',
                createdAt: alert.createdAt,
                role: 'user',
              }
            : {
                type: 'checkin',
                id: alert.source.sourceId,
                date: recentDay(),
                pain: 8,
                mood: 3,
                createdAt: alert.createdAt,
              },
      });
    }

    if (url.pathname.match(/^\/clinician\/alerts\/[^/]+$/) && init?.method === 'PATCH') {
      const alertId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const payload = init.body
        ? (JSON.parse(String(init.body)) as { status?: 'acknowledged' | 'resolved' })
        : null;
      const current = alertsByStatus.open.find((item) => item._id === alertId);
      if (!current || !payload?.status) {
        return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      const updatedAlert: AlertItem = {
        ...current,
        status: payload.status,
        updatedAt: recentIso(1, 10),
        ...(payload.status === 'acknowledged'
          ? { acknowledgedAt: recentIso(1, 10) }
          : { resolvedAt: recentIso(1, 10) }),
      };

      alertsByStatus.open = alertsByStatus.open.filter((item) => item._id !== alertId);
      alertsByStatus[payload.status] = [updatedAlert, ...alertsByStatus[payload.status]];

      return createJsonResponse({ ok: true, alert: updatedAlert });
    }

    if (url.pathname.match(/^\/clinician\/alerts\/[^/]+\/assignment$/) && init?.method === 'PATCH') {
      const alertId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const current = alertsByStatus.open.find((item) => item._id === alertId);
      if (!current) {
        return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      const payload = init.body
        ? (JSON.parse(String(init.body)) as {
            assignedTo?: string | null;
            assignedToName?: string;
          })
        : null;

      const updatedAlert: AlertItem = {
        ...current,
        assignedTo: payload?.assignedTo ?? undefined,
        assignedToName: payload?.assignedTo ? payload.assignedToName ?? payload.assignedTo : undefined,
        assignedAt: payload?.assignedTo ? recentIso(1, 5) : undefined,
        assignmentSource: payload?.assignedTo ? 'manual' : undefined,
      };

      alertsByStatus.open = alertsByStatus.open.map((item) =>
        item._id === alertId ? updatedAlert : item,
      );

      return createJsonResponse({ ok: true, alert: updatedAlert });
    }

    if (url.pathname.match(/^\/clinician\/alerts\/[^/]+\/risk-override$/) && init?.method === 'PATCH') {
      const alertId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const current = alertsByStatus.open.find((item) => item._id === alertId);
      if (!current) {
        return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      const payload = init.body
        ? (JSON.parse(String(init.body)) as { riskFinal?: string; overrideReason?: string })
        : null;
      if (!payload?.riskFinal) {
        return createJsonResponse({ ok: false, error: 'VALIDATION_ERROR' }, 400);
      }

      const updatedAlert: AlertItem = {
        ...current,
        riskFinal: payload.riskFinal,
        overrideReason: payload.overrideReason ?? 'Confirmed auto risk.',
        overriddenAt: recentIso(1),
        overriddenBy: 'clinician-1',
        overriddenByName: 'Clinician',
      };

      alertsByStatus.open = alertsByStatus.open.map((item) =>
        item._id === alertId ? updatedAlert : item,
      );

      return createJsonResponse({ ok: true, alert: updatedAlert });
    }

    if (url.pathname.match(/^\/clinician\/alerts\/[^/]+\/risk-override$/) && init?.method === 'DELETE') {
      const alertId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const current = alertsByStatus.open.find((item) => item._id === alertId);
      if (!current) {
        return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      const updatedAlert: AlertItem = {
        ...current,
        riskFinal: undefined,
        overrideReason: undefined,
        overriddenAt: undefined,
        overriddenBy: undefined,
        overriddenByName: undefined,
      };

      alertsByStatus.open = alertsByStatus.open.map((item) =>
        item._id === alertId ? updatedAlert : item,
      );

      return createJsonResponse({ ok: true, alert: updatedAlert });
    }

    if (url.pathname.match(/^\/clinician\/alerts\/[^/]+\/retry-notification$/) && init?.method === 'POST') {
      const alertId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const current = alertsByStatus.open.find((item) => item._id === alertId);
      if (!current) {
        return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      const updatedAlert: AlertItem = {
        ...current,
        notificationStatus: 'unknown',
        notificationAttemptedAt: recentIso(0, 55),
        notificationRetryCount: (current.notificationRetryCount ?? 0) + 1,
      };

      alertsByStatus.open = alertsByStatus.open.map((item) =>
        item._id === alertId ? updatedAlert : item,
      );

      return createJsonResponse({
        ok: true,
        status: 'queued',
        alert: updatedAlert,
      });
    }

    return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
  });
}

function setAlertsGate(enabled: boolean): void {
  const defaults = getDefaultDashboardV2Gates();

  writeDashboardV2Gates({
    ...defaults,
    routes: {
      ...defaults.routes,
      alerts: enabled,
    },
  });
}

describe('AlertsRoute', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('aura_access_token', 'TEST_TOKEN');
    installMatchMediaMock(() => false);
    installResizeObserverMock();
    resetDashboardV2GatesForTests();
    resetAlertsUiStore();
    installAlertsFetchMock();
  });

  afterEach(() => {
    cleanup();
    resetDashboardV2GatesForTests();
    resetAlertsUiStore();
  });

  it('falls back to the legacy alerts page when the route is explicitly rolled back', async () => {
    setAlertsGate(false);
    renderAlertsRoute();

    expect(await screen.findByText('Safety triage', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(screen.queryByTestId('v2-alerts-route')).not.toBeInTheDocument();
  });

  it('renders the v2 alerts route by default and keeps selection in-route', async () => {
    const user = userEvent.setup();

    renderAlertsRoute();

    expect(await screen.findByTestId('v2-alerts-route', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Alert governance', level: 2 }, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alert governance', level: 1 })).not.toBeInTheDocument();
    expect(await screen.findByTestId('v2-alerts-queue-pane', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(await screen.findByTestId('v2-alert-row-alert-1', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(await screen.findByTestId('v2-alert-review-workspace', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toHaveTextContent('Jordan Lee');
    expect(screen.queryByTestId('v2-alert-governance-rail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Context' })).toBeInTheDocument();

    await user.click(screen.getByTestId('v2-alert-row-alert-2'));

    await waitFor(() => {
      expect(screen.getByTestId('v2-alert-review-workspace')).toHaveTextContent('Avery Chen');
    });
  });

  it('moves alert queue focus with arrow keys without selecting until activation', async () => {
    const user = userEvent.setup();

    renderAlertsRoute();

    expect(await screen.findByTestId('v2-alert-review-workspace', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toHaveTextContent('Jordan Lee');

    const firstRow = await screen.findByTestId('v2-alert-row-alert-1', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS });
    const secondRow = await screen.findByTestId('v2-alert-row-alert-2', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS });

    firstRow.focus();
    fireEvent.keyDown(firstRow, { key: 'ArrowRight' });

    expect(secondRow).toHaveFocus();
    expect(screen.getByTestId('v2-alert-review-workspace')).toHaveTextContent('Jordan Lee');

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(
      fetchMock.mock.calls.some(([, init]) =>
        ['PATCH', 'POST', 'PUT', 'DELETE'].includes(String(init?.method ?? 'GET').toUpperCase()),
      ),
    ).toBe(false);

    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByTestId('v2-alert-review-workspace')).toHaveTextContent('Avery Chen');
    });
    expect(screen.getByLabelText('Selected alert')).toBeInTheDocument();
  });

  it('keeps selected review aligned with the filtered queue', async () => {
    const user = userEvent.setup();

    renderAlertsRoute();

    expect(await screen.findByTestId('v2-alert-review-workspace', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toHaveTextContent('Jordan Lee');

    await user.click(screen.getByTestId('v2-alert-row-alert-2'));
    await waitFor(() => {
      expect(screen.getByTestId('v2-alert-review-workspace')).toHaveTextContent('Avery Chen');
    });

    const searchInput = screen.getByPlaceholderText('Search patient, alert id, or reason');
    await user.type(searchInput, 'patient-2');

    await waitFor(() => {
      expect(screen.getByTestId('v2-alert-review-workspace')).toHaveTextContent('Avery Chen');
    });

    await user.clear(searchInput);
    await user.type(searchInput, 'patient-1');

    await waitFor(() => {
      expect(screen.getByTestId('v2-alert-review-workspace')).toHaveTextContent('Jordan Lee');
    });

    await user.clear(searchInput);
    await user.type(searchInput, 'no matching alert');

    expect(await screen.findByRole('heading', { name: 'No alerts match this filtered view.' })).toBeInTheDocument();
    expect(screen.getByText('Reset filters to return to the full governance queue.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Select an alert to begin review' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take over' })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Reset filters' }).at(-1)!);

    await waitFor(() => {
      expect(screen.getByTestId('v2-alert-review-workspace')).toHaveTextContent('Jordan Lee');
    });
  });

  it('preserves patient navigation semantics and shows Unknown when metadata is absent', async () => {
    const user = userEvent.setup();

    renderAlertsRoute('/alerts?search=patient-2');

    expect(await screen.findByTestId('v2-alerts-route', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(await screen.findByTestId('v2-alert-review-workspace', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toHaveTextContent('Avery Chen');
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Open patient' }));

    const locationEcho = await screen.findByText(/Patient workspace/);
    expect(locationEcho.textContent).toContain('"source":"alerts"');
    expect(locationEcho.textContent).toContain('"/alerts?search=patient-2"');
  });

  it('shows the governance drawer on medium layouts', async () => {
    installMatchMediaMock((query) => query.includes('max-width: 1279px'));
    const user = userEvent.setup();

    renderAlertsRoute();

    expect(await screen.findByTestId('v2-alerts-route', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(await screen.findByTestId('v2-alert-review-workspace', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Context' }));

    expect(await screen.findByRole('heading', { name: 'Alert governance context' })).toBeInTheDocument();
  });

  it('stays queue-first on narrow layouts until a clinician selects an alert', async () => {
    installMatchMediaMock(
      (query) => query.includes('max-width: 1023px') || query.includes('max-width: 1279px'),
    );
    const user = userEvent.setup();

    renderAlertsRoute();

    expect(await screen.findByTestId('v2-alerts-route', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(screen.queryByTestId('v2-alert-review-workspace')).not.toBeInTheDocument();

    await user.click(await screen.findByTestId('v2-alert-row-alert-1'));

    await waitFor(() => {
      expect(screen.getByTestId('v2-alert-review-workspace')).toHaveTextContent('Jordan Lee');
    });
  });
});
