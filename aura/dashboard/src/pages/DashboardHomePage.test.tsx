/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardHomePage } from './DashboardHomePage';
import { clearClinicianProfileForTests, getClinicianProfile, setClinicianProfile } from '../services/clinicianProfile';
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

function renderDashboardHome(): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardHomePage />} />
          <Route path="/communication" element={<div>Communication workspace</div>} />
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
  appointmentRequestItems?: Array<Record<string, unknown>>;
  availableSlotItems?: Array<Record<string, unknown>>;
  closedSlotItems?: Array<Record<string, unknown>>;
  followUpItems?: Array<Record<string, unknown>>;
  communicationOverview?: Record<string, unknown>;
  pendingInsightsItems?: Array<Record<string, unknown>>;
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

  const appointmentRequestItems = options.appointmentRequestItems ?? [
    {
      requestId: 'request-1',
      slotId: 'slot-1',
      patientId: 'p1',
      status: 'pending',
      workflowStatus: 'awaiting_confirmation',
      note: 'Prefers morning follow-up this week.',
      startsAt: '2026-03-10T09:00:00.000Z',
      endsAt: '2026-03-10T09:30:00.000Z',
      modality: 'video',
      createdAt: '2026-03-09T10:10:00.000Z',
      updatedAt: '2026-03-09T10:10:00.000Z',
    },
    {
      requestId: 'request-2',
      slotId: 'slot-2',
      patientId: 'p2',
      status: 'pending',
      workflowStatus: 'awaiting_confirmation',
      note: 'Needs next available afternoon review.',
      startsAt: '2026-03-11T13:00:00.000Z',
      endsAt: '2026-03-11T13:30:00.000Z',
      modality: 'video',
      createdAt: '2026-03-09T10:15:00.000Z',
      updatedAt: '2026-03-09T10:15:00.000Z',
    },
    {
      requestId: 'request-3',
      slotId: 'slot-3',
      patientId: 'p1',
      status: 'pending',
      workflowStatus: 'awaiting_confirmation',
      note: 'Follow-up requested after missed check-in.',
      startsAt: '2026-03-12T15:00:00.000Z',
      endsAt: '2026-03-12T15:30:00.000Z',
      modality: 'video',
      createdAt: '2026-03-09T10:20:00.000Z',
      updatedAt: '2026-03-09T10:20:00.000Z',
    },
  ];

  const availableSlotItems = options.availableSlotItems ?? [
    {
      slotId: 'slot-available-1',
      clinicianId: 'clinician-1',
      startsAt: '2026-03-10T09:00:00.000Z',
      endsAt: '2026-03-10T09:30:00.000Z',
      modality: 'video',
      status: 'available',
      createdAt: '2026-03-09T10:00:00.000Z',
    },
    {
      slotId: 'slot-available-2',
      clinicianId: 'clinician-1',
      startsAt: '2026-03-11T13:00:00.000Z',
      endsAt: '2026-03-11T13:30:00.000Z',
      modality: 'video',
      status: 'available',
      createdAt: '2026-03-09T10:05:00.000Z',
    },
  ];

  const closedSlotItems = options.closedSlotItems ?? [
    {
      slotId: 'slot-closed-1',
      clinicianId: 'clinician-1',
      startsAt: '2026-03-12T15:00:00.000Z',
      endsAt: '2026-03-12T15:30:00.000Z',
      modality: 'video',
      status: 'closed',
      createdAt: '2026-03-09T10:30:00.000Z',
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

  const pendingInsightsItems = options.pendingInsightsItems ?? [
    {
      id: 'insight-1',
      patientId: 'p1',
      patientDisplayName: 'Jordan Lee',
      status: 'pending',
      title: 'Safety regression pattern',
      message: 'Pain severity and symptom burden rose across the last two check-ins.',
      category: 'safety',
      confidence: 'high',
      priority: 3,
      windowDays: 14,
      createdAt: '2026-03-09T08:45:00.000Z',
    },
    {
      id: 'insight-2',
      patientId: 'p2',
      patientDisplayName: 'Avery Chen',
      status: 'pending',
      title: 'Adherence drift',
      message: 'Exercise adherence dropped for two consecutive days.',
      category: 'adherence',
      confidence: 'medium',
      priority: 2,
      windowDays: 14,
      createdAt: '2026-03-09T09:10:00.000Z',
    },
  ];

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

    if (url.pathname === '/clinician/appointments/requests') {
      return createJsonResponse({ ok: true, items: appointmentRequestItems });
    }

    if (url.pathname === '/clinician/appointments/slots') {
      const status = url.searchParams.get('status');

      if (status === 'closed') {
        return createJsonResponse({ ok: true, items: closedSlotItems });
      }

      return createJsonResponse({ ok: true, items: availableSlotItems });
    }

    if (url.pathname === '/clinician/insights') {
      const status = url.searchParams.get('status');

      if (status === 'pending') {
        return createJsonResponse({ ok: true, items: pendingInsightsItems });
      }

      return createJsonResponse({ ok: true, items: [] });
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
    clearClinicianProfileForTests();
    window.localStorage.setItem(
      'aura_access_token',
      buildToken({ sub: 'auth-dashboard-home', name: 'Dr Dashboard' }),
    );
    installMatchMediaMock();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the command-center modules from aggregate API data', async () => {
    installDashboardFetchMock();

    renderDashboardHome();

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Operational snapshot')).toBeInTheDocument();
    expect(screen.getByText('Needs attention now')).toBeInTheDocument();
    expect(screen.getByText('Urgent work leads')).toBeInTheDocument();
    expect(screen.getByText('Keep the day moving')).toBeInTheDocument();
    expect(await screen.findByText('Main action list')).toBeInTheDocument();
    expect(screen.getByText('Safety feed')).toBeInTheDocument();
    expect(screen.getByText('Background workload and capacity')).toBeInTheDocument();
    expect(screen.getByText('Safety workload')).toBeInTheDocument();
    expect(screen.getByText('Communication burden')).toBeInTheDocument();
    expect(screen.getByText('Insights backlog')).toBeInTheDocument();
    expect(screen.getByText('Scheduling balance')).toBeInTheDocument();
    expect(screen.getByText('Pending requests exceed visible open capacity in the next 7 days.')).toBeInTheDocument();
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
      appointmentRequestItems: [],
      availableSlotItems: [],
      closedSlotItems: [],
      followUpItems: [],
      communicationOverview: {
        counts: {
          needsResponseCount: 0,
          flaggedBySafetyCount: 0,
          followUpRequestedCount: 0,
        },
        items: [],
      },
      pendingInsightsItems: [],
      patients: [],
    });

    renderDashboardHome();

    expect(await screen.findByText('Nothing urgent right now')).toBeInTheDocument();
    expect(screen.getByText('No recent safety activity')).toBeInTheDocument();
    expect(screen.getByText('No appointments today')).toBeInTheDocument();
    expect(screen.getByText('No follow-up tasks')).toBeInTheDocument();
    expect(screen.getByText('No communication waiting')).toBeInTheDocument();
    expect(screen.getByText('No recent safety activity in the current feed.')).toBeInTheDocument();
    expect(screen.getByText('No communication follow-up is waiting right now.')).toBeInTheDocument();
    expect(screen.getByText('No pending insight mix is visible in the current queue.')).toBeInTheDocument();
    expect(screen.getByText('No visible scheduling pressure in the next 7 days.')).toBeInTheDocument();
  });

  it('routes communication actions to the communication workspace', async () => {
    installDashboardFetchMock();
    const user = userEvent.setup();

    renderDashboardHome();

    await screen.findByText('Pain is much worse after yesterday’s session.');

    const communicationCard = screen.getByText('Communication review');
    const cardElement = communicationCard.closest('section');
    expect(cardElement).not.toBeNull();

    await user.click(within(cardElement as HTMLElement).getByRole('button', { name: 'Open thread' }));

    await waitFor(() => {
      expect(screen.getByText('Communication workspace')).toBeInTheDocument();
    });
  }, 10_000);

  it('reduces only the communication overview attention treatment when preferences are reduced', async () => {
    installDashboardFetchMock();
    setClinicianProfile({
      ...getClinicianProfile(),
      notificationPreferences: {
        communication: {
          cueMode: 'reduced',
        },
        safety: {
          cueMode: 'default',
        },
        quietHours: {
          enabled: false,
          startTime: '22:00',
          endTime: '07:00',
        },
      },
    });

    renderDashboardHome();

    await screen.findByText('Pain is much worse after yesterday’s session.');

    const communicationOverview = screen.getByTestId('dashboard-home-communication-overview');
    const cardElement = communicationOverview.querySelector('.dashboard-communication-card--attention');
    expect(cardElement).not.toBeNull();
    expect(communicationOverview).toHaveClass('dashboard-home-communication-overview--reduced');
    expect(within(communicationOverview).getByText('Communication review')).toBeInTheDocument();
  });

});
