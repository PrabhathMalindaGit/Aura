/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
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
import { createJsonResponse, installMatchMediaMock, installResizeObserverMock } from '../../../test/mocks';
import type { AppointmentRequestItem, AppointmentSlot, PatientSummary } from '../../../types/models';
import { writeWorkspaceState } from '../../../services/workspaceState';
import { AppointmentsRouteFacade } from '../../config/routeFacades';
import {
  getDefaultDashboardV2Gates,
  resetDashboardV2GatesForTests,
  writeDashboardV2Gates,
} from '../../config/migrationGates';
import { resetAppointmentsUiStore } from '../../state/useAppointmentsUiStore';

interface PublishBehavior {
  kind?: 'success' | 'error' | 'unconfirmed';
  errorMessage?: string;
  status?: number;
}

const REQUESTS: AppointmentRequestItem[] = [
  {
    requestId: 'request-1',
    slotId: 'slot-1',
    patientId: 'patient-1',
    status: 'pending',
    workflowStatus: 'awaiting_confirmation',
    note: 'Review demand before publishing more time.',
    startsAt: '2026-04-18T09:00:00.000Z',
    endsAt: '2026-04-18T09:30:00.000Z',
    modality: 'video',
    createdAt: '2026-04-17T08:00:00.000Z',
    updatedAt: '2026-04-17T08:00:00.000Z',
  },
  {
    requestId: 'request-2',
    slotId: 'slot-2',
    patientId: 'patient-2',
    status: 'approved',
    workflowStatus: 'completed',
    note: 'Completed request remains visible for follow-through.',
    startsAt: '2026-04-17T09:00:00.000Z',
    endsAt: '2026-04-17T09:30:00.000Z',
    modality: 'video',
    createdAt: '2026-04-16T08:00:00.000Z',
    updatedAt: '2026-04-17T10:00:00.000Z',
    reviewedAt: '2026-04-17T10:00:00.000Z',
  },
];

const SLOTS: AppointmentSlot[] = [
  {
    slotId: 'slot-available-1',
    clinicianName: 'Clinician One',
    startsAt: '2026-04-18T11:00:00.000Z',
    endsAt: '2026-04-18T11:30:00.000Z',
    modality: 'video',
    status: 'available',
    meetingLink: 'https://meet.example.com/open-capacity',
    createdAt: '2026-04-17T07:30:00.000Z',
  },
  {
    slotId: 'slot-closed-1',
    clinicianName: 'Clinician One',
    startsAt: '2026-04-19T14:00:00.000Z',
    endsAt: '2026-04-19T14:30:00.000Z',
    modality: 'video',
    status: 'closed',
    createdAt: '2026-04-17T07:45:00.000Z',
  },
];

const PATIENTS: PatientSummary[] = [
  {
    id: 'patient-1',
    displayName: 'Jordan Lee',
    status: 'active',
    lastCheckinAt: '2026-04-18T06:00:00.000Z',
    openAlertCount: 1,
  },
  {
    id: 'patient-2',
    displayName: 'Avery Chen',
    status: 'active',
  },
];

const BACKEND_SEEDED_PRESENTATION_PATIENTS: PatientSummary[] = [
  ...PATIENTS,
  {
    id: 'presentation-emily-chen',
    displayName: 'Emily Chen',
    status: 'active',
    lastCheckinAt: '2026-04-28T06:00:00.000Z',
    openAlertCount: 0,
  },
];

const BACKEND_SEEDED_PRESENTATION_REQUESTS: AppointmentRequestItem[] = [
  {
    requestId: 'presentation-request-emily-chen',
    slotId: 'presentation-slot-emily-chen',
    patientId: 'presentation-emily-chen',
    status: 'pending',
    workflowStatus: 'awaiting_confirmation',
    note: 'Return-to-activity follow-up after backend presentation seed.',
    startsAt: '2026-04-28T15:00:00.000Z',
    endsAt: '2026-04-28T15:30:00.000Z',
    modality: 'video',
    meetingLink: 'https://meet.example.com/emily-chen',
    createdAt: '2026-04-28T08:00:00.000Z',
    updatedAt: '2026-04-28T08:00:00.000Z',
  },
];

