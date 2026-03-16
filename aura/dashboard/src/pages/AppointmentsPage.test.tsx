/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentsPage } from './AppointmentsPage';

interface RenderOptions {
  requests?: Array<Record<string, unknown>>;
  slots?: Array<Record<string, unknown>>;
  patients?: Array<Record<string, unknown>>;
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

function installMatchMediaMock(): void {
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

function installFetchMock({ requests = [], slots = [], patients = [] }: RenderOptions): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);

    if (url.includes('/clinician/appointments/requests')) {
      return createJsonResponse({ ok: true, items: requests });
    }

    if (url.includes('/clinician/appointments/slots')) {
      return createJsonResponse({ ok: true, items: slots });
    }

    if (url.includes('/clinician/patients')) {
      return createJsonResponse({ ok: true, patients });
    }

    return createJsonResponse({ ok: true });
  });
}

function renderAppointmentsPage(options: RenderOptions = {}): void {
  installFetchMock(options);

  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/appointments']}>
        <Routes>
          <Route path="/appointments" element={<AppointmentsPage />} />
          <Route path="/patients/:patientId" element={<div>Patient detail workspace</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-16T12:00:00.000Z').getTime());
  installMatchMediaMock();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('AppointmentsPage', () => {
  it('prioritizes request review with resolved patient identity, waiting context, and patient navigation', async () => {
    renderAppointmentsPage({
      requests: [
        {
          requestId: 'req-1',
          slotId: 'slot-1',
          patientId: 'patient-42',
          status: 'pending',
          workflowStatus: 'awaiting_confirmation',
          note: 'Prefers a morning rehab session.',
          startsAt: '2026-03-16T09:00:00.000Z',
          endsAt: '2026-03-16T09:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-14T08:00:00.000Z',
        },
      ],
      slots: [
        {
          slotId: 'slot-1',
          clinicianName: 'Dr. Rivera',
          startsAt: '2026-03-16T13:00:00.000Z',
          endsAt: '2026-03-16T13:30:00.000Z',
          modality: 'video',
          status: 'available',
          createdAt: '2026-03-14T07:30:00.000Z',
        },
      ],
      patients: [
        {
          id: 'patient-42',
          displayName: 'Taylor Moss',
          status: 'active',
          lastCheckinAt: '2026-03-13T09:00:00.000Z',
          openAlertCount: 0,
          lastPain: 2.4,
        },
      ],
    });

    expect(await screen.findByText('Taylor Moss')).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.getByText('Waiting 2d')).toBeInTheDocument();
    expect(screen.getByText('Request note')).toBeInTheDocument();
    expect(
      await screen.findByText('Requests waiting', {
        selector: '.appointments-summary-strip__value--state',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Demand currently covered').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Open patient' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open patient' }));

    expect(await screen.findByText('Patient detail workspace')).toBeInTheDocument();
  });

  it('frames pending demand without open capacity as the next coordination problem', async () => {
    renderAppointmentsPage({
      requests: [
        {
          requestId: 'req-2',
          slotId: 'slot-2',
          patientId: 'patient-77',
          status: 'pending',
          workflowStatus: 'reschedule_requested',
          startsAt: '2026-03-17T10:00:00.000Z',
          endsAt: '2026-03-17T10:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-14T09:00:00.000Z',
        },
      ],
      slots: [],
      patients: [],
    });

    expect(
      await screen.findByText('Requests waiting without open capacity', {
        selector: '.appointments-summary-strip__value--state',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Demand uncovered').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Requests are waiting and no open capacity is published. Review the queue, then publish availability if coverage is needed.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Publish after review')).toBeInTheDocument();
  });

  it('calls out when demand exceeds currently published capacity', async () => {
    renderAppointmentsPage({
      requests: [
        {
          requestId: 'req-3',
          slotId: 'slot-4',
          patientId: 'patient-13',
          status: 'pending',
          workflowStatus: 'awaiting_confirmation',
          startsAt: '2026-03-17T09:00:00.000Z',
          endsAt: '2026-03-17T09:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-15T08:00:00.000Z',
        },
        {
          requestId: 'req-4',
          slotId: 'slot-5',
          patientId: 'patient-14',
          status: 'pending',
          workflowStatus: 'reschedule_requested',
          startsAt: '2026-03-17T11:00:00.000Z',
          endsAt: '2026-03-17T11:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-15T09:00:00.000Z',
        },
      ],
      slots: [
        {
          slotId: 'slot-4',
          clinicianName: 'Dr. Hall',
          startsAt: '2026-03-17T14:00:00.000Z',
          endsAt: '2026-03-17T14:30:00.000Z',
          modality: 'video',
          status: 'available',
          createdAt: '2026-03-14T10:30:00.000Z',
        },
      ],
      patients: [],
    });

    expect((await screen.findAllByText('Demand exceeds open capacity')).length).toBeGreaterThan(0);
    expect(
      screen.getByText('Some open slots are published, but more coverage may still be needed.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Publish after review').length).toBeGreaterThan(0);
  });

  it('treats open capacity as useful even when the queue is quiet and keeps publishing secondary', async () => {
    renderAppointmentsPage({
      requests: [],
      slots: [
        {
          slotId: 'slot-3',
          clinicianName: 'Dr. Hall',
          startsAt: '2026-03-18T14:00:00.000Z',
          endsAt: '2026-03-18T14:30:00.000Z',
          modality: 'video',
          status: 'available',
          createdAt: '2026-03-14T10:30:00.000Z',
        },
      ],
      patients: [],
    });

    expect(
      await screen.findByText('Capacity open', {
        selector: '.appointments-summary-strip__value--state',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Queue quiet with open capacity').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Queue is quiet and published capacity is ready if new demand arrives.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Publish after queue review')).toBeInTheDocument();
    expect(
      screen.getByText('Use this panel after request review to publish only the clinician time the queue still needs.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Published slots become immediately visible to the booking queue after creation.'),
    ).toBeInTheDocument();
  });
});
