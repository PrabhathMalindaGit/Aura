/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertsPage } from './AlertsPage';
import { clearAssignmentStoreForTests, setAssignment } from '../services/assignmentStore';
import { clearClinicianIdentityForTests, setClinicianIdentity } from '../services/clinicianIdentity';
import { clearRiskOverrideStoreForTests, setRiskOverride } from '../services/overrideStore';
import { clearSeenStoreForTests, getSeenStorageKey, markSeen } from '../services/seenStore';
import { getWorkspaceStateStorageKey } from '../services/workspaceState';
import type { AlertItem } from '../types/models';

const baseAlert: AlertItem = {
  _id: 'alt-001',
  patientId: 'patient-42',
  risk: 'high',
  reason: 'Pain increase and missed medication',
  source: { type: 'checkin', sourceId: 'checkin-abc' },
  status: 'open',
  createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
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

function renderAlertsPage(initialEntry: string = '/alerts'): void {
  const queryClient = createQueryClient();

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/patients/:patientId" element={<PatientDetailRoute />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
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

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  });

  document.dispatchEvent(new Event('visibilitychange'));
}

function installMatchMediaMock(
  resolveMatches: (query: string) => boolean = () => false,
): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: resolveMatches(query),
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

function installStatefulAlertsFetchMock(options: {
  open?: AlertItem[];
  acknowledged?: AlertItem[];
  resolved?: AlertItem[];
  failUpdateIds?: string[];
}): void {
  let openAlerts = [...(options.open ?? [])];
  let acknowledgedAlerts = [...(options.acknowledged ?? [])];
  let resolvedAlerts = [...(options.resolved ?? [])];
  const failingIds = new Set(options.failUpdateIds ?? []);

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = String(init?.method ?? 'GET').toUpperCase();

    if (url.pathname === '/clinician/alerts' && method === 'GET') {
      const status = url.searchParams.get('status') ?? 'open';
      if (status === 'acknowledged') {
        return createJsonResponse({ ok: true, alerts: acknowledgedAlerts });
      }
      if (status === 'resolved') {
        return createJsonResponse({ ok: true, alerts: resolvedAlerts });
      }
      return createJsonResponse({ ok: true, alerts: openAlerts });
    }

    if (url.pathname.startsWith('/clinician/alerts/') && method === 'PATCH') {
      const alertId = decodeURIComponent(url.pathname.split('/').pop() ?? '');

      if (failingIds.has(alertId)) {
        return createJsonResponse({ ok: false }, 500);
      }

      const body =
        typeof init?.body === 'string' && init.body.length > 0
          ? (JSON.parse(init.body) as { status?: AlertStatus })
          : {};
      const nextStatus = body.status === 'resolved' ? 'resolved' : 'acknowledged';
      const sourceAlert =
        openAlerts.find((alert) => alert._id === alertId) ??
        acknowledgedAlerts.find((alert) => alert._id === alertId) ??
        resolvedAlerts.find((alert) => alert._id === alertId);

      if (!sourceAlert) {
        return createJsonResponse({ ok: false }, 404);
      }

      openAlerts = openAlerts.filter((alert) => alert._id !== alertId);
      acknowledgedAlerts = acknowledgedAlerts.filter((alert) => alert._id !== alertId);
      resolvedAlerts = resolvedAlerts.filter((alert) => alert._id !== alertId);

      const updatedAlert: AlertItem = {
        ...sourceAlert,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
        acknowledgedAt:
          nextStatus === 'acknowledged' ? new Date().toISOString() : sourceAlert.acknowledgedAt,
        resolvedAt: nextStatus === 'resolved' ? new Date().toISOString() : sourceAlert.resolvedAt,
      };

      if (nextStatus === 'acknowledged') {
        acknowledgedAlerts = [updatedAlert, ...acknowledgedAlerts];
      } else {
        resolvedAlerts = [updatedAlert, ...resolvedAlerts];
      }

      return createJsonResponse({ ok: true, alert: updatedAlert });
    }

    return createJsonResponse({ ok: true, alerts: [] });
  });
}

