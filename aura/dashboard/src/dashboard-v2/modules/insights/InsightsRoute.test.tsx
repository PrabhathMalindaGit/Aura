/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  render,
  screen,
  within,
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
import { getWorkspaceStateStorageKey } from '../../../services/workspaceState';
import type { InsightItem, PatientSummary } from '../../../types/models';
import { InsightsRouteFacade } from '../../config/routeFacades';
import {
  getDefaultDashboardV2Gates,
  resetDashboardV2GatesForTests,
  writeDashboardV2Gates,
} from '../../config/migrationGates';
import { resetInsightsUiStore } from '../../state/useInsightsUiStore';

const PENDING_ITEMS: InsightItem[] = [
  {
    id: 'insight-priority-1',
    patientId: 'patient-1',
    status: 'pending',
    title: 'Pain follow-up suggested',
    message: 'Pain scores rose again in the current review window.',
    category: 'symptoms',
    confidence: 'high',
    priority: 3,
    windowDays: 14,
    createdAt: '2026-04-18T07:00:00.000Z',
  },
  {
    id: 'insight-low-1',
    patientId: 'patient-2',
    status: 'pending',
    title: 'Routine adherence follow-up',
    message: 'A lighter-touch check could confirm adherence stability.',
    category: 'adherence',
    confidence: 'low',
    priority: 1,
    windowDays: 14,
    createdAt: '2026-04-17T07:00:00.000Z',
  },
  {
    id: 'insight-low-2',
    patientId: 'patient-3',
    status: 'pending',
    title: 'Routine medication follow-up',
    message: 'Medication review can stay list-scoped for now.',
    category: 'medications',
    confidence: 'low',
    priority: 1,
    windowDays: 7,
    createdAt: '2026-04-16T07:00:00.000Z',
  },
];

const APPROVED_ITEMS: InsightItem[] = [
  {
    id: 'insight-approved-1',
    patientId: 'patient-missing',
    status: 'approved',
    title: 'Approved recovery follow-up',
    message: 'Approved follow-up stayed in the recorded history.',
    category: 'recovery',
    confidence: 'medium',
    priority: 2,
    windowDays: 10,
    createdAt: '2026-04-15T07:00:00.000Z',
    reviewedAt: '2026-04-16T07:00:00.000Z',
  },
];

const REJECTED_ITEMS: InsightItem[] = [
  {
    id: 'insight-rejected-1',
    patientId: 'patient-4',
    status: 'rejected',
    title: 'Rejected reminder follow-up',
    message: 'Rejected history stays visible for follow-through.',
    category: 'questionnaires',
    confidence: 'low',
    priority: 2,
    windowDays: 14,
    createdAt: '2026-04-14T07:00:00.000Z',
    reviewedAt: '2026-04-14T12:00:00.000Z',
  },
];

