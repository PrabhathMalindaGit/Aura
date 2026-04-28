import type { Page, Route } from '@playwright/test';
import type {
  AlertItem,
  AlertStatus,
  AppointmentRequestItem,
  AppointmentSlot,
  CaregiverAccessItem,
  CheckinAdaptationDecision,
  CheckinAdaptationHistoryEntry,
  ClinicianCoordinationRecord,
  DashboardCommunicationOverview,
  ExercisePlan,
  ExerciseSessionListItem,
  InsightItem,
  PatientRecoverySupportConfig,
  PatientSummary,
  PatientThresholdConfig,
  PromDueCard,
  PromHistoryRow,
  RehabPayload,
  SafetyAuditEntry,
  SymptomPhotoItem,
  TrendPointRaw,
  InsightStatus,
} from '../../../src/types/models';
import {
  FIXTURE_ACK_ALERT,
  FIXTURE_ALERT_ID,
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
  FIXTURE_PATIENT_ID,
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
  alertsByStatus?: Record<AlertStatus, AlertItem[]>;
  insightsByStatus?: Record<InsightStatus, InsightItem[]>;
  exercisePlan?: ExercisePlan | null;
  patients?: PatientSummary[];
  appointmentRequests?: AppointmentRequestItem[];
  appointmentSlots?: AppointmentSlot[];
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
  insightsByStatus: Record<InsightStatus, InsightItem[]>;
  trendsByDays: Record<14 | 30, TrendPointRaw[]>;
  tasks: typeof FIXTURE_PATIENT_TASKS;
  worklistItems: typeof FIXTURE_WORKLIST_ITEMS;
  appointmentRequests: typeof FIXTURE_PATIENT_APPOINTMENT_REQUESTS;
  appointmentSlots: AppointmentSlot[];
  communicationOverview: DashboardCommunicationOverview;
  coordinationByPatient: Record<string, ClinicianCoordinationRecord | null>;
  exercisePlan: ExercisePlan | null;
  patients: PatientSummary[];
}

const DEFAULT_REHAB: RehabPayload = {
  currentKey: 'strength-control',
  phases: [
    {
      key: 'pain-calm',
      title: 'Pain calm',
      description: 'Reduce pain and restore daily rhythm.',
      order: 1,
      status: 'done',
      startedAt: '2026-04-14T07:00:00.000Z',
      completedAt: '2026-04-15T07:00:00.000Z',
    },
    {
      key: 'strength-control',
      title: 'Strength & Control',
      description: 'Progress tolerance and confidence.',
      order: 2,
      status: 'current',
      startedAt: '2026-04-16T07:00:00.000Z',
      completedAt: null,
    },
  ],
  updatedAt: '2026-04-17T08:30:00.000Z',
  updatedBy: {
    clinicianId: 'clinician-1',
    name: 'Clinician One',
  },
};

const DEFAULT_PROM_DUE: PromDueCard[] = [
  {
    id: 'prom-due-1',
    templateKey: 'AURA_RECOVERY_5',
    title: 'Aura Recovery 5',
    dueAt: '2026-04-17T12:00:00.000Z',
    status: 'due',
  },
];

const DEFAULT_PROM_HISTORY: PromHistoryRow[] = [
  {
    id: 'prom-history-1',
    templateKey: 'AURA_RECOVERY_5',
    title: 'Aura Recovery 5',
    completedAt: '2026-04-16T10:00:00.000Z',
    score: {
      normalized: 61,
      bandKey: 'amber',
      bandLabel: 'Amber',
    },
  },
];

const DEFAULT_PENDING_INSIGHTS: InsightItem[] = [
  {
    id: 'insight-1',
    patientId: FIXTURE_PATIENT_ID,
    status: 'pending',
    title: 'Pain trend worsened',
    message: 'Pain scores are rising again in the recent window.',
    category: 'symptoms',
    confidence: 'high',
    priority: 90,
    windowDays: 14,
    createdAt: '2026-04-17T08:35:00.000Z',
  },
];

