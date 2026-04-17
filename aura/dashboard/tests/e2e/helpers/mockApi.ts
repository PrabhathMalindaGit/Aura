import type { Page, Route } from '@playwright/test';
import type {
  AlertItem,
  AlertStatus,
  ClinicianCoordinationRecord,
  DashboardCommunicationOverview,
  TrendPointRaw,
} from '../../../src/types/models';
import {
  FIXTURE_ACK_ALERT,
  FIXTURE_ALERTS_BY_STATUS,
  FIXTURE_DASHBOARD_APPOINTMENTS,
  FIXTURE_DASHBOARD_COMMUNICATION,
  FIXTURE_DASHBOARD_PRIORITY_QUEUE,
  FIXTURE_DASHBOARD_SAFETY_EVENTS,
  FIXTURE_DASHBOARD_SUMMARY,
  FIXTURE_DASHBOARD_TASKS,
  FIXTURE_DAY_DRILLDOWN_DATE,
  FIXTURE_PATIENT_APPOINTMENT_REQUESTS,
  FIXTURE_PATIENT_TASKS,
  FIXTURE_PATIENTS,
  FIXTURE_RESOLVED_ALERT,
  FIXTURE_TRENDS_14,
  FIXTURE_TRENDS_30,
  FIXTURE_WORKLIST_ITEMS,
} from '../fixtures';
import { jsonHeaders, isPath, parseRequestUrl, startsWithPath } from '../mocks/routes';

export type MockScenario = 'default' | 'ackSuccess' | 'ackFail' | 'offline';

