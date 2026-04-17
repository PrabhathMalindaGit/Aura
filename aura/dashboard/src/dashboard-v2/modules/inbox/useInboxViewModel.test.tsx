/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonResponse } from '../../../test/mocks';
import type {
  ClinicianCoordinationRecord,
  DashboardCommunicationOverview,
} from '../../../types/models';
import { resetInboxUiStore, useInboxUiStore } from '../../state/useInboxUiStore';
import { useInboxViewModel } from './useInboxViewModel';

const COMMUNICATION_OVERVIEW: DashboardCommunicationOverview = {
  counts: {
    needsResponseCount: 2,
    flaggedBySafetyCount: 1,
    followUpRequestedCount: 2,
  },
  items: [
    {
      id: 'comm-1',
      patientId: 'patient-1',
      patientName: 'Jordan Lee',
      messageId: 'msg-1',
      needsResponse: true,
      flaggedBySafety: true,
      followUpRequested: true,
      messageCreatedAt: '2026-03-09T11:15:00.000Z',
      messagePreview: 'Pain is much worse after exercise today.',
      patientRiskLevel: 'high',
      openAlertCount: 2,
      lastCheckinAt: '2026-03-09T08:15:00.000Z',
      lastPainScore: 8,
      responseState: 'delayed',
      responseDueAt: '2026-03-09T12:00:00.000Z',
      responseDelayed: true,
      responseDelayHours: 8,
      reviewedAfterLatestInbound: false,
    },
    {
      id: 'comm-2',
      patientId: 'patient-2',
      patientName: 'Avery Chen',
      messageId: 'msg-2',
      needsResponse: true,
      flaggedBySafety: false,
      followUpRequested: true,
      messageCreatedAt: '2026-03-09T10:30:00.000Z',
      messagePreview: 'Can someone confirm whether tomorrow still works?',
      patientRiskLevel: 'low',
      openAlertCount: 0,
      lastCheckinAt: '2026-03-08T09:30:00.000Z',
      lastPainScore: 3,
      responseState: 'reviewing',
      responseDelayHours: 24,
      reviewedAfterLatestInbound: false,
    },
  ],
};

const COORDINATION_BY_PATIENT: Record<string, ClinicianCoordinationRecord | null> = {
  'patient-1': {
    patientId: 'patient-1',
    currentHandoff: {
      summary: 'Shared coordination summary for the next clinician.',
      nextStep: 'plan',
      followUpOwner: {
        kind: 'clinician',
        clinicianId: 'coordination-clinician-1',
        displayName: 'Dr Elena Hall',
      },
      updatedBy: {
        clinicianId: 'coordination-clinician-1',
        displayName: 'Dr Elena Hall',
      },
      updatedAt: '2026-03-09T11:45:00.000Z',
    },
    noteHistory: [
      {
        id: 'coord-note-1',
        text: 'Shared coordination note for inbox review.',
        createdBy: {
          clinicianId: 'coordination-clinician-1',
          displayName: 'Dr Elena Hall',
        },
        createdAt: '2026-03-09T11:50:00.000Z',
      },
    ],
    createdAt: '2026-03-09T11:40:00.000Z',
    updatedAt: '2026-03-09T11:50:00.000Z',
  },
  'patient-2': null,
};

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

function installInboxFetchMock(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost');

    if (url.pathname === '/clinician/dashboard/communication-overview') {
      return createJsonResponse({
        ok: true,
        overview: COMMUNICATION_OVERVIEW,
      });
    }

    if (url.pathname.match(/^\/clinician\/patients\/[^/]+\/coordination$/)) {
      const patientId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      return createJsonResponse({
        ok: true,
        coordination: COORDINATION_BY_PATIENT[patientId] ?? null,
      });
    }

    if (url.pathname.match(/^\/clinician\/patients\/[^/]+\/communication\/events$/)) {
      return createJsonResponse({ ok: true }, 201);
    }

    return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
  });
}

function createWrapper(initialEntry: string): ({ children }: { children: ReactNode }) => JSX.Element {
  const queryClient = createQueryClient();

  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('useInboxViewModel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('aura_access_token', 'TEST_TOKEN');
    resetInboxUiStore();
    installInboxFetchMock();
  });

  afterEach(() => {
    resetInboxUiStore();
  });

  it('auto-selects the first visible thread on wide layouts', async () => {
    const { result } = renderHook(
      () => useInboxViewModel({ isNarrowLayout: false }),
      { wrapper: createWrapper('/communication?view=needs-response') },
    );

    await waitFor(() => {
      expect(result.current.queueRows).toHaveLength(2);
      expect(result.current.activeWorkspace?.patientName).toBe('Jordan Lee');
    });

    expect(result.current.focusMode).toBe('workspace');
  });

  it('stays queue-first on narrow layouts when the route does not deep-link a patient', async () => {
    const { result } = renderHook(
      () => useInboxViewModel({ isNarrowLayout: true }),
      { wrapper: createWrapper('/communication?view=needs-response') },
    );

    await waitFor(() => {
      expect(result.current.queueRows).toHaveLength(2);
    });

    expect(result.current.activeWorkspace).toBeNull();
    expect(result.current.focusMode).toBe('queue');
  });

  it('honors the URL patient id before any saved selection', async () => {
    useInboxUiStore.getState().setSelectedThreadId('patient-2');

    const { result } = renderHook(
      () => useInboxViewModel({ isNarrowLayout: false }),
      { wrapper: createWrapper('/communication?patientId=patient-1&view=needs-response') },
    );

    await waitFor(() => {
      expect(result.current.activeWorkspace?.patientId).toBe('patient-1');
    });

    expect(result.current.activeWorkspace?.patientName).toBe('Jordan Lee');
  });
});