const DEFAULT_APPROVED_INSIGHTS: InsightItem[] = [
  {
    id: 'insight-2',
    patientId: FIXTURE_PATIENT_ID,
    status: 'approved',
    title: 'Adherence stabilized',
    message: 'Exercise completion recovered over the last few check-ins.',
    category: 'adherence',
    confidence: 'medium',
    priority: 60,
    windowDays: 14,
    createdAt: '2026-04-16T08:35:00.000Z',
    reviewedAt: '2026-04-16T09:00:00.000Z',
  },
];

const DEFAULT_REJECTED_INSIGHTS: InsightItem[] = [
  {
    id: 'insight-3',
    patientId: FIXTURE_PATIENT_ID,
    status: 'rejected',
    title: 'Medication reminder review rejected',
    message: 'The current follow-up record already covers medication review for this window.',
    category: 'medications',
    confidence: 'low',
    priority: 10,
    windowDays: 7,
    createdAt: '2026-04-15T08:35:00.000Z',
    reviewedAt: '2026-04-15T09:10:00.000Z',
  },
];

const DEFAULT_APPOINTMENT_SLOTS: AppointmentSlot[] = [
  {
    slotId: 'slot-1',
    clinicianName: 'Clinician One',
    startsAt: FIXTURE_PATIENT_APPOINTMENT_REQUESTS[0]?.startsAt ?? '2026-04-18T13:00:00.000Z',
    endsAt: FIXTURE_PATIENT_APPOINTMENT_REQUESTS[0]?.endsAt ?? '2026-04-18T13:30:00.000Z',
    modality: FIXTURE_PATIENT_APPOINTMENT_REQUESTS[0]?.modality ?? 'video',
    status: 'available',
    meetingLink: 'https://meet.example.com/review-slot-1',
    createdAt: '2026-04-17T08:40:00.000Z',
  },
  {
    slotId: 'slot-closed-1',
    clinicianName: 'Clinician One',
    startsAt: '2026-04-19T09:00:00.000Z',
    endsAt: '2026-04-19T09:30:00.000Z',
    modality: 'video',
    status: 'closed',
    createdAt: '2026-04-17T08:50:00.000Z',
  },
];

const DEFAULT_EXERCISE_PLAN: ExercisePlan = {
  title: 'Recovery plan',
  timezone: 'UTC',
  daysOfWeek: [1, 3, 5],
  version: 3,
  updatedAt: '2026-04-17T08:20:00.000Z',
  updatedBy: {
    clinicianId: 'clinician-1',
    name: 'Clinician One',
  },
  items: [
    {
      key: 'bridge',
      name: 'Bridge',
      instructions: 'Lift hips with control and lower slowly.',
      sets: 3,
      reps: 8,
      intensity: 'moderate',
      order: 1,
    },
  ],
};

const DEFAULT_THRESHOLDS: PatientThresholdConfig = {
  patientId: FIXTURE_PATIENT_ID,
  painHighThreshold: 7,
  missedCheckinDays: 2,
  responseDelayHours: 8,
  safetyFlaggedResponseDelayHours: 2,
  version: 1,
  configured: true,
  updatedAt: '2026-04-17T08:15:00.000Z',
};

const DEFAULT_RECOVERY_SUPPORT: PatientRecoverySupportConfig = {
  patientId: FIXTURE_PATIENT_ID,
  checkinMode: 'adaptive',
  nudgesEnabled: true,
  rationale: 'Escalate when pain and missed check-ins rise together.',
  temporaryForceFullUntil: null,
  version: 1,
  configured: true,
  updatedAt: '2026-04-17T08:10:00.000Z',
};

