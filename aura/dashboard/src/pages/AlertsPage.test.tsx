/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertsPage } from './AlertsPage';
import { clearAssignmentStoreForTests, setAssignment } from '../services/assignmentStore';
import { clearClinicianIdentityForTests, setClinicianIdentity } from '../services/clinicianIdentity';
import { clearRiskOverrideStoreForTests, setRiskOverride } from '../services/overrideStore';
import { clearSeenStoreForTests, getSeenStorageKey, markSeen } from '../services/seenStore';
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

function renderAlertsPage(): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <AlertsPage />
    </QueryClientProvider>,
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

beforeAll(() => {
  installMatchMediaMock();
});

beforeEach(() => {
  vi.restoreAllMocks();
  installMatchMediaMock();
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
  });

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
    }, { timeout: 7_000 });

    expect(fetchMock).toHaveBeenCalled();
  }, 12_000);

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

  it('queue row shows "Notif failed" with retry control when notification failed', async () => {
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

    expect(within(row).getByText('Notif failed')).toBeInTheDocument();
    expect(
      within(row).getByRole('button', {
        name: `Retry notification for alert ${failedNotificationAlert._id}`,
      }),
    ).toBeDisabled();
  });

  it('queue row shows "Notif unknown" and no retry control when notification state is unknown', async () => {
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

    expect(within(row).getByText('Notif unknown')).toBeInTheDocument();
    expect(
      within(row).queryByRole('button', {
        name: `Retry notification for alert ${unknownNotificationAlert._id}`,
      }),
    ).not.toBeInTheDocument();
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
