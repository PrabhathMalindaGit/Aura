/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  render,
  screen,
  within,
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
import { CommunicationRouteFacade } from '../../config/routeFacades';
import {
  getDefaultDashboardV2Gates,
  resetDashboardV2GatesForTests,
  writeDashboardV2Gates,
} from '../../config/migrationGates';
import { resetInboxUiStore } from '../../state/useInboxUiStore';
import { createJsonResponse, installMatchMediaMock } from '../../../test/mocks';
import type {
  ClinicianCoordinationRecord,
  DashboardCommunicationOverview,
} from '../../../types/models';

const ROUTE_LOAD_TIMEOUT_MS = 3_000;

const COMMUNICATION_OVERVIEW: DashboardCommunicationOverview = {
  counts: {
    needsResponseCount: 2,
    flaggedBySafetyCount: 1,
    followUpRequestedCount: 2,
  },
  items: [
    {
      id: 'comm-1',
      patientId: 'patient-1',
      patientName: 'Jordan Lee',
      messageId: 'msg-1',
      needsResponse: true,
      flaggedBySafety: true,
      followUpRequested: true,
      messageCreatedAt: '2026-03-09T11:15:00.000Z',
      messagePreview: 'Pain is much worse after exercise today.',
      patientRiskLevel: 'high',
      openAlertCount: 2,
      lastCheckinAt: '2026-03-09T08:15:00.000Z',
      lastPainScore: 8,
      responseState: 'delayed',
      responseDueAt: '2026-03-09T12:00:00.000Z',
      responseDelayed: true,
      responseDelayHours: 8,
      reviewedAfterLatestInbound: false,
      thresholdSummary: {
        patientId: 'patient-1',
        painHighThreshold: 7,
        missedCheckinDays: 2,
        responseDelayHours: 8,
        safetyFlaggedResponseDelayHours: 2,
        version: 1,
        configured: true,
      },
    },
    {
      id: 'comm-2',
      patientId: 'patient-2',
      patientName: 'Avery Chen',
      messageId: 'msg-2',
      needsResponse: true,
      flaggedBySafety: false,
      followUpRequested: true,
      messageCreatedAt: '2026-03-09T10:30:00.000Z',
      messagePreview: 'Can someone confirm whether tomorrow still works?',
      patientRiskLevel: 'low',
      openAlertCount: 0,
      lastCheckinAt: '2026-03-08T09:30:00.000Z',
      lastPainScore: 3,
      responseState: 'reviewing',
      responseDelayHours: 24,
      reviewedAfterLatestInbound: false,
    },
  ],
};

const COORDINATION_BY_PATIENT: Record<string, ClinicianCoordinationRecord | null> = {
  'patient-1': {
    patientId: 'patient-1',
    currentHandoff: {
      summary: 'Shared coordination summary for the next clinician.',
      nextStep: 'plan',
      followUpOwner: {
        kind: 'clinician',
        clinicianId: 'coordination-clinician-1',
        displayName: 'Dr Elena Hall',
      },
      linkedTaskId: 'task-1',
      linkedTask: {
        id: 'task-1',
        title: 'Review adherence before next visit',
        type: 'follow_up',
        priority: 'high',
        status: 'open',
        dueAt: '2026-03-10T09:00:00.000Z',
        assignedTo: 'Dr Elena Hall',
        updatedAt: '2026-03-09T11:45:00.000Z',
      },
      updatedBy: {
        clinicianId: 'coordination-clinician-1',
        displayName: 'Dr Elena Hall',
      },
      updatedAt: '2026-03-09T11:45:00.000Z',
    },
    noteHistory: [
      {
        id: 'coord-note-1',
        text: 'Shared coordination note for inbox review.',
        createdBy: {
          clinicianId: 'coordination-clinician-1',
          displayName: 'Dr Elena Hall',
        },
        createdAt: '2026-03-09T11:50:00.000Z',
      },
    ],
    createdAt: '2026-03-09T11:40:00.000Z',
    updatedAt: '2026-03-09T11:50:00.000Z',
  },
  'patient-2': null,
};

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