const DEFAULT_ADAPTATION_DECISION: CheckinAdaptationDecision = {
  patientId: FIXTURE_PATIENT_ID,
  date: '2026-04-17',
  mode: 'expanded',
  decisionSource: 'adaptive_expanded',
  reasonCodes: ['high_pain'],
  reasonDetails: [
    {
      code: 'high_pain',
      label: 'High pain',
      category: 'safety',
    },
  ],
  clinicianSummary: 'Expanded check-in remains active because pain is high.',
  explanation: 'The full recovery context remains visible while symptoms are elevated.',
  configVersion: 1,
  thresholdVersion: 1,
  generatedAt: '2026-04-17T08:10:00.000Z',
  optionalSections: {
    recovery: true,
    support: true,
    dailyContext: true,
  },
};

const DEFAULT_ADAPTATION_HISTORY: CheckinAdaptationHistoryEntry[] = [
  {
    id: 'adaptation-1',
    recordedAt: '2026-04-17T08:10:00.000Z',
    surface: 'patient_checkin',
    decision: DEFAULT_ADAPTATION_DECISION,
  },
];

const DEFAULT_CAREGIVER_ACCESS: CaregiverAccessItem[] = [
  {
    inviteId: 'caregiver-1',
    relationship: 'Spouse',
    caregiverName: 'Morgan Moss',
    codeHint: 'MM-42',
    createdAt: '2026-04-16T09:30:00.000Z',
    expiresAt: '2026-04-18T09:30:00.000Z',
  },
];

const DEFAULT_SAFETY_EVENTS: SafetyAuditEntry[] = [
  {
    id: 'safety-1',
    patientId: FIXTURE_PATIENT_ID,
    alertId: FIXTURE_ALERT_ID,
    eventType: 'manual_review',
    summary: 'Safety review opened from the worklist.',
    occurredAt: '2026-04-17T08:05:00.000Z',
    actor: {
      clinicianId: 'clinician-1',
      name: 'Clinician One',
    },
  },
];

const DEFAULT_EXERCISE_SESSIONS: ExerciseSessionListItem[] = [
  {
    id: 'session-1',
    startedAt: '2026-04-17T07:00:00.000Z',
    durationSeconds: 720,
    exerciseCount: 4,
    completedCount: 3,
    avgPainDuring: 5,
    planTitle: 'Recovery plan',
  },
];

const DEFAULT_PHOTOS: SymptomPhotoItem[] = [
  {
    id: 'photo-1',
    date: '2026-04-17',
    kind: 'swelling',
    notePreview: 'Left knee swelling.',
    createdAt: '2026-04-17T08:00:00.000Z',
  },
];

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
    alertsByStatus: deepClone(options.alertsByStatus ?? FIXTURE_ALERTS_BY_STATUS),
    insightsByStatus: deepClone(
      options.insightsByStatus ?? {
        pending: [...DEFAULT_PENDING_INSIGHTS, {
          id: 'insight-4',
          patientId: FIXTURE_PATIENT_ID,
          status: 'pending',
          title: 'Routine recovery summary follow-up',
          message: 'A lighter-touch follow-up could confirm the current recovery trend.',
          category: 'recovery',
          confidence: 'low',
          priority: 1,
          windowDays: 14,
          createdAt: '2026-04-17T09:05:00.000Z',
        }],
        approved: DEFAULT_APPROVED_INSIGHTS,
        rejected: DEFAULT_REJECTED_INSIGHTS,
      },
    ),
    trendsByDays: {
      14: deepClone(FIXTURE_TRENDS_14),
      30: deepClone(FIXTURE_TRENDS_30),
    },
    tasks: deepClone(FIXTURE_PATIENT_TASKS),
    worklistItems: deepClone(FIXTURE_WORKLIST_ITEMS),
    patients: deepClone(options.patients ?? FIXTURE_PATIENTS),
    appointmentRequests: deepClone(options.appointmentRequests ?? FIXTURE_PATIENT_APPOINTMENT_REQUESTS),
    appointmentSlots: deepClone(options.appointmentSlots ?? DEFAULT_APPOINTMENT_SLOTS),
    communicationOverview: deepClone(options.communicationOverview ?? FIXTURE_DASHBOARD_COMMUNICATION),
    coordinationByPatient: deepClone(options.coordinationByPatient ?? DEFAULT_COORDINATION_BY_PATIENT),
    exercisePlan:
      options.exercisePlan === undefined
        ? deepClone(DEFAULT_EXERCISE_PLAN)
        : deepClone(options.exercisePlan),
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

