/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonResponse } from '../../../test/mocks';
import type {
  AlertContextResult,
  AlertItem,
  PatientSummary,
} from '../../../types/models';
import { resetAlertsUiStore } from '../../state/useAlertsUiStore';
import { useAlertsViewModel } from './useAlertsViewModel';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function recentIso(hoursAgo: number, minutesAgo = 0): string {
  return new Date(Date.now() - hoursAgo * HOUR_MS - minutesAgo * 60 * 1000).toISOString();
}

function recentDay(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

const OPEN_ALERTS: AlertItem[] = [
  {
    _id: 'alert-1',
    patientId: 'patient-1',
    risk: 'high',
    riskAuto: 'high',
    reason: ['PAIN_GE_THRESHOLD'],
    reasonsAuto: ['Pain threshold reached'],
    source: {
      type: 'checkin',
      sourceId: 'checkin-1',
    },
    status: 'open',
    createdAt: recentIso(2, 15),
    updatedAt: recentIso(2, 15),
    notificationChannel: 'telegram',
    notificationStatus: 'failed',
    notificationFailedAt: recentIso(2, 14),
    notificationError: 'Delivery failed.',
  },
  {
    _id: 'alert-2',
    patientId: 'patient-2',
    risk: 'medium',
    riskAuto: 'medium',
    reason: 'MISSED_CHECKIN_THRESHOLD',
    source: {
      type: 'chat',
      sourceId: 'message-2',
    },
    status: 'open',
    createdAt: recentIso(30),
    updatedAt: recentIso(30),
    seenAt: recentIso(29, 55),
    assignedTo: 'clinician-2',
    assignedToName: 'Dr Other Clinician',
    assignedAt: recentIso(2, 59),
    assignmentSource: 'manual',
  },
  {
    _id: 'alert-3',
    patientId: 'patient-3',
    risk: 'high',
    riskAuto: 'high',
    riskFinal: 'medium',
    overrideReason: 'Reduced after direct clinician review.',
    overriddenAt: recentIso(1, 30),
    overriddenBy: 'clinician-1',
    overriddenByName: 'Clinician One',
    reason: 'SYMPTOM_SPIKE',
    source: {
      type: 'checkin',
      sourceId: 'checkin-3',
    },
    status: 'open',
    createdAt: recentIso(4),
    updatedAt: recentIso(4),
    seenAt: recentIso(3, 55),
    assignedTo: 'clinician-1',
    assignedToName: 'Clinician One',
    assignedAt: recentIso(1, 35),
    assignmentSource: 'manual',
  },
];

const ACKNOWLEDGED_ALERTS: AlertItem[] = [
  {
    ...OPEN_ALERTS[0],
    _id: 'alert-ack-1',
    patientId: 'patient-3',
    status: 'acknowledged',
    updatedAt: recentIso(1, 20),
    acknowledgedAt: recentIso(1, 20),
  },
];

const RESOLVED_ALERTS: AlertItem[] = [
  {
    ...OPEN_ALERTS[0],
    _id: 'alert-resolved-1',
    patientId: 'patient-4',
    status: 'resolved',
    updatedAt: recentIso(1),
    resolvedAt: recentIso(1),
  },
];

const PATIENTS: PatientSummary[] = [
  {
    id: 'patient-1',
    displayName: 'Jordan Lee',
    status: 'active',
    lastCheckinAt: recentIso(5),
  },
  {
    id: 'patient-2',
    displayName: 'Avery Chen',
  },
  {
    id: 'patient-3',
    displayName: 'Maya Patel',
    status: 'active',
  },
];

const CONTEXT_BY_ALERT_ID: Record<string, AlertContextResult> = {
  'alert-1': {
    alert: OPEN_ALERTS[0],
    triggeringEvent: {
      type: 'checkin',
      id: 'checkin-1',
      date: recentDay(),
      pain: 8,
      mood: 3,
      createdAt: OPEN_ALERTS[0].createdAt,
    },
    timeline: [
      {
        type: 'ALERT_CREATED',
        at: OPEN_ALERTS[0].createdAt,
        label: 'Alert created',
        status: 'ok',
      },
    ],
  },
  'alert-2': {
    alert: OPEN_ALERTS[1],
    timeline: [
      {
        type: 'ALERT_CREATED',
        at: OPEN_ALERTS[1].createdAt,
        label: 'Alert created',
        status: 'ok',
      },
    ],
  },
  'alert-3': {
    alert: OPEN_ALERTS[2],
    triggeringEvent: {
      type: 'checkin',
      id: 'checkin-3',
      date: recentDay(),
      pain: 6,
      mood: 5,
      createdAt: OPEN_ALERTS[2].createdAt,
    },
    timeline: [
      {
        type: 'RISK_OVERRIDE_SAVED',
        at: OPEN_ALERTS[2].overriddenAt ?? OPEN_ALERTS[2].updatedAt,
        label: 'Risk override saved',
        status: 'ok',
      },
    ],
  },
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

function installAlertsFetchMock(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');

    if (url.pathname === '/clinician/alerts') {
      const status = url.searchParams.get('status') ?? 'open';
      if (status === 'acknowledged') {
        return createJsonResponse({ ok: true, alerts: ACKNOWLEDGED_ALERTS });
      }

      if (status === 'resolved') {
        return createJsonResponse({ ok: true, alerts: RESOLVED_ALERTS });
      }

      return createJsonResponse({ ok: true, alerts: OPEN_ALERTS });
    }

    if (url.pathname === '/clinician/patients') {
      return createJsonResponse({ ok: true, patients: PATIENTS });
    }

    if (url.pathname.match(/^\/clinician\/alerts\/[^/]+\/context$/)) {
      const alertId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const context = CONTEXT_BY_ALERT_ID[alertId];
      if (!context) {
        return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      return createJsonResponse({
        ok: true,
        alert: context.alert,
        triggeringEvent: context.triggeringEvent,
        timeline: context.timeline,
      });
    }

    if (url.pathname.match(/^\/clinician\/alerts\/[^/]+$/) && init?.method === 'PATCH') {
      const alertId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const payload = init.body
        ? (JSON.parse(String(init.body)) as { status?: 'acknowledged' | 'resolved' })
        : null;
      const source = OPEN_ALERTS.find((alert) => alert._id === alertId);
      if (!source || !payload?.status) {
        return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      return createJsonResponse({
        ok: true,
        alert: {
          ...source,
          status: payload.status,
          updatedAt: recentIso(1, 10),
        },
      });
    }

    if (url.pathname.match(/^\/clinician\/alerts\/[^/]+\/assignment$/) && init?.method === 'PATCH') {
      const alertId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const source = OPEN_ALERTS.find((alert) => alert._id === alertId);
      if (!source) {
        return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      const payload = init.body
        ? (JSON.parse(String(init.body)) as {
            assignedTo?: string | null;
            assignedToName?: string;
          })
        : null;

      return createJsonResponse({
        ok: true,
        alert: {
          ...source,
          assignedTo: payload?.assignedTo ?? undefined,
          assignedToName: payload?.assignedTo ? payload.assignedToName ?? payload.assignedTo : undefined,
          assignedAt: payload?.assignedTo ? recentIso(1, 5) : undefined,
          assignmentSource: payload?.assignedTo ? 'manual' : undefined,
        },
      });
    }

    if (url.pathname.match(/^\/clinician\/alerts\/[^/]+\/risk-override$/) && init?.method === 'PATCH') {
      const alertId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const source = OPEN_ALERTS.find((alert) => alert._id === alertId);
      const payload = init.body
        ? (JSON.parse(String(init.body)) as { riskFinal?: string; overrideReason?: string })
        : null;
      if (!source || !payload?.riskFinal) {
        return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      return createJsonResponse({
        ok: true,
        alert: {
          ...source,
          riskFinal: payload.riskFinal,
          overrideReason: payload.overrideReason ?? 'Confirmed auto risk.',
          overriddenAt: recentIso(1),
          overriddenBy: 'clinician-1',
          overriddenByName: 'Clinician',
        },
      });
    }

    if (url.pathname.match(/^\/clinician\/alerts\/[^/]+\/risk-override$/) && init?.method === 'DELETE') {
      const alertId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const source = OPEN_ALERTS.find((alert) => alert._id === alertId);
      if (!source) {
        return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      return createJsonResponse({
        ok: true,
        alert: {
          ...source,
          riskFinal: undefined,
          overrideReason: undefined,
        },
      });
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

describe('useAlertsViewModel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('aura_access_token', 'TEST_TOKEN');
    resetAlertsUiStore();
    installAlertsFetchMock();
  });

  afterEach(() => {
    resetAlertsUiStore();
  });

  it('auto-selects the first visible alert on wide layouts', async () => {
    const { result } = renderHook(
      () => useAlertsViewModel({ isNarrowLayout: false }),
      { wrapper: createWrapper('/alerts') },
    );

    await waitFor(() => {
      expect(result.current.queueRows).toHaveLength(3);
      expect(result.current.activeHeader?.patientName).toBe('Jordan Lee');
    });

    expect(result.current.focusMode).toBe('workspace');
  });

  it('keeps narrow layouts queue-first while aligning selection to the first visible alert', async () => {
    const { result } = renderHook(
      () => useAlertsViewModel({ isNarrowLayout: true }),
      { wrapper: createWrapper('/alerts') },
    );

    await waitFor(() => {
      expect(result.current.queueRows).toHaveLength(3);
    });

    expect(result.current.activeAlert?._id).toBe('alert-1');
    expect(result.current.activeHeader?.patientName).toBe('Jordan Lee');
    expect(result.current.focusMode).toBe('queue');
  });

  it('clears open-only filters when switching from open to acknowledged', async () => {
    const { result } = renderHook(
      () => useAlertsViewModel({ isNarrowLayout: false }),
      { wrapper: createWrapper('/alerts') },
    );

    await waitFor(() => {
      expect(result.current.queueRows).toHaveLength(3);
    });

    act(() => {
      result.current.setUnseenOnly(true);
      result.current.setAssignedToMeOnly(true);
      result.current.setOverriddenOnly(true);
      result.current.handleStatusChange('acknowledged');
    });

    expect(result.current.status).toBe('acknowledged');
    expect(result.current.unseenOnly).toBe(false);
    expect(result.current.assignedToMeOnly).toBe(false);
    expect(result.current.unassignedOnly).toBe(false);
    expect(result.current.overriddenOnly).toBe(false);
  });

  it('filters the queue by patient display name and source label text', async () => {
    const { result } = renderHook(
      () => useAlertsViewModel({ isNarrowLayout: false }),
      { wrapper: createWrapper('/alerts') },
    );

    await waitFor(() => {
      expect(result.current.queueRows).toHaveLength(3);
    });

    act(() => {
      result.current.setSearchValue('Maya');
    });

    await waitFor(() => {
      expect(result.current.queueRows.map((row) => row.patientName)).toEqual(['Maya Patel']);
      expect(result.current.activeHeader?.patientName).toBe('Maya Patel');
    });

    act(() => {
      result.current.setSearchValue('Check-in');
    });

    await waitFor(() => {
      expect(result.current.queueRows.map((row) => row.alertId)).toEqual(['alert-1', 'alert-3']);
    });
  });

  it('applies supported source, time range, and sort controls', async () => {
    const { result } = renderHook(
      () => useAlertsViewModel({ isNarrowLayout: false }),
      { wrapper: createWrapper('/alerts') },
    );

    await waitFor(() => {
      expect(result.current.queueRows).toHaveLength(3);
    });

    act(() => {
      result.current.setSourceFilter('chat');
    });

    await waitFor(() => {
      expect(result.current.queueRows.map((row) => row.alertId)).toEqual(['alert-2']);
    });

    act(() => {
      result.current.setSourceFilter('all');
      result.current.setTimeRange('24h');
    });

    await waitFor(() => {
      expect(result.current.queueRows.map((row) => row.alertId)).toEqual(['alert-1', 'alert-3']);
    });

    act(() => {
      result.current.setTimeRange('7d');
      result.current.setSortOrder('patient-asc');
    });

    await waitFor(() => {
      expect(result.current.queueRows.map((row) => row.patientName)).toEqual([
        'Avery Chen',
        'Jordan Lee',
        'Maya Patel',
      ]);
    });
  });

  it('applies supported open queue chip filters and reset restores the default view', async () => {
    const { result } = renderHook(
      () => useAlertsViewModel({ isNarrowLayout: false }),
      { wrapper: createWrapper('/alerts') },
    );

    await waitFor(() => {
      expect(result.current.queueRows).toHaveLength(3);
    });

    act(() => {
      result.current.setUnseenOnly(true);
    });

    await waitFor(() => {
      expect(result.current.queueRows.map((row) => row.alertId)).toEqual(['alert-1']);
    });

    act(() => {
      result.current.setUnseenOnly(false);
      result.current.setAssignedToMeOnly(true);
    });

    await waitFor(() => {
      expect(result.current.queueRows.map((row) => row.alertId)).toEqual(['alert-3']);
    });

    act(() => {
      result.current.setAssignedToMeOnly(false);
      result.current.setUnassignedOnly(true);
    });

    await waitFor(() => {
      expect(result.current.queueRows.map((row) => row.alertId)).toEqual(['alert-1']);
    });

    act(() => {
      result.current.setUnassignedOnly(false);
      result.current.setOverriddenOnly(true);
    });

    await waitFor(() => {
      expect(result.current.queueRows.map((row) => row.alertId)).toEqual(['alert-3']);
    });

    act(() => {
      result.current.resetFilters();
    });

    await waitFor(() => {
      expect(result.current.queueRows).toHaveLength(3);
      expect(result.current.searchValue).toBe('');
      expect(result.current.sourceFilter).toBe('all');
      expect(result.current.timeRange).toBe('7d');
      expect(result.current.sortOrder).toBe('newest');
      expect(result.current.unseenOnly).toBe(false);
      expect(result.current.assignedToMeOnly).toBe(false);
      expect(result.current.unassignedOnly).toBe(false);
      expect(result.current.overriddenOnly).toBe(false);
    });
  });
});
