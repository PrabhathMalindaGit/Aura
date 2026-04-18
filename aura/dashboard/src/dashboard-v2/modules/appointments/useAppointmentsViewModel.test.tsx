/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonResponse } from '../../../test/mocks';
import { getWorkspaceStateStorageKey } from '../../../services/workspaceState';
import type { AppointmentRequestItem, AppointmentSlot, PatientSummary } from '../../../types/models';
import { resetAppointmentsUiStore } from '../../state/useAppointmentsUiStore';
import { useAppointmentsViewModel } from './useAppointmentsViewModel';

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
];

const PATIENTS: PatientSummary[] = [
  { id: 'patient-1', displayName: 'Jordan Lee', status: 'active' },
];

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function installAppointmentsFetchMock(options: { publishBehaviors?: PublishBehavior[] } = {}): void {
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
      if (status) {
        items = items.filter((item) => item.status === status);
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
      if (status) {
        items = items.filter((item) => (item.status ?? 'available') === status);
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

function createWrapper() {
  const queryClient = createQueryClient();

  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetAppointmentsUiStore();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('useAppointmentsViewModel', () => {
  it('auto-selects the first request on wide layouts and persists planner continuity', async () => {
    installAppointmentsFetchMock();

    const { result } = renderHook(
      () => useAppointmentsViewModel({ isNarrowLayout: false }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.activeRequest?.requestId).toBe('request-1');
    });

    act(() => {
      result.current.handleScheduleViewChange('day');
      result.current.handleSlotStatusChange('closed');
    });

    const stored = window.localStorage.getItem(getWorkspaceStateStorageKey('appointments'));
    expect(stored).toContain('"scheduleView":"day"');
    expect(stored).toContain('"slotStatus":"closed"');
  });

  it('keeps publish outcome conservative when the new slot cannot be confirmed in refreshed open capacity', async () => {
    installAppointmentsFetchMock({
      publishBehaviors: [{ kind: 'unconfirmed' }],
    });

    const { result } = renderHook(
      () => useAppointmentsViewModel({ isNarrowLayout: false }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.activeRequest?.requestId).toBe('request-1');
    });

    act(() => {
      result.current.setStartsAtInput('2026-04-20T14:00');
      result.current.setEndsAtInput('2026-04-20T14:30');
      result.current.setMeetingLinkInput('https://meet.example.com/unconfirmed-slot');
    });

    await act(async () => {
      await result.current.handleCreateSlot();
    });

    expect(result.current.lastPublishOutcome).toBeNull();
    expect(result.current.errorNotice).toBeNull();
  });
});