const BACKEND_SEEDED_PRESENTATION_SLOTS: AppointmentSlot[] = [
  {
    slotId: 'presentation-slot-emily-chen',
    clinicianName: 'Clinician One',
    startsAt: '2026-04-28T15:00:00.000Z',
    endsAt: '2026-04-28T15:30:00.000Z',
    modality: 'video',
    status: 'available',
    meetingLink: 'https://meet.example.com/emily-chen',
    createdAt: '2026-04-28T07:30:00.000Z',
  },
];

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function installViewportMock(width: number): void {
  installMatchMediaMock((query) => {
    const maxMatch = query.match(/max-width:\s*(\d+)px/);
    if (maxMatch) {
      return width <= Number(maxMatch[1]);
    }

    const minMatch = query.match(/min-width:\s*(\d+)px/);
    if (minMatch) {
      return width >= Number(minMatch[1]);
    }

    return false;
  });
}

function installAppointmentsFetchMock(options: {
  requests?: AppointmentRequestItem[];
  slots?: AppointmentSlot[];
  patients?: PatientSummary[];
  publishBehaviors?: PublishBehavior[];
} = {}): void {
  let requestItems = [...(options.requests ?? REQUESTS)];
  let slotItems = [...(options.slots ?? SLOTS)];
  const patients = options.patients ?? PATIENTS;
  const publishBehaviors = [...(options.publishBehaviors ?? [])];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = String(init?.method ?? 'GET').toUpperCase();

    if (url.pathname === '/clinician/patients') {
      return createJsonResponse({ ok: true, patients });
    }

    if (url.pathname === '/clinician/appointments/requests' && method === 'GET') {
      let items = [...requestItems];
      const status = url.searchParams.get('status');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');

      if (status) {
        items = items.filter((item) => item.status === status);
      }
      if (from) {
        const fromMs = Date.parse(from);
        items = items.filter((item) => Date.parse(item.startsAt) >= fromMs);
      }
      if (to) {
        const toMs = Date.parse(to);
        items = items.filter((item) => Date.parse(item.startsAt) < toMs);
      }

      return createJsonResponse({ ok: true, items });
    }

    if (url.pathname.match(/^\/clinician\/appointments\/requests\/[^/]+$/) && method === 'PATCH') {
      const requestId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
      const payload = init?.body
        ? (JSON.parse(String(init.body)) as { status?: 'approved' | 'rejected' })
        : null;
      const sourceRequest = requestItems.find((item) => item.requestId === requestId);
      if (!sourceRequest || !payload?.status) {
        return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      const reviewedRequest: AppointmentRequestItem = {
        ...sourceRequest,
        status: payload.status,
        reviewedAt: '2026-04-18T10:00:00.000Z',
        updatedAt: '2026-04-18T10:00:00.000Z',
      };

      requestItems = [
        reviewedRequest,
        ...requestItems.filter((item) => item.requestId !== requestId),
      ];

      return createJsonResponse({ ok: true, item: reviewedRequest });
    }

    if (url.pathname === '/clinician/appointments/slots' && method === 'GET') {
      let items = [...slotItems];
      const status = url.searchParams.get('status');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');

      if (status) {
        items = items.filter((item) => (item.status ?? 'available') === status);
      }
      if (from) {
        const fromMs = Date.parse(from);
        items = items.filter((item) => Date.parse(item.startsAt) >= fromMs);
      }
      if (to) {
        const toMs = Date.parse(to);
        items = items.filter((item) => Date.parse(item.startsAt) < toMs);
      }

      return createJsonResponse({ ok: true, items });
    }

    if (url.pathname === '/clinician/appointments/slots' && method === 'POST') {
      const behavior = publishBehaviors.shift() ?? { kind: 'success' };
      if (behavior.kind === 'error') {
        return createJsonResponse(
          { ok: false, message: behavior.errorMessage ?? 'Publish failed' },
          behavior.status ?? 500,
        );
      }

      const payload = init?.body
        ? (JSON.parse(String(init.body)) as {
            startsAt?: string;
            endsAt?: string;
            meetingLink?: string;
          })
        : {};
      const createdSlot: AppointmentSlot = {
        slotId: `slot-created-${slotItems.length + 1}`,
        clinicianName: 'Clinician One',
        startsAt: payload.startsAt ?? '2026-04-20T08:00:00.000Z',
        endsAt: payload.endsAt ?? '2026-04-20T08:30:00.000Z',
        modality: 'video',
        meetingLink: payload.meetingLink,
        status: 'available',
        createdAt: '2026-04-18T10:05:00.000Z',
      };

      if (behavior.kind !== 'unconfirmed') {
        slotItems = [createdSlot, ...slotItems];
      }

      return createJsonResponse({ ok: true, slot: createdSlot }, 201);
    }

    return createJsonResponse({ ok: true });
  });
}

