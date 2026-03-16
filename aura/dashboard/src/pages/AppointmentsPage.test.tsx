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
  installMatchMediaMock();
});

afterEach(() => {
  cleanup();
});

describe('AppointmentsPage', () => {
  it('prioritizes request review with resolved patient identity and patient navigation', async () => {
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
    expect(
      await screen.findByText('Requests waiting', {
        selector: '.appointments-summary-strip__value--state',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Open capacity is available').length).toBeGreaterThan(0);
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
    expect(screen.getAllByText('No open capacity is published').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Requests are waiting but there are no open slots in this view. Review the queue, then publish availability below.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Publish more availability')).toBeInTheDocument();
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
    expect(
      screen.getByText('The review queue is quiet and open capacity is already available for future bookings.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Publish after queue review')).toBeInTheDocument();
    expect(
      screen.getByText('Add bookable clinician time only after the current review queue and published capacity are clear.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Capacity is already published and ready. Add more availability only if additional follow-up time needs to be opened.',
      ),
    ).toBeInTheDocument();
  });
});
