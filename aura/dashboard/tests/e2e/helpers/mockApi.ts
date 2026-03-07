import type { Page, Route } from '@playwright/test';
import type { AlertItem, AlertStatus, TrendPointRaw } from '../../../src/types/models';
import {
  FIXTURE_ACK_ALERT,
  FIXTURE_ALERTS_BY_STATUS,
  FIXTURE_DAY_DRILLDOWN_DATE,
  FIXTURE_PATIENTS,
  FIXTURE_RESOLVED_ALERT,
  FIXTURE_TRENDS_14,
  FIXTURE_TRENDS_30,
} from '../fixtures';
import { jsonHeaders, isPath, parseRequestUrl, startsWithPath } from '../mocks/routes';

export type MockScenario = 'default' | 'ackSuccess' | 'ackFail' | 'offline';

interface MockApiOptions {
  scenario?: MockScenario;
}

interface PatchCall {
  id: string;
  status: 'acknowledged' | 'resolved';
}

export interface MockApiTracker {
  patchStatusCalls: PatchCall[];
  trendDaysCalls: number[];
  requestLog: Array<{ method: string; pathname: string }>;
}

interface MockState {
  alertsByStatus: Record<AlertStatus, AlertItem[]>;
  trendsByDays: Record<14 | 30, TrendPointRaw[]>;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createInitialState(): MockState {
  return {
    alertsByStatus: deepClone(FIXTURE_ALERTS_BY_STATUS),
    trendsByDays: {
      14: deepClone(FIXTURE_TRENDS_14),
      30: deepClone(FIXTURE_TRENDS_30),
    },
  };
}

function findAlertById(state: MockState, id: string): AlertItem | undefined {
  const statuses: AlertStatus[] = ['open', 'acknowledged', 'resolved'];
  for (const status of statuses) {
    const matched = state.alertsByStatus[status].find((alert) => alert._id === id);
    if (matched) {
      return matched;
    }
  }

  return undefined;
}

function updateAlertStatusInState(
  state: MockState,
  id: string,
  nextStatus: 'acknowledged' | 'resolved',
): AlertItem | undefined {
  const alert = findAlertById(state, id);
  if (!alert) {
    return undefined;
  }

  const nowIso = new Date('2026-02-22T10:00:00.000Z').toISOString();
  const updatedAlert: AlertItem =
    nextStatus === 'acknowledged'
      ? { ...FIXTURE_ACK_ALERT, ...alert, status: 'acknowledged', updatedAt: nowIso, acknowledgedAt: nowIso }
      : { ...FIXTURE_RESOLVED_ALERT, ...alert, status: 'resolved', updatedAt: nowIso, resolvedAt: nowIso };

  state.alertsByStatus.open = state.alertsByStatus.open.filter((item) => item._id !== id);
  state.alertsByStatus.acknowledged = state.alertsByStatus.acknowledged.filter((item) => item._id !== id);
  state.alertsByStatus.resolved = state.alertsByStatus.resolved.filter((item) => item._id !== id);

  state.alertsByStatus[nextStatus] = [updatedAlert, ...state.alertsByStatus[nextStatus]];
  return updatedAlert;
}

async function fulfillJson(route: Route, status: number, payload: unknown): Promise<void> {
  await route.fulfill({
    status,
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function installMockApi(
  page: Page,
  options: MockApiOptions = {},
): Promise<MockApiTracker> {
  const scenario = options.scenario ?? 'default';
  const state = createInitialState();
  const tracker: MockApiTracker = {
    patchStatusCalls: [],
    trendDaysCalls: [],
    requestLog: [],
  };

  await page.addInitScript(() => {
    window.localStorage.setItem('aura_access_token', 'MOCKED_E2E_TOKEN');
  });

  await page.route('**/clinician/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = parseRequestUrl(request.url());
    const pathname = url.pathname;

    tracker.requestLog.push({ method, pathname });

    if (scenario === 'offline') {
      await route.abort('internetdisconnected');
      return;
    }

    if (isPath(pathname, '/clinician/patients') && method === 'GET') {
      await fulfillJson(route, 200, { ok: true, patients: deepClone(FIXTURE_PATIENTS) });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/trends') && method === 'GET') {
      const daysValue = url.searchParams.get('days');
      const parsedDays: 14 | 30 = daysValue === '30' ? 30 : 14;
      tracker.trendDaysCalls.push(parsedDays);

      const trends = deepClone(state.trendsByDays[parsedDays]);
      const nowIso = new Date('2026-02-22T10:00:00.000Z').toISOString();
      const fromIso = parsedDays === 30 ? '2026-01-23T00:00:00.000Z' : '2026-02-08T00:00:00.000Z';
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? 'p1',
        days: parsedDays,
        from: fromIso,
        to: nowIso,
        trends,
      });
      return;
    }

    if (isPath(pathname, '/clinician/alerts') && method === 'GET') {
      const status = (url.searchParams.get('status') ?? 'open') as AlertStatus;
      const alerts = deepClone(state.alertsByStatus[status] ?? []);
      await fulfillJson(route, 200, { ok: true, alerts });
      return;
    }

    if (startsWithPath(pathname, '/clinician/alerts/') && pathname.endsWith('/context') && method === 'GET') {
      const id = pathname.split('/')[3];
      const alert = id ? findAlertById(state, id) : undefined;
      if (!alert) {
        await fulfillJson(route, 404, { ok: false, error: 'NOT_FOUND' });
        return;
      }

      const timeline = [
        {
          type: 'ALERT_CREATED',
          at: alert.createdAt,
          label: 'Alert created',
          status: 'ok',
        },
      ];

      await fulfillJson(route, 200, {
        ok: true,
        alert: deepClone(alert),
        timeline,
        triggeringEvent: {
          type: 'checkin',
          id: alert.source.sourceId,
          date: FIXTURE_DAY_DRILLDOWN_DATE,
          pain: 6,
          mood: 3,
          createdAt: alert.createdAt,
        },
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/alerts/') && method === 'PATCH') {
      const id = pathname.split('/')[3];
      const payload = request.postDataJSON() as { status?: 'acknowledged' | 'resolved' } | null;
      const nextStatus = payload?.status;
      if (!id || (nextStatus !== 'acknowledged' && nextStatus !== 'resolved')) {
        await fulfillJson(route, 400, { ok: false, error: 'VALIDATION_ERROR' });
        return;
      }

      tracker.patchStatusCalls.push({ id, status: nextStatus });

      if (scenario === 'ackFail') {
        await fulfillJson(route, 500, { ok: false, error: 'INTERNAL_ERROR' });
        return;
      }

      const updatedAlert = updateAlertStatusInState(state, id, nextStatus);
      if (!updatedAlert) {
        await fulfillJson(route, 404, { ok: false, error: 'NOT_FOUND' });
        return;
      }

      await fulfillJson(route, 200, { ok: true, alert: deepClone(updatedAlert) });
      return;
    }

    await fulfillJson(route, 404, { ok: false, error: 'NOT_FOUND' });
  });

  return tracker;
}