function replaceAlertInState(state: MockState, updatedAlert: AlertItem): AlertItem {
  const statuses: AlertStatus[] = ['open', 'acknowledged', 'resolved'];
  for (const status of statuses) {
    state.alertsByStatus[status] = state.alertsByStatus[status].map((alert) =>
      alert._id === updatedAlert._id ? updatedAlert : alert,
    );
  }

  return updatedAlert;
}

function updateAlertAssignmentInState(
  state: MockState,
  id: string,
  payload: {
    assignedTo?: string | null;
    assignedToName?: string;
    force?: boolean;
  },
): AlertItem | undefined {
  void payload.force;

  const alert = findAlertById(state, id);
  if (!alert) {
    return undefined;
  }

  const nowIso = new Date('2026-02-22T10:10:00.000Z').toISOString();
  const updatedAlert: AlertItem = {
    ...alert,
    assignedTo: payload.assignedTo ?? undefined,
    assignedToName: payload.assignedTo ? payload.assignedToName ?? payload.assignedTo : undefined,
    assignedAt: payload.assignedTo ? nowIso : undefined,
    assignmentSource: payload.assignedTo ? 'manual' : undefined,
    updatedAt: nowIso,
  };

  return replaceAlertInState(state, updatedAlert);
}

function updateAlertRiskOverrideInState(
  state: MockState,
  id: string,
  payload: {
    riskFinal: string;
    overrideReason?: string;
    overriddenBy?: string;
    overriddenByName?: string;
  },
): AlertItem | undefined {
  const alert = findAlertById(state, id);
  if (!alert) {
    return undefined;
  }

  const nowIso = new Date('2026-02-22T10:15:00.000Z').toISOString();
  const updatedAlert: AlertItem = {
    ...alert,
    riskAuto: alert.riskAuto ?? alert.risk,
    riskFinal: payload.riskFinal,
    overrideReason: payload.overrideReason ?? 'Confirmed auto risk.',
    overriddenAt: nowIso,
    overriddenBy: payload.overriddenBy ?? 'clinician-1',
    overriddenByName: payload.overriddenByName ?? 'Clinician One',
    updatedAt: nowIso,
  };

  return replaceAlertInState(state, updatedAlert);
}

function clearAlertRiskOverrideInState(
  state: MockState,
  id: string,
): AlertItem | undefined {
  const alert = findAlertById(state, id);
  if (!alert) {
    return undefined;
  }

  const updatedAlert: AlertItem = {
    ...alert,
    riskFinal: undefined,
    overrideReason: undefined,
    overriddenAt: undefined,
    overriddenBy: undefined,
    overriddenByName: undefined,
  };

  return replaceAlertInState(state, updatedAlert);
}

function retryNotificationInState(
  state: MockState,
  id: string,
): AlertItem | undefined {
  const alert = findAlertById(state, id);
  if (!alert) {
    return undefined;
  }

  const nowIso = new Date('2026-02-22T10:20:00.000Z').toISOString();
  const updatedAlert: AlertItem = {
    ...alert,
    notificationStatus: 'unknown',
    notificationAttemptedAt: nowIso,
    notificationRetryCount: (alert.notificationRetryCount ?? 0) + 1,
    updatedAt: nowIso,
  };

  return replaceAlertInState(state, updatedAlert);
}

