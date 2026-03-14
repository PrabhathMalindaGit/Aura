/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardHomePage } from './DashboardHomePage';
import { createJsonResponse, installMatchMediaMock } from '../test/mocks';

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

function renderDashboardHome(): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardHomePage />} />
          <Route path="/alerts" element={<div>Alerts workspace</div>} />
          <Route path="/appointments" element={<div>Appointments workspace</div>} />
          <Route path="/insights" element={<div>Insights workspace</div>} />
          <Route path="/patients" element={<div>Patients workspace</div>} />
          <Route path="/patients/:patientId" element={<div>Patient detail workspace</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type DashboardMockOptions = {
  summary?: Record<string, number>;
  priorityItems?: Array<Record<string, unknown>>;
  safetyItems?: Array<Record<string, unknown>>;
  appointmentItems?: Array<Record<string, unknown>>;
  followUpItems?: Array<Record<string, unknown>>;
  communicationOverview?: Record<string, unknown>;
  patients?: Array<Record<string, unknown>>;
};

function installDashboardFetchMock(options: DashboardMockOptions = {}): void {
  const summary = options.summary ?? {
    openAlertsCount: 3,
    assignedToMeAlertsCount: 1,
    pendingInsightsCount: 2,
    todayAppointmentsCount: 1,
    missedCheckinsCount: 4,
    openFollowUpTasksCount: 2,
    messagesNeedingResponseCount: 1,
  };

  const priorityItems = options.priorityItems ?? [
    {
      id: 'queue-alert-1',
      itemType: 'alert',
      patientId: 'p1',
      title: 'Assigned high-risk alert',
      subtitle: 'High pain escalation',
      priority: 'high',
      status: 'open',
      source: 'checkin',
      createdAt: '2026-03-09T09:30:00.000Z',
      linkedEntityId: 'alert-1',
      linkedEntityType: 'alert',
    },
    {
      id: 'queue-task-1',
      itemType: 'task',
      patientId: 'p2',
      title: 'Review adherence follow-up',
      subtitle: 'Check whether exercise adherence has dropped again.',
      priority: 'medium',
      status: 'open',
      source: 'task',
      createdAt: '2026-03-09T08:15:00.000Z',
      dueAt: '2026-03-09T12:15:00.000Z',
      linkedEntityId: 'task-1',
      linkedEntityType: 'task',
    },
  ];

  const safetyItems = options.safetyItems ?? [
    {
      id: 'event-1',
      type: 'NOTIFICATION_SENT',
      patientId: 'p1',
      alertId: 'alert-1',
      createdAt: '2026-03-09T09:40:00.000Z',
      summary: 'Telegram escalation sent successfully.',
      alertStatus: 'open',
      notificationStatus: 'sent',
    },
  ];

  const appointmentItems = options.appointmentItems ?? [
    {
      id: 'appt-1',
      patientId: 'p1',
      clinicianId: 'clinician-1',
      startsAt: '2026-03-09T13:00:00.000Z',
      endsAt: '2026-03-09T13:30:00.000Z',
      status: 'awaiting_confirmation',
      requestStatus: 'pending',
      modality: 'video',
      note: 'Waiting for patient confirmation.',
      updatedAt: '2026-03-09T09:45:00.000Z',
    },
  ];

  const followUpItems = options.followUpItems ?? [
    {
      id: 'task-1',
      patientId: 'p1',
      title: 'Review safety escalation',
      priority: 'urgent',
      status: 'open',
      dueAt: '2026-03-09T11:00:00.000Z',
      type: 'safety_review',
      linkedAlertId: 'alert-1',
      updatedAt: '2026-03-09T09:50:00.000Z',
    },
  ];

  const communicationOverview = options.communicationOverview ?? {
    counts: {
      needsResponseCount: 1,
      flaggedBySafetyCount: 1,
      followUpRequestedCount: 1,
    },
    items: [
      {
        id: 'comm-1',
        patientId: 'p1',
        patientName: 'Jordan Lee',
        messageId: 'msg-1',
        needsResponse: true,
        flaggedBySafety: true,
        followUpRequested: true,
        linkedTaskId: 'task-1',
        messageCreatedAt: '2026-03-09T09:20:00.000Z',
        messagePreview: 'Pain is much worse after yesterday’s session.',
      },
    ],
  };

  const patients = options.patients ?? [
    {
      id: 'p1',
      displayName: 'Jordan Lee',
      status: 'active',
      openAlertCount: 1,
      lastCheckinAt: '2026-03-09T08:00:00.000Z',
      lastPain: 8,
    },
    {
      id: 'p2',
      displayName: 'Avery Chen',
      status: 'active',
      openAlertCount: 0,
      lastCheckinAt: '2026-03-08T08:00:00.000Z',
      lastPain: 4,
    },
  ];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));

    if (url.pathname === '/clinician/dashboard/summary') {
      return createJsonResponse({ ok: true, summary });
    }

    if (url.pathname === '/clinician/dashboard/priority-queue') {
      return createJsonResponse({ ok: true, items: priorityItems });
    }

    if (url.pathname === '/clinician/dashboard/recent-safety-events') {
      return createJsonResponse({ ok: true, items: safetyItems });
    }

    if (url.pathname === '/clinician/dashboard/today-appointments') {
      return createJsonResponse({ ok: true, items: appointmentItems });
    }

    if (url.pathname === '/clinician/dashboard/follow-up-tasks') {
      return createJsonResponse({ ok: true, items: followUpItems });
    }

    if (url.pathname === '/clinician/dashboard/communication-overview') {
      return createJsonResponse({ ok: true, overview: communicationOverview });
    }

    if (url.pathname === '/clinician/patients') {
      return createJsonResponse({ ok: true, patients });
    }

    return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
  });
}

