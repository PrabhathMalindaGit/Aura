/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentsPage } from './AppointmentsPage';

interface PublishBehavior {
  kind?: 'success' | 'error' | 'unconfirmed';
  errorMessage?: string;
}

interface ReviewBehavior {
  kind?: 'success' | 'error';
  errorMessage?: string;
}

interface RenderOptions {
  requests?: Array<Record<string, unknown>>;
  slots?: Array<Record<string, unknown>>;
  patients?: Array<Record<string, unknown>>;
  publishBehaviors?: PublishBehavior[];
  reviewBehaviors?: ReviewBehavior[];
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

function installFetchMock({
  requests = [],
  slots = [],
  patients = [],
  publishBehaviors = [],
  reviewBehaviors = [],
}: RenderOptions): void {
  function filterItemsByRange<T extends Record<string, unknown>>(
    items: T[],
    from: string | null,
    to: string | null,
  ): T[] {
    if (!from && !to) {
      return items;
    }

    const fromMs = from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY;
    const toMs = to ? new Date(to).getTime() : Number.POSITIVE_INFINITY;

    return items.filter((item) => {
      const startsAtMs = new Date(String(item.startsAt ?? '')).getTime();
      if (!Number.isFinite(startsAtMs)) {
        return false;
      }

      return startsAtMs >= fromMs && startsAtMs < toMs;
    });
  }

  let requestItems = [...requests];
  let slotItems = [...slots];
  const queuedPublishBehaviors = [...publishBehaviors];
  const queuedReviewBehaviors = [...reviewBehaviors];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const href = String(input);
    const url = new URL(href, 'http://localhost');
    const method = String(init?.method ?? 'GET').toUpperCase();

    if (href.includes('/clinician/appointments/requests')) {
      if (method === 'PATCH') {
        const behavior = queuedReviewBehaviors.shift() ?? { kind: 'success' };

        if (behavior.kind === 'error') {
          return createJsonResponse(
            { ok: false, message: behavior.errorMessage ?? 'Review failed' },
            500,
          );
        }

        const requestId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
        const payload =
          typeof init?.body === 'string' && init.body.length > 0
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : {};
        const nextStatus = payload.status === 'approved' ? 'approved' : 'rejected';
        const sourceRequest = requestItems.find((item) => String(item.requestId) === requestId);

        if (!sourceRequest) {
          return createJsonResponse({ ok: false, message: 'Request not found' }, 404);
        }

        const reviewedRequest = {
          ...sourceRequest,
          status: nextStatus,
          reviewedAt: '2026-03-16T12:10:00.000Z',
        };

        requestItems = [
          reviewedRequest,
          ...requestItems.filter((item) => String(item.requestId) !== requestId),
        ];

        return createJsonResponse({ ok: true, item: reviewedRequest });
      }

      const status = url.searchParams.get('status');
      const rangedItems = filterItemsByRange(
        requestItems,
        url.searchParams.get('from'),
        url.searchParams.get('to'),
      );
      const filteredItems = status
        ? rangedItems.filter((item) => String(item.status ?? '') === status)
        : rangedItems;

      return createJsonResponse({ ok: true, items: filteredItems });
    }

    if (href.includes('/clinician/appointments/slots') && method === 'POST') {
      const behavior = queuedPublishBehaviors.shift() ?? { kind: 'success' };

      if (behavior.kind === 'error') {
        return createJsonResponse({ ok: false, message: behavior.errorMessage ?? 'Publish failed' }, 500);
      }

      const payload =
        typeof init?.body === 'string' && init.body.length > 0
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {};
      const createdSlot = {
        slotId: `slot-created-${slotItems.length + 1}`,
        clinicianName: 'Dr. Rivera',
        startsAt: String(payload.startsAt ?? ''),
        endsAt: String(payload.endsAt ?? ''),
        modality: 'video',
        meetingLink:
          typeof payload.meetingLink === 'string' && payload.meetingLink.trim().length > 0
            ? payload.meetingLink
            : undefined,
        status: 'available',
        createdAt: '2026-03-16T12:05:00.000Z',
      };

      if (behavior.kind !== 'unconfirmed') {
        slotItems = [createdSlot, ...slotItems];
      }

      return createJsonResponse({ ok: true, slot: createdSlot });
    }

    if (href.includes('/clinician/appointments/slots')) {
      const status = url.searchParams.get('status');
      const rangedItems = filterItemsByRange(slotItems, url.searchParams.get('from'), url.searchParams.get('to'));
      const filteredItems = status
        ? rangedItems.filter((item) => String(item.status ?? 'available') === status)
        : rangedItems;

      return createJsonResponse({ ok: true, items: filteredItems });
    }

    if (href.includes('/clinician/patients')) {
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

function fillAndPublishAvailability(options: {
  startsAt: string;
  endsAt: string;
  meetingLink?: string;
}): void {
  const startsAtInput = screen.getByLabelText('Start (local datetime)') as HTMLInputElement;
  const endsAtInput = screen.getByLabelText('End (local datetime)') as HTMLInputElement;
  const meetingLinkInput = screen.getByLabelText('Meeting link (optional)') as HTMLInputElement;

  fireEvent.input(startsAtInput, {
    target: { value: options.startsAt },
  });
  fireEvent.input(endsAtInput, {
    target: { value: options.endsAt },
  });
  fireEvent.change(meetingLinkInput, {
    target: { value: options.meetingLink ?? '' },
  });

  expect(startsAtInput.value).toBe(options.startsAt);
  expect(endsAtInput.value).toBe(options.endsAt);

  const publishButton = screen.getByRole('button', { name: 'Publish availability' });
  expect(publishButton).not.toBeDisabled();
  fireEvent.click(publishButton);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-16T12:00:00.000Z'));
  installMatchMediaMock();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('AppointmentsPage', () => {
  it('renders week schedule alongside request review using only supported slot states', async () => {
    renderAppointmentsPage({
      requests: [
        {
          requestId: 'req-schedule-1',
          slotId: 'slot-schedule-1',
          patientId: 'patient-42',
          status: 'pending',
          workflowStatus: 'awaiting_confirmation',
          startsAt: '2026-03-16T09:00:00.000Z',
          endsAt: '2026-03-16T09:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-14T08:00:00.000Z',
        },
      ],
      slots: [
        {
          slotId: 'slot-schedule-open',
          clinicianName: 'Dr. Rivera',
          startsAt: '2026-03-16T13:00:00.000Z',
          endsAt: '2026-03-16T13:30:00.000Z',
          modality: 'video',
          status: 'available',
          createdAt: '2026-03-14T07:30:00.000Z',
        },
        {
          slotId: 'slot-schedule-closed',
          clinicianName: 'Dr. Rivera',
          startsAt: '2026-03-17T15:00:00.000Z',
          endsAt: '2026-03-17T15:30:00.000Z',
          modality: 'video',
          status: 'closed',
          createdAt: '2026-03-14T08:15:00.000Z',
        },
      ],
      patients: [
        {
          id: 'patient-42',
          displayName: 'Taylor Moss',
          status: 'active',
        },
      ],
    });

    expect(await screen.findByText('1 open visible')).toBeInTheDocument();
    expect(screen.getByText('Request review')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Schedule', level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId('appointments-schedule-week')).toBeInTheDocument();
    expect(screen.getByText('1 closed visible')).toBeInTheDocument();
    expect(screen.queryByText('BOOKED')).not.toBeInTheDocument();
  });

  it('supports day and week navigation without leaving the active fetched range', async () => {
    renderAppointmentsPage({
      requests: [],
      slots: [
        {
          slotId: 'slot-nav-week-1',
          clinicianName: 'Dr. Rivera',
          startsAt: '2026-03-16T09:00:00.000Z',
          endsAt: '2026-03-16T09:30:00.000Z',
          modality: 'video',
          meetingLink: 'https://visit.example/week-1',
          status: 'available',
          createdAt: '2026-03-14T07:30:00.000Z',
        },
        {
          slotId: 'slot-nav-week-2',
          clinicianName: 'Dr. Rivera',
          startsAt: '2026-03-23T15:00:00.000Z',
          endsAt: '2026-03-23T15:30:00.000Z',
          modality: 'video',
          meetingLink: 'https://visit.example/week-2',
          status: 'available',
          createdAt: '2026-03-14T07:30:00.000Z',
        },
      ],
    });

    await screen.findByText('1 open visible');
    const rangeLabel = screen.getByTestId('appointments-schedule-range-label');
    const initialRangeLabel = rangeLabel.textContent;
    expect(screen.getByTestId('appointments-schedule-week')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByTestId('appointments-schedule-range-label').textContent).not.toEqual(
        initialRangeLabel,
      );
    });
    const nextRangeLabel = screen.getByTestId('appointments-schedule-range-label').textContent;

    fireEvent.click(screen.getByRole('button', { name: 'Day' }));
    expect(await screen.findByTestId('appointments-schedule-day')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() => {
      expect(screen.getByTestId('appointments-schedule-range-label').textContent).not.toEqual(
        nextRangeLabel,
      );
    });
  });

  it('updates selected request schedule context without implying booking', async () => {
    renderAppointmentsPage({
      requests: [
        {
          requestId: 'req-context-1',
          slotId: 'slot-context-1',
          patientId: 'patient-42',
          status: 'pending',
          workflowStatus: 'awaiting_confirmation',
          startsAt: '2026-03-16T09:00:00.000Z',
          endsAt: '2026-03-16T09:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-14T08:00:00.000Z',
        },
        {
          requestId: 'req-context-2',
          slotId: 'slot-context-2',
          patientId: 'patient-77',
          status: 'pending',
          workflowStatus: 'reschedule_requested',
          startsAt: '2026-03-24T11:00:00.000Z',
          endsAt: '2026-03-24T11:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-15T09:00:00.000Z',
        },
      ],
      slots: [
        {
          slotId: 'slot-context-open',
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
        },
        {
          id: 'patient-77',
          displayName: 'Riley Chen',
          status: 'active',
        },
      ],
    });

    const contextPanel = await screen.findByTestId('appointments-schedule-context');
    expect(within(contextPanel).getByText('Taylor Moss')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Riley Chen'));

    await waitFor(() => {
      expect(within(screen.getByTestId('appointments-schedule-context')).getByText('Riley Chen')).toBeInTheDocument();
    });
    expect(screen.getByTestId('appointments-schedule-context')).toHaveTextContent(
      'Requested window is outside this week',
    );
  });

  it('shows operational empty states when the active schedule range has no fetched slots', async () => {
    renderAppointmentsPage({
      requests: [],
      slots: [
        {
          slotId: 'slot-empty-week',
          clinicianName: 'Dr. Rivera',
          startsAt: '2026-03-16T09:00:00.000Z',
          endsAt: '2026-03-16T09:30:00.000Z',
          modality: 'video',
          meetingLink: 'https://visit.example/empty-week',
          status: 'available',
          createdAt: '2026-03-14T07:30:00.000Z',
        },
      ],
    });

    expect(await screen.findByText('https://visit.example/empty-week')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('No visible capacity in this week')).toBeInTheDocument();
  });

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

    expect((await screen.findAllByText('Taylor Moss')).length).toBeGreaterThan(0);
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting 2d').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Request note').length).toBeGreaterThan(0);
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

  it('shows section-local request review continuity when more pending review remains', async () => {
    renderAppointmentsPage({
      requests: [
        {
          requestId: 'req-review-1',
          slotId: 'slot-review-1',
          patientId: 'patient-42',
          status: 'pending',
          workflowStatus: 'awaiting_confirmation',
          note: 'Prefers an early follow-up.',
          startsAt: '2026-03-17T09:00:00.000Z',
          endsAt: '2026-03-17T09:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-15T08:00:00.000Z',
        },
        {
          requestId: 'req-review-2',
          slotId: 'slot-review-2',
          patientId: 'patient-77',
          status: 'pending',
          workflowStatus: 'reschedule_requested',
          startsAt: '2026-03-17T11:00:00.000Z',
          endsAt: '2026-03-17T11:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-15T09:00:00.000Z',
        },
      ],
      patients: [
        {
          id: 'patient-42',
          displayName: 'Taylor Moss',
          status: 'active',
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeDisabled();
    });
    const approveButtons = screen.getAllByRole('button', { name: 'Approve' });
    fireEvent.click(approveButtons[0]);

    const outcomePanel = await screen.findByTestId('appointments-request-outcome');
    expect(within(outcomePanel).getByText('Request approved')).toBeInTheDocument();
    expect(outcomePanel).toHaveTextContent('Request for Taylor Moss moved out of Pending review.');
    expect(outcomePanel).toHaveTextContent('1 request still needs review in this view.');
    expect(screen.queryByText('Updated')).not.toBeInTheDocument();
  });

  it('shows clear request-review continuity when pending review clears and capacity remains open', async () => {
    renderAppointmentsPage({
      requests: [
        {
          requestId: 'req-clear-1',
          slotId: 'slot-clear-1',
          patientId: 'patient-88',
          status: 'pending',
          workflowStatus: 'awaiting_confirmation',
          startsAt: '2026-03-17T09:00:00.000Z',
          endsAt: '2026-03-17T09:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-15T08:00:00.000Z',
        },
      ],
      slots: [
        {
          slotId: 'slot-open-capacity',
          clinicianName: 'Dr. Rivera',
          startsAt: '2026-03-18T14:00:00.000Z',
          endsAt: '2026-03-18T14:30:00.000Z',
          modality: 'video',
          status: 'available',
          createdAt: '2026-03-14T10:30:00.000Z',
        },
      ],
      patients: [
        {
          id: 'patient-88',
          displayName: 'Morgan Diaz',
          status: 'active',
        },
      ],
    });

    fireEvent.click((await screen.findAllByRole('button', { name: 'Reject' }))[0]);

    const outcomePanel = await screen.findByTestId('appointments-request-outcome');
    expect(within(outcomePanel).getByText('Request rejected')).toBeInTheDocument();
    expect(outcomePanel).toHaveTextContent('Pending review is clear and open capacity remains available.');
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
      screen.getByText(
        'Requests are waiting and no open capacity is visible in the current schedule range. Review the queue, then publish availability if coverage is needed.',
      ),
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
      screen.getByText('Use this after request review to publish only the clinician time the queue still needs.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Published slots become immediately visible to the booking queue after creation.'),
    ).toBeInTheDocument();
  });

  it('shows publish outcome continuity without auto-switching views and keeps follow-through actions explicit', async () => {
    renderAppointmentsPage({
      requests: [
        {
          requestId: 'req-10',
          slotId: 'slot-10',
          patientId: 'patient-10',
          status: 'pending',
          workflowStatus: 'awaiting_confirmation',
          startsAt: '2026-03-17T09:00:00.000Z',
          endsAt: '2026-03-17T09:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-15T08:00:00.000Z',
        },
        {
          requestId: 'req-11',
          slotId: 'slot-11',
          patientId: 'patient-11',
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
          slotId: 'slot-closed-1',
          clinicianName: 'Dr. Hall',
          startsAt: '2026-03-18T15:00:00.000Z',
          endsAt: '2026-03-18T15:30:00.000Z',
          modality: 'video',
          status: 'closed',
          createdAt: '2026-03-14T10:30:00.000Z',
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: /approved/i }));
    expect(await screen.findByText('No approved requests')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Closed capacity' }));

    fillAndPublishAvailability({
      startsAt: '2026-03-19T09:00',
      endsAt: '2026-03-19T09:30',
      meetingLink: 'https://visit.example/published-1',
    });

    expect(await screen.findByText('Availability published')).toBeInTheDocument();
    expect(
      screen.getByText('Open capacity is published, but some requests are still waiting without enough coverage.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View open capacity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review requests' })).toBeInTheDocument();
    expect(screen.getByText('No approved requests')).toBeInTheDocument();
    expect(screen.queryByText('https://visit.example/published-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review requests' }));
    expect(await screen.findByText('Patient ID patient-10')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View open capacity' }));
    await waitFor(() => {
      expect(document.querySelectorAll('.appointments-item--slot-just-published')).toHaveLength(1);
    });
    const publishedSlot = document.querySelector('.appointments-item--slot-just-published');
    expect(publishedSlot).not.toBeNull();
    expect(publishedSlot).toHaveTextContent('9:00 AM to 9:30 AM');
  });

  it('explains when the new publish now appears to cover current demand and marks only the latest slot', async () => {
    renderAppointmentsPage({
      requests: [
        {
          requestId: 'req-20',
          slotId: 'slot-20',
          patientId: 'patient-20',
          status: 'pending',
          workflowStatus: 'awaiting_confirmation',
          startsAt: '2026-03-17T09:00:00.000Z',
          endsAt: '2026-03-17T09:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-15T08:00:00.000Z',
        },
      ],
      slots: [
        {
          slotId: 'slot-open-1',
          clinicianName: 'Dr. Hall',
          startsAt: '2026-03-18T14:00:00.000Z',
          endsAt: '2026-03-18T14:30:00.000Z',
          modality: 'video',
          meetingLink: 'https://visit.example/existing',
          status: 'available',
          createdAt: '2026-03-14T10:30:00.000Z',
        },
      ],
    });

    fillAndPublishAvailability({
      startsAt: '2026-03-19T10:00',
      endsAt: '2026-03-19T10:30',
      meetingLink: 'https://visit.example/published-2',
    });

    expect(await screen.findByText('Availability published')).toBeInTheDocument();
    expect(
      screen.getByText('Open capacity is published and current demand now appears covered.'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(document.querySelectorAll('.appointments-item--slot-just-published')).toHaveLength(1);
    });
    await waitFor(() => {
      expect(document.querySelectorAll('.appointments-schedule-slot--recent')).toHaveLength(1);
    });
    const latestSlot = document.querySelector('.appointments-item--slot-just-published');
    const existingLink = screen.getByText('https://visit.example/existing');
    expect(latestSlot).not.toBeNull();
    expect(latestSlot).toHaveTextContent('10:00 AM to 10:30 AM');
    expect(existingLink.closest('.appointments-item--slot')).not.toHaveClass(
      'appointments-item--slot-just-published',
    );
  });

  it('explains when published capacity lands into a quiet queue', async () => {
    renderAppointmentsPage({
      requests: [],
      slots: [],
      patients: [],
    });

    fillAndPublishAvailability({
      startsAt: '2026-03-19T11:00',
      endsAt: '2026-03-19T11:30',
      meetingLink: 'https://visit.example/published-quiet',
    });

    expect(await screen.findByText('Availability published')).toBeInTheDocument();
    expect(
      screen.getByText('The queue is quiet and open capacity is now available if new demand arrives.'),
    ).toBeInTheDocument();
  });

  it('clears stale publish outcome state after a failed publish attempt', async () => {
    renderAppointmentsPage({
      requests: [],
      slots: [],
      publishBehaviors: [{ kind: 'success' }, { kind: 'error', errorMessage: 'Publish failed' }],
    });

    fillAndPublishAvailability({
      startsAt: '2026-03-19T12:00',
      endsAt: '2026-03-19T12:30',
      meetingLink: 'https://visit.example/published-success',
    });

    expect(await screen.findByText('Availability published')).toBeInTheDocument();

    fillAndPublishAvailability({
      startsAt: '2026-03-19T13:00',
      endsAt: '2026-03-19T13:30',
      meetingLink: 'https://visit.example/published-error',
    });

    expect(await screen.findByText('Could not complete action')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Availability published')).not.toBeInTheDocument();
    });
  });

  it('clears stale request review continuity after a later failed review attempt', async () => {
    renderAppointmentsPage({
      requests: [
        {
          requestId: 'req-fail-1',
          slotId: 'slot-fail-1',
          patientId: 'patient-42',
          status: 'pending',
          workflowStatus: 'awaiting_confirmation',
          startsAt: '2026-03-17T09:00:00.000Z',
          endsAt: '2026-03-17T09:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-15T08:00:00.000Z',
        },
        {
          requestId: 'req-fail-2',
          slotId: 'slot-fail-2',
          patientId: 'patient-77',
          status: 'pending',
          workflowStatus: 'reschedule_requested',
          startsAt: '2026-03-17T11:00:00.000Z',
          endsAt: '2026-03-17T11:30:00.000Z',
          modality: 'video',
          createdAt: '2026-03-15T09:00:00.000Z',
        },
      ],
      reviewBehaviors: [{ kind: 'success' }, { kind: 'error', errorMessage: 'Review failed' }],
      patients: [
        {
          id: 'patient-42',
          displayName: 'Taylor Moss',
          status: 'active',
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeDisabled();
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    expect(await screen.findByTestId('appointments-request-outcome')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]);

    expect(await screen.findByText('Could not complete action')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('appointments-request-outcome')).not.toBeInTheDocument();
    });
  });

  it('suppresses the publish outcome when refreshed open capacity cannot confirm the destination slot', async () => {
    renderAppointmentsPage({
      requests: [],
      slots: [],
      publishBehaviors: [{ kind: 'unconfirmed' }],
    });

    fillAndPublishAvailability({
      startsAt: '2026-03-19T14:00',
      endsAt: '2026-03-19T14:30',
      meetingLink: 'https://visit.example/unconfirmed',
    });

    await waitFor(() => {
      expect(screen.queryByText('Availability published')).not.toBeInTheDocument();
    });
  });
});
