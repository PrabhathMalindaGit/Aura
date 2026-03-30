/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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

type ResizeObserverCallbackMock = (
  entries: ResizeObserverEntry[],
  observer: ResizeObserver,
) => void;

const resizeObserverCallbacks = new Map<Element, Set<ResizeObserverCallbackMock>>();

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
    private readonly callback: ResizeObserverCallbackMock;
    private readonly observedElements = new Set<Element>();

    constructor(callback: ResizeObserverCallbackMock) {
      this.callback = callback;
    }

    observe(target: Element): void {
      this.observedElements.add(target);
      const callbacks = resizeObserverCallbacks.get(target) ?? new Set<ResizeObserverCallbackMock>();
      callbacks.add(this.callback);
      resizeObserverCallbacks.set(target, callbacks);
    }

    unobserve(target: Element): void {
      this.observedElements.delete(target);
      const callbacks = resizeObserverCallbacks.get(target);

      if (!callbacks) {
        return;
      }

      callbacks.delete(this.callback);

      if (callbacks.size === 0) {
        resizeObserverCallbacks.delete(target);
      }
    }

    disconnect(): void {
      this.observedElements.forEach((target) => {
        this.unobserve(target);
      });
    }
  }

  resizeObserverCallbacks.clear();

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

  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
}

function createResizeObserverEntry(target: Element, width: number): ResizeObserverEntry {
  return {
    target,
    contentRect: {
      width,
      height: 0,
      x: 0,
      y: 0,
      top: 0,
      right: width,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
    } as DOMRectReadOnly,
  } as ResizeObserverEntry;
}

function triggerResizeObserver(target: Element, width: number): void {
  const callbacks = resizeObserverCallbacks.get(target);

  callbacks?.forEach((callback) => {
    callback([createResizeObserverEntry(target, width)], {} as ResizeObserver);
  });
}