function reviewInsightInState(
  state: MockState,
  id: string,
  status: 'approved' | 'rejected',
): InsightItem | undefined {
  const source = state.insightsByStatus.pending.find((item) => item.id === id);
  if (!source) {
    return undefined;
  }

  const reviewedAt = new Date('2026-04-18T08:35:00.000Z').toISOString();
  const reviewedItem: InsightItem = {
    ...source,
    status,
    reviewedAt,
  };

  state.insightsByStatus.pending = state.insightsByStatus.pending.filter((item) => item.id !== id);
  state.insightsByStatus.approved = state.insightsByStatus.approved.filter((item) => item.id !== id);
  state.insightsByStatus.rejected = state.insightsByStatus.rejected.filter((item) => item.id !== id);
  state.insightsByStatus[status] = [reviewedItem, ...state.insightsByStatus[status]];

  return reviewedItem;
}

function reviewAppointmentRequestInState(
  state: MockState,
  requestId: string,
  status: 'approved' | 'rejected',
): AppointmentRequestItem | undefined {
  const source = state.appointmentRequests.find((item) => item.requestId === requestId);
  if (!source) {
    return undefined;
  }

  const reviewedAt = new Date('2026-04-18T08:45:00.000Z').toISOString();
  const reviewedItem: AppointmentRequestItem = {
    ...source,
    status,
    reviewedAt,
    updatedAt: reviewedAt,
  };

  state.appointmentRequests = [
    reviewedItem,
    ...state.appointmentRequests.filter((item) => item.requestId !== requestId),
  ];

  return reviewedItem;
}