interface MockApiOptions {
  scenario?: MockScenario;
  communicationOverview?: DashboardCommunicationOverview;
  coordinationByPatient?: Record<string, ClinicianCoordinationRecord | null>;
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
  tasks: typeof FIXTURE_PATIENT_TASKS;
  worklistItems: typeof FIXTURE_WORKLIST_ITEMS;
  appointmentRequests: typeof FIXTURE_PATIENT_APPOINTMENT_REQUESTS;
  communicationOverview: DashboardCommunicationOverview;
  coordinationByPatient: Record<string, ClinicianCoordinationRecord | null>;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const DEFAULT_COORDINATION_BY_PATIENT: Record<string, ClinicianCoordinationRecord | null> = {
  p1: {
    patientId: 'p1',
    currentHandoff: {
      summary: 'Shared coordination summary for Patient P1.',
      nextStep: 'plan',
      followUpOwner: {
        kind: 'clinician',
        clinicianId: 'clinician-1',
        displayName: 'Clinician One',
      },
      linkedTaskId: 'task-1',
      linkedTask: {
        id: 'task-1',
        title: 'Check medication adherence',
        type: 'follow_up',
        priority: 'high',
        status: 'open',
        dueAt: FIXTURE_PATIENT_TASKS[0]?.dueAt ?? null,
        assignedTo: 'clinician-1',
        updatedAt: FIXTURE_PATIENT_TASKS[0]?.updatedAt ?? new Date().toISOString(),
      },
      updatedBy: {
        clinicianId: 'clinician-1',
        displayName: 'Clinician One',
      },
      updatedAt: FIXTURE_PATIENT_TASKS[0]?.updatedAt ?? new Date().toISOString(),
    },
    noteHistory: [
      {
        id: 'coord-note-1',
        text: 'Shared coordination note for Patient P1.',
        createdBy: {
          clinicianId: 'clinician-1',
          displayName: 'Clinician One',
        },
        createdAt: FIXTURE_PATIENT_TASKS[0]?.updatedAt ?? new Date().toISOString(),
      },
    ],
    createdAt: FIXTURE_PATIENT_TASKS[0]?.createdAt ?? new Date().toISOString(),
    updatedAt: FIXTURE_PATIENT_TASKS[0]?.updatedAt ?? new Date().toISOString(),
  },
};

function createInitialState(options: MockApiOptions = {}): MockState {
  return {
    alertsByStatus: deepClone(FIXTURE_ALERTS_BY_STATUS),
    trendsByDays: {
      14: deepClone(FIXTURE_TRENDS_14),
      30: deepClone(FIXTURE_TRENDS_30),
    },
    tasks: deepClone(FIXTURE_PATIENT_TASKS),
    worklistItems: deepClone(FIXTURE_WORKLIST_ITEMS),
    appointmentRequests: deepClone(FIXTURE_PATIENT_APPOINTMENT_REQUESTS),
    communicationOverview: deepClone(options.communicationOverview ?? FIXTURE_DASHBOARD_COMMUNICATION),
    coordinationByPatient: deepClone(options.coordinationByPatient ?? DEFAULT_COORDINATION_BY_PATIENT),
  };
}

function applyTaskCompletion(state: MockState, id: string) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) {
    return undefined;
  }

  const nowIso = new Date('2026-02-22T10:05:00.000Z').toISOString();
  task.status = 'completed';
  task.completedAt = nowIso;
  task.updatedAt = nowIso;

  const worklistItem = state.worklistItems.find((item) => item.patientId === task.patientId);
  if (worklistItem) {
    worklistItem.activeTaskCount = state.tasks.filter(
      (item) => item.patientId === task.patientId && (item.status === 'open' || item.status === 'in_progress'),
    ).length;
    worklistItem.updatedAt = nowIso;
  }

  return task;
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
  const state = createInitialState(options);
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

    if (isPath(pathname, '/clinician/dashboard/summary') && method === 'GET') {
      await fulfillJson(route, 200, { ok: true, summary: deepClone(FIXTURE_DASHBOARD_SUMMARY) });
      return;
    }

    if (isPath(pathname, '/clinician/dashboard/priority-queue') && method === 'GET') {
      await fulfillJson(route, 200, { ok: true, items: deepClone(FIXTURE_DASHBOARD_PRIORITY_QUEUE) });
      return;
    }

    if (isPath(pathname, '/clinician/dashboard/recent-safety-events') && method === 'GET') {
      await fulfillJson(route, 200, { ok: true, items: deepClone(FIXTURE_DASHBOARD_SAFETY_EVENTS) });
      return;
    }

    if (isPath(pathname, '/clinician/dashboard/today-appointments') && method === 'GET') {
      await fulfillJson(route, 200, { ok: true, items: deepClone(FIXTURE_DASHBOARD_APPOINTMENTS) });
      return;
    }

    if (isPath(pathname, '/clinician/dashboard/follow-up-tasks') && method === 'GET') {
      await fulfillJson(route, 200, { ok: true, items: deepClone(FIXTURE_DASHBOARD_TASKS) });
      return;
    }

    if (isPath(pathname, '/clinician/dashboard/communication-overview') && method === 'GET') {
      await fulfillJson(route, 200, { ok: true, overview: deepClone(state.communicationOverview) });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/coordination') && method === 'GET') {
      const patientId = pathname.split('/')[3];
      if (!patientId) {
        await fulfillJson(route, 400, { ok: false, error: 'VALIDATION_ERROR' });
        return;
      }

      await fulfillJson(route, 200, {
        ok: true,
        coordination: deepClone(state.coordinationByPatient[patientId] ?? null),
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/coordination/notes') && method === 'POST') {
      const patientId = pathname.split('/')[3];
      const payload = request.postDataJSON() as { text?: string } | null;
      const noteText = payload?.text?.trim();

      if (!patientId || !noteText) {
        await fulfillJson(route, 400, { ok: false, error: 'VALIDATION_ERROR' });
        return;
      }

      const nowIso = new Date('2026-04-17T09:30:00.000Z').toISOString();
      const currentRecord = state.coordinationByPatient[patientId] ?? null;
      const nextRecord: ClinicianCoordinationRecord = {
        patientId,
        currentHandoff: currentRecord?.currentHandoff ?? null,
        noteHistory: [
          {
            id: `coord-note-${patientId}-${currentRecord?.noteHistory.length ?? 0}`,
            text: noteText,
            createdBy: {
              clinicianId: 'clinician-1',
              displayName: 'Clinician One',
            },
            createdAt: nowIso,
          },
          ...(currentRecord?.noteHistory ?? []),
        ],
        createdAt: currentRecord?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };

      state.coordinationByPatient[patientId] = nextRecord;
      await fulfillJson(route, 201, { ok: true, coordination: deepClone(nextRecord) });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/communication/events') && method === 'POST') {
      await fulfillJson(route, 201, { ok: true });
      return;
    }

    if (isPath(pathname, '/clinician/worklist') && method === 'GET') {
      let items = deepClone(state.worklistItems);
      const search = url.searchParams.get('search')?.trim().toLowerCase();

      if (search) {
        items = items.filter(
          (item) =>
            item.patientName.toLowerCase().includes(search) ||
            item.patientId.toLowerCase().includes(search),
        );
      }

      if (url.searchParams.get('highRiskOnly') === 'true') {
        items = items.filter((item) => item.latestRiskLevel === 'high');
      }

      if (url.searchParams.get('hasOpenAlerts') === 'true') {
        items = items.filter((item) => item.openAlertsCount > 0);
      }

      if (url.searchParams.get('needsResponse') === 'true') {
        items = items.filter((item) => item.communicationNeedsResponse);
      }

      if (url.searchParams.get('missedCheckins') === 'true') {
        items = items.filter((item) => item.missedCheckins.flag);
      }

      if (url.searchParams.get('assignedToMe') === 'true') {
        items = items.filter((item) => item.patientId === 'p1');
      }

      const status = url.searchParams.get('status');
      if (status) {
        items = items.filter((item) => item.patientStatus === status);
      }

      if (url.searchParams.get('sort') === 'patientName') {
        items.sort((left, right) => left.patientName.localeCompare(right.patientName));
      }

      await fulfillJson(route, 200, { ok: true, items, total: items.length });
      return;
    }

    if (isPath(pathname, '/clinician/tasks') && method === 'GET') {
      let items = deepClone(state.tasks);
      const patientId = url.searchParams.get('patientId');
      const statusValues = url.searchParams.get('status')?.split(',').filter(Boolean) ?? [];

      if (patientId) {
        items = items.filter((item) => item.patientId === patientId);
      }

      if (statusValues.length > 0) {
        items = items.filter((item) => statusValues.includes(item.status));
      }

      await fulfillJson(route, 200, { ok: true, tasks: items });
      return;
    }

    if (startsWithPath(pathname, '/clinician/tasks/') && pathname.endsWith('/complete') && method === 'POST') {
      const id = pathname.split('/')[3];
      if (!id) {
        await fulfillJson(route, 400, { ok: false, error: 'VALIDATION_ERROR' });
        return;
      }

      const task = applyTaskCompletion(state, id);
      if (!task) {
        await fulfillJson(route, 404, { ok: false, error: 'NOT_FOUND' });
        return;
      }

      await fulfillJson(route, 200, { ok: true, task: deepClone(task) });
      return;
    }

    if (isPath(pathname, '/clinician/appointments/requests') && method === 'GET') {
      let items = deepClone(state.appointmentRequests);
      const status = url.searchParams.get('status');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');

      if (status) {
        items = items.filter((item) => item.status === status);
      }
      if (from) {
        const fromTime = Date.parse(from);
        items = items.filter((item) => Date.parse(item.startsAt) >= fromTime);
      }
      if (to) {
        const toTime = Date.parse(to);
        items = items.filter((item) => Date.parse(item.startsAt) <= toTime);
      }

      await fulfillJson(route, 200, { ok: true, items });
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

  await page.route('**/auth/clinician/me', async (route) => {
    if (scenario === 'offline') {
      await route.abort('internetdisconnected');
      return;
    }

    await fulfillJson(route, 200, {
      ok: true,
      clinician: {
        id: 'clinician-1',
        email: 'clinician1@example.com',
        name: 'Clinician One',
        role: 'clinician',
      },
    });
  });

  return tracker;
}
