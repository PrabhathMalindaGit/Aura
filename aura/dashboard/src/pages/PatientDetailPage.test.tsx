/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClinicianCommunicationScopeKey } from '../services/clinicianIdentity';
import { clearClinicianProfileForTests, getClinicianProfile, setClinicianProfile } from '../services/clinicianProfile';
import {
  addPatientHandoffNote,
  clearPatientHandoffWorkspaceForTests,
  savePatientCurrentHandoff,
} from '../services/patientHandoffWorkspace';
import type {
  AlertItem,
  AppointmentRequestItem,
  ClinicianTaskItem,
  DashboardCommunicationOverviewItem,
  WorklistRecord,
} from '../types/models';
import { clearDashboardSessionData } from '../utils/storageKeys';
import { createPatientEntryState } from '../utils/patientEntryContext';
import { CommunicationPage } from './CommunicationPage';
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

function signInAs(input: { sub: string; name?: string }): void {
  window.localStorage.setItem('aura_access_token', buildToken(input));
}

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

function PatientDetailHistoryHarness(): JSX.Element {
  const navigate = useNavigate();

  return (
    <>
      <button type="button" onClick={() => navigate(-1)}>
        Go back
      </button>
      <PatientDetailPage />
    </>
  );
}

function renderPatientDetail(
  initialEntries:
    | string
    | Array<string | { pathname: string; search?: string; state?: unknown }> = [
      `/patients/${patientId}?days=14`,
    ],
  options: {
    withHistoryProbe?: boolean;
  } = {},
): void {
  const queryClient = createQueryClient();
  const entries = Array.isArray(initialEntries) ? initialEntries : [initialEntries];

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route
            path="/patients/:patientId"
            element={options.withHistoryProbe ? <PatientDetailHistoryHarness /> : <PatientDetailPage />}
          />
          <Route path="/patients" element={<div>Patients workspace</div>} />
          <Route path="/communication" element={<CommunicationPage />} />
          <Route path="/appointments" element={<div>Appointments workspace</div>} />
          <Route path="/alerts" element={<div>Alerts workspace</div>} />
          <Route path="/insights" element={<div>Insights workspace</div>} />
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
  window.localStorage.clear();
  window.sessionStorage.clear();
  clearClinicianProfileForTests();
  clearPatientHandoffWorkspaceForTests();
  signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });
  setClinicianProfile({
    ...getClinicianProfile(),
    displayName: 'Dr Elena Hall',
    clinicianId: 'elena-hall-local',
    roleTitle: 'Lead rehab clinician',
    specialty: 'Post-op recovery',
  });
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

  it('hands off patient communication summary into the communication workspace', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    const communicationPanel = await screen.findByTestId('patient-communication-panel');
    await user.click(within(communicationPanel).getAllByRole('button', { name: 'Open communication' })[0]);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Communication' })).toBeInTheDocument();
    });
  });

  it('renders the mini-nav alongside source-aware continuity and jumps to major sections', async () => {
    installFetchMock();
    const user = userEvent.setup();
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoViewMock,
    });

    renderPatientDetail([
      {
        pathname: `/patients/${patientId}`,
        search: '?days=14',
        state: createPatientEntryState({
          patientId,
          source: 'alerts',
          focus: 'alerts',
          returnTo: '/alerts?patientId=patient-42',
        }),
      },
    ]);

    const miniNav = await screen.findByTestId('patient-detail-mini-nav');
    expect(miniNav).toBeInTheDocument();
    expect(await screen.findByTestId('patient-detail-entry-cue')).toHaveTextContent('Opened from Alerts');
    expect(screen.getByTestId('patient-detail-return-link')).toHaveTextContent('Return to Alerts');

    await user.click(within(miniNav).getByRole('button', { name: 'Operations' }));

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it('expands trend cards inline one at a time and keeps day drilldown available', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    expect(await screen.findByTestId('trend-chart-card-pain')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand pain trend' }));

    expect(await screen.findByTestId('trend-chart-expanded-shell')).toBeInTheDocument();
    expect(screen.getByTestId('trend-chart-expanded-pain')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand mood trend' }));

    expect(await screen.findByTestId('trend-chart-expanded-mood')).toBeInTheDocument();
    expect(screen.queryByTestId('trend-chart-expanded-pain')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse trend' }));
    await waitFor(() => {
      expect(screen.queryByTestId('trend-chart-expanded-shell')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Expand pain trend' }));
    await screen.findByTestId('trend-chart-expanded-pain');
    await user.click(screen.getByTestId(`trend-view-${TODAY_KEY}`));

    expect(await screen.findByRole('dialog', { name: /Day detail/i })).toBeInTheDocument();
  }, 20_000);

  it('shows inline quick reply for routine communication', async () => {
    const routineCommunicationItem: DashboardCommunicationOverviewItem = {
      ...baseCommunicationItem,
      flaggedBySafety: false,
      followUpRequested: false,
      messagePreview: 'Can someone confirm whether tomorrow still works?',
    };

    installFetchMock({
      communicationItems: [routineCommunicationItem],
    });

    renderPatientDetail();

    const communicationPanel = await screen.findByTestId('patient-communication-panel');
    expect(await within(communicationPanel).findByRole('textbox', { name: 'Quick reply' })).toBeInTheDocument();
    expect(within(communicationPanel).getByRole('button', { name: 'Send quick reply' })).toBeInTheDocument();
  });

  it('suppresses inline quick reply for safety-sensitive communication and keeps the handoff path', async () => {
    installFetchMock();
    renderPatientDetail();

    const safetyPanel = await screen.findByTestId('patient-communication-panel');
    expect(within(safetyPanel).queryByRole('textbox', { name: 'Quick reply' })).not.toBeInTheDocument();
    expect(
      await within(safetyPanel).findByText('Safety-sensitive communication stays on handoff review.'),
    ).toBeInTheDocument();
    expect(within(safetyPanel).getByRole('button', { name: 'Open alerts' })).toBeInTheDocument();
  });

  it('stores a routine patient-detail quick reply in the shared communication model without marking the thread reviewed', async () => {
    const routineCommunicationItem: DashboardCommunicationOverviewItem = {
      ...baseCommunicationItem,
      flaggedBySafety: false,
      followUpRequested: false,
      messagePreview: 'Can someone confirm whether tomorrow still works?',
    };

    installFetchMock({
      communicationItems: [routineCommunicationItem],
    });
    const user = userEvent.setup();

    renderPatientDetail();

    const communicationPanel = await screen.findByTestId('patient-communication-panel');
    await within(communicationPanel).findByLabelText('Replying as clinician identity');
    expect(within(communicationPanel).getByText('Replying as')).toBeInTheDocument();
    expect(within(communicationPanel).getByText('Dr Elena Hall')).toBeInTheDocument();
    await within(communicationPanel).findByRole('textbox', { name: 'Quick reply' });
    const communicationTimeline = within(communicationPanel).getByRole('list', {
      name: 'Patient communication timeline',
    });
    expect(
      within(communicationTimeline).getByText('Can someone confirm whether tomorrow still works?'),
    ).toBeInTheDocument();
    await user.type(
      within(communicationPanel).getByRole('textbox', { name: 'Quick reply' }),
      'Please keep tomorrow for now. We will confirm the schedule this afternoon.',
    );
    await user.click(within(communicationPanel).getByRole('button', { name: 'Send quick reply' }));

    const localReply = await within(communicationTimeline).findByText(
      'Please keep tomorrow for now. We will confirm the schedule this afternoon.',
    );
    expect(localReply).toBeInTheDocument();
    expect(within(communicationTimeline).getByText('Local clinician reply')).toBeInTheDocument();
    expect(within(communicationTimeline).getByText('Dr Elena Hall')).toBeInTheDocument();
    expect(within(communicationTimeline).getByText('Lead rehab clinician · Post-op recovery')).toBeInTheDocument();

    const storedState = window.localStorage.getItem(
      `aura_communication_workspace:${getClinicianCommunicationScopeKey()}`,
    );
    expect(storedState).not.toBeNull();
    const parsedStoredState = JSON.parse(storedState ?? '{}') as {
      repliesByPatient?: Record<string, unknown>;
      reviewedAtByPatient?: Record<string, string>;
    };
    expect(parsedStoredState.repliesByPatient?.[patientId]).toBeDefined();
    expect(parsedStoredState.reviewedAtByPatient?.[patientId]).toBeUndefined();

    await user.click(within(communicationPanel).getByRole('button', { name: 'Open communication' }));

    expect(await screen.findByRole('heading', { name: 'Communication' })).toBeInTheDocument();
    expect(
      await within(screen.getByRole('list', { name: 'Patient communication timeline' })).findByText(
        'Please keep tomorrow for now. We will confirm the schedule this afternoon.',
      ),
    ).toBeInTheDocument();
  });

  it('renders a grounded internal handoff panel with only supported next-step options', async () => {
    installFetchMock();
    renderPatientDetail();

    const handoffPanel = await screen.findByTestId('patient-handoff-panel');
    expect(
      within(handoffPanel).getByText(
        'Stored only in this browser for local patient handoff continuity. It is not synced across devices or staff accounts.',
      ),
    ).toBeInTheDocument();

    const nextStepSelect = within(handoffPanel).getByLabelText('Recommended next step');
    expect(within(nextStepSelect).getByRole('option', { name: 'Continue monitoring' })).toBeInTheDocument();
    expect(within(nextStepSelect).getByRole('option', { name: 'Review alerts' })).toBeInTheDocument();
    expect(within(nextStepSelect).getByRole('option', { name: 'Review communication' })).toBeInTheDocument();
    expect(within(nextStepSelect).getByRole('option', { name: 'Review tasks' })).toBeInTheDocument();
    expect(within(nextStepSelect).getByRole('option', { name: 'Review appointments' })).toBeInTheDocument();
    expect(within(nextStepSelect).getByRole('option', { name: 'Open plan' })).toBeInTheDocument();
    expect(within(nextStepSelect).queryByRole('option', { name: 'Open worklist' })).not.toBeInTheDocument();
    expect(within(nextStepSelect).queryByRole('option', { name: 'Review trends' })).not.toBeInTheDocument();
  });

  it('saves structured handoff and internal notes from patient detail', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    const handoffPanel = await screen.findByTestId('patient-handoff-panel');
    await user.type(
      within(handoffPanel).getByLabelText('Handoff summary'),
      'Escalate into the current plan review after checking the latest patient context.',
    );
    await user.selectOptions(
      within(handoffPanel).getByLabelText('Recommended next step'),
      'plan',
    );
    await user.selectOptions(
      within(handoffPanel).getByLabelText('Follow-up owner'),
      'self',
    );
    await user.click(within(handoffPanel).getByRole('button', { name: 'Save handoff' }));

    expect(
      await within(handoffPanel).findByText('Internal handoff saved in this browser.'),
    ).toBeInTheDocument();
    const savedHandoff = within(handoffPanel).getByTestId('patient-handoff-current');
    expect(
      within(savedHandoff).getByText(
        'Escalate into the current plan review after checking the latest patient context.',
      ),
    ).toBeInTheDocument();
    expect(within(savedHandoff).getAllByText('Dr Elena Hall').length).toBeGreaterThan(0);
    expect(within(savedHandoff).getByText('Lead rehab clinician · Post-op recovery')).toBeInTheDocument();

    await user.type(
      within(handoffPanel).getByLabelText('Add internal note'),
      'Patient asked for a calmer follow-up window tomorrow morning.',
    );
    await user.click(within(handoffPanel).getByRole('button', { name: 'Add note' }));

    expect(await within(handoffPanel).findByText('Internal note saved in this browser.')).toBeInTheDocument();
    const notesSection = within(handoffPanel).getByRole('region', { name: 'Internal clinician notes' });
    const notesList = within(notesSection).getByRole('list');
    expect(
      within(notesList).getByText('Patient asked for a calmer follow-up window tomorrow morning.'),
    ).toBeInTheDocument();
  });

  it('opens the saved next step only for a real supported patient-detail target', async () => {
    installFetchMock();
    savePatientCurrentHandoff(patientId, {
      summary: 'Move from review into the exercise plan next.',
      nextAction: 'plan',
      followUpOwner: { kind: 'unassigned' },
    });
    const user = userEvent.setup();

    renderPatientDetail();

    const handoffPanel = await screen.findByTestId('patient-handoff-panel');
    await user.click(within(handoffPanel).getByRole('button', { name: 'Open plan' }));

    expect(await screen.findByText('Plan workspace')).toBeInTheDocument();
  });

  it('clears only the structured handoff when saved blank and preserves note history', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    const handoffPanel = await screen.findByTestId('patient-handoff-panel');
    await user.type(
      within(handoffPanel).getByLabelText('Handoff summary'),
      'Keep the alert review in view during the next pass.',
    );
    await user.selectOptions(within(handoffPanel).getByLabelText('Recommended next step'), 'alerts');
    await user.click(within(handoffPanel).getByRole('button', { name: 'Save handoff' }));
    await user.type(
      within(handoffPanel).getByLabelText('Add internal note'),
      'Note history should survive the blank handoff clear.',
    );
    await user.click(within(handoffPanel).getByRole('button', { name: 'Add note' }));

    await user.clear(within(handoffPanel).getByLabelText('Handoff summary'));
    await user.selectOptions(within(handoffPanel).getByLabelText('Recommended next step'), '');
    await user.selectOptions(within(handoffPanel).getByLabelText('Follow-up owner'), 'unassigned');
    await user.click(within(handoffPanel).getByRole('button', { name: 'Save handoff' }));

    expect(
      await within(handoffPanel).findByText('Structured handoff cleared for this patient in this browser.'),
    ).toBeInTheDocument();
    expect(within(handoffPanel).queryByTestId('patient-handoff-current')).not.toBeInTheDocument();
    expect(
      within(handoffPanel).getByText('Note history should survive the blank handoff clear.'),
    ).toBeInTheDocument();
  });

  it('keeps saved handoff attribution stable after later clinician profile edits', async () => {
    installFetchMock();
    savePatientCurrentHandoff(patientId, {
      summary: 'Saved by the original clinician identity.',
      nextAction: 'alerts',
      followUpOwner: { kind: 'self', clinicianId: '', authorDisplayName: '' },
    });
    addPatientHandoffNote(patientId, 'Original clinician note.');

    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: 'Dr Morgan Shaw',
      clinicianId: 'morgan-shaw-local',
      roleTitle: 'Coverage clinician',
      specialty: 'Weekend escalation',
    });

    renderPatientDetail();

    const handoffPanel = await screen.findByTestId('patient-handoff-panel');
    const savedHandoff = within(handoffPanel).getByTestId('patient-handoff-current');
    const notesSection = within(handoffPanel).getByRole('region', { name: 'Internal clinician notes' });
    const notesList = within(notesSection).getByRole('list');
    expect(within(savedHandoff).getAllByText('Dr Elena Hall').length).toBeGreaterThan(0);
    expect(within(savedHandoff).getByText('Lead rehab clinician · Post-op recovery')).toBeInTheDocument();
    expect(within(notesList).getByText('Original clinician note.')).toBeInTheDocument();
    expect(within(notesList).getByText('Lead rehab clinician · Post-op recovery')).toBeInTheDocument();
  });

  it('keeps browser-local handoff visible across normal sign-out and later sign-in', async () => {
    installFetchMock();
    savePatientCurrentHandoff(patientId, {
      summary: 'Browser-local continuity should remain visible on this device.',
      nextAction: 'appointments',
      followUpOwner: { kind: 'self', clinicianId: '', authorDisplayName: '' },
    });

    clearDashboardSessionData();
    signInAs({ sub: 'auth-clinician-2', name: 'Dr Patel' });

    renderPatientDetail();

    const handoffPanel = await screen.findByTestId('patient-handoff-panel');
    const savedHandoff = within(handoffPanel).getByTestId('patient-handoff-current');
    expect(
      within(savedHandoff).getByText('Browser-local continuity should remain visible on this device.'),
    ).toBeInTheDocument();
    expect(
      within(handoffPanel).getByText(
        'Stored only in this browser for local patient handoff continuity. It is not synced across devices or staff accounts.',
      ),
    ).toBeInTheDocument();
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

  it('shows a subtle source cue and return link for alert follow-through', async () => {
    installFetchMock();

    renderPatientDetail([
      {
        pathname: `/patients/${patientId}`,
        search: '?days=14',
        state: createPatientEntryState({
          patientId,
          source: 'alerts',
          focus: 'alerts',
          returnTo: '/alerts?patientId=patient-42',
        }),
      },
    ]);

    expect(await screen.findByTestId('patient-detail-entry-cue')).toHaveTextContent('Opened from Alerts');
    expect(screen.getByTestId('patient-detail-entry-hint')).toHaveTextContent('Alert follow-through.');
    expect(screen.getByTestId('patient-detail-return-link')).toHaveTextContent('Return to Alerts');
    expect(screen.getByTestId('patient-detail-return-link')).toHaveAttribute(
      'href',
      '/alerts?patientId=patient-42',
    );
  }, 20_000);

  it('falls back to the generic patient entry when route state is invalid for this patient', async () => {
    installFetchMock();

    renderPatientDetail([
      {
        pathname: `/patients/${patientId}`,
        search: '?days=14',
        state: createPatientEntryState({
          patientId: 'patient-other',
          source: 'worklist',
          focus: 'workflow',
          returnTo: '/worklist',
        }),
      },
    ]);

    expect(await screen.findByTestId('patient-detail-current-context')).toBeInTheDocument();
    expect(screen.queryByTestId('patient-detail-entry-cue')).not.toBeInTheDocument();
    expect(screen.queryByTestId('patient-detail-entry-hint')).not.toBeInTheDocument();
    expect(screen.getByTestId('patient-detail-return-link')).toHaveTextContent('Back to patients');
    expect(screen.getByTestId('patient-detail-return-link')).toHaveAttribute('href', '/patients');
  }, 20_000);

  it('clears handoff state with replace semantics so browser back returns to the source page', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail(
      [
        '/worklist',
        {
          pathname: `/patients/${patientId}`,
          search: '?days=14',
          state: createPatientEntryState({
            patientId,
            source: 'worklist',
            focus: 'workflow',
            returnTo: '/worklist',
          }),
        },
      ],
      { withHistoryProbe: true },
    );

    expect(await screen.findByTestId('patient-detail-entry-cue')).toHaveTextContent('Opened from Worklist');

    await user.click(screen.getByRole('button', { name: 'Go back' }));

    expect(await screen.findByText('Worklist workspace')).toBeInTheDocument();
  }, 20_000);
});