function PatientDetailHistoryHarness(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      <button type="button" onClick={() => navigate(-1)}>
        Go back
      </button>
      <button type="button" onClick={() => navigate(1)}>
        Go forward
      </button>
      <output aria-label="Current patient detail route">
        {location.pathname}
        {location.search}
      </output>
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
  const patientDetailElement = options.withHistoryProbe ? <PatientDetailHistoryHarness /> : <PatientDetailPage />;

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/patients/:patientId" element={patientDetailElement} />
          <Route path="/patients/:patientId/overview" element={patientDetailElement} />
          <Route path="/patients/:patientId/communications" element={patientDetailElement} />
          <Route path="/patients/:patientId/guidance" element={patientDetailElement} />
          <Route path="/patients/:patientId/history" element={patientDetailElement} />
          <Route path="/patients" element={<div>Patients workspace</div>} />
          <Route path="/communication" element={<CommunicationPage />} />
          <Route path="/appointments" element={<div>Appointments workspace</div>} />
          <Route path="/alerts" element={<div>Alerts workspace</div>} />
          <Route path="/insights" element={<div>Insights workspace</div>} />
          <Route path="/worklist" element={<div>Worklist workspace</div>} />
          <Route path="/patients/:patientId/plan" element={<div>Plan workspace</div>} />
          <Route path="/patients/:patientId/sessions" element={<div>Sessions workspace</div>} />
          <Route path="/patients/:patientId/weekly-report" element={<div>Weekly report workspace</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderPatientDetailWithoutRouteParam(): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/patients']}>
        <Routes>
          <Route path="/patients" element={<PatientDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openPatientWorkspaceTab(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<void> {
  const tab = await screen.findByRole('tab', { name });
  await user.click(tab);

  await waitFor(() => {
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });
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
  let openAlertsState = [...(options.openAlerts ?? [basePatientAlert, otherPatientAlert])];
  let acknowledgedAlertsState: AlertItem[] = [];
  let resolvedAlertsState: AlertItem[] = [];

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

  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

    if (method === 'PATCH' && url.includes('/clinician/alerts/')) {
      const alertId = url.split('/clinician/alerts/')[1]?.split('?')[0] ?? '';
      const payload =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as { status?: 'acknowledged' | 'resolved' })
          : {};
      const nextStatus = payload.status === 'resolved' ? 'resolved' : 'acknowledged';
      const currentAlert =
        [...openAlertsState, ...acknowledgedAlertsState, ...resolvedAlertsState].find(
          (alert) => alert._id === alertId,
        ) ?? {
          ...basePatientAlert,
          _id: alertId || basePatientAlert._id,
        };
      const updatedAlert: AlertItem = {
        ...currentAlert,
        status: nextStatus,
        updatedAt: `${TODAY_KEY}T12:30:00.000Z`,
        acknowledgedAt:
          nextStatus === 'acknowledged'
            ? currentAlert.acknowledgedAt ?? `${TODAY_KEY}T12:30:00.000Z`
            : currentAlert.acknowledgedAt,
        resolvedAt:
          nextStatus === 'resolved'
            ? currentAlert.resolvedAt ?? `${TODAY_KEY}T12:35:00.000Z`
            : currentAlert.resolvedAt,
      };

      openAlertsState = openAlertsState.filter((alert) => alert._id !== alertId);
      acknowledgedAlertsState = acknowledgedAlertsState.filter((alert) => alert._id !== alertId);
      resolvedAlertsState = resolvedAlertsState.filter((alert) => alert._id !== alertId);

      if (nextStatus === 'acknowledged') {
        acknowledgedAlertsState = [updatedAlert, ...acknowledgedAlertsState];
      } else {
        resolvedAlertsState = [updatedAlert, ...resolvedAlertsState];
      }

      return createJsonResponse({
        ok: true,
        alert: updatedAlert,
      });
    }

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
        alerts: openAlertsState,
      });
    }

    if (url.includes('/clinician/alerts?status=acknowledged')) {
      return createJsonResponse({ ok: true, alerts: acknowledgedAlertsState });
    }

    if (url.includes('/clinician/alerts?status=resolved')) {
      return createJsonResponse({ ok: true, alerts: resolvedAlertsState });
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
  it('renders a cockpit-consistent fallback when route context is missing', async () => {
    renderPatientDetailWithoutRouteParam();

    expect(await screen.findByRole('heading', { name: 'Patient detail' })).toBeInTheDocument();
    expect(screen.getByText('Missing route context')).toBeInTheDocument();
    expect(screen.getByText('Patient not found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to patients' })).toBeInTheDocument();
  });

  it('renders the new cockpit overview first, then opens the communications workspace on demand', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    expect(await screen.findByTestId('patient-detail-current-context')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Current priorities' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recommended actions' })).toBeInTheDocument();
    expect(
      await within(screen.getByTestId('patient-current-priorities')).findByText('Missed recent check-in'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('patient-communication-panel')).not.toBeInTheDocument();

    await openPatientWorkspaceTab(user, 'Communications & Notes');

    expect(screen.getByTestId('patient-communication-panel')).toBeInTheDocument();
    expect(screen.getByTestId('patient-tasks-panel')).toBeInTheDocument();
    expect(screen.getByTestId('patient-appointments-panel')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('patient-communication-panel')).getByText(
        'Pain is much worse after exercise today.',
      ),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('patient-tasks-panel')).getByText('Check medication adherence')).toBeInTheDocument();
    expect(within(screen.getByTestId('patient-appointments-panel')).getByText('Awaiting confirmation')).toBeInTheDocument();
  }, 20_000);

  it('keeps the overview activity strip secondary to the decision surface and factual', async () => {
    installFetchMock();

    renderPatientDetail();

    const decisionSurface = await screen.findByTestId('patient-decision-surface');
    const overviewActivityStrip = screen.getByLabelText('Overview review window activity');

    expect(
      (decisionSurface.compareDocumentPosition(overviewActivityStrip) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    ).toBe(true);
    expect(overviewActivityStrip).toHaveTextContent('Patient update');
    expect(overviewActivityStrip).toHaveTextContent('Safety');
    expect(overviewActivityStrip).toHaveTextContent('Follow-through');
    expect(overviewActivityStrip).toHaveTextContent(/Next touchpoint|Recent session/);
    expect(overviewActivityStrip).not.toHaveTextContent(/improving|declining|stabilizing|high risk/i);
  });

  it('keeps urgent context available before history-only reference queries wake up', async () => {
    const fetchMock = installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    const prioritySupport = await screen.findByTestId('patient-detail-priority-support');
    expect(within(prioritySupport).getByText('Clinical context in view')).toBeInTheDocument();
    expect(within(prioritySupport).getByText('Recent alerts')).toBeInTheDocument();

    const initialUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(initialUrls.some((url) => url.includes(`/clinician/patients/${patientId}/checkins`))).toBe(false);
    expect(initialUrls.some((url) => url.includes('/hydration/range'))).toBe(false);
    expect(initialUrls.some((url) => url.includes('/nutrition/range'))).toBe(false);
    expect(initialUrls.some((url) => url.includes('/wearables/summary'))).toBe(false);
    expect(initialUrls.some((url) => url.includes('/wearables/daily'))).toBe(false);
    expect(initialUrls.some((url) => url.includes('/medications/adherence'))).toBe(false);
    expect(initialUrls.some((url) => url.includes('/photos?'))).toBe(false);

    await openPatientWorkspaceTab(user, 'History & Signals');

    await waitFor(() => {
      const historyUrls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(historyUrls.some((url) => url.includes(`/clinician/patients/${patientId}/checkins`))).toBe(true);
      expect(historyUrls.some((url) => url.includes('/hydration/range'))).toBe(true);
      expect(historyUrls.some((url) => url.includes('/nutrition/range'))).toBe(true);
      expect(historyUrls.some((url) => url.includes('/wearables/summary'))).toBe(true);
      expect(historyUrls.some((url) => url.includes('/wearables/daily'))).toBe(true);
      expect(historyUrls.some((url) => url.includes('/medications/adherence'))).toBe(true);
      expect(historyUrls.some((url) => url.includes('/photos?'))).toBe(true);
    });
  });

  it('uses tabs to demote slower care review and history content until requested', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    expect(await screen.findByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.queryByRole('heading', { name: 'Questionnaires, insights, and rehab guidance' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Trend history and slower recovery context' }),
    ).not.toBeInTheDocument();

    await openPatientWorkspaceTab(user, 'Clinical Guidance & Questionnaires');
    expect(
      await screen.findByRole('heading', { name: 'Questionnaires, insights, and rehab guidance' }),
    ).toBeVisible();

    await openPatientWorkspaceTab(user, 'History & Signals');
    expect(
      await screen.findByRole('heading', { name: 'Trend history and slower recovery context' }),
    ).toBeVisible();

    expect(screen.getByRole('button', { name: 'Show symptom detail' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Show support signals' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('heading', { name: 'Sleep (recent)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hydration (last 7 days)' })).not.toBeInTheDocument();
  }, 20_000);

  it('keeps the history review-window summary factual and above slower trend detail', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    await openPatientWorkspaceTab(user, 'History & Signals');

    const historySummary = await screen.findByLabelText('History review window summary');
    const trajectoryHeading = screen.getByRole('heading', { name: 'Clinical trajectory' });

    expect((historySummary.compareDocumentPosition(trajectoryHeading) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(
      true,
    );
    expect(historySummary).toHaveTextContent('Last check-in');
    expect(historySummary).toHaveTextContent('Latest pain');
    expect(historySummary).toHaveTextContent('7d adherence');
    expect(historySummary).toHaveTextContent('Recent session');
    expect(historySummary).not.toHaveTextContent(/improving|declining|stabilizing|high risk/i);
  });

  it('reveals compressed reference panels when requested', async () => {
    installFetchMock();

    const user = userEvent.setup();
    renderPatientDetail();

    await openPatientWorkspaceTab(user, 'History & Signals');
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
    await openPatientWorkspaceTab(user, 'History & Signals');
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
    await openPatientWorkspaceTab(user, 'History & Signals');
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

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    const communicationPanel = await screen.findByTestId('patient-communication-panel');
    await user.click(within(communicationPanel).getAllByRole('button', { name: 'Open communication' })[0]);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    });
  });

  it('renders source-aware continuity alongside the new workspace tabs and supports keyboard tab switching', async () => {
    installFetchMock();
    const user = userEvent.setup();

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
    expect(screen.getByTestId('patient-detail-return-link')).toHaveTextContent('Return to Alerts');
    expect(screen.queryByTestId('patient-detail-mini-nav')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');

    const guidanceTab = screen.getByRole('tab', { name: 'Clinical Guidance & Questionnaires' });
    guidanceTab.focus();
    fireEvent.keyDown(guidanceTab, { key: 'ArrowRight' });

    const historyTab = screen.getByRole('tab', { name: 'History & Signals' });
    await waitFor(() => {
      expect(historyTab).toHaveFocus();
      expect(historyTab).toHaveAttribute('aria-selected', 'true');
    });
    expect(
      await screen.findByRole('heading', { name: 'Trend history and slower recovery context' }),
    ).toBeInTheDocument();

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    expect(screen.getByTestId('patient-communication-panel')).toBeInTheDocument();
  });

  it('loads directly into a tab-specific patient detail route without losing the selected workspace', async () => {
    installFetchMock();

    renderPatientDetail(`/patients/${patientId}/history?days=30`);

    expect(await screen.findByRole('tab', { name: 'History & Signals' })).toHaveAttribute('aria-selected', 'true');
    expect(
      await screen.findByRole('heading', { name: 'Trend history and slower recovery context' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'false');
  });

  it('does not fetch communications or guidance buckets on direct history routes until those tabs open', async () => {
    const fetchMock = installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail(`/patients/${patientId}/history?days=30`);

    expect(await screen.findByRole('tab', { name: 'History & Signals' })).toHaveAttribute('aria-selected', 'true');
    const initialUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(initialUrls.some((url) => url.includes('/clinician/dashboard/communication-overview'))).toBe(false);
    expect(initialUrls.some((url) => url.includes('/clinician/tasks'))).toBe(false);
    expect(initialUrls.some((url) => url.includes('/rehab-phases'))).toBe(false);
    expect(initialUrls.some((url) => url.includes('/proms'))).toBe(false);
    expect(initialUrls.some((url) => url.includes('/insights'))).toBe(false);

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    await waitFor(() => {
      const communicationUrls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(communicationUrls.some((url) => url.includes('/clinician/dashboard/communication-overview'))).toBe(true);
      expect(communicationUrls.some((url) => url.includes('/clinician/tasks'))).toBe(true);
    });

    await openPatientWorkspaceTab(user, 'Clinical Guidance & Questionnaires');
    await waitFor(() => {
      const guidanceUrls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(guidanceUrls.some((url) => url.includes('/rehab-phases'))).toBe(true);
      expect(guidanceUrls.some((url) => url.includes('/proms'))).toBe(true);
      expect(guidanceUrls.some((url) => url.includes('/insights'))).toBe(true);
    });
  });

  it('updates the URL path for tab changes while preserving the review window query', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail(`/patients/${patientId}?days=30`, { withHistoryProbe: true });

    expect(await screen.findByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Current patient detail route')).toHaveTextContent(
      `/patients/${patientId}?days=30`,
    );

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    await waitFor(() => {
      expect(screen.getByLabelText('Current patient detail route')).toHaveTextContent(
        `/patients/${patientId}/communications?days=30`,
      );
    });

    await openPatientWorkspaceTab(user, 'Clinical Guidance & Questionnaires');
    await waitFor(() => {
      expect(screen.getByLabelText('Current patient detail route')).toHaveTextContent(
        `/patients/${patientId}/guidance?days=30`,
      );
    });
  });

  it('restores tab selection with browser back and forward navigation', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail(`/patients/${patientId}?days=14`, { withHistoryProbe: true });

    expect(await screen.findByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    await openPatientWorkspaceTab(user, 'History & Signals');

    await waitFor(() => {
      expect(screen.getByLabelText('Current patient detail route')).toHaveTextContent(
        `/patients/${patientId}/history?days=14`,
      );
    });

    await user.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Current patient detail route')).toHaveTextContent(
        `/patients/${patientId}/communications?days=14`,
      );
    });
    expect(screen.getByRole('tab', { name: 'Communications & Notes' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Current patient detail route')).toHaveTextContent(
        `/patients/${patientId}?days=14`,
      );
    });
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: 'Go forward' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Current patient detail route')).toHaveTextContent(
        `/patients/${patientId}/communications?days=14`,
      );
    });
    expect(screen.getByRole('tab', { name: 'Communications & Notes' })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the active history tab on refresh and refetches only shell plus the active history bucket', async () => {
    const fetchMock = installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail(`/patients/${patientId}/history?days=14`, { withHistoryProbe: true });

    expect(await screen.findByRole('heading', { name: 'Trend history and slower recovery context' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Current patient detail route')).toHaveTextContent(
        `/patients/${patientId}/history?days=14`,
      );
    });

    fetchMock.mockClear();

    const headerRefreshButton = document.querySelector('.patient-detail-actions__refresh') as HTMLButtonElement | null;
    expect(headerRefreshButton).not.toBeNull();
    await user.click(headerRefreshButton!);

    await waitFor(() => {
      const refreshUrls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(refreshUrls.some((url) => url.includes('/clinician/patients'))).toBe(true);
      expect(refreshUrls.some((url) => url.includes('/clinician/worklist'))).toBe(true);
      expect(refreshUrls.some((url) => url.includes('/clinician/alerts?status=open'))).toBe(true);
      expect(refreshUrls.some((url) => url.includes(`/clinician/patients/${patientId}/trends`) && url.includes('days=14'))).toBe(true);
      expect(refreshUrls.some((url) => url.includes(`/clinician/patients/${patientId}/checkins`))).toBe(true);
    });

    const refreshUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(refreshUrls.some((url) => url.includes('/clinician/dashboard/communication-overview'))).toBe(false);
    expect(refreshUrls.some((url) => url.includes('/clinician/tasks'))).toBe(false);
    expect(refreshUrls.some((url) => url.includes('/rehab-phases'))).toBe(false);
    expect(refreshUrls.some((url) => url.includes('/proms'))).toBe(false);
    expect(refreshUrls.some((url) => url.includes('/insights'))).toBe(false);
    expect(screen.getByLabelText('Current patient detail route')).toHaveTextContent(
      `/patients/${patientId}/history?days=14`,
    );
    expect(screen.getByRole('tab', { name: 'History & Signals' })).toHaveAttribute('aria-selected', 'true');
  });

  it('uses route-aware tab jumps for recommended actions that stay inside patient detail', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail(`/patients/${patientId}?days=14`, { withHistoryProbe: true });

    expect(
      await within(screen.getByTestId('patient-current-priorities')).findByText('Missed recent check-in'),
    ).toBeInTheDocument();
    const recommendedActions = await screen.findByTestId('patient-recommended-actions');
    await user.click(within(recommendedActions).getByRole('button', { name: 'Open tasks' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Current patient detail route')).toHaveTextContent(
        `/patients/${patientId}/communications?days=14`,
      );
    });
    expect(screen.getByRole('tab', { name: 'Communications & Notes' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('patient-tasks-panel')).toBeInTheDocument();
  });

  it('keeps snapshot and recent alerts near the top on narrower widths without mounting duplicates', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    const patientDetailPage = document.querySelector('.patient-detail-page');
    expect(patientDetailPage).not.toBeNull();
    triggerResizeObserver(patientDetailPage as Element, 1200);

    const prioritySupport = await screen.findByLabelText('Priority patient support context');
    const summarySection = document.getElementById('patient-summary-section');
    const workspaceHeading = screen.getByRole('heading', { name: 'Deep review modes' });

    expect(summarySection).not.toBeNull();
    expect(prioritySupport).toContainElement(summarySection);
    expect(screen.getAllByText('Clinical context in view')).toHaveLength(1);
    expect(screen.getAllByText('Recent alerts')).toHaveLength(1);
    expect(
      (summarySection?.compareDocumentPosition(workspaceHeading) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(prioritySupport).queryByTestId('patient-handoff-panel')).not.toBeInTheDocument();

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    expect(screen.getByTestId('patient-handoff-panel')).toBeInTheDocument();
  });

  it('keeps summary and recent alerts in the desktop support rail when the content width stays wide', async () => {
    installFetchMock();

    renderPatientDetail();

    const patientDetailPage = document.querySelector('.patient-detail-page');
    expect(patientDetailPage).not.toBeNull();
    triggerResizeObserver(patientDetailPage as Element, 1440);

    await waitFor(() => {
      expect(screen.queryByLabelText('Priority patient support context')).not.toBeInTheDocument();
    });

    const supportAside = screen.getByLabelText('Patient support context');
    expect(within(supportAside).getByText('Clinical context in view')).toBeInTheDocument();
    expect(within(supportAside).getByText('Recent alerts')).toBeInTheDocument();
  });

  it('shows a compact top-priority handoff summary on narrower widths while keeping the full editor lower', async () => {
    installFetchMock();
    savePatientCurrentHandoff(patientId, {
      summary: 'Escalate into plan review before the next patient contact.',
      nextAction: 'plan',
      followUpOwner: { kind: 'self' },
    });
    const user = userEvent.setup();

    renderPatientDetail();

    const patientDetailPage = document.querySelector('.patient-detail-page');
    expect(patientDetailPage).not.toBeNull();
    triggerResizeObserver(patientDetailPage as Element, 1200);

    const prioritySupport = await screen.findByLabelText('Priority patient support context');

    expect(within(prioritySupport).getByText('Current handoff')).toBeInTheDocument();
    expect(
      within(prioritySupport).getByText('Escalate into plan review before the next patient contact.'),
    ).toBeInTheDocument();
    expect(within(prioritySupport).getByRole('button', { name: 'Open plan' })).toBeInTheDocument();
    expect(within(prioritySupport).getByText('Dr Elena Hall')).toBeInTheDocument();

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    expect(screen.getByTestId('patient-handoff-panel')).toBeInTheDocument();
  });

  it('guards resolving open recent alerts behind confirmation before firing the mutation', async () => {
    const fetchMock = installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    const prioritySupport = await screen.findByTestId('patient-detail-priority-support');
    const resolveButton = await within(prioritySupport).findByRole('button', { name: 'Resolve' });

    await user.click(resolveButton);

    const resolveDialog = await screen.findByRole('alertdialog', { name: 'Resolve alert now?' });
    expect(within(resolveDialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(resolveDialog).not.toHaveTextContent(/audit|signoff/i);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes(`/clinician/alerts/${basePatientAlert._id}`))).toBe(
      false,
    );

    await user.click(within(resolveDialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog', { name: 'Resolve alert now?' })).not.toBeInTheDocument();
    });
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes(`/clinician/alerts/${basePatientAlert._id}`))).toBe(
      false,
    );

    await user.click(await within(prioritySupport).findByRole('button', { name: 'Resolve' }));
    const confirmDialog = await screen.findByRole('alertdialog', { name: 'Resolve alert now?' });
    await user.click(within(confirmDialog).getByRole('button', { name: 'Resolve' }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes(`/clinician/alerts/${basePatientAlert._id}`)),
      ).toBe(true);
    });
  });

  it('expands trend cards inline one at a time and keeps day drilldown available', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    await openPatientWorkspaceTab(user, 'History & Signals');
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

    const user = userEvent.setup();
    renderPatientDetail();

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    const communicationPanel = await screen.findByTestId('patient-communication-panel');
    expect(await within(communicationPanel).findByRole('textbox', { name: 'Quick reply' })).toBeInTheDocument();
    expect(screen.queryByText('Trends endpoint not ready')).not.toBeInTheDocument();
    expect(within(communicationPanel).getByRole('button', { name: 'Save local reply' })).toBeInTheDocument();
  });

  it(
    'reuses compact template and signature helpers on patient detail without auto-appending the signature',
    async () => {
    const routineCommunicationItem: DashboardCommunicationOverviewItem = {
      ...baseCommunicationItem,
      flaggedBySafety: false,
      followUpRequested: false,
      messagePreview: 'Can someone confirm whether tomorrow still works?',
    };

    setClinicianProfile({
      ...getClinicianProfile(),
      communicationAuthoring: {
        defaultSignature: 'Dr Elena Hall\nLead rehab clinician · Post-op recovery',
        autoAppendSignature: true,
        templates: [
          {
            id: 'reviewed',
            title: 'Reviewed',
            body: 'Thanks, I have reviewed this update.',
          },
        ],
      },
    });

    installFetchMock({
      communicationItems: [routineCommunicationItem],
    });

    const user = userEvent.setup();
    renderPatientDetail();

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    const communicationPanel = await screen.findByTestId('patient-communication-panel');
    const quickReplyField = (await within(communicationPanel).findByRole('textbox', {
      name: 'Quick reply',
    })) as HTMLTextAreaElement;

    expect(within(communicationPanel).getByRole('combobox', { name: 'Quick reply template' })).toBeInTheDocument();
    expect(within(communicationPanel).getByRole('button', { name: 'Insert template' })).toBeInTheDocument();
      expect(within(communicationPanel).getByRole('button', { name: 'Insert signature' })).toBeInTheDocument();
      expect(quickReplyField).toHaveValue('');
    },
    30_000,
  );

  it('suppresses inline quick reply for safety-sensitive communication and keeps the handoff path', async () => {
    installFetchMock();
    const user = userEvent.setup();
    renderPatientDetail();

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    const safetyPanel = await screen.findByTestId('patient-communication-panel');
    expect(within(safetyPanel).queryByRole('textbox', { name: 'Quick reply' })).not.toBeInTheDocument();
    expect(within(safetyPanel).queryByRole('button', { name: 'Insert template' })).not.toBeInTheDocument();
    expect(within(safetyPanel).queryByRole('button', { name: 'Insert signature' })).not.toBeInTheDocument();
    expect(
      await within(safetyPanel).findByText('Safety-sensitive communication stays on handoff review.'),
    ).toBeInTheDocument();
    expect(within(safetyPanel).getByRole('button', { name: 'Open alerts' })).toBeInTheDocument();
  });

  it('inserts patient-detail templates and signatures into the shared quick reply draft without duplication', async () => {
    const routineCommunicationItem: DashboardCommunicationOverviewItem = {
      ...baseCommunicationItem,
      flaggedBySafety: false,
      followUpRequested: false,
      messagePreview: 'Can someone confirm whether tomorrow still works?',
    };

    setClinicianProfile({
      ...getClinicianProfile(),
      communicationAuthoring: {
        defaultSignature: 'Dr Elena Hall\nLead rehab clinician · Post-op recovery',
        autoAppendSignature: true,
        templates: [
          {
            id: 'reviewed',
            title: 'Reviewed',
            body: 'Thanks, I have reviewed this update.',
          },
        ],
      },
    });

    installFetchMock({
      communicationItems: [routineCommunicationItem],
    });
    const user = userEvent.setup();

    renderPatientDetail();

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    const communicationPanel = await screen.findByTestId('patient-communication-panel');
    const quickReplyField = (await within(communicationPanel).findByRole('textbox', {
      name: 'Quick reply',
    })) as HTMLTextAreaElement;

    await user.click(within(communicationPanel).getByRole('button', { name: 'Insert template' }));
    expect(quickReplyField).toHaveValue('Thanks, I have reviewed this update.');

    await user.click(within(communicationPanel).getByRole('button', { name: 'Insert signature' }));
    await user.click(within(communicationPanel).getByRole('button', { name: 'Insert signature' }));

    expect(quickReplyField).toHaveValue(
      'Thanks, I have reviewed this update.\n\nDr Elena Hall\nLead rehab clinician · Post-op recovery',
    );
  });

  it(
    'stores a routine patient-detail quick reply in the shared communication model without marking the thread reviewed',
    async () => {
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

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    const communicationPanel = await screen.findByTestId('patient-communication-panel');
    await within(communicationPanel).findByLabelText('Local clinician identity');
    expect(within(communicationPanel).getByLabelText('Local clinician identity')).toBeInTheDocument();
    expect(within(communicationPanel).getByText('Dr Elena Hall')).toBeInTheDocument();
    await within(communicationPanel).findByRole('textbox', { name: 'Quick reply' });
    const communicationTimeline = within(communicationPanel).getByRole('list', {
      name: 'Patient communication timeline',
    });
    expect(
      within(communicationTimeline).getByText('Can someone confirm whether tomorrow still works?'),
    ).toBeInTheDocument();
    const quickReplyTextbox = within(communicationPanel).getByRole('textbox', { name: 'Quick reply' });
    fireEvent.change(quickReplyTextbox, {
      target: {
        value: 'Please keep tomorrow for now. We will confirm the schedule this afternoon.',
      },
    });
    await waitFor(() => {
      expect(quickReplyTextbox).toHaveValue(
        'Please keep tomorrow for now. We will confirm the schedule this afternoon.',
      );
    });
    await user.click(within(communicationPanel).getByRole('button', { name: 'Save local reply' }));

    const localReply = await within(communicationTimeline).findByText(
      'Please keep tomorrow for now. We will confirm the schedule this afternoon.',
    );
    expect(localReply).toBeInTheDocument();
    expect(within(communicationTimeline).getByText('Local to this browser')).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    expect(
      await within(screen.getByRole('list', { name: 'Patient communication timeline' })).findByText(
        'Please keep tomorrow for now. We will confirm the schedule this afternoon.',
      ),
    ).toBeInTheDocument();
    },
    30_000,
  );

  it('renders a grounded internal handoff panel with only supported next-step options', async () => {
    installFetchMock();
    const user = userEvent.setup();
    renderPatientDetail();

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    const handoffPanel = await screen.findByTestId('patient-handoff-panel');
    expect(
      within(handoffPanel).getByText(
        'Stored only in this browser for local handoff continuity. It does not sync across devices or staff accounts.',
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

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    const handoffPanel = await screen.findByTestId('patient-handoff-panel');
    const handoffSummaryField = within(handoffPanel).getByLabelText('Handoff summary');
    fireEvent.change(handoffSummaryField, {
      target: {
        value: 'Escalate into the current plan review after checking the latest patient context.',
      },
    });
    await waitFor(() => {
      expect(handoffSummaryField).toHaveValue(
        'Escalate into the current plan review after checking the latest patient context.',
      );
    });
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

    const internalNoteField = within(handoffPanel).getByLabelText('Add internal note');
    fireEvent.change(internalNoteField, {
      target: {
        value: 'Patient asked for a calmer follow-up window tomorrow morning.',
      },
    });
    await waitFor(() => {
      expect(internalNoteField).toHaveValue(
        'Patient asked for a calmer follow-up window tomorrow morning.',
      );
    });
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

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    const handoffPanel = await screen.findByTestId('patient-handoff-panel');
    await user.click(within(handoffPanel).getByRole('button', { name: 'Open plan' }));

    expect(await screen.findByText('Plan workspace')).toBeInTheDocument();
  });

  it('clears only the structured handoff when saved blank and preserves note history', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    await openPatientWorkspaceTab(user, 'Communications & Notes');
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

    const user = userEvent.setup();
    await openPatientWorkspaceTab(user, 'Communications & Notes');
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

    const user = userEvent.setup();
    await openPatientWorkspaceTab(user, 'Communications & Notes');
    const handoffPanel = await screen.findByTestId('patient-handoff-panel');
    const savedHandoff = within(handoffPanel).getByTestId('patient-handoff-current');
    expect(
      within(savedHandoff).getByText('Browser-local continuity should remain visible on this device.'),
    ).toBeInTheDocument();
    expect(
      within(handoffPanel).getByText(
        'Stored only in this browser for local handoff continuity. It does not sync across devices or staff accounts.',
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

    const user = userEvent.setup();
    renderPatientDetail();

    expect(await screen.findByText('No immediate priorities detected')).toBeInTheDocument();

    await openPatientWorkspaceTab(user, 'Communications & Notes');
    expect(await screen.findByText('No recent communication needing follow-up')).toBeInTheDocument();
    expect(await screen.findByText('No open tasks for this patient')).toBeInTheDocument();
    expect(await screen.findByText('No appointment activity to review')).toBeInTheDocument();
  }, 20_000);

  it('marks a patient task complete and refreshes the follow-up panel', async () => {
    installFetchMock();
    const user = userEvent.setup();

    renderPatientDetail();

    await openPatientWorkspaceTab(user, 'Communications & Notes');
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
