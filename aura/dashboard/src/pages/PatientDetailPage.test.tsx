/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AlertItem,
  AppointmentRequestItem,
  ClinicianTaskItem,
  DashboardCommunicationOverviewItem,
  WorklistRecord,
} from '../types/models';
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

const basePatientTask: ClinicianTaskItem = {
  id: 'task-1',
  patientId,
  title: 'Check medication adherence',
  description: 'Review the recent missed doses and confirm the next follow-up step.',
  type: 'adherence_review',
  priority: 'high',
  status: 'open',
  dueAt: `${TODAY_KEY}T18:00:00.000Z`,
  assignedTo: 'clinician-1',
  createdBy: 'clinician-1',
  linkedMessageId: 'msg-1',
  createdAt: `${TODAY_KEY}T09:00:00.000Z`,
  updatedAt: `${TODAY_KEY}T09:00:00.000Z`,
};

const baseCompletedTask: ClinicianTaskItem = {
  ...basePatientTask,
  id: 'task-complete-1',
  title: 'Confirm home exercise reminder',
  priority: 'medium',
  status: 'completed',
  dueAt: `${PREV_KEY}T15:00:00.000Z`,
  completedAt: `${TODAY_KEY}T08:00:00.000Z`,
  updatedAt: `${TODAY_KEY}T08:00:00.000Z`,
};

const baseCommunicationItem: DashboardCommunicationOverviewItem = {
  id: 'comm-1',
  patientId,
  patientName: 'Taylor Moss',
  messageId: 'msg-1',
  needsResponse: true,
  flaggedBySafety: true,
  followUpRequested: true,
  linkedTaskId: basePatientTask.id,
  messageCreatedAt: `${TODAY_KEY}T11:15:00.000Z`,
  messagePreview: 'Pain is much worse after exercise today.',
};

const baseAppointmentRequest: AppointmentRequestItem = {
  requestId: 'request-1',
  slotId: 'slot-1',
  patientId,
  status: 'pending',
  workflowStatus: 'awaiting_confirmation',
  note: 'Waiting for patient confirmation.',
  startsAt: `${TODAY_KEY}T13:00:00.000Z`,
  endsAt: `${TODAY_KEY}T13:30:00.000Z`,
  modality: 'video',
  createdAt: `${TODAY_KEY}T07:30:00.000Z`,
  updatedAt: `${TODAY_KEY}T08:30:00.000Z`,
};