function PatientWorkspaceEcho(): JSX.Element {
  const location = useLocation();
  return <div>{`Patient workspace ${JSON.stringify(location.state)}`}</div>;
}

function LocationEcho(): JSX.Element {
  const location = useLocation();
  return <div data-testid="appointments-location">{`${location.pathname}${location.search}`}</div>;
}

function formatTestTimeRange(startsAt: string, endsAt: string): string {
  return `${new Date(startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} to ${new Date(endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function renderAppointmentsRoute(initialEntry = '/appointments'): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationEcho />
        <Routes>
          <Route path="/appointments" element={<AppointmentsRouteFacade />} />
          <Route path="/patients/:patientId" element={<PatientWorkspaceEcho />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setAppointmentsGate(enabled: boolean): void {
  const defaults = getDefaultDashboardV2Gates();

  writeDashboardV2Gates({
    ...defaults,
    routes: {
      ...defaults.routes,
      appointments: enabled,
    },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  installResizeObserverMock();
  installViewportMock(1440);
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetAppointmentsUiStore();
  resetDashboardV2GatesForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('AppointmentsRoute', () => {
  it('falls back to the legacy scheduling page when the route is explicitly rolled back', async () => {
    installAppointmentsFetchMock();
    setAppointmentsGate(false);

    renderAppointmentsRoute();

    expect(
      await screen.findByRole('heading', { name: 'Schedule' }, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('v2-appointments-route')).not.toBeInTheDocument();
  });

  it('renders the v2 route by default, auto-selects the first request, and preserves patient routing', async () => {
    installAppointmentsFetchMock();

    renderAppointmentsRoute();

    expect(await screen.findByTestId('v2-appointments-route')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Appointments', level: 2 })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Appointments', level: 1 })).not.toBeInTheDocument();
    await screen.findByTestId('v2-appointment-request-row-request-1');
    const plannerWorkspace = await screen.findByTestId('v2-appointments-planner-workspace');
    expect(plannerWorkspace).toHaveTextContent('Planner');
    expect(screen.getByRole('heading', { name: 'Jordan Lee' })).toBeVisible();
    expect(screen.queryByText(/Booked|Confirmed visit/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open patient' }));
    expect(screen.getByTestId('appointments-location')).toHaveTextContent('/patients/patient-1');
    expect(await screen.findByText(/Patient workspace/)).toHaveTextContent('"returnTo":"/appointments"');
  });

  it('renders review requests before the planner in the scheduling workflow', async () => {
    installAppointmentsFetchMock();

    renderAppointmentsRoute();

    const route = await screen.findByTestId('v2-appointments-route');
    const requestPane = await screen.findByTestId('v2-appointments-request-pane');
    const plannerWorkspace = screen.getByTestId('v2-appointments-planner-workspace');

    expect(route).toContainElement(requestPane);
    expect(route).toContainElement(plannerWorkspace);
    expect(
      requestPane.compareDocumentPosition(plannerWorkspace) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders the real-mode scheduling cockpit shell even when requests and capacity are empty', async () => {
    installAppointmentsFetchMock({ requests: [], slots: [] });

    renderAppointmentsRoute();

    expect(await screen.findByTestId('v2-appointments-route')).toBeVisible();
    expect(await screen.findByText('No requests are waiting right now')).toBeVisible();
    expect(screen.getByTestId('appointments-schedule-week')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'No visible capacity in this week' })).toBeVisible();
    expect(screen.getByTestId('v2-appointment-capacity-detail')).toHaveTextContent('No open capacity visible');
    expect(screen.queryByText('Selected request context')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Support context' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load presentation data' })).not.toBeInTheDocument();
    expect(screen.queryByText('Emily Chen')).not.toBeInTheDocument();
  });

  it('keeps publishing inline on medium layouts and shows publish outcomes without implying booking truth', async () => {
    installViewportMock(1180);
    installAppointmentsFetchMock();

    renderAppointmentsRoute();

    expect(await screen.findByTestId('v2-appointments-route')).toBeVisible();
    await screen.findByTestId('v2-appointment-request-row-request-1');
    expect(screen.getByRole('heading', { name: 'Open only the time still needed' })).toBeVisible();

    await userEvent.type(screen.getByLabelText('Start (local datetime)'), '2026-04-20T14:00');
    await userEvent.clear(screen.getByLabelText('End (local datetime)'));
    await userEvent.type(screen.getByLabelText('End (local datetime)'), '2026-04-20T14:30');
    await userEvent.type(screen.getByLabelText('Meeting link (optional)'), 'https://meet.example.com/new-slot');
    await userEvent.click(screen.getByRole('button', { name: 'Publish availability' }));

    expect(await screen.findByText('Availability published')).toBeInTheDocument();
    expect(screen.getByText(/open capacity is published/i)).toBeInTheDocument();
    expect(screen.queryByText(/Booked|Confirmed visit/i)).not.toBeInTheDocument();

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = new URL(String(input), 'http://localhost');
        const body = init?.body
          ? (JSON.parse(String(init.body)) as { startsAt?: string; endsAt?: string; meetingLink?: string })
          : null;
        return (
          url.pathname === '/clinician/appointments/slots' &&
          String(init?.method ?? 'GET').toUpperCase() === 'POST' &&
          body?.startsAt === new Date('2026-04-20T14:00').toISOString() &&
          body?.endsAt === new Date('2026-04-20T14:30').toISOString() &&
          body?.meetingLink === 'https://meet.example.com/new-slot'
        );
      }),
    ).toBe(true);
  });

  it('blocks publish when required start or end datetimes are missing', async () => {
    installAppointmentsFetchMock();

    renderAppointmentsRoute();

    expect(await screen.findByTestId('v2-appointments-route')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Publish availability' }));

    expect(await screen.findByText('Start time is required.')).toBeVisible();
    expect(screen.getByText('End time is required.')).toBeVisible();

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = new URL(String(input), 'http://localhost');
        return (
          url.pathname === '/clinician/appointments/slots' &&
          String(init?.method ?? 'GET').toUpperCase() === 'POST'
        );
      }),
    ).toBe(false);
  });

  it('blocks publish when the end datetime is before the start datetime', async () => {
    installAppointmentsFetchMock();

    renderAppointmentsRoute();

    expect(await screen.findByTestId('v2-appointments-route')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Start (local datetime)'), '2026-05-17T22:34');
    await userEvent.clear(screen.getByLabelText('End (local datetime)'));
    await userEvent.type(screen.getByLabelText('End (local datetime)'), '2026-05-13T22:34');
    await userEvent.click(screen.getByRole('button', { name: 'Publish availability' }));

    expect(await screen.findByText('End time must be after start time.')).toBeVisible();

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = new URL(String(input), 'http://localhost');
        return (
          url.pathname === '/clinician/appointments/slots' &&
          String(init?.method ?? 'GET').toUpperCase() === 'POST'
        );
      }),
    ).toBe(false);
  });

  it('surfaces backend validation detail when a valid-looking publish request is rejected', async () => {
    installAppointmentsFetchMock({
      publishBehaviors: [
        {
          kind: 'error',
          status: 400,
          errorMessage: 'Availability overlaps an existing slot.',
        },
      ],
    });

    renderAppointmentsRoute();

    expect(await screen.findByTestId('v2-appointments-route')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Start (local datetime)'), '2026-05-17T22:34');
    await userEvent.clear(screen.getByLabelText('End (local datetime)'));
    await userEvent.type(screen.getByLabelText('End (local datetime)'), '2026-05-17T23:34');
    await userEvent.click(screen.getByRole('button', { name: 'Publish availability' }));

    expect(await screen.findByText('Availability overlaps an existing slot.')).toBeVisible();
    expect(screen.queryByText('The request was invalid.')).not.toBeInTheDocument();
  });

  it('keeps the vertical scheduling workflow on narrow layouts while preserving request selection', async () => {
    installViewportMock(900);
    installAppointmentsFetchMock();

    renderAppointmentsRoute();

    expect(await screen.findByTestId('v2-appointments-route')).toBeVisible();
    const requestPane = await screen.findByTestId('v2-appointments-request-pane');
    const plannerWorkspace = screen.getByTestId('v2-appointments-planner-workspace');
    expect(
      requestPane.compareDocumentPosition(plannerWorkspace) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await userEvent.click(screen.getByTestId('v2-appointment-request-row-request-1'));
    expect(screen.getByTestId('v2-appointments-planner-workspace')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Back to requests' })).not.toBeInTheDocument();
  });

  it('switches week and day views while previous, today, and next update the visible range', async () => {
    installAppointmentsFetchMock();

    renderAppointmentsRoute();

    expect(await screen.findByTestId('appointments-schedule-week')).toBeVisible();
    const initialRangeLabel = screen.getByTestId('appointments-schedule-range-label').textContent;

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getByTestId('appointments-schedule-range-label').textContent).not.toEqual(initialRangeLabel);
    });
    const nextWeekLabel = screen.getByTestId('appointments-schedule-range-label').textContent;

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => {
      expect(screen.getByTestId('appointments-schedule-range-label').textContent).toEqual(initialRangeLabel);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Day' }));
    expect(await screen.findByTestId('appointments-schedule-day')).toBeVisible();
    const initialDayLabel = screen.getByTestId('appointments-schedule-range-label').textContent;
    expect(initialDayLabel).not.toEqual(nextWeekLabel);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getByTestId('appointments-schedule-range-label').textContent).not.toEqual(initialDayLabel);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() => {
      expect(screen.getByTestId('appointments-schedule-range-label').textContent).toEqual(initialDayLabel);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(await screen.findByTestId('appointments-schedule-week')).toBeVisible();
  });

  it('shows capacity only for the selected calendar range', async () => {
    installAppointmentsFetchMock({
      requests: [],
      slots: [
        {
          ...SLOTS[0],
          slotId: 'slot-current-week',
          startsAt: '2026-04-18T11:00:00.000Z',
          endsAt: '2026-04-18T11:30:00.000Z',
        },
        {
          ...SLOTS[0],
          slotId: 'slot-next-week',
          startsAt: '2026-04-25T12:00:00.000Z',
          endsAt: '2026-04-25T12:30:00.000Z',
        },
      ],
    });
    writeWorkspaceState('appointments', {
      requestStatus: 'pending',
      slotStatus: 'available',
      scheduleView: 'week',
      scheduleDate: '2026-04-18',
    });

    renderAppointmentsRoute();

    const currentWeekLabel = formatTestTimeRange('2026-04-18T11:00:00.000Z', '2026-04-18T11:30:00.000Z');
    const nextRangeSlotLabel = formatTestTimeRange('2026-04-25T12:00:00.000Z', '2026-04-25T12:30:00.000Z');
    const plannerWorkspace = await screen.findByTestId('v2-appointments-planner-workspace');
    expect(plannerWorkspace).toHaveTextContent('Apr 13 - Apr 19');
    await waitFor(() => {
      expect(plannerWorkspace).toHaveTextContent(currentWeekLabel);
    });
    expect(plannerWorkspace).not.toHaveTextContent(nextRangeSlotLabel);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByTestId('v2-appointments-planner-workspace')).toHaveTextContent('Apr 20 - Apr 26');
    });
    expect(screen.getByTestId('v2-appointments-planner-workspace')).toHaveTextContent(nextRangeSlotLabel);
    expect(screen.getByTestId('v2-appointments-planner-workspace')).not.toHaveTextContent(currentWeekLabel);
  });

  it('uses a native request summary button and keeps selected request actions separate', async () => {
    const pendingRequests: AppointmentRequestItem[] = [
      REQUESTS[0],
      {
        ...REQUESTS[1],
        status: 'pending',
        workflowStatus: 'awaiting_confirmation',
      },
    ];
    installAppointmentsFetchMock({ requests: pendingRequests });

    renderAppointmentsRoute();

    const firstRow = await screen.findByTestId('v2-appointment-request-row-request-1');
    const secondRow = await screen.findByTestId('v2-appointment-request-row-request-2');
    const firstSummary = within(firstRow).getByRole('button', {
      name: /Select appointment request for Jordan Lee/i,
    });
    const secondSummary = within(secondRow).getByRole('button', {
      name: /Select appointment request for Avery Chen/i,
    });

    expect(firstSummary).toHaveAttribute('aria-pressed', 'true');
    expect(within(firstRow).getByRole('button', { name: 'Open patient' })).toBeVisible();
    expect(firstSummary).not.toContainElement(within(firstRow).getByRole('button', { name: 'Approve' }));

    secondSummary.focus();
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Avery Chen' })).toBeVisible();
    });
    expect(secondSummary).toHaveAttribute('aria-pressed', 'true');
    expect(within(secondRow).getByRole('button', { name: 'Open patient' })).toBeVisible();
    expect(secondSummary).not.toContainElement(within(secondRow).getByRole('button', { name: 'Approve' }));

    await userEvent.click(within(secondRow).getByRole('button', { name: 'Open patient' }));

    expect(screen.getByTestId('appointments-location')).toHaveTextContent('/patients/patient-2');
  });

  it.each([
    ['Approve', 'approved'],
    ['Reject', 'rejected'],
  ] as const)('keeps real-mode %s wired to the backend review mutation', async (buttonName, status) => {
    installAppointmentsFetchMock();

    renderAppointmentsRoute();

    expect(await screen.findByTestId('v2-appointment-request-row-request-1')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: buttonName }));

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = new URL(String(input), 'http://localhost');
        const body = init?.body ? JSON.parse(String(init.body)) as { status?: string } : null;
        return (
          url.pathname === '/clinician/appointments/requests/request-1' &&
          String(init?.method ?? 'GET').toUpperCase() === 'PATCH' &&
          body?.status === status
        );
      }),
    ).toBe(true);
  });

  it('treats backend-seeded presentation-style records as normal appointment API data', async () => {
    installAppointmentsFetchMock({
      patients: BACKEND_SEEDED_PRESENTATION_PATIENTS,
      requests: BACKEND_SEEDED_PRESENTATION_REQUESTS,
      slots: BACKEND_SEEDED_PRESENTATION_SLOTS,
    });
    writeWorkspaceState('appointments', {
      requestStatus: 'pending',
      slotStatus: 'available',
      scheduleView: 'week',
      scheduleDate: '2026-04-28',
    });

    renderAppointmentsRoute('/appointments?workspace=seed-safe');

    expect(await screen.findByTestId('v2-appointments-route')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Load presentation data' })).not.toBeInTheDocument();
    expect(screen.getByTestId('appointments-location')).toHaveTextContent('/appointments?workspace=seed-safe');
    expect(screen.getByTestId('appointments-location')).not.toHaveTextContent('scheduleDemo');
    expect(await screen.findByTestId('v2-appointment-request-row-presentation-request-emily-chen')).toHaveTextContent(
      'Emily Chen',
    );
    expect(screen.getByTestId('v2-appointment-request-row-presentation-request-emily-chen')).toHaveTextContent(
      'Reason',
    );
    expect(screen.getByTestId('v2-appointment-request-row-presentation-request-emily-chen')).toHaveTextContent(
      'Constraints',
    );
    expect(screen.getByTestId('v2-appointments-planner-workspace')).toHaveTextContent('Telehealth');
    expect(screen.getByTestId('v2-appointment-capacity-detail')).toHaveTextContent('Telehealth');
    expect(screen.queryByText('Presentation only')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open patient' }));
    expect(screen.getByTestId('appointments-location')).toHaveTextContent('/patients/presentation-emily-chen');
    expect(await screen.findByText(/Patient workspace/)).toHaveTextContent('"patientId":"presentation-emily-chen"');
  });
});
