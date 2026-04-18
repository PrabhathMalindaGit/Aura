/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
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
import { createJsonResponse, installMatchMediaMock, installResizeObserverMock } from '../../../test/mocks';
import type { AppointmentRequestItem, AppointmentSlot, PatientSummary } from '../../../types/models';
import { AppointmentsRouteFacade } from '../../config/routeFacades';
import { resetDashboardV2GatesForTests, writeDashboardV2Gates } from '../../config/migrationGates';
import { resetAppointmentsUiStore } from '../../state/useAppointmentsUiStore';

interface PublishBehavior {
  kind?: 'success' | 'error' | 'unconfirmed';
  errorMessage?: string;
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
  publishBehaviors?: PublishBehavior[];
} = {}): void {
  let requestItems = [...REQUESTS];
  let slotItems = [...SLOTS];
  const publishBehaviors = [...(options.publishBehaviors ?? [])];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = String(init?.method ?? 'GET').toUpperCase();

    if (url.pathname === '/clinician/patients') {
      return createJsonResponse({ ok: true, patients: PATIENTS });
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
        return createJsonResponse({ ok: false, message: behavior.errorMessage ?? 'Publish failed' }, 500);
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

function renderAppointmentsRoute(): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/appointments']}>
        <Routes>
          <Route path="/appointments" element={<AppointmentsRouteFacade />} />
          <Route path="/patients/:patientId" element={<PatientWorkspaceEcho />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
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
});

describe('AppointmentsRoute', () => {
  it('falls back to the legacy scheduling page while the route gate is off', async () => {
    installAppointmentsFetchMock();

    renderAppointmentsRoute();

    expect(
      await screen.findByRole('heading', { name: 'Schedule' }, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('v2-appointments-route')).not.toBeInTheDocument();
  });

  it('renders the gated v2 route, auto-selects the first request, and preserves patient routing', async () => {
    installAppointmentsFetchMock();
    writeDashboardV2Gates({
      shell: false,
      routes: {
        dashboard: false,
        worklist: false,
        communication: false,
        'patient-workspace': false,
        alerts: false,
        insights: false,
        appointments: true,
        settings: false,
      },
    });

    renderAppointmentsRoute();

    expect(await screen.findByTestId('v2-appointments-route')).toBeVisible();
    await screen.findByTestId('v2-appointment-request-row-request-1');
    const plannerWorkspace = await screen.findByTestId('v2-appointments-planner-workspace');
    expect(plannerWorkspace).toHaveTextContent('Jordan Lee');
    expect(screen.queryByText(/Booked|Confirmed visit/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open patient' }));
    expect(await screen.findByText(/Patient workspace/)).toHaveTextContent('"returnTo":"/appointments"');
  });

  it('keeps publishing secondary on medium layouts and shows publish outcomes without implying booking truth', async () => {
    installViewportMock(1180);
    installAppointmentsFetchMock();
    writeDashboardV2Gates({
      shell: false,
      routes: {
        dashboard: false,
        worklist: false,
        communication: false,
        'patient-workspace': false,
        alerts: false,
        insights: false,
        appointments: true,
        settings: false,
      },
    });

    renderAppointmentsRoute();

    expect(await screen.findByTestId('v2-appointments-route')).toBeVisible();
    await screen.findByTestId('v2-appointment-request-row-request-1');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open publishing' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Open publishing' }));
    expect(await screen.findByRole('heading', { name: 'Scheduling support context' })).toBeVisible();

    await userEvent.type(screen.getByLabelText('Start (local datetime)'), '2026-04-20T14:00');
    await userEvent.type(screen.getByLabelText('End (local datetime)'), '2026-04-20T14:30');
    await userEvent.type(screen.getByLabelText('Meeting link (optional)'), 'https://meet.example.com/new-slot');
    await userEvent.click(screen.getByRole('button', { name: 'Publish availability' }));

    expect(await screen.findByText('Availability published')).toBeInTheDocument();
    expect(screen.getByText(/open capacity is published/i)).toBeInTheDocument();
    expect(screen.queryByText(/Booked|Confirmed visit/i)).not.toBeInTheDocument();
  });

  it('stays request-first on narrow layouts until a clinician selects a request', async () => {
    installViewportMock(900);
    installAppointmentsFetchMock();
    writeDashboardV2Gates({
      shell: false,
      routes: {
        dashboard: false,
        worklist: false,
        communication: false,
        'patient-workspace': false,
        alerts: false,
        insights: false,
        appointments: true,
        settings: false,
      },
    });

    renderAppointmentsRoute();

    expect(await screen.findByTestId('v2-appointments-route')).toBeVisible();
    await screen.findByTestId('v2-appointment-request-row-request-1');
    expect(screen.queryByTestId('v2-appointments-planner-workspace')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('v2-appointment-request-row-request-1'));
    expect(await screen.findByTestId('v2-appointments-planner-workspace')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back to requests' })).toBeInTheDocument();
  });
});