const baseWorklistItem: WorklistRecord = {
  patientId,
  patientName: 'Taylor Moss',
  patientStatus: 'active',
  rehabPhase: 'Strength & Control',
  lastCheckinAt: `${TODAY_KEY}T07:00:00.000Z`,
  openAlertsCount: 1,
  latestRiskLevel: 'high',
  lastPainScore: 8,
  adherenceSummary: {
    exercisesPct: 0.4,
    medicationTaken: false,
  },
  nextAppointmentAt: baseAppointmentRequest.startsAt,
  missedCheckins: {
    flag: true,
    count: 2,
  },
  communicationNeedsResponse: true,
  activeTaskCount: 1,
  topIssue: 'High pain escalation',
  reviewReason: 'Safety review, missed check-ins, and patient communication all need follow-up.',
  priorityScore: 92,
  updatedAt: `${TODAY_KEY}T11:00:00.000Z`,
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
          <Route path="/appointments" element={<div>Appointments workspace</div>} />
          <Route path="/worklist" element={<div>Worklist workspace</div>} />
          <Route path="/patients/:patientId/plan" element={<div>Plan workspace</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

interface FetchMockOptions {
  trends14?: Array<Record<string, unknown>>;
  trends30?: Array<Record<string, unknown>>;
  openAlerts?: AlertItem[];
  communicationItems?: DashboardCommunicationOverviewItem[];
  tasks?: ClinicianTaskItem[];
  appointments?: AppointmentRequestItem[];
  worklistItems?: WorklistRecord[];
}

function installFetchMock(options: FetchMockOptions = {}) {
  const otherPatientAlert: AlertItem = {
    ...basePatientAlert,
    _id: 'alt-other-1',
    patientId: 'patient-other',
  };
  const openAlerts = options.openAlerts ?? [basePatientAlert, otherPatientAlert];

  let taskState = [...(options.tasks ?? [basePatientTask, baseCompletedTask])];
  const communicationItems = options.communicationItems ?? [baseCommunicationItem];
  const appointmentItems = options.appointments ?? [baseAppointmentRequest];
  const worklistItems = options.worklistItems ?? [baseWorklistItem];
  const trends14 = options.trends14 ?? [
    {
      date: TODAY_KEY,
      pain: 8,
      mood: 4,
      adherence: {
        exercises: 0.45,
        medication: true,
      },
      notes: 'Hard day with mobility limits.',
    },
  ];
  const trends30 = options.trends30 ?? [
    {
      date: PREV_KEY,
      pain: 6,
      mood: 5,
      adherence: {
        exercises: 0.7,
        medication: false,
      },
    },
  ];

  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);

    if (url.includes(`/clinician/patients/${patientId}/trends`) && url.includes('days=14')) {
      return createJsonResponse({
        ok: true,
        trends: trends14,
      });
    }

    if (url.includes(`/clinician/patients/${patientId}/trends`) && url.includes('days=30')) {
      return createJsonResponse({
        ok: true,
        trends: trends30,
      });
    }

    if (url.includes('/clinician/alerts?status=open')) {
      return createJsonResponse({
        ok: true,
        alerts: openAlerts,
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

    if (url.includes('/clinician/worklist')) {
      return createJsonResponse({
        ok: true,
        items: worklistItems,
        total: worklistItems.length,
      });
    }

    if (url.includes('/clinician/dashboard/communication-overview')) {
      return createJsonResponse({
        ok: true,
        overview: {
          counts: {
            needsResponseCount: communicationItems.length,
            flaggedBySafetyCount: communicationItems.filter((item) => item.flaggedBySafety).length,
            followUpRequestedCount: communicationItems.filter((item) => item.followUpRequested).length,
          },
          items: communicationItems,
        },
      });
    }

    if (url.includes('/clinician/tasks/') && url.endsWith('/complete')) {
      const taskId = url.split('/clinician/tasks/')[1]?.split('/complete')[0];
      taskState = taskState.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: 'completed',
              completedAt: `${TODAY_KEY}T12:00:00.000Z`,
              updatedAt: `${TODAY_KEY}T12:00:00.000Z`,
            }
          : task,
      );
      return createJsonResponse({
        ok: true,
        task: taskState.find((task) => task.id === taskId),
      });
    }

    if (url.includes('/clinician/tasks')) {
      return createJsonResponse({
        ok: true,
        tasks: taskState,
      });
    }

    if (url.includes('/clinician/appointments/requests')) {
      return createJsonResponse({
        ok: true,
        items: appointmentItems,
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
  it('renders new operational review cockpit panels from available data', async () => {
    installFetchMock();

    renderPatientDetail();

    expect(await screen.findByTestId('patient-detail-current-context')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current priorities' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recommended actions' })).toBeInTheDocument();
    expect(screen.getByTestId('patient-communication-panel')).toBeInTheDocument();
    expect(screen.getByTestId('patient-tasks-panel')).toBeInTheDocument();
    expect(screen.getByTestId('patient-appointments-panel')).toBeInTheDocument();
    expect(
      await within(screen.getByTestId('patient-current-priorities')).findByText('Missed recent check-in'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('patient-communication-panel')).getByText(
        'Pain is much worse after exercise today.',
      ),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('patient-tasks-panel')).getByText('Check medication adherence')).toBeInTheDocument();
    expect(within(screen.getByTestId('patient-appointments-panel')).getByText('Awaiting confirmation')).toBeInTheDocument();
  }, 20_000);

  it('keeps care review visible and collapses slower reference panels by default', async () => {
    installFetchMock();

    renderPatientDetail();

    const operationalHeading = await screen.findByRole('heading', {
      name: 'Communication, tasks, and appointments',
    });
    const careReviewHeading = screen.getByRole('heading', {
      name: 'Care plan, questionnaires, and insight review',
    });
    const referenceBridge = screen.getByTestId('patient-detail-reference-bridge');

    expect(
      operationalHeading.compareDocumentPosition(careReviewHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      careReviewHeading.compareDocumentPosition(referenceBridge) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(screen.getByRole('button', { name: 'Show symptom detail' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Show support signals' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('heading', { name: 'Sleep (recent)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hydration (last 7 days)' })).not.toBeInTheDocument();
  }, 20_000);

  it('reveals compressed reference panels when requested', async () => {
    installFetchMock();

    const user = userEvent.setup();
    renderPatientDetail();

    await screen.findByRole('button', { name: 'Show symptom detail' });
    await user.click(screen.getByRole('button', { name: 'Show symptom detail' }));
    expect(await screen.findByRole('heading', { name: 'Sleep (recent)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide symptom detail' })).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Show support signals' }));
    expect(await screen.findByRole('heading', { name: 'Hydration (last 7 days)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide support signals' })).toHaveAttribute('aria-expanded', 'true');
  }, 20_000);

  it('click-through day detail opens with selected date content', async () => {
    installFetchMock();

    const user = userEvent.setup();
    renderPatientDetail();

    await screen.findByText('Ref alt-pati');
    const detailButtons = await screen.findAllByRole('button', {
      name: /View details|Open day detail/i,
    });
    await user.click(detailButtons[0]);

    expect(await screen.findByRole('dialog', { name: /Day detail/i })).toBeInTheDocument();
    expect(screen.getByText('Check-in snapshot')).toBeInTheDocument();
    expect(screen.getByText('Alerts on this day')).toBeInTheDocument();
  }, 20_000);

  it('switching 14/30 refetches trends and closes day detail panel', async () => {
    const fetchMock = installFetchMock();

    const user = userEvent.setup();
    renderPatientDetail(`/patients/${patientId}?days=14`);

    await screen.findByText('Ref alt-pati');
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
  }, 20_000);

  it('renders only alerts that belong to the selected patient', async () => {
    installFetchMock();

    renderPatientDetail();

    expect(await screen.findByText('Ref alt-pati')).toBeInTheDocument();
    expect(screen.queryByText('Ref alt-othe')).not.toBeInTheDocument();
  });

  it('renders calm empty states for communication, tasks, and appointments when no follow-up exists', async () => {
    installFetchMock({
      openAlerts: [],
      communicationItems: [],
      tasks: [],
      appointments: [],
      worklistItems: [],
      trends14: [
        {
          date: TODAY_KEY,
          pain: 3,
          mood: 4,
          adherence: {
            exercises: 0.8,
            medication: true,
          },
        },
      ],
    });

    renderPatientDetail();

    expect(await screen.findByText('No immediate priorities detected')).toBeInTheDocument();
    expect(screen.getByText('No recent communication needing follow-up')).toBeInTheDocument();
    expect(screen.getByText('No open tasks for this patient')).toBeInTheDocument();
    expect(screen.getByText('No appointment activity to review')).toBeInTheDocument();
  }, 20_000);

  it('marks a patient task complete and refreshes the follow-up panel', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    expect(
      await within(screen.getByTestId('patient-tasks-panel')).findByText('Check medication adherence'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark complete' }));

    expect(await screen.findByText('Task marked complete.')).toBeInTheDocument();
    expect(within(screen.getByTestId('patient-tasks-panel')).getByText('Recently completed')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('patient-tasks-panel')).getAllByText('Completed').length,
    ).toBeGreaterThan(0);
  }, 20_000);
});
