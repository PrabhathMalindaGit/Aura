/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InsightsQueuePage } from './InsightsQueuePage';
import { getWorkspaceStateStorageKey } from '../services/workspaceState';

interface RenderOptions {
  pending?: Array<Record<string, unknown>>;
  approved?: Array<Record<string, unknown>>;
  rejected?: Array<Record<string, unknown>>;
  patients?: Array<Record<string, unknown>>;
  failReviewIds?: string[];
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
  failReviewIds = [],
}: RenderOptions): void {
  let pendingItems = [...pending];
  let approvedItems = [...approved];
  let rejectedItems = [...rejected];
  const failingReviewIds = new Set(failReviewIds);

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.url;
    const url = new URL(rawUrl, 'http://localhost');

    if (url.pathname === '/clinician/insights' && (init?.method ?? 'GET') === 'GET') {
      const status = url.searchParams.get('status');
      if (status === 'approved') {
        return createJsonResponse({ ok: true, items: approvedItems });
      }
      if (status === 'rejected') {
        return createJsonResponse({ ok: true, items: rejectedItems });
      }
      return createJsonResponse({ ok: true, items: pendingItems });
    }

    if (url.pathname === '/clinician/patients') {
      return createJsonResponse({ ok: true, patients });
    }

    if (url.pathname.startsWith('/clinician/insights/') && (init?.method ?? 'PATCH') === 'PATCH') {
      const insightId = decodeURIComponent(url.pathname.split('/').pop() ?? '');

      if (failingReviewIds.has(insightId)) {
        return createJsonResponse({ ok: false }, 500);
      }

      const body =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as { status?: string }) : {};
      const nextStatus = body.status === 'approved' ? 'approved' : 'rejected';
      const sourceItem = pendingItems.find(
        (item) => typeof item.id === 'string' && item.id === insightId,
      );

      if (!sourceItem) {
        return createJsonResponse({ ok: false }, 404);
      }

      pendingItems = pendingItems.filter((item) => item.id !== insightId);

      const reviewedItem = {
        ...sourceItem,
        status: nextStatus,
        reviewedAt: '2026-03-16T09:30:00.000Z',
      };

      if (nextStatus === 'approved') {
        approvedItems = [reviewedItem, ...approvedItems];
      } else {
        rejectedItems = [reviewedItem, ...rejectedItems];
      }

      return createJsonResponse({ ok: true, item: reviewedItem });
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
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('InsightsQueuePage', () => {
  it('renders pending review with patient context and clinician actions', async () => {
    renderInsightsPage({
      pending: [
        {
          id: 'insight-1',
          patientId: 'patient-42',
          status: 'pending',
          title: 'Follow-up questionnaire may be due',
          message:
            'Recent recovery updates suggest a follow-up questionnaire could help confirm rehab progress.',
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
    expect(screen.getByRole('tab', { name: 'Pending (1)' })).toHaveAttribute('aria-selected', 'true');
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

  it('shows approved and rejected items as reviewed outcomes via lifecycle tabs', async () => {
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
      patients: [
        {
          id: 'patient-88',
          displayName: 'Morgan Diaz',
          status: 'active',
          lastCheckinAt: '2026-03-13T09:00:00.000Z',
          openAlertCount: 0,
          lastPain: 2.1,
        },
        {
          id: 'patient-99',
          displayName: 'Casey Brown',
          status: 'active',
          lastCheckinAt: '2026-03-13T09:00:00.000Z',
          openAlertCount: 0,
          lastPain: 3.1,
        },
      ],
    });

    expect(await screen.findByRole('tab', { name: 'Approved (1)' })).toBeInTheDocument();
    expect(
      await screen.findByText('Approved 1 · Rejected 1 in current queue view.', {
        selector: '.insights-summary-strip__hint',
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Approved (1)' }));

    const approvedTitle = await screen.findByText('Approved guidance');
    const approvedCard = approvedTitle.closest('.insights-queue__item');
    expect(approvedCard).not.toBeNull();
    expect(within(approvedCard as HTMLElement).getByText('Approved for workflow')).toBeInTheDocument();
    expect(within(approvedCard as HTMLElement).getByText('Reason snapshot')).toBeInTheDocument();
    expect(
      within(approvedCard as HTMLElement).queryByRole('button', { name: 'Approve for workflow' }),
    ).not.toBeInTheDocument();
    expect(
      within(approvedCard as HTMLElement).queryByRole('button', { name: 'Reject suggestion' }),
    ).not.toBeInTheDocument();
    expect(within(approvedCard as HTMLElement).getByRole('button', { name: 'Open patient' })).toBeInTheDocument();
    expect(within(approvedCard as HTMLElement).queryByText(/^Reviewed /)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Rejected (1)' }));

    const rejectedTitle = await screen.findByText('Rejected guidance');
    const rejectedCard = rejectedTitle.closest('.insights-queue__item');
    expect(rejectedCard).not.toBeNull();
    expect(within(rejectedCard as HTMLElement).getByText('Rejected from workflow')).toBeInTheDocument();
    expect(within(rejectedCard as HTMLElement).getByText('Reason snapshot')).toBeInTheDocument();
    expect(within(rejectedCard as HTMLElement).getByRole('button', { name: 'Open patient' })).toBeInTheDocument();
  });

  it('restores the saved lifecycle tab locally for the current clinician browser context', async () => {
    window.localStorage.setItem(
      getWorkspaceStateStorageKey('insights', 'clinician-1'),
      JSON.stringify({ activeView: 'approved' }),
    );

    renderInsightsPage({
      pending: [],
      approved: [
        {
          id: 'approved-3',
          patientId: 'patient-22',
          status: 'approved',
          title: 'Approved follow-up guidance',
          message: 'Approved guidance snapshot.',
          category: 'recovery',
          confidence: 'medium',
          priority: 2,
          windowDays: 14,
          createdAt: '2026-03-12T08:00:00.000Z',
        },
      ],
      rejected: [],
      patients: [],
    });

    const approvedTab = await screen.findByRole('tab', { name: 'Approved (1)' });
    expect(approvedTab).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Approved follow-up guidance')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve for workflow' })).not.toBeInTheDocument();
  });

  it('falls back safely when the saved lifecycle tab is invalid', async () => {
    window.localStorage.setItem(
      getWorkspaceStateStorageKey('insights', 'clinician-1'),
      JSON.stringify({ activeView: 'archive' }),
    );

    renderInsightsPage({
      pending: [
        {
          id: 'pending-3',
          patientId: 'patient-55',
          status: 'pending',
          title: 'Pending recovery guidance',
          message: 'Pending review context.',
          category: 'recovery',
          confidence: 'medium',
          priority: 2,
          windowDays: 14,
          createdAt: '2026-03-14T08:00:00.000Z',
        },
      ],
      approved: [],
      rejected: [],
      patients: [],
    });

    const pendingTab = await screen.findByRole('tab', { name: 'Pending (1)' });
    expect(pendingTab).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Pending recovery guidance')).toBeInTheDocument();
  });

  it('keeps pending selected and shows approved outcome continuity after review', async () => {
    renderInsightsPage({
      pending: [
        {
          id: 'insight-approve',
          patientId: 'patient-42',
          status: 'pending',
          title: 'Follow-up questionnaire may be due',
          message: 'Recent recovery updates suggest follow-up review.',
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
        },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Approve for workflow' }));

    const outcomePanel = await screen.findByTestId('insights-review-outcome');
    expect(within(outcomePanel).getByText('Approved into workflow')).toBeInTheDocument();
    expect(outcomePanel).toHaveTextContent(
      'Follow-up questionnaire may be due moved out of Pending and is now visible in Approved in this current queue view.',
    );
    expect(within(outcomePanel).getByText('Pending review is clear.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pending (0)' })).toHaveAttribute('aria-selected', 'true');
    expect((await screen.findAllByText('Queue cleared')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('insight-just-reviewed-insight-approve')).not.toBeInTheDocument();

    fireEvent.click(within(outcomePanel).getByRole('button', { name: 'View approved' }));

    const approvedTitle = await screen.findByText('Follow-up questionnaire may be due', {
      selector: '.insights-queue__title',
    });
    const approvedCard = approvedTitle.closest('.insights-queue__item');
    expect(approvedCard).not.toBeNull();
    expect(approvedCard).toHaveClass('insights-queue__item--just-reviewed');
    expect(screen.getByTestId('insight-just-reviewed-insight-approve')).toBeInTheDocument();

    fireEvent.click(within(outcomePanel).getByRole('button', { name: 'Open patient' }));

    expect(await screen.findByText('Patient detail workspace')).toBeInTheDocument();
  });

  it('keeps pending selected and shows rejected outcome continuity after review', async () => {
    renderInsightsPage({
      pending: [
        {
          id: 'insight-reject-1',
          patientId: 'patient-12',
          status: 'pending',
          title: 'Habit guidance should stay out',
          message: 'This looks low-signal for current follow-up.',
          category: 'habits',
          confidence: 'low',
          priority: 1,
          windowDays: 14,
          createdAt: '2026-03-14T09:00:00.000Z',
        },
        {
          id: 'insight-reject-2',
          patientId: 'patient-13',
          status: 'pending',
          title: 'Another pending review item',
          message: 'This one still needs clinician review.',
          category: 'recovery',
          confidence: 'medium',
          priority: 2,
          windowDays: 14,
          createdAt: '2026-03-14T09:30:00.000Z',
        },
      ],
    });

    fireEvent.click((await screen.findAllByRole('button', { name: 'Reject suggestion' }))[0]);

    const outcomePanel = await screen.findByTestId('insights-review-outcome');
    expect(within(outcomePanel).getByText('Rejected from workflow')).toBeInTheDocument();
    expect(outcomePanel).toHaveTextContent(
      'Habit guidance should stay out moved out of Pending and is now visible in Rejected in this current queue view.',
    );
    expect(
      within(outcomePanel).getByText('Continue with the next pending suggestion below.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pending (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Another pending review item')).toBeInTheDocument();
    expect(screen.queryByTestId('insight-just-reviewed-insight-reject-1')).not.toBeInTheDocument();

    fireEvent.click(within(outcomePanel).getByRole('button', { name: 'View rejected' }));

    const rejectedTitle = await screen.findByText('Habit guidance should stay out', {
      selector: '.insights-queue__title',
    });
    const rejectedCard = rejectedTitle.closest('.insights-queue__item');
    expect(rejectedCard).not.toBeNull();
    expect(rejectedCard).toHaveClass('insights-queue__item--just-reviewed');
    expect(screen.getByTestId('insight-just-reviewed-insight-reject-1')).toBeInTheDocument();
  });

  it('clears the last review outcome when a later review attempt fails', async () => {
    renderInsightsPage({
      pending: [
        {
          id: 'insight-success',
          patientId: 'patient-42',
          status: 'pending',
          title: 'Successful review first',
          message: 'This one will move into workflow.',
          category: 'recovery',
          confidence: 'medium',
          priority: 2,
          windowDays: 14,
          createdAt: '2026-03-14T08:00:00.000Z',
        },
        {
          id: 'insight-fail',
          patientId: 'patient-43',
          status: 'pending',
          title: 'Failing review second',
          message: 'This review will fail.',
          category: 'safety',
          confidence: 'high',
          priority: 3,
          windowDays: 7,
          createdAt: '2026-03-14T08:30:00.000Z',
        },
      ],
      failReviewIds: ['insight-fail'],
    });

    fireEvent.click((await screen.findAllByRole('button', { name: 'Approve for workflow' }))[0]);
    expect(await screen.findByTestId('insights-review-outcome')).toBeInTheDocument();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Reject suggestion' }))[0]);

    expect(await screen.findByText('Could not update insight')).toBeInTheDocument();
    expect(screen.queryByTestId('insights-review-outcome')).not.toBeInTheDocument();
  });

  it('omits outcome panel Open patient when patient navigation context is not valid', async () => {
    renderInsightsPage({
      pending: [
        {
          id: 'insight-no-patient',
          patientId: '   ',
          status: 'pending',
          title: 'Guidance without patient route',
          message: 'Route context is missing here.',
          category: 'habits',
          confidence: 'low',
          priority: 1,
          windowDays: 14,
          createdAt: '2026-03-14T08:00:00.000Z',
        },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Approve for workflow' }));

    const outcomePanel = await screen.findByTestId('insights-review-outcome');
    expect(within(outcomePanel).queryByRole('button', { name: 'Open patient' })).not.toBeInTheDocument();
  });

  it('treats an empty pending queue with reviewed items as queue cleared', async () => {
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

    expect((await screen.findAllByText('Queue cleared')).length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'No pending suggestions are waiting now. Approved and rejected views below reflect what was already handled in this current queue view only.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Approved (1)' }));
    expect(
      await screen.findByText('Approved item', {
        selector: '.insights-queue__title',
      }),
    ).toBeInTheDocument();
  });

  it('uses quiet and per-state empty views when no lifecycle items are present', async () => {
    renderInsightsPage({
      pending: [],
      approved: [],
      rejected: [],
    });

    expect((await screen.findAllByText('Quiet queue')).length).toBeGreaterThan(0);
    expect(
      await screen.findByText('No guidance suggestions are waiting'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Monitoring remains active and new guidance suggestions will appear here when they are generated.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Approved (0)' }));
    expect(await screen.findByText('No approved suggestions in this queue view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Rejected (0)' }));
    expect(await screen.findByText('No rejected suggestions in this queue view')).toBeInTheDocument();
  });
});