describe('DashboardHomePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('aura_access_token', 'TEST_TOKEN');
    installMatchMediaMock();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the command-center modules from aggregate API data', async () => {
    installDashboardFetchMock();

    renderDashboardHome();

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Today in focus')).toBeInTheDocument();
    expect(screen.getByText('Needs attention now')).toBeInTheDocument();
    expect(screen.getByText('Follow-up waiting')).toBeInTheDocument();
    expect(screen.getByText('Matters today')).toBeInTheDocument();
    expect(await screen.findByText('Assigned to me')).toBeInTheDocument();
    expect(screen.getByText('Priority queue')).toBeInTheDocument();
    expect(screen.getByText('Assigned high-risk alert')).toBeInTheDocument();
    expect(screen.getByText('Recent safety events')).toBeInTheDocument();
    expect(screen.getByText('Telegram escalation sent successfully.')).toBeInTheDocument();
    expect(screen.getByText('Waiting for patient confirmation.')).toBeInTheDocument();
    expect(screen.getByText('Review safety escalation')).toBeInTheDocument();
    expect(screen.getByText('Communication review')).toBeInTheDocument();
    expect(screen.getByText('Pain is much worse after yesterday’s session.')).toBeInTheDocument();
  });

  it('renders premium empty states when aggregate modules have no items', async () => {
    installDashboardFetchMock({
      summary: {
        openAlertsCount: 0,
        assignedToMeAlertsCount: 0,
        pendingInsightsCount: 0,
        todayAppointmentsCount: 0,
        missedCheckinsCount: 0,
        openFollowUpTasksCount: 0,
        messagesNeedingResponseCount: 0,
      },
      priorityItems: [],
      safetyItems: [],
      appointmentItems: [],
      followUpItems: [],
      communicationOverview: {
        counts: {
          needsResponseCount: 0,
          flaggedBySafetyCount: 0,
          followUpRequestedCount: 0,
        },
        items: [],
      },
      patients: [],
    });

    renderDashboardHome();

    expect(await screen.findByText('Nothing urgent right now')).toBeInTheDocument();
    expect(screen.getByText('No recent safety activity')).toBeInTheDocument();
    expect(screen.getByText('No appointments today')).toBeInTheDocument();
    expect(screen.getByText('No follow-up tasks')).toBeInTheDocument();
    expect(screen.getByText('No communication waiting')).toBeInTheDocument();
  });

  it('routes communication actions to patient detail', async () => {
    installDashboardFetchMock();
    const user = userEvent.setup();

    renderDashboardHome();

    await screen.findByText('Pain is much worse after yesterday’s session.');

    const communicationCard = screen.getByText('Communication review');
    const cardElement = communicationCard.closest('section');
    expect(cardElement).not.toBeNull();

    await user.click(within(cardElement as HTMLElement).getByRole('button', { name: 'Open patient' }));

    await waitFor(() => {
      expect(screen.getByText('Patient detail workspace')).toBeInTheDocument();
    });
  }, 10_000);
});