function createAppointmentSlotInState(
  state: MockState,
  payload: { startsAt?: string; endsAt?: string; meetingLink?: string },
): AppointmentSlot {
  const createdAt = new Date('2026-04-18T08:50:00.000Z').toISOString();
  const slot: AppointmentSlot = {
    slotId: `slot-created-${state.appointmentSlots.length + 1}`,
    clinicianName: 'Clinician One',
    startsAt: payload.startsAt ?? createdAt,
    endsAt: payload.endsAt ?? createdAt,
    modality: 'video',
    meetingLink: payload.meetingLink,
    status: 'available',
    createdAt,
  };

  state.appointmentSlots = [slot, ...state.appointmentSlots];
  return slot;
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

    if (!startsWithPath(pathname, '/clinician/')) {
      await route.fallback();
      return;
    }

    tracker.requestLog.push({ method, pathname });

    if (scenario === 'offline') {
      await route.abort('internetdisconnected');
      return;
    }

    if (isPath(pathname, '/clinician/patients') && method === 'GET') {
      await fulfillJson(route, 200, { ok: true, patients: deepClone(state.patients) });
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

    if (startsWithPath(pathname, '/clinician/appointments/requests/') && method === 'PATCH') {
      const requestId = pathname.split('/')[4];
      const payload = request.postDataJSON() as { status?: 'approved' | 'rejected' } | null;
      if (!requestId || !payload?.status) {
        await fulfillJson(route, 400, { ok: false, error: 'VALIDATION_ERROR' });
        return;
      }

      const reviewedItem = reviewAppointmentRequestInState(state, requestId, payload.status);
      if (!reviewedItem) {
        await fulfillJson(route, 404, { ok: false, error: 'NOT_FOUND' });
        return;
      }

      await fulfillJson(route, 200, { ok: true, item: deepClone(reviewedItem) });
      return;
    }

    if (isPath(pathname, '/clinician/appointments/slots') && method === 'GET') {
      let items = deepClone(state.appointmentSlots);
      const status = url.searchParams.get('status');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');

      if (status) {
        items = items.filter((item) => (item.status ?? 'available') === status);
      }
      if (from) {
        const fromTime = Date.parse(from);
        items = items.filter((item) => Date.parse(item.startsAt) >= fromTime);
      }
      if (to) {
        const toTime = Date.parse(to);
        items = items.filter((item) => Date.parse(item.startsAt) < toTime);
      }

      await fulfillJson(route, 200, { ok: true, items });
      return;
    }

    if (isPath(pathname, '/clinician/appointments/slots') && method === 'POST') {
      const payload = (request.postDataJSON() as {
        startsAt?: string;
        endsAt?: string;
        meetingLink?: string;
      } | null) ?? {};
      const createdSlot = createAppointmentSlotInState(state, payload);
      await fulfillJson(route, 201, { ok: true, slot: deepClone(createdSlot) });
      return;
    }

    if (isPath(pathname, '/clinician/insights') && method === 'GET') {
      const status = (url.searchParams.get('status') ?? 'pending') as InsightStatus;
      const items = deepClone(state.insightsByStatus[status] ?? []);
      await fulfillJson(route, 200, { ok: true, items });
      return;
    }

    if (startsWithPath(pathname, '/clinician/insights/') && method === 'PATCH') {
      const insightId = pathname.split('/')[3];
      const payload = request.postDataJSON() as { status?: 'approved' | 'rejected' } | null;
      if (!insightId || !payload?.status) {
        await fulfillJson(route, 400, { ok: false, error: 'VALIDATION_ERROR' });
        return;
      }

      const reviewedInsight = reviewInsightInState(state, insightId, payload.status);
      if (!reviewedInsight) {
        await fulfillJson(route, 404, { ok: false, error: 'NOT_FOUND' });
        return;
      }

      await fulfillJson(route, 200, { ok: true, item: deepClone(reviewedInsight) });
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

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/checkins') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        checkins: deepClone(FIXTURE_TRENDS_14),
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/hydration/range') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        from: '2026-04-11',
        to: '2026-04-17',
        targetMl: 2000,
        days: [
          { date: '2026-04-16', totalMl: 1850, metTarget: false },
          { date: '2026-04-17', totalMl: 2100, metTarget: true },
        ],
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/nutrition/range') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        from: '2026-04-11',
        to: '2026-04-17',
        days: [
          {
            date: '2026-04-16',
            entry: {
              id: 'nutrition-1',
              date: '2026-04-16',
              protein: 'ok',
              fruitVegServings: 4,
              antiInflammatoryFocus: true,
              mealRegularity: 'mostly',
              createdAt: '2026-04-16T08:00:00.000Z',
            },
          },
        ],
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/wearables/summary') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        source: 'mock',
        from: '2026-04-11',
        to: '2026-04-17',
        trackedDays: 4,
        avgSteps: 5230,
        avgActiveMinutes: 34,
        avgRestingHr: 68,
        totalSteps: 20920,
        totalActiveMinutes: 136,
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/wearables/daily') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        source: 'mock',
        from: '2026-04-11',
        to: '2026-04-17',
        days: [
          { date: '2026-04-16', steps: 4800, activeMinutes: 28, restingHr: 69 },
          { date: '2026-04-17', steps: 5660, activeMinutes: 40, restingHr: 67 },
        ],
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/medications/adherence') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        from: '2026-04-11',
        to: '2026-04-17',
        days: [
          { date: '2026-04-16', taken: 2, skipped: 0, totalScheduled: 2 },
          { date: '2026-04-17', taken: 1, skipped: 1, totalScheduled: 2 },
        ],
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/photos') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        items: deepClone(DEFAULT_PHOTOS),
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/rehab-phases') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        rehab: deepClone(DEFAULT_REHAB),
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/proms') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        due: deepClone(DEFAULT_PROM_DUE),
        completed: deepClone(DEFAULT_PROM_HISTORY),
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/exercise-plan') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        plan: deepClone(state.exercisePlan),
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/thresholds') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        thresholds: deepClone(DEFAULT_THRESHOLDS),
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/recovery-support') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        recoverySupport: deepClone(DEFAULT_RECOVERY_SUPPORT),
        adaptationDecision: deepClone(DEFAULT_ADAPTATION_DECISION),
        adaptationHistory: deepClone(DEFAULT_ADAPTATION_HISTORY),
        recoveryNudge: null,
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/caregiver-access') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        items: deepClone(DEFAULT_CAREGIVER_ACCESS),
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/safety-events') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        items: deepClone(DEFAULT_SAFETY_EVENTS),
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/insights') && method === 'GET') {
      const status = url.searchParams.get('status');
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        items: deepClone(status === 'approved' ? DEFAULT_APPROVED_INSIGHTS : DEFAULT_PENDING_INSIGHTS),
      });
      return;
    }

    if (startsWithPath(pathname, '/clinician/patients/') && pathname.endsWith('/exercise-sessions') && method === 'GET') {
      await fulfillJson(route, 200, {
        ok: true,
        patientId: pathname.split('/')[3] ?? FIXTURE_PATIENT_ID,
        sessions: deepClone(DEFAULT_EXERCISE_SESSIONS),
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

    if (startsWithPath(pathname, '/clinician/alerts/') && pathname.endsWith('/assignment') && method === 'PATCH') {
      const id = pathname.split('/')[3];
      const payload = request.postDataJSON() as {
        assignedTo?: string | null;
        assignedToName?: string;
        force?: boolean;
      } | null;
      if (!id) {
        await fulfillJson(route, 400, { ok: false, error: 'VALIDATION_ERROR' });
        return;
      }

      const updatedAlert = updateAlertAssignmentInState(state, id, payload ?? {});
      if (!updatedAlert) {
        await fulfillJson(route, 404, { ok: false, error: 'NOT_FOUND' });
        return;
      }

      await fulfillJson(route, 200, { ok: true, alert: deepClone(updatedAlert) });
      return;
    }

    if (startsWithPath(pathname, '/clinician/alerts/') && pathname.endsWith('/risk-override') && method === 'PATCH') {
      const id = pathname.split('/')[3];
      const payload = request.postDataJSON() as {
        riskFinal?: string;
        overrideReason?: string;
        overriddenBy?: string;
        overriddenByName?: string;
      } | null;
      if (!id || !payload?.riskFinal) {
        await fulfillJson(route, 400, { ok: false, error: 'VALIDATION_ERROR' });
        return;
      }

      const updatedAlert = updateAlertRiskOverrideInState(state, id, payload as {
        riskFinal: string;
        overrideReason?: string;
        overriddenBy?: string;
        overriddenByName?: string;
      });
      if (!updatedAlert) {
        await fulfillJson(route, 404, { ok: false, error: 'NOT_FOUND' });
        return;
      }

      await fulfillJson(route, 200, { ok: true, alert: deepClone(updatedAlert) });
      return;
    }

    if (startsWithPath(pathname, '/clinician/alerts/') && pathname.endsWith('/risk-override') && method === 'DELETE') {
      const id = pathname.split('/')[3];
      if (!id) {
        await fulfillJson(route, 400, { ok: false, error: 'VALIDATION_ERROR' });
        return;
      }

      const updatedAlert = clearAlertRiskOverrideInState(state, id);
      if (!updatedAlert) {
        await fulfillJson(route, 404, { ok: false, error: 'NOT_FOUND' });
        return;
      }

      await fulfillJson(route, 200, { ok: true, alert: deepClone(updatedAlert) });
      return;
    }

    if (startsWithPath(pathname, '/clinician/alerts/') && pathname.endsWith('/retry-notification') && method === 'POST') {
      const id = pathname.split('/')[3];
      if (!id) {
        await fulfillJson(route, 400, { ok: false, error: 'VALIDATION_ERROR' });
        return;
      }

      const updatedAlert = retryNotificationInState(state, id);
      if (!updatedAlert) {
        await fulfillJson(route, 404, { ok: false, error: 'NOT_FOUND' });
        return;
      }

      await fulfillJson(route, 200, {
        ok: true,
        status: 'queued',
        alert: deepClone(updatedAlert),
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
