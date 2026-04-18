/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonResponse } from '../../../test/mocks';
import { getWorkspaceStateStorageKey } from '../../../services/workspaceState';
import type { InsightItem, PatientSummary } from '../../../types/models';
import { resetInsightsUiStore } from '../../state/useInsightsUiStore';
import { useInsightsViewModel } from './useInsightsViewModel';

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

const APPROVED_ITEMS: InsightItem[] = [];
const REJECTED_ITEMS: InsightItem[] = [];

const PATIENTS: PatientSummary[] = [
  { id: 'patient-1', displayName: 'Jordan Lee', status: 'active' },
  { id: 'patient-2', displayName: 'Avery Chen', status: 'active' },
  { id: 'patient-3', displayName: 'Morgan Diaz', status: 'paused' },
];

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function installInsightsFetchMock(options: { failReviewIds?: string[] } = {}): void {
  let pendingItems = [...PENDING_ITEMS];
  let approvedItems = [...APPROVED_ITEMS];
  let rejectedItems = [...REJECTED_ITEMS];
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
  resetInsightsUiStore();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('useInsightsViewModel', () => {
  it('auto-selects the first visible item on wide layouts and persists lifecycle changes', async () => {
    installInsightsFetchMock();

    const { result } = renderHook(
      () => useInsightsViewModel({ isNarrowLayout: false }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.activeInsight?.id).toBe('insight-priority-1');
    });

    act(() => {
      result.current.persistActiveView('approved');
    });

    await waitFor(() => {
      expect(result.current.activeView).toBe('approved');
    });
    expect(window.localStorage.getItem(getWorkspaceStateStorageKey('insights'))).toContain('"activeView":"approved"');
  });

  it('preserves partial batch failure truth and keeps failed low-priority rows selected', async () => {
    installInsightsFetchMock({ failReviewIds: ['insight-low-2'] });

    const { result } = renderHook(
      () => useInsightsViewModel({ isNarrowLayout: false }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.queueSections.length).toBeGreaterThan(0);
    });

    act(() => {
      result.current.handleToggleLowPrioritySelection('insight-low-1', true);
      result.current.handleToggleLowPrioritySelection('insight-low-2', true);
    });

    await act(async () => {
      await result.current.handleBatchReview('approved');
    });

    await waitFor(() => {
      expect(result.current.reviewOutcome?.title).toBe('Batch approved');
    });
    expect(result.current.reviewError?.message).toContain('1 low-priority suggestion could not be updated');
    expect(Array.from(result.current.selectedLowPriorityIds)).toEqual(['insight-low-2']);
  });
});