beforeAll(() => {
  installMatchMediaMock();
});

beforeEach(() => {
  vi.restoreAllMocks();
  installMatchMediaMock();
  window.localStorage.clear();
  window.sessionStorage.clear();
  clearAssignmentStoreForTests();
  clearClinicianIdentityForTests();
  clearRiskOverrideStoreForTests();
  clearSeenStoreForTests();
  clearSeenStoreForTests('clinician-1');
  setClinicianIdentity('clinician-1', 'Clinician 1');
  setDocumentHidden(false);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('AlertsPage queue flow', () => {
  it('keeps chat-origin continuity informational only when opened from patient communication', async () => {
    installStatefulAlertsFetchMock({
      open: [baseAlert],
    });

    renderAlertsPage('/alerts?patientId=patient-42&source=chat');

    expect(await screen.findByTestId('alerts-chat-origin-note')).toHaveTextContent(
      'Opened from patient communication for patient-42. Keep alert review anchored to this patient context.',
    );
    expect(screen.getByRole('searchbox', { name: 'Search alerts' })).toHaveValue('patient-42');
    expect(screen.getByRole('button', { name: 'All sources' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('2-click acknowledge path works', async () => {
    const acknowledgedAlert: AlertItem = {
      ...baseAlert,
      status: 'acknowledged',
      acknowledgedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let openFetchCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/clinician/alerts?status=open') && method === 'GET') {
        openFetchCount += 1;
        return createJsonResponse({ ok: true, alerts: openFetchCount > 1 ? [] : [baseAlert] });
      }

      if (url.includes(`/clinician/alerts/${baseAlert._id}`) && method === 'PATCH') {
        return createJsonResponse({ ok: true, alert: acknowledgedAlert });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    const rowLabel = `Alert ${baseAlert._id} for patient ${baseAlert.patientId}`;
    await screen.findByLabelText(rowLabel);

    await user.click(screen.getByLabelText(rowLabel));
    await screen.findByRole('dialog', { name: 'Alert' });

    await user.click(screen.getByRole('button', { name: 'Acknowledge alert' }));

    await waitFor(() => {
      expect(screen.queryByLabelText(rowLabel)).not.toBeInTheDocument();
    });
  }, 12_000);

  it('review alert opens the drawer from the list action', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [baseAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    await screen.findByLabelText(`Alert ${baseAlert._id} for patient ${baseAlert.patientId}`);
    await user.click(screen.getByRole('button', { name: 'Review alert' }));

    expect(await screen.findByRole('dialog', { name: 'Alert' })).toBeInTheDocument();
  });

  it('shows acknowledged triage continuity and keeps the view switch explicit', async () => {
    const secondOpenAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-002',
      patientId: 'patient-77',
      reason: 'Missed check-in follow-up',
    };

    installStatefulAlertsFetchMock({
      open: [baseAlert, secondOpenAlert],
    });

    const user = userEvent.setup();
    renderAlertsPage();

    await screen.findByLabelText(`Alert ${baseAlert._id} for patient ${baseAlert.patientId}`);
    await user.click(screen.getByLabelText(`Alert ${baseAlert._id} for patient ${baseAlert.patientId}`));
    await user.click(await screen.findByRole('button', { name: 'Acknowledge alert' }));

    const outcomePanel = await screen.findByTestId('alerts-triage-outcome');
    expect(within(outcomePanel).getByText('Alert acknowledged')).toBeInTheDocument();
    expect(outcomePanel).toHaveTextContent(
      'Alert for patient-42 moved out of Open and is now visible in Acknowledged.',
    );
    expect(outcomePanel).toHaveTextContent('Open triage still needs review in this queue.');
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');

    await user.click(within(outcomePanel).getByRole('button', { name: 'View acknowledged' }));

    expect(await screen.findByRole('tab', { name: 'Acknowledged' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('shows resolved triage continuity when open triage becomes clear', async () => {
    installStatefulAlertsFetchMock({
      open: [baseAlert],
    });

    const user = userEvent.setup();
    renderAlertsPage();

    await screen.findByLabelText(`Alert ${baseAlert._id} for patient ${baseAlert.patientId}`);
    await user.click(screen.getByLabelText(`Alert ${baseAlert._id} for patient ${baseAlert.patientId}`));
    await user.click(await screen.findByRole('button', { name: 'Resolve alert' }));
    const resolveDialog = await screen.findByRole('alertdialog', { name: 'Resolve alert now?' });
    await user.click(within(resolveDialog).getByRole('button', { name: 'Resolve' }));

    const outcomePanel = await screen.findByTestId('alerts-triage-outcome');
    expect(within(outcomePanel).getByText('Alert resolved')).toBeInTheDocument();
    expect(outcomePanel).toHaveTextContent(
      'Alert for patient-42 moved out of Open and is now visible in Resolved.',
    );
    expect(outcomePanel).toHaveTextContent('Open triage is clear.');
  });

  it('clears stale triage outcome state when a later triage action fails', async () => {
    const secondOpenAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-fail-2',
      patientId: 'patient-99',
      reason: 'Second alert should fail',
    };

    let openAlerts = [baseAlert, secondOpenAlert];
    let acknowledgedAlerts: AlertItem[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = String(init?.method ?? 'GET').toUpperCase();

      if (url.includes('/clinician/alerts?status=open') && method === 'GET') {
        return createJsonResponse({ ok: true, alerts: openAlerts });
      }

      if (url.includes('/clinician/alerts?status=acknowledged') && method === 'GET') {
        return createJsonResponse({ ok: true, alerts: acknowledgedAlerts });
      }

      if (url.includes('/clinician/alerts?status=resolved') && method === 'GET') {
        return createJsonResponse({ ok: true, alerts: [] });
      }

      if (url.includes(`/clinician/alerts/${baseAlert._id}`) && method === 'PATCH') {
        const acknowledgedAlert: AlertItem = {
          ...baseAlert,
          status: 'acknowledged',
          acknowledgedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        openAlerts = openAlerts.filter((alert) => alert._id !== baseAlert._id);
        acknowledgedAlerts = [acknowledgedAlert, ...acknowledgedAlerts];

        return createJsonResponse({ ok: true, alert: acknowledgedAlert });
      }

      if (url.includes(`/clinician/alerts/${secondOpenAlert._id}`) && method === 'PATCH') {
        return createJsonResponse({ ok: false }, 500);
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    await screen.findByLabelText(`Alert ${baseAlert._id} for patient ${baseAlert.patientId}`);
    await user.click(screen.getByLabelText(`Alert ${baseAlert._id} for patient ${baseAlert.patientId}`));
    await user.click(await screen.findByRole('button', { name: 'Acknowledge alert' }));
    expect(await screen.findByTestId('alerts-triage-outcome')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Alert' })).not.toBeInTheDocument();
    });

    const secondRow = await screen.findByLabelText(
      `Alert ${secondOpenAlert._id} for patient ${secondOpenAlert.patientId}`,
    );
    await user.click(secondRow);
    const secondDialog = await screen.findByRole('dialog', { name: 'Alert' });
    expect(within(secondDialog).getByText(`Patient ${secondOpenAlert.patientId}`)).toBeInTheDocument();
    await user.click(within(secondDialog).getByRole('button', { name: 'Acknowledge alert' }));

    await waitFor(() => {
      expect(screen.getByText('Action failed')).toBeInTheDocument();
      expect(screen.queryByTestId('alerts-triage-outcome')).not.toBeInTheDocument();
      expect(
        screen.getByLabelText(`Alert ${secondOpenAlert._id} for patient ${secondOpenAlert.patientId}`),
      ).toBeInTheDocument();
    }, { timeout: 12_000 });
  });

  it('shows drawer Open patient only with valid patient context and routes to patient detail', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({
          ok: true,
          alerts: [
            baseAlert,
            {
              ...baseAlert,
              _id: 'alt-no-patient',
              patientId: '   ',
            },
          ],
        });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage('/alerts?patientId=patient-42');

    await screen.findByLabelText(`Alert ${baseAlert._id} for patient ${baseAlert.patientId}`);

    await user.click(screen.getByLabelText(`Alert ${baseAlert._id} for patient ${baseAlert.patientId}`));
    await user.click(await screen.findByRole('button', { name: 'Open patient' }));

    await waitFor(() => {
      expect(screen.getByText('Patient detail workspace')).toBeInTheDocument();
    });
    expect(screen.getByTestId('patient-detail-route-state')).toHaveTextContent('"source":"alerts"');
    expect(screen.getByTestId('patient-detail-route-state')).toHaveTextContent('"focus":"alerts"');
    expect(screen.getByTestId('patient-detail-route-state')).toHaveTextContent(
      '"returnTo":"/alerts?patientId=patient-42"',
    );

    cleanup();
    renderAlertsPage();

    await screen.findByTestId('alert-row-alt-no-patient');
    await user.click(screen.getByTestId('alert-row-alt-no-patient'));
    await screen.findByRole('dialog', { name: 'Alert' });

    expect(screen.queryByRole('button', { name: 'Open patient' })).not.toBeInTheDocument();
  });

  it('unseen becomes seen after opening drawer', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [baseAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    const rowLabel = `Alert ${baseAlert._id} for patient ${baseAlert.patientId}`;

    await screen.findByLabelText(rowLabel);
    expect(screen.getByLabelText('Unseen alert')).toBeInTheDocument();

    await user.click(screen.getByLabelText(rowLabel));
    await screen.findByRole('dialog', { name: 'Alert' });
    await user.click(screen.getByRole('button', { name: 'Close alert drawer' }));

    await waitFor(() => {
      expect(screen.getByText('Seen')).toBeInTheDocument();
    });

    const stored = window.localStorage.getItem(getSeenStorageKey('clinician-1'));
    expect(stored).toContain(baseAlert._id);
  }, 12_000);

  it('unseen-only filter hides seen alerts', async () => {
    const seenAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-seen-1',
    };
    const unseenAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-unseen-1',
      patientId: 'patient-99',
    };

    markSeen(seenAlert._id, 'clinician-1');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [seenAlert, unseenAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    const seenRowLabel = `Alert ${seenAlert._id} for patient ${seenAlert.patientId}`;
    const unseenRowLabel = `Alert ${unseenAlert._id} for patient ${unseenAlert.patientId}`;

    await screen.findByLabelText(seenRowLabel);
    await screen.findByLabelText(unseenRowLabel);

    await user.click(screen.getByRole('checkbox', { name: 'Unseen only' }));

    await waitFor(() => {
      expect(screen.queryByLabelText(seenRowLabel)).not.toBeInTheDocument();
      expect(screen.getByLabelText(unseenRowLabel)).toBeInTheDocument();
    });
  }, 12_000);

  it('restores saved workspace framing and normalizes open-only filters outside the open queue', async () => {
    const resolvedAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-resolved-1',
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: { type: 'chat', sourceId: 'chat-1' },
    };

    window.localStorage.setItem(
      getWorkspaceStateStorageKey('alerts', 'clinician-1'),
      JSON.stringify({
        status: 'resolved',
        searchValue: 'patient-42',
        sourceFilter: 'chat',
        timeRange: '30d',
        sortOrder: 'patient-asc',
        unseenOnly: true,
        assignedToMeOnly: true,
        unassignedOnly: true,
        overriddenOnly: true,
      }),
    );

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [] });
      }

      if (url.includes('/clinician/alerts?status=resolved')) {
        return createJsonResponse({ ok: true, alerts: [resolvedAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    expect(await screen.findByRole('tab', { name: 'Resolved' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('searchbox', { name: 'Search alerts' })).toHaveValue('patient-42');
    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Time range')).toHaveValue('30d');
    expect(screen.getByLabelText('Sort')).toHaveValue('patient-asc');

    await user.click(screen.getByRole('tab', { name: 'Open' }));

    expect(await screen.findByRole('checkbox', { name: 'Unseen only' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Assigned to me' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Unassigned only' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Overridden only' })).not.toBeChecked();
  });

  it('lets URL search override saved state without writing it back until search is edited', async () => {
    const workspaceKey = getWorkspaceStateStorageKey('alerts', 'clinician-1');

    window.localStorage.setItem(
      workspaceKey,
      JSON.stringify({
        status: 'open',
        searchValue: 'saved-search',
        sourceFilter: 'all',
        timeRange: '7d',
        sortOrder: 'newest',
        unseenOnly: false,
        assignedToMeOnly: false,
        unassignedOnly: false,
        overriddenOnly: false,
      }),
    );

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [baseAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    renderAlertsPage('/alerts?search=patient-42');

    expect(await screen.findByRole('searchbox', { name: 'Search alerts' })).toHaveValue('patient-42');
    expect(JSON.parse(window.localStorage.getItem(workspaceKey) ?? '{}').searchValue).toBe('saved-search');

    fireEvent.click(screen.getByRole('button', { name: 'Check-in' }));

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(workspaceKey) ?? '{}');
      expect(stored.searchValue).toBe('saved-search');
      expect(stored.sourceFilter).toBe('checkin');
    });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search alerts' }), {
      target: { value: 'patient-99' },
    });

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(workspaceKey) ?? '{}').searchValue).toBe(
        'patient-99',
      );
    });
  });

  it('acknowledged alerts do not show unseen indicator', async () => {
    const acknowledgedAlert: AlertItem = {
      ...baseAlert,
      status: 'acknowledged',
      acknowledgedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [] });
      }

      if (url.includes('/clinician/alerts?status=acknowledged')) {
        return createJsonResponse({ ok: true, alerts: [acknowledgedAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    await user.click(screen.getByRole('tab', { name: 'Acknowledged' }));

    await screen.findByLabelText(`Alert ${acknowledgedAlert._id} for patient ${acknowledgedAlert.patientId}`);
    expect(screen.queryByLabelText('Unseen alert')).not.toBeInTheDocument();
    expect(screen.getByText('Seen')).toBeInTheDocument();
  });

  it('polling is paused when document.hidden is true', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [baseAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    setDocumentHidden(true);
    renderAlertsPage();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const hasHiddenPollingInterval = setIntervalSpy.mock.calls.some((call) => call[1] === 12_000);
    expect(hasHiddenPollingInterval).toBe(false);

    setDocumentHidden(false);

    await waitFor(() => {
      const hasVisiblePollingInterval = setIntervalSpy.mock.calls.some((call) => call[1] === 12_000);
      expect(hasVisiblePollingInterval).toBe(true);
    });
  });

  it('hydrates the search filter from a patientId query parameter', async () => {
    const matchingAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-match-1',
      patientId: 'patient-42',
    };
    const otherAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-other-1',
      patientId: 'patient-99',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [matchingAlert, otherAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    renderAlertsPage('/alerts?patientId=patient-42');

    const searchInput = await screen.findByRole('searchbox', { name: 'Search alerts' });
    expect(searchInput).toHaveValue('patient-42');
    await waitFor(() => {
      expect(screen.getByLabelText('Alert alt-match-1 for patient patient-42')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Alert alt-other-1 for patient patient-99')).not.toBeInTheDocument();
  });

  it('hydrates the search filter from a search query parameter', async () => {
    const matchingAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-match-2',
      patientId: 'patient-42',
    };
    const otherAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-other-2',
      patientId: 'patient-77',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [matchingAlert, otherAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    renderAlertsPage('/alerts?search=alt-match-2');

    const searchInput = await screen.findByRole('searchbox', { name: 'Search alerts' });
    expect(searchInput).toHaveValue('alt-match-2');
    await waitFor(() => {
      expect(screen.getByLabelText('Alert alt-match-2 for patient patient-42')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Alert alt-other-2 for patient patient-77')).not.toBeInTheDocument();
  });

  it('optimistic update rollback restores row on failure', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes(`/clinician/alerts/${baseAlert._id}`)) {
        return Promise.resolve(createJsonResponse({ ok: false }, 500));
      }

      if (url.includes('/clinician/alerts?status=open') && method === 'GET') {
        return Promise.resolve(createJsonResponse({ ok: true, alerts: [baseAlert] }));
      }

      return Promise.resolve(createJsonResponse({ ok: true, alerts: [] }));
    });

    renderAlertsPage();

    const rowLabel = `Alert ${baseAlert._id} for patient ${baseAlert.patientId}`;
    await screen.findByLabelText(rowLabel);

    fireEvent.click(screen.getByLabelText(rowLabel));
    await screen.findByRole('dialog', { name: 'Alert' });

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge alert' }));

    await waitFor(() => {
      expect(screen.getByLabelText(rowLabel)).toBeInTheDocument();
      expect(screen.getByText('Action failed')).toBeInTheDocument();
    }, { timeout: 12_000 });

    expect(fetchMock).toHaveBeenCalled();
  }, 20_000);

  it('shows blocking error panel when alerts fail with no cached data', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: false }, 500);
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    renderAlertsPage();

    await waitFor(() => {
      expect(screen.getByText('Unable to load alerts')).toBeInTheDocument();
      expect(
        screen.getByText('The backend is temporarily unavailable. Please retry shortly.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    }, { timeout: 8_000 });
  });

  it('keeps last known list and shows warning banner on refresh failure', async () => {
    let openFetchCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/clinician/alerts?status=open') && method === 'GET') {
        openFetchCount += 1;
        if (openFetchCount === 1) {
          return createJsonResponse({ ok: true, alerts: [baseAlert] });
        }

        return createJsonResponse({ ok: false }, 500);
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    const rowLabel = `Alert ${baseAlert._id} for patient ${baseAlert.patientId}`;
    await screen.findByLabelText(rowLabel);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(screen.getByText('Service temporarily unavailable')).toBeInTheDocument();
      expect(screen.getByLabelText(rowLabel)).toBeInTheDocument();
    }, { timeout: 8_000 });
  });

  it('unassigned alert shows Assign to me quick action', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [baseAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    renderAlertsPage();
    await screen.findByLabelText(`Alert ${baseAlert._id} for patient ${baseAlert.patientId}`);

    expect(screen.getByRole('button', { name: 'Assign to me' })).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('assigned-to-other disables acknowledge/resolve and shows take over', async () => {
    const assignedElsewhere: AlertItem = {
      ...baseAlert,
      assignedTo: 'clinician-99',
      assignedToName: 'Dr Patel',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [assignedElsewhere] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    const rowLabel = `Alert ${assignedElsewhere._id} for patient ${assignedElsewhere.patientId}`;
    await screen.findByLabelText(rowLabel);

    expect(screen.getByRole('button', { name: 'Take over' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ack' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled();

    await user.click(screen.getByLabelText(rowLabel));
    await screen.findByRole('dialog', { name: 'Alert' });

    expect(screen.getByRole('button', { name: 'Acknowledge alert' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resolve alert' })).toBeDisabled();
    expect(screen.getByText('Assigned to Dr Patel')).toBeInTheDocument();
  });

  it('confirm take over transfers assignment to current clinician', async () => {
    const assignedElsewhere: AlertItem = {
      ...baseAlert,
      assignedTo: 'clinician-77',
      assignedToName: 'Dr Chen',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [assignedElsewhere] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    await screen.findByLabelText(`Alert ${assignedElsewhere._id} for patient ${assignedElsewhere.patientId}`);
    await user.click(screen.getByRole('button', { name: 'Take over' }));
    const takeoverDialog = await screen.findByRole('alertdialog', { name: 'Take over this alert?' });

    await user.click(within(takeoverDialog).getByRole('button', { name: 'Take over' }));

    await waitFor(() => {
      expect(screen.getByText('Assigned to you')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ack' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Resolve' })).toBeEnabled();
    });
  });

  it('assigned-to-me filter shows only my assigned alerts', async () => {
    const assignedToMe: AlertItem = {
      ...baseAlert,
      _id: 'alt-me',
      patientId: 'patient-me',
    };
    const unassigned: AlertItem = {
      ...baseAlert,
      _id: 'alt-unassigned',
      patientId: 'patient-unassigned',
    };

    setAssignment('alt-me', {
      assignedTo: 'clinician-1',
      assignedToName: 'Clinician 1',
      assignedAtISO: new Date().toISOString(),
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [assignedToMe, unassigned] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    await screen.findByLabelText(`Alert ${assignedToMe._id} for patient ${assignedToMe.patientId}`);
    await screen.findByLabelText(`Alert ${unassigned._id} for patient ${unassigned.patientId}`);

    await user.click(screen.getByRole('checkbox', { name: 'Assigned to me' }));

    await waitFor(() => {
      expect(screen.getByLabelText(`Alert ${assignedToMe._id} for patient ${assignedToMe.patientId}`)).toBeInTheDocument();
      expect(screen.queryByLabelText(`Alert ${unassigned._id} for patient ${unassigned.patientId}`)).not.toBeInTheDocument();
    });
  });

  it('overridden-only filter shows only overridden open alerts', async () => {
    const overriddenAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-overridden-only',
      patientId: 'patient-overridden',
      risk: 'high',
      riskAuto: 'high',
    };
    const normalAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-normal-only',
      patientId: 'patient-normal',
      risk: 'high',
      riskAuto: 'high',
    };

    setRiskOverride(overriddenAlert._id, {
      riskAuto: 'high',
      riskFinal: 'medium',
      overrideReason: 'Clinical review downgrade',
      overriddenAtISO: new Date().toISOString(),
      overriddenBy: 'clinician-1',
      overriddenByName: 'Clinician 1',
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [overriddenAlert, normalAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    const overriddenRow = `Alert ${overriddenAlert._id} for patient ${overriddenAlert.patientId}`;
    const normalRow = `Alert ${normalAlert._id} for patient ${normalAlert.patientId}`;

    await screen.findByLabelText(overriddenRow);
    await screen.findByLabelText(normalRow);

    await user.click(screen.getByRole('checkbox', { name: 'Overridden only' }));

    await waitFor(() => {
      expect(screen.getByLabelText(overriddenRow)).toBeInTheDocument();
      expect(screen.queryByLabelText(normalRow)).not.toBeInTheDocument();
    });
  });

  it('saving risk override updates risk display and overridden chip', async () => {
    const riskAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-risk-2',
      risk: 'high',
      riskAuto: 'high',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [riskAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    const rowLabel = `Alert ${riskAlert._id} for patient ${riskAlert.patientId}`;
    await screen.findByLabelText(rowLabel);

    await user.click(screen.getByLabelText(rowLabel));
    await screen.findByRole('dialog', { name: 'Alert' });

    await user.selectOptions(screen.getByLabelText('Final risk'), 'medium');
    const saveButton = screen.getByRole('button', { name: 'Save override' });
    expect(saveButton).toBeDisabled();

    await user.type(screen.getByLabelText('Override reason'), 'Clinician review found moderate risk.');
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => {
      const updatedRow = screen.getByLabelText(rowLabel);
      expect(within(updatedRow).getByText('Overridden')).toBeInTheDocument();
      expect(within(updatedRow).getByText('Medium')).toBeInTheDocument();
    });
  });

  it('timeline includes override event after save', async () => {
    const riskAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-risk-3',
      risk: 'high',
      riskAuto: 'high',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [riskAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    await screen.findByLabelText(`Alert ${riskAlert._id} for patient ${riskAlert.patientId}`);
    await user.click(screen.getByLabelText(`Alert ${riskAlert._id} for patient ${riskAlert.patientId}`));
    await screen.findByRole('dialog', { name: 'Alert' });

    await user.selectOptions(screen.getByLabelText('Final risk'), 'medium');
    await user.type(screen.getByLabelText('Override reason'), 'Marked medium after symptom review.');
    await user.click(screen.getByRole('button', { name: 'Save override' }));

    await waitFor(() => {
      expect(screen.getByText('Risk overridden')).toBeInTheDocument();
      expect(screen.getByText(/Reason: Marked medium after symptom review\./)).toBeInTheDocument();
    });
  });

  it('clear override removes overridden chip and restores auto risk', async () => {
    const riskAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-risk-4',
      risk: 'high',
      riskAuto: 'high',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [riskAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    const rowLabel = `Alert ${riskAlert._id} for patient ${riskAlert.patientId}`;
    await screen.findByLabelText(rowLabel);
    await user.click(screen.getByLabelText(rowLabel));
    await screen.findByRole('dialog', { name: 'Alert' });

    await user.selectOptions(screen.getByLabelText('Final risk'), 'medium');
    await user.type(screen.getByLabelText('Override reason'), 'Temporary downgrade after exam.');
    await user.click(screen.getByRole('button', { name: 'Save override' }));

    await waitFor(() => {
      const row = screen.getByLabelText(rowLabel);
      expect(within(row).getByText('Overridden')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Clear override' }));
    const clearDialog = await screen.findByRole('alertdialog', { name: 'Clear override?' });
    await user.click(within(clearDialog).getByRole('button', { name: 'Clear override' }));

    await waitFor(() => {
      const row = screen.getByLabelText(rowLabel);
      expect(within(row).queryByText('Overridden')).not.toBeInTheDocument();
      expect(within(row).getByText('High')).toBeInTheDocument();
    });
  });

  it('queue row shows "Delivery failed" with retry control when notification failed', async () => {
    const failedNotificationAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-notif-failed',
      notificationStatus: 'failed',
      notificationError: 'Delivery timeout',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [failedNotificationAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    renderAlertsPage();

    const rowLabel = `Alert ${failedNotificationAlert._id} for patient ${failedNotificationAlert.patientId}`;
    const row = await screen.findByLabelText(rowLabel);

    expect(within(row).getByText('Delivery failed')).toBeInTheDocument();
    expect(
      within(row).getByRole('button', {
        name: `Retry notification for alert ${failedNotificationAlert._id}`,
      }),
    ).toBeDisabled();
  });

  it('queue row shows "Delivery status unknown" and no retry control when notification state is unknown', async () => {
    const unknownNotificationAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-notif-unknown',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [unknownNotificationAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    renderAlertsPage();

    const rowLabel = `Alert ${unknownNotificationAlert._id} for patient ${unknownNotificationAlert.patientId}`;
    const row = await screen.findByLabelText(rowLabel);

    expect(within(row).getByText('Delivery status unknown')).toBeInTheDocument();
    expect(
      within(row).queryByRole('button', {
        name: `Retry notification for alert ${unknownNotificationAlert._id}`,
      }),
    ).not.toBeInTheDocument();
  });

  it('marks newly arrived alerts with the arrival highlight class', async () => {
    const incomingAlert: AlertItem = {
      ...baseAlert,
      _id: 'alt-new-arrival',
      patientId: 'patient-new',
    };
    let openFetchCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        openFetchCount += 1;
        return createJsonResponse({
          ok: true,
          alerts: openFetchCount > 1 ? [incomingAlert, baseAlert] : [baseAlert],
        });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    const user = userEvent.setup();
    renderAlertsPage();

    const existingRowLabel = `Alert ${baseAlert._id} for patient ${baseAlert.patientId}`;
    await screen.findByLabelText(existingRowLabel);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    const incomingRowLabel = `Alert ${incomingAlert._id} for patient ${incomingAlert.patientId}`;
    await waitFor(() => {
      expect(screen.getByLabelText(incomingRowLabel)).toHaveClass('alert-arrived');
    });
  });

  it('renders alert cards instead of table on small widths', async () => {
    installMatchMediaMock((query) => query.includes('(max-width: 900px)'));

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/alerts?status=open')) {
        return createJsonResponse({ ok: true, alerts: [baseAlert] });
      }

      return createJsonResponse({ ok: true, alerts: [] });
    });

    renderAlertsPage();

    expect(await screen.findByLabelText('Alerts card list')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Alerts queue table' })).not.toBeInTheDocument();
  });
});
