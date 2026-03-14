/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InsightsQueuePage } from './InsightsQueuePage';

interface RenderOptions {
  pending?: Array<Record<string, unknown>>;
  approved?: Array<Record<string, unknown>>;
  rejected?: Array<Record<string, unknown>>;
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

function installFetchMock({
  pending = [],
  approved = [],
  rejected = [],
  patients = [],
}: RenderOptions): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.url;
    const url = new URL(rawUrl, 'http://localhost');

    if (url.pathname === '/clinician/insights' && (init?.method ?? 'GET') === 'GET') {
      const status = url.searchParams.get('status');
      if (status === 'approved') {
        return createJsonResponse({ ok: true, items: approved });
      }
      if (status === 'rejected') {
        return createJsonResponse({ ok: true, items: rejected });
      }
      return createJsonResponse({ ok: true, items: pending });
    }

    if (url.pathname === '/clinician/patients') {
      return createJsonResponse({ ok: true, patients });
    }

    if (url.pathname.startsWith('/clinician/insights/') && (init?.method ?? 'PATCH') === 'PATCH') {
      return createJsonResponse({ ok: true, item: pending[0] ?? null });
    }

    return createJsonResponse({ ok: true });
  });
}

function renderInsightsPage(options: RenderOptions = {}): void {
  installFetchMock(options);

  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/insights']}>
        <Routes>
          <Route path="/insights" element={<InsightsQueuePage />} />
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

describe('InsightsQueuePage', () => {
  it('renders stronger patient context, reason framing, and all review actions for a pending suggestion', async () => {
    renderInsightsPage({
      pending: [
        {
          id: 'insight-1',
          patientId: 'patient-42',
          status: 'pending',
          title: 'Follow-up questionnaire may be due',
          message: 'Recent recovery updates suggest a follow-up questionnaire could help confirm rehab progress.',
          category: 'questionnaires',
          confidence: 'medium',
          priority: 2,
          windowDays: 14,
          createdAt: '2026-03-14T08:00:00.000Z',
        },
      ],
      patients: [
        {
          id: 'patient-42',
          displayName: 'Taylor Moss',
          status: 'active',
          lastCheckinAt: '2026-03-13T09:00:00.000Z',
          openAlertCount: 0,
          lastPain: 2.1,
        },
      ],
    });

    expect(await screen.findByText('Taylor Moss')).toBeInTheDocument();
    expect(screen.getByText('Patient ID patient-42')).toBeInTheDocument();
    expect(screen.getByText('Reason for review')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Recent recovery updates suggest a follow-up questionnaire could help confirm rehab progress.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve for workflow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject suggestion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open patient' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open patient' }));

    expect(await screen.findByText('Patient detail workspace')).toBeInTheDocument();
  });

  it('shows approved and rejected counts as current queue-view summary context', async () => {
    renderInsightsPage({
      pending: [
        {
          id: 'insight-2',
          patientId: 'patient-12',
          patientDisplayName: 'Jordan Lee',
          status: 'pending',
          title: 'Exercise adherence follow-up suggested',
          message: 'Adherence has softened over the last review window.',
          category: 'adherence',
          confidence: 'low',
          priority: 1,
          windowDays: 7,
          createdAt: '2026-03-14T09:00:00.000Z',
        },
      ],
      approved: [
        {
          id: 'approved-1',
          patientId: 'patient-88',
          status: 'approved',
          title: 'Approved guidance',
          message: 'Approved item',
          category: 'recovery',
          confidence: 'medium',
          priority: 2,
          windowDays: 14,
          createdAt: '2026-03-13T08:00:00.000Z',
        },
      ],
      rejected: [
        {
          id: 'rejected-1',
          patientId: 'patient-99',
          status: 'rejected',
          title: 'Rejected guidance',
          message: 'Rejected item',
          category: 'habits',
          confidence: 'low',
          priority: 3,
          windowDays: 14,
          createdAt: '2026-03-12T08:00:00.000Z',
        },
      ],
    });

    expect(await screen.findByText('Reviewed in current queue view')).toBeInTheDocument();
    expect(
      await screen.findByText('Approved 1 · Rejected 1 in current queue view.', {
        selector: '.insights-summary-strip__hint',
      }),
    ).toBeInTheDocument();
  });

  it('keeps an empty pending queue purposeful when reviewed-state summary exists', async () => {
    renderInsightsPage({
      pending: [],
      approved: [
        {
          id: 'approved-2',
          patientId: 'patient-31',
          status: 'approved',
          title: 'Approved item',
          message: 'Approved item',
          category: 'symptoms',
          confidence: 'medium',
          priority: 1,
          windowDays: 14,
          createdAt: '2026-03-12T08:00:00.000Z',
        },
      ],
      rejected: [
        {
          id: 'rejected-2',
          patientId: 'patient-32',
          status: 'rejected',
          title: 'Rejected item',
          message: 'Rejected item',
          category: 'habits',
          confidence: 'low',
          priority: 3,
          windowDays: 14,
          createdAt: '2026-03-11T08:00:00.000Z',
        },
      ],
    });

    expect(await screen.findByText('Queue is clear')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No pending suggestions are waiting now. Reviewed-state counts above reflect the current queue view only and do not represent a full history.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Approved 1 · Rejected 1 in current queue view.').length).toBeGreaterThan(0);
  });

  it('uses a monitoring-active empty state when there is no pending or reviewed guidance', async () => {
    renderInsightsPage({
      pending: [],
      approved: [],
      rejected: [],
    });

    expect(await screen.findByText('No guidance suggestions are waiting')).toBeInTheDocument();
    expect(
      screen.getByText('Monitoring remains active and new guidance suggestions will appear here when they are generated.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Monitoring remains active.')).toBeInTheDocument();
  });
});
