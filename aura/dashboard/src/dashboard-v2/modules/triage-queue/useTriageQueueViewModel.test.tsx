/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonResponse } from '../../../test/mocks';
import { resetTriageQueueUiStore } from '../../state/useTriageQueueUiStore';
import type { WorklistRecord } from '../../../types/models';
import { useTriageQueueViewModel } from './useTriageQueueViewModel';

const WORKLIST_ITEMS: WorklistRecord[] = [
  {
    patientId: 'p1',
    patientName: 'Jordan Lee',
    patientStatus: 'active',
    rehabPhase: 'Strength & Control',
    lastCheckinAt: '2026-03-09T08:00:00.000Z',
    openAlertsCount: 2,
    latestRiskLevel: 'high',
    lastPainScore: 8,
    adherenceSummary: {
      exercisesPct: 0.4,
      medicationTaken: false,
    },
    nextAppointmentAt: '2026-03-09T14:00:00.000Z',
    missedCheckins: {
      flag: false,
      count: 0,
    },
    communicationNeedsResponse: true,
    activeTaskCount: 2,
    proms: {
      dueCount: 2,
      overdueCount: 1,
      nextDueAt: '2026-03-09T06:00:00.000Z',
    },
    topIssue: 'High pain escalation',
    reviewReason: 'Patient chat and safety review both need follow-up.',
    priorityScore: 92,
    updatedAt: '2026-03-09T09:00:00.000Z',
  },
  {
    patientId: 'p2',
    patientName: 'Avery Chen',
    patientStatus: 'on_hold',
    rehabPhase: 'Return to mobility',
    lastCheckinAt: '2026-03-05T08:00:00.000Z',
    openAlertsCount: 0,
    latestRiskLevel: 'low',
    lastPainScore: 3,
    adherenceSummary: {
      exercisesPct: 0.75,
      medicationTaken: true,
    },
    missedCheckins: {
      flag: true,
      count: 2,
    },
    communicationNeedsResponse: false,
    activeTaskCount: 1,
    proms: {
      dueCount: 1,
      overdueCount: 1,
      nextDueAt: '2026-03-07T08:00:00.000Z',
    },
    topIssue: 'Missed daily check-ins',
    reviewReason: 'Follow-up is needed before the next rehab step.',
    priorityScore: 48,
    updatedAt: '2026-03-08T10:00:00.000Z',
  },
];

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

function installWorklistFetchMock(itemsSeed: WorklistRecord[] = WORKLIST_ITEMS): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));

    if (url.pathname === '/clinician/worklist') {
      return createJsonResponse({
        ok: true,
        items: itemsSeed,
        total: itemsSeed.length,
      });
    }

    return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
  });
}

function createWrapper(): ({ children }: { children: ReactNode }) => JSX.Element {
  const queryClient = createQueryClient();

  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/worklist']}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('useTriageQueueViewModel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('aura_access_token', 'TEST_TOKEN');
    resetTriageQueueUiStore();
  });

  afterEach(() => {
    resetTriageQueueUiStore();
  });

  it('auto-selects the first visible case on wide layouts', async () => {
    installWorklistFetchMock();

    const { result } = renderHook(
      () => useTriageQueueViewModel({ isNarrowLayout: false }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.cases).toHaveLength(2);
      expect(result.current.selectedCase?.workspace.patientName).toBe('Jordan Lee');
    });

    expect(result.current.focusMode).toBe('workspace');
  });

  it('stays queue-first on narrow layouts when there is no saved selection', async () => {
    installWorklistFetchMock();

    const { result } = renderHook(
      () => useTriageQueueViewModel({ isNarrowLayout: true }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.cases).toHaveLength(2);
    });

    expect(result.current.selectedCase).toBeNull();
    expect(result.current.focusMode).toBe('queue');
  });
});