function renderCommunicationRoute(initialEntry: string = '/communication?view=needs-response'): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/communication" element={<CommunicationRouteFacade />} />
          <Route path="/patients/:patientId" element={<div>Patient detail workspace</div>} />
          <Route
            path="/patients/:patientId/communications"
            element={<div>Patient detail communications workspace</div>}
          />
          <Route path="/alerts" element={<AlertsWorkspaceRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function installCommunicationFetchMock(
  overview: DashboardCommunicationOverview = COMMUNICATION_OVERVIEW,
): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');

    if (url.pathname.match(/^\/clinician\/patients\/[^/]+\/communication\/events$/)) {
      return createJsonResponse({ ok: true }, 201);
    }

    if (url.pathname === '/clinician/dashboard/communication-overview') {
      return createJsonResponse({ ok: true, overview });
    }

    if (url.pathname.match(/^\/clinician\/patients\/[^/]+\/coordination\/notes$/)) {
      const patientId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const requestBody = init?.body
        ? (JSON.parse(String(init.body)) as { text?: string })
        : {};
      const currentRecord = COORDINATION_BY_PATIENT[patientId];
      const nextCreatedAt = '2026-03-09T12:05:00.000Z';
      const nextRecord: ClinicianCoordinationRecord = {
        patientId,
        currentHandoff: currentRecord?.currentHandoff ?? null,
        noteHistory: [
          {
            id: 'coord-note-2',
            text: requestBody.text ?? '',
            createdBy: {
              clinicianId: 'coordination-clinician-2',
              displayName: 'Dr Mira Patel',
            },
            createdAt: nextCreatedAt,
          },
          ...(currentRecord?.noteHistory ?? []),
        ],
        createdAt: currentRecord?.createdAt ?? nextCreatedAt,
        updatedAt: nextCreatedAt,
      };

      return createJsonResponse({
        ok: true,
        coordination: nextRecord,
      }, 201);
    }

    if (url.pathname.match(/^\/clinician\/patients\/[^/]+\/coordination$/)) {
      const patientId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      return createJsonResponse({
        ok: true,
        coordination: COORDINATION_BY_PATIENT[patientId] ?? null,
      });
    }

    return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
  });
}

function setCommunicationGate(enabled: boolean): void {
  const defaults = getDefaultDashboardV2Gates();

  writeDashboardV2Gates({
    ...defaults,
    routes: {
      ...defaults.routes,
      communication: enabled,
    },
  });
}