const PATIENTS: PatientSummary[] = [
  {
    id: 'patient-1',
    displayName: 'Jordan Lee',
    status: 'active',
    lastCheckinAt: '2026-04-18T06:00:00.000Z',
    openAlertCount: 1,
    lastPain: 7,
  },
  {
    id: 'patient-2',
    displayName: 'Avery Chen',
    status: 'active',
  },
  {
    id: 'patient-3',
    displayName: 'Morgan Diaz',
    status: 'paused',
  },
  {
    id: 'patient-4',
    displayName: 'Taylor Moss',
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

function installInsightsFetchMock(options: {
  failReviewIds?: string[];
  pendingItems?: InsightItem[];
  approvedItems?: InsightItem[];
  rejectedItems?: InsightItem[];
} = {}): void {
  let pendingItems = [...(options.pendingItems ?? PENDING_ITEMS)];
  let approvedItems = [...(options.approvedItems ?? APPROVED_ITEMS)];
  let rejectedItems = [...(options.rejectedItems ?? REJECTED_ITEMS)];
  const failingIds = new Set(options.failReviewIds ?? []);

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = String(init?.method ?? 'GET').toUpperCase();

    if (url.pathname === '/clinician/insights' && method === 'GET') {
      const status = url.searchParams.get('status') ?? 'pending';
      if (status === 'approved') {
        return createJsonResponse({ ok: true, items: approvedItems });
      }
      if (status === 'rejected') {
        return createJsonResponse({ ok: true, items: rejectedItems });
      }
      return createJsonResponse({ ok: true, items: pendingItems });
    }

    if (url.pathname === '/clinician/patients') {
      return createJsonResponse({ ok: true, patients: PATIENTS });
    }

    if (url.pathname.match(/^\/clinician\/insights\/[^/]+$/) && method === 'PATCH') {
      const insightId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
      if (failingIds.has(insightId)) {
        return createJsonResponse({ ok: false, message: 'Could not update item' }, 500);
      }

      const payload = init?.body
        ? (JSON.parse(String(init.body)) as { status?: 'approved' | 'rejected' })
        : null;
      const sourceItem = pendingItems.find((item) => item.id === insightId);
      if (!sourceItem || !payload?.status) {
        return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      const reviewedItem: InsightItem = {
        ...sourceItem,
        status: payload.status,
        reviewedAt: '2026-04-18T10:00:00.000Z',
      };

      pendingItems = pendingItems.filter((item) => item.id !== insightId);
      if (payload.status === 'approved') {
        approvedItems = [reviewedItem, ...approvedItems];
      } else {
        rejectedItems = [reviewedItem, ...rejectedItems];
      }

      return createJsonResponse({ ok: true, item: reviewedItem });
    }

    return createJsonResponse({ ok: true });
  });
}

function PatientWorkspaceEcho(): JSX.Element {
  const location = useLocation();
  return <div>{`Patient workspace ${JSON.stringify(location.state)}`}</div>;
}

function renderInsightsRoute(): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/insights']}>
        <Routes>
          <Route path="/insights" element={<InsightsRouteFacade />} />
          <Route path="/patients/:patientId" element={<PatientWorkspaceEcho />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setInsightsGate(enabled: boolean): void {
  const defaults = getDefaultDashboardV2Gates();

  writeDashboardV2Gates({
    ...defaults,
    routes: {
      ...defaults.routes,
      insights: enabled,
    },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  installResizeObserverMock();
  installViewportMock(1440);
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetInsightsUiStore();
  resetDashboardV2GatesForTests();
});

afterEach(() => {
  cleanup();
});

describe('InsightsRoute', () => {
  it('falls back to the legacy queue when the route is explicitly rolled back', async () => {
    installInsightsFetchMock();
    setInsightsGate(false);

    renderInsightsRoute();

    expect(
      await screen.findByText('Review queue', undefined, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('v2-insights-route')).not.toBeInTheDocument();
  });

  it('renders the v2 route by default, preserves patient routing, and keeps lifecycle context conservative', async () => {
    installInsightsFetchMock();

    renderInsightsRoute();

    expect(await screen.findByTestId('v2-insights-route')).toBeVisible();
    await screen.findByRole('button', { name: 'Pending (3)' });
    const workspace = await screen.findByTestId('v2-insights-review-workspace');
    expect(workspace).toHaveTextContent('Jordan Lee');

    await userEvent.click(screen.getByRole('button', { name: 'Approved (1)' }));
    await waitFor(() => {
      expect(screen.getByTestId('v2-insights-review-workspace')).toHaveTextContent('Patient patient-missing');
    });
    expect(screen.queryAllByLabelText('Insight support context')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Support context' }));
    expect(screen.getAllByLabelText('Insight support context')[0]).toHaveTextContent('Unknown');
    expect(screen.getByText(/Unsupported provenance stays omitted/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(
      window.localStorage.getItem(getWorkspaceStateStorageKey('insights')),
    ).toContain('"activeView":"approved"');

    await userEvent.click(screen.getByRole('button', { name: 'Pending (3)' }));
    await waitFor(() => {
      expect(screen.getByTestId('v2-insights-review-workspace')).toHaveTextContent('Jordan Lee');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Open patient' }));
    expect(await screen.findByText(/Patient workspace/)).toHaveTextContent('"returnTo":"/insights"');
  });

  it('renders a horizontal lane below the review strip and updates the selected insight review', async () => {
    installInsightsFetchMock();

    renderInsightsRoute();

    const route = await screen.findByTestId('v2-insights-route');
    const reviewStripTitle = await screen.findByText('Follow-up insights');
    const lane = await screen.findByTestId('v2-insights-queue-pane');
    expect(
      reviewStripTitle.compareDocumentPosition(lane) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText('Scan the review lane')).toBeInTheDocument();
    expect(screen.getByText(
      'Pending review stays grouped so clinicians can scan work from left to right before opening an item.',
    )).toBeInTheDocument();
    expect(within(lane).getByTestId('v2-insight-row-insight-priority-1')).toHaveAccessibleName(
      /Jordan Lee: Pain follow-up suggested, Symptoms, Priority 3, Pending/,
    );
    expect(within(route).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(within(route).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(within(route).getByRole('button', { name: 'Open patient' })).toBeInTheDocument();

    const selectedReview = screen.getByLabelText('Selected insight review');
    expect(selectedReview).toHaveTextContent('Selected insight review');
    expect(selectedReview).toHaveTextContent('Pain follow-up suggested');
    expect(selectedReview).toHaveTextContent('Review basis');
    expect(selectedReview).toHaveTextContent('Category');
    expect(selectedReview).toHaveTextContent('Symptoms');
    expect(selectedReview).toHaveTextContent('Confidence');
    expect(selectedReview).toHaveTextContent('high');
    expect(selectedReview).not.toHaveTextContent('Suggested follow-through');
    expect(selectedReview).not.toHaveTextContent('Review this item before routine batching.');
    expect(selectedReview).not.toHaveTextContent('Decision checklist');
    expect(selectedReview).not.toHaveTextContent('Patient context available');
    expect(selectedReview).not.toHaveTextContent('Review reason visible');
    expect(selectedReview).not.toHaveTextContent('Decision actions available');
    expect(selectedReview).not.toHaveTextContent(/Presentation/i);
    const supportRail = screen.getByLabelText('Follow-up review support');
    expect(supportRail).toHaveTextContent('Support context');
    expect(supportRail).toHaveTextContent('Why this needs follow-up');
    expect(supportRail).toHaveTextContent('Review support');

    await userEvent.click(within(lane).getByTestId('v2-insight-row-insight-low-1'));
    await waitFor(() => {
      expect(screen.getByLabelText('Selected insight review')).toHaveTextContent('Routine adherence follow-up');
    });
    expect(screen.getByLabelText('Selected insight review')).toHaveTextContent('Avery Chen');
    expect(screen.getByLabelText('Selected insight review')).toHaveTextContent('Adherence');
  });

  it('keeps batch review queue-scoped and preserves partial failure truth', async () => {
    installInsightsFetchMock({ failReviewIds: ['insight-low-2'] });

    renderInsightsRoute();

    expect(await screen.findByTestId('v2-insights-route')).toBeVisible();
    await screen.findByRole('button', { name: 'Pending (3)' });
    await userEvent.click(screen.getByLabelText('Select Routine adherence follow-up'));
    await userEvent.click(screen.getByLabelText('Select Routine medication follow-up'));
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }));

    expect(await screen.findByText('Batch approved')).toBeInTheDocument();
    expect(
      screen.getByText('1 low-priority suggestion moved into workflow.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 low-priority suggestion could not be updated. Any successful reviews are reflected below.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('v2-insights-batch-bar')).toHaveTextContent('1 low-priority suggestion selected');
  });

  it('stays queue-first on narrow widths until a clinician selects an item', async () => {
    installViewportMock(900);
    installInsightsFetchMock();

    renderInsightsRoute();

    expect(await screen.findByTestId('v2-insights-route')).toBeVisible();
    await screen.findByRole('button', { name: 'Pending (3)' });
    expect(screen.queryByTestId('v2-insights-review-workspace')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByTestId('v2-insight-row-insight-priority-1'));
    expect(await screen.findByTestId('v2-insights-review-workspace')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back to lane' })).toBeInTheDocument();
    expect(screen.getByTestId('v2-insights-queue-pane')).toBeVisible();
  });

  it('keeps the empty lane honest when no suggestions exist', async () => {
    installInsightsFetchMock({
      pendingItems: [],
      approvedItems: [],
      rejectedItems: [],
    });

    renderInsightsRoute();

    expect(await screen.findByTestId('v2-insights-route')).toBeVisible();
    expect(await screen.findByText('No guidance suggestions are waiting')).toBeInTheDocument();
    expect(screen.queryByLabelText('Selected insight review')).not.toBeInTheDocument();
  });
});