function expectElementBefore(first: HTMLElement, second: HTMLElement): void {
  expect(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
}

describe('InboxRoute', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('aura_access_token', 'TEST_TOKEN');
    installMatchMediaMock(() => false);
    resetDashboardV2GatesForTests();
    resetInboxUiStore();
    installCommunicationFetchMock();
  });

  afterEach(() => {
    cleanup();
    resetDashboardV2GatesForTests();
    resetInboxUiStore();
  });

  it('falls back to the legacy communication route when the route is explicitly rolled back', async () => {
    setCommunicationGate(false);
    renderCommunicationRoute();

    expect(await screen.findByRole('heading', { name: 'Inbox' }, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(screen.queryByTestId('v2-inbox-route')).not.toBeInTheDocument();
    expect(await screen.findByText('Communication queue', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
  });

  it('renders the v2 inbox route by default and keeps row selection in-route', async () => {
    const user = userEvent.setup();

    renderCommunicationRoute();

    expect(await screen.findByTestId('v2-inbox-route', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(screen.getByText('Communication triage')).toBeInTheDocument();
    expect(screen.getByTestId('v2-inbox-queue')).toBeInTheDocument();
    expect(screen.getByTestId('v2-inbox-queue-lane')).toHaveAccessibleName('Horizontal message queue');
    expect(await screen.findByTestId('v2-inbox-row-patient-1', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(await screen.findByTestId('v2-inbox-workspace', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toHaveTextContent('Jordan Lee');
    expect(screen.getByTestId('v2-inbox-timeline')).toHaveTextContent('Pain is much worse after exercise today.');
    expect(screen.getByText('Local private draft')).toBeInTheDocument();
    expect(screen.getByText('Private to this browser only. Saving here does not send a patient message or update shared coordination.')).toBeInTheDocument();
    expect(screen.getByLabelText('Compact coordination summary')).toHaveTextContent('Team context');
    expect(screen.queryByTestId('v2-inbox-support-rail')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send patient message/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open alerts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open patient' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open structured coordination' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Refresh' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Support context' })).toBeInTheDocument();

    expectElementBefore(screen.getByText('Communication triage'), screen.getByTestId('v2-inbox-queue'));
    expectElementBefore(screen.getByTestId('v2-inbox-queue'), screen.getByTestId('v2-inbox-active-thread'));
    expectElementBefore(screen.getByTestId('v2-inbox-active-thread'), screen.getByTestId('v2-inbox-timeline'));
    expectElementBefore(screen.getByTestId('v2-inbox-timeline'), screen.getByTestId('v2-inbox-local-draft'));

    await user.click(screen.getByTestId('v2-inbox-row-patient-2'));

    await waitFor(() => {
      expect(screen.getByTestId('v2-inbox-workspace')).toHaveTextContent('Avery Chen');
    });
    expect(screen.getByTestId('v2-inbox-timeline')).toHaveTextContent('Can someone confirm whether tomorrow still works?');

    expect(screen.queryByText('Patient detail workspace')).not.toBeInTheDocument();
  });

  it('preserves CTA destinations and shows Unknown when metadata is absent', async () => {
    const user = userEvent.setup();

    renderCommunicationRoute();

    await screen.findByTestId('v2-inbox-route', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS });
    expect(await screen.findByTestId('v2-inbox-row-patient-2', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    await user.click(screen.getByTestId('v2-inbox-row-patient-2'));

    await waitFor(() => {
      expect(screen.getByTestId('v2-inbox-workspace')).toHaveTextContent('Avery Chen');
    });

    await user.click(screen.getByRole('button', { name: 'Support context' }));
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Close panel' }));

    await user.click(screen.getByRole('button', { name: 'Open patient' }));
    expect(await screen.findByText('Patient detail workspace', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
  });

  it('keeps the local draft separate from shared coordination authoring', async () => {
    const user = userEvent.setup();

    renderCommunicationRoute();

    expect(await screen.findByTestId('v2-inbox-workspace', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    const localDraft = screen.getByRole('textbox', { name: 'Personal reply draft' });
    await user.type(localDraft, 'Local follow-up stays private.');

    await user.click(screen.getByRole('button', { name: 'Support context' }));
    const sharedNote = screen.getByRole('textbox', { name: 'Add shared coordination note' });

    await user.type(sharedNote, 'Team note stays shared.');
    await user.click(screen.getByRole('button', { name: 'Add shared note' }));

    expect(await screen.findByText('Shared coordination note added for the care team.', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(sharedNote).toHaveValue('');
    expect(screen.getAllByText('Team note stays shared.').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(screen.getByRole('textbox', { name: 'Personal reply draft' })).toHaveValue('Local follow-up stays private.');
  });

  it('uses queue-first and workspace-focused narrow navigation while preserving the local draft', async () => {
    installMatchMediaMock(
      (query) => query.includes('max-width: 1023px') || query.includes('max-width: 1279px'),
    );
    const user = userEvent.setup();

    renderCommunicationRoute();

    expect(await screen.findByTestId('v2-inbox-route', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(screen.getByTestId('v2-inbox-queue')).toBeInTheDocument();
    expect(await screen.findByTestId('v2-inbox-row-patient-1', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(screen.queryByTestId('v2-inbox-active-thread')).not.toBeInTheDocument();
    expect(screen.queryByTestId('v2-inbox-local-draft')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('v2-inbox-row-patient-1'));

    await waitFor(() => {
      expect(screen.getByTestId('v2-inbox-workspace')).toHaveTextContent('Jordan Lee');
    });
    expect(screen.queryByTestId('v2-inbox-queue')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to queue' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Review queue' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /send patient message/i })).not.toBeInTheDocument();
    expectElementBefore(screen.getByTestId('v2-inbox-active-thread'), screen.getByTestId('v2-inbox-timeline'));
    expectElementBefore(screen.getByTestId('v2-inbox-timeline'), screen.getByTestId('v2-inbox-local-draft'));

    const localDraft = screen.getByRole('textbox', { name: 'Personal reply draft' });
    await user.type(localDraft, 'Keep this local note.');
    await user.click(screen.getByRole('button', { name: 'Back to queue' }));

    await waitFor(() => {
      expect(screen.getByTestId('v2-inbox-queue')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('v2-inbox-active-thread')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('v2-inbox-row-patient-1'));

    await waitFor(() => {
      expect(screen.getByTestId('v2-inbox-workspace')).toHaveTextContent('Jordan Lee');
    });
    expect(screen.getByRole('textbox', { name: 'Personal reply draft' })).toHaveValue('Keep this local note.');

    await user.click(screen.getByRole('button', { name: 'Review queue' }));
    const queueDialog = await screen.findByRole('dialog', { name: 'Message queue' });
    await user.click(within(queueDialog).getByTestId('v2-inbox-row-patient-2'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Message queue' })).not.toBeInTheDocument();
      expect(screen.getByTestId('v2-inbox-workspace')).toHaveTextContent('Avery Chen');
    });
    expect(screen.queryByTestId('v2-inbox-queue')).not.toBeInTheDocument();
  });

  it('keeps the wide inbox layout stacked for desktop scanning', async () => {
    renderCommunicationRoute();

    expect(await screen.findByTestId('v2-inbox-route', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(await screen.findByTestId('v2-inbox-row-patient-1', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(await screen.findByTestId('v2-inbox-workspace', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toHaveTextContent('Jordan Lee');
    expect(screen.getByTestId('v2-inbox-queue')).toBeInTheDocument();
    expectElementBefore(screen.getByTestId('v2-inbox-queue'), screen.getByTestId('v2-inbox-active-thread'));
    expectElementBefore(screen.getByTestId('v2-inbox-active-thread'), screen.getByTestId('v2-inbox-timeline'));
    expectElementBefore(screen.getByTestId('v2-inbox-timeline'), screen.getByTestId('v2-inbox-local-draft'));
    expect(screen.queryByRole('button', { name: 'Back to queue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review queue' })).not.toBeInTheDocument();
  });

  it('shows route-local empty states when the queue has no threads', async () => {
    vi.restoreAllMocks();
    installMatchMediaMock(() => false);
    installCommunicationFetchMock({
      counts: {
        needsResponseCount: 0,
        flaggedBySafetyCount: 0,
        followUpRequestedCount: 0,
      },
      items: [],
    });

    renderCommunicationRoute('/communication?view=all');

    expect(await screen.findByTestId('v2-inbox-route', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(await screen.findByText('No communication waiting', undefined, { timeout: ROUTE_LOAD_TIMEOUT_MS })).toBeInTheDocument();
    expect(screen.getByText('Select a patient thread')).toBeInTheDocument();
    expect(screen.getByText('Patient communication needing clinician review will appear here.')).toBeInTheDocument();
  });
});
