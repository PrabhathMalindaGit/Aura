/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonResponse } from '../../../test/mocks';
import {
  resetPatientWorkspaceUiStore,
} from '../../state/usePatientWorkspaceUiStore';
import { createPatientEntryState } from '../../../utils/patientEntryContext';
import type {
  AlertItem,
  AppointmentRequestItem,
  CaregiverAccessItem,
  CheckinAdaptationDecision,
  CheckinAdaptationHistoryEntry,
  ClinicianCoordinationRecord,
  ClinicianTaskItem,
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
  WorklistRecord,
} from '../../../types/models';
import { usePatientWorkspaceViewModel } from './usePatientWorkspaceViewModel';

const PATIENT_ID = 'patient-1';
const TODAY = '2026-04-17';

const PATIENTS: PatientSummary[] = [
  {
    id: PATIENT_ID,
    displayName: 'Taylor Moss',
    status: 'active',
    lastCheckinAt: `${TODAY}T08:00:00.000Z`,
    openAlertCount: 1,
    lastPain: 8,
  },
];

const ALERTS: AlertItem[] = [
  {
    _id: 'alert-1',
    patientId: PATIENT_ID,
    risk: 'high',
    reason: 'Escalating pain',
    source: { type: 'checkin', sourceId: 'checkin-1' },
    status: 'open',
    createdAt: `${TODAY}T09:00:00.000Z`,
    updatedAt: `${TODAY}T09:00:00.000Z`,
  },
];

const TASKS: ClinicianTaskItem[] = [
  {
    id: 'task-1',
    patientId: PATIENT_ID,
    title: 'Check medication adherence',
    type: 'follow_up',
    priority: 'high',
    status: 'open',
    dueAt: `${TODAY}T16:00:00.000Z`,
    createdAt: `${TODAY}T08:30:00.000Z`,
    updatedAt: `${TODAY}T08:30:00.000Z`,
  },
  {
    id: 'task-2',
    patientId: PATIENT_ID,
    title: 'Confirm home exercise reminder',
    type: 'communication',
    priority: 'medium',
    status: 'completed',
    dueAt: `${TODAY}T10:00:00.000Z`,
    completedAt: `${TODAY}T09:15:00.000Z`,
    createdAt: `${TODAY}T07:30:00.000Z`,
    updatedAt: `${TODAY}T09:15:00.000Z`,
  },
];

const APPOINTMENTS: AppointmentRequestItem[] = [
  {
    requestId: 'appointment-1',
    slotId: 'slot-1',
    patientId: PATIENT_ID,
    status: 'pending',
    workflowStatus: 'awaiting_confirmation',
    startsAt: `${TODAY}T14:00:00.000Z`,
    endsAt: `${TODAY}T14:30:00.000Z`,
    modality: 'video',
    createdAt: `${TODAY}T07:00:00.000Z`,
    updatedAt: `${TODAY}T07:15:00.000Z`,
  },
];

const WORKLIST_ITEMS: WorklistRecord[] = [
  {
    patientId: PATIENT_ID,
    patientName: 'Taylor Moss',
    patientStatus: 'active',
    rehabPhase: 'Strength & Control',
    lastCheckinAt: `${TODAY}T08:00:00.000Z`,
    openAlertsCount: 1,
    latestRiskLevel: 'high',
    lastPainScore: 8,
    adherenceSummary: {
      exercisesPct: 0.42,
      medicationTaken: false,
    },
    nextAppointmentAt: APPOINTMENTS[0].startsAt,
    missedCheckins: {
      flag: true,
      count: 2,
    },
    communicationNeedsResponse: true,
    activeTaskCount: 1,
    proms: {
      dueCount: 1,
      overdueCount: 1,
      nextDueAt: `${TODAY}T06:00:00.000Z`,
    },
    topIssue: 'High pain escalation',
    reviewReason: 'Pain spike, missed check-ins, and a delayed message all need follow-up.',
    priorityScore: 91,
    updatedAt: `${TODAY}T09:10:00.000Z`,
  },
];

const COMMUNICATION_OVERVIEW: DashboardCommunicationOverview = {
  counts: {
    needsResponseCount: 1,
    flaggedBySafetyCount: 0,
    followUpRequestedCount: 1,
  },
  items: [
    {
      id: 'comm-1',
      patientId: PATIENT_ID,
      patientName: 'Taylor Moss',
      messageId: 'message-1',
      needsResponse: true,
      flaggedBySafety: false,
      followUpRequested: true,
      linkedTaskId: 'task-1',
      messageCreatedAt: `${TODAY}T08:40:00.000Z`,
      messagePreview: 'Pain is much worse after exercise today.',
      patientRiskLevel: 'high',
      openAlertCount: 1,
      lastCheckinAt: `${TODAY}T08:00:00.000Z`,
      lastPainScore: 8,
      responseState: 'delayed',
      responseDueAt: `${TODAY}T09:00:00.000Z`,
      responseDelayed: true,
      responseDelayHours: 8,
      reviewedAfterLatestInbound: false,
    },
  ],
};

const COORDINATION: ClinicianCoordinationRecord = {
  patientId: PATIENT_ID,
  currentHandoff: {
    summary: 'Shared coordination summary for the next clinician.',
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
      dueAt: `${TODAY}T16:00:00.000Z`,
      assignedTo: 'Clinician One',
      updatedAt: `${TODAY}T09:05:00.000Z`,
    },
    updatedBy: {
      clinicianId: 'clinician-1',
      displayName: 'Clinician One',
    },
    updatedAt: `${TODAY}T09:05:00.000Z`,
  },
  noteHistory: [
    {
      id: 'coord-note-1',
      text: 'Shared coordination note for this patient.',
      createdBy: {
        clinicianId: 'clinician-1',
        displayName: 'Clinician One',
      },
      createdAt: `${TODAY}T09:06:00.000Z`,
    },
  ],
  createdAt: `${TODAY}T09:00:00.000Z`,
  updatedAt: `${TODAY}T09:06:00.000Z`,
};

const REHAB: RehabPayload = {
  currentKey: 'strength-control',
  phases: [
    {
      key: 'pain-calm',
      title: 'Pain calm',
      description: 'Reduce pain and re-establish daily rhythm.',
      order: 1,
      status: 'done',
      startedAt: `${TODAY}T06:00:00.000Z`,
      completedAt: `${TODAY}T07:00:00.000Z`,
    },
    {
      key: 'strength-control',
      title: 'Strength & Control',
      description: 'Progress strength and movement confidence.',
      order: 2,
      status: 'current',
      startedAt: `${TODAY}T07:30:00.000Z`,
      completedAt: null,
    },
  ],
  updatedAt: `${TODAY}T09:20:00.000Z`,
  updatedBy: {
    clinicianId: 'clinician-1',
    name: 'Clinician One',
  },
};

const PROM_DUE: PromDueCard[] = [
  {
    id: 'prom-due-1',
    templateKey: 'AURA_RECOVERY_5',
    title: 'Aura Recovery 5',
    dueAt: `${TODAY}T11:00:00.000Z`,
    status: 'due',
  },
];

const PROM_HISTORY: PromHistoryRow[] = [
  {
    id: 'prom-completed-1',
    templateKey: 'AURA_RECOVERY_5',
    title: 'Aura Recovery 5',
    completedAt: `${TODAY}T07:40:00.000Z`,
    score: {
      normalized: 62,
      bandKey: 'amber',
      bandLabel: 'Amber',
    },
  },
];

const PENDING_INSIGHTS: InsightItem[] = [
  {
    id: 'insight-1',
    patientId: PATIENT_ID,
    status: 'pending',
    title: 'Pain trend worsened',
    message: 'Pain scores have risen over the last week.',
    category: 'symptoms',
    confidence: 'high',
    priority: 90,
    windowDays: 14,
    createdAt: `${TODAY}T09:10:00.000Z`,
  },
];

const APPROVED_INSIGHTS: InsightItem[] = [
  {
    id: 'insight-2',
    patientId: PATIENT_ID,
    status: 'approved',
    title: 'Adherence stabilized',
    message: 'Exercise adherence recovered over the past five days.',
    category: 'adherence',
    confidence: 'medium',
    priority: 60,
    windowDays: 14,
    createdAt: `${TODAY}T08:10:00.000Z`,
    reviewedAt: `${TODAY}T08:20:00.000Z`,
  },
];

const PATIENT_PLAN: ExercisePlan = {
  title: 'Recovery plan',
  timezone: 'UTC',
  daysOfWeek: [1, 3, 5],
  version: 3,
  updatedAt: `${TODAY}T08:45:00.000Z`,
  updatedBy: {
    clinicianId: 'clinician-1',
    name: 'Clinician One',
  },
  items: [
    {
      key: 'bridge',
      name: 'Bridge',
      instructions: 'Lift hips slowly and lower with control.',
      sets: 3,
      reps: 8,
      intensity: 'moderate',
      order: 1,
    },
  ],
};

const THRESHOLDS: PatientThresholdConfig = {
  patientId: PATIENT_ID,
  painHighThreshold: 7,
  missedCheckinDays: 2,
  responseDelayHours: 8,
  safetyFlaggedResponseDelayHours: 2,
  rationale: 'Use conservative safety thresholds.',
  version: 1,
  configured: true,
  updatedAt: `${TODAY}T08:50:00.000Z`,
};

const ADAPTATION_DECISION: CheckinAdaptationDecision = {
  patientId: PATIENT_ID,
  date: TODAY,
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
  explanation: 'The patient still needs the full recovery context while symptoms settle.',
  configVersion: 1,
  thresholdVersion: 1,
  generatedAt: `${TODAY}T08:55:00.000Z`,
  optionalSections: {
    recovery: true,
    support: true,
    dailyContext: true,
  },
};

const ADAPTATION_HISTORY: CheckinAdaptationHistoryEntry[] = [
  {
    id: 'adaptation-1',
    recordedAt: `${TODAY}T08:55:00.000Z`,
    surface: 'patient_checkin',
    decision: ADAPTATION_DECISION,
  },
];

const RECOVERY_SUPPORT: PatientRecoverySupportConfig = {
  patientId: PATIENT_ID,
  checkinMode: 'adaptive',
  nudgesEnabled: true,
  rationale: 'Escalate when pain and missed check-ins rise together.',
  temporaryForceFullUntil: null,
  version: 1,
  configured: true,
  updatedAt: `${TODAY}T08:55:00.000Z`,
};

const CAREGIVER_ACCESS: CaregiverAccessItem[] = [
  {
    inviteId: 'caregiver-1',
    relationship: 'Spouse',
    caregiverName: 'Morgan Moss',
    codeHint: 'MM-42',
    createdAt: `${TODAY}T07:10:00.000Z`,
    expiresAt: `${TODAY}T19:10:00.000Z`,
  },
];

const SAFETY_EVENTS: SafetyAuditEntry[] = [
  {
    id: 'safety-1',
    patientId: PATIENT_ID,
    alertId: 'alert-1',
    eventType: 'manual_review',
    summary: 'Safety review opened from worklist.',
    occurredAt: `${TODAY}T09:02:00.000Z`,
    actor: {
      clinicianId: 'clinician-1',
      name: 'Clinician One',
    },
  },
];

const SESSIONS: ExerciseSessionListItem[] = [
  {
    id: 'session-1',
    startedAt: `${TODAY}T06:30:00.000Z`,
    durationSeconds: 720,
    exerciseCount: 4,
    completedCount: 3,
    avgPainDuring: 5,
    planTitle: 'Recovery plan',
  },
];

const TRENDS_14: TrendPointRaw[] = [
  {
    date: '2026-04-16',
    pain: 6,
    mood: 4,
    adherence: { exercises: 0.5, medication: true },
    sleep: { hours: 7, quality: 4, disturbances: 1 },
    notes: 'Soreness after exercises.',
  },
  {
    date: '2026-04-17',
    pain: 8,
    mood: 3,
    adherence: { exercises: 0.4, medication: false },
    sleep: { hours: 6, quality: 3, disturbances: 2 },
    notes: 'Pain worsened today.',
  },
];

const TRENDS_30: TrendPointRaw[] = [
  {
    date: '2026-04-03',
    pain: 4,
    mood: 5,
    adherence: { exercises: 0.8, medication: true },
    sleep: { hours: 7, quality: 4, disturbances: 1 },
  },
  ...TRENDS_14,
];

const PHOTOS: SymptomPhotoItem[] = [
  {
    id: 'photo-1',
    date: '2026-04-17',
    kind: 'swelling',
    notePreview: 'Left knee swelling.',
    createdAt: `${TODAY}T08:20:00.000Z`,
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

interface FetchTracker {
  requestLog: Array<{ method: string; pathname: string; search: string }>;
  trendDaysCalls: number[];
}

function installPatientWorkspaceFetchMock(): FetchTracker {
  const tracker: FetchTracker = {
    requestLog: [],
    trendDaysCalls: [],
  };

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';

    tracker.requestLog.push({
      method,
      pathname: url.pathname,
      search: url.search,
    });

    if (url.pathname === '/clinician/patients') {
      return createJsonResponse({ ok: true, patients: PATIENTS });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/coordination`) {
      return createJsonResponse({ ok: true, coordination: COORDINATION });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/communication/events`) {
      return createJsonResponse({ ok: true }, 201);
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/trends`) {
      const days = url.searchParams.get('days') === '30' ? 30 : 14;
      tracker.trendDaysCalls.push(days);
      return createJsonResponse({
        ok: true,
        trends: days === 30 ? TRENDS_30 : TRENDS_14,
      });
    }

    if (url.pathname === '/clinician/alerts') {
      const status = url.searchParams.get('status') ?? 'open';
      return createJsonResponse({
        ok: true,
        alerts: status === 'open' ? ALERTS : [],
      });
    }

    if (url.pathname === '/clinician/worklist') {
      return createJsonResponse({
        ok: true,
        items: WORKLIST_ITEMS,
        total: WORKLIST_ITEMS.length,
      });
    }

    if (url.pathname === '/clinician/dashboard/communication-overview') {
      return createJsonResponse({
        ok: true,
        overview: COMMUNICATION_OVERVIEW,
      });
    }

    if (url.pathname === '/clinician/tasks') {
      const statusFilter = url.searchParams.get('status');
      const filtered = !statusFilter
        ? TASKS
        : TASKS.filter((task) => statusFilter.split(',').includes(task.status));
      return createJsonResponse({
        ok: true,
        tasks: filtered,
      });
    }

    if (url.pathname === '/clinician/appointments/requests') {
      return createJsonResponse({
        ok: true,
        items: APPOINTMENTS,
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/rehab-phases`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        rehab: REHAB,
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/proms`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        due: PROM_DUE,
        completed: PROM_HISTORY,
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/exercise-plan`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        plan: PATIENT_PLAN,
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/thresholds`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        thresholds: THRESHOLDS,
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/recovery-support`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        recoverySupport: RECOVERY_SUPPORT,
        adaptationDecision: ADAPTATION_DECISION,
        adaptationHistory: ADAPTATION_HISTORY,
        recoveryNudge: null,
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/caregiver-access`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        items: CAREGIVER_ACCESS,
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/safety-events`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        items: SAFETY_EVENTS,
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/insights`) {
      const status = url.searchParams.get('status');
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        items: status === 'approved' ? APPROVED_INSIGHTS : PENDING_INSIGHTS,
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/exercise-sessions`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        sessions: SESSIONS,
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/checkins`) {
      return createJsonResponse({
        ok: true,
        checkins: TRENDS_14,
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/hydration/range`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        from: '2026-04-11',
        to: TODAY,
        targetMl: 2000,
        days: [
          { date: '2026-04-16', totalMl: 1850, metTarget: false },
          { date: '2026-04-17', totalMl: 2100, metTarget: true },
        ],
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/nutrition/range`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        from: '2026-04-11',
        to: TODAY,
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
              createdAt: `${TODAY}T08:00:00.000Z`,
            },
          },
        ],
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/wearables/summary`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        source: 'mock',
        from: '2026-04-11',
        to: TODAY,
        trackedDays: 4,
        avgSteps: 5230,
        avgActiveMinutes: 34,
        avgRestingHr: 68,
        totalSteps: 20920,
        totalActiveMinutes: 136,
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/wearables/daily`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        source: 'mock',
        from: '2026-04-11',
        to: TODAY,
        days: [
          { date: '2026-04-16', steps: 4800, activeMinutes: 28, restingHr: 69 },
          { date: '2026-04-17', steps: 5660, activeMinutes: 40, restingHr: 67 },
        ],
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/medications/adherence`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        from: '2026-04-11',
        to: TODAY,
        days: [
          { date: '2026-04-16', taken: 2, skipped: 0, totalScheduled: 2 },
          { date: '2026-04-17', taken: 1, skipped: 1, totalScheduled: 2 },
        ],
      });
    }

    if (url.pathname === `/clinician/patients/${PATIENT_ID}/photos`) {
      return createJsonResponse({
        ok: true,
        patientId: PATIENT_ID,
        items: PHOTOS,
      });
    }

    return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
  });

  return tracker;
}

function createWrapper(initialEntry: string | { pathname: string; search?: string; state?: unknown }): ({ children }: { children: ReactNode }) => JSX.Element {
  const queryClient = createQueryClient();
  const entries = [typeof initialEntry === 'string' ? initialEntry : initialEntry];

  function RouteHarness({ children }: { children: ReactNode }): JSX.Element {
    return <>{children}</>;
  }

  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={entries}>
          <Routes>
            <Route path="/patients/:patientId/*" element={<RouteHarness>{children}</RouteHarness>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('usePatientWorkspaceViewModel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('aura_access_token', 'TEST_TOKEN');
    resetPatientWorkspaceUiStore();
  });

  afterEach(() => {
    resetPatientWorkspaceUiStore();
  });

  it('treats /patients/:patientId as an overview alias and preserves patient-entry context in the header', async () => {
    installPatientWorkspaceFetchMock();

    const { result } = renderHook(
      () => usePatientWorkspaceViewModel(),
      {
        wrapper: createWrapper({
          pathname: `/patients/${PATIENT_ID}`,
          search: '?days=14',
          state: createPatientEntryState({
            patientId: PATIENT_ID,
            source: 'worklist',
            focus: 'workflow',
            returnTo: '/worklist',
            hint: 'Pain escalation review',
          }),
        }),
      },
    );

    await waitFor(() => {
      expect(result.current.patientDisplayName).toBe('Taylor Moss');
      expect(result.current.activeTab).toBe('overview');
    });

    expect(result.current.header.returnTo).toBe('/worklist');
    expect(result.current.header.returnLabel).toBe('Return to Worklist');
    expect(result.current.header.sourceCue).toBe('Opened from Worklist');
    expect(result.current.selectedDays).toBe(14);
  });

  it('preserves dashboard entry context so the workspace can return to service analytics', async () => {
    installPatientWorkspaceFetchMock();

    const { result } = renderHook(
      () => usePatientWorkspaceViewModel(),
      {
        wrapper: createWrapper({
          pathname: `/patients/${PATIENT_ID}`,
          state: createPatientEntryState({
            patientId: PATIENT_ID,
            source: 'dashboard',
            focus: 'workflow',
            returnTo: '/dashboard',
          }),
        }),
      },
    );

    await waitFor(() => {
      expect(result.current.patientDisplayName).toBe('Taylor Moss');
      expect(result.current.activeTab).toBe('overview');
    });

    expect(result.current.header.returnTo).toBe('/dashboard');
    expect(result.current.header.returnLabel).toBe('Return to Dashboard');
    expect(result.current.header.sourceCue).toBe('Opened from Dashboard');
  });

  it('preserves patients-roster entry context so the workspace can return to the roster', async () => {
    installPatientWorkspaceFetchMock();

    const { result } = renderHook(
      () => usePatientWorkspaceViewModel(),
      {
        wrapper: createWrapper({
          pathname: `/patients/${PATIENT_ID}`,
          search: '?days=14',
          state: createPatientEntryState({
            patientId: PATIENT_ID,
            source: 'patients',
            subtype: 'roster',
            focus: 'roster',
            returnTo: '/patients?search=Taylor',
          }),
        }),
      },
    );

    await waitFor(() => {
      expect(result.current.patientDisplayName).toBe('Taylor Moss');
      expect(result.current.activeTab).toBe('overview');
    });

    expect(result.current.header.returnTo).toBe('/patients?search=Taylor');
    expect(result.current.header.returnLabel).toBe('Return to Patients');
    expect(result.current.header.sourceCue).toBe('Opened from Patients roster');
  });

  it('preserves selective query-bucket loading for direct history routes', async () => {
    const tracker = installPatientWorkspaceFetchMock();

    const { result } = renderHook(
      () => usePatientWorkspaceViewModel(),
      { wrapper: createWrapper(`/patients/${PATIENT_ID}/history?days=30`) },
    );

    await waitFor(() => {
      expect(result.current.activeTab).toBe('history');
      expect(result.current.history.summaryItems.length).toBeGreaterThan(0);
    });

    expect(result.current.selectedDays).toBe(30);
    expect(tracker.trendDaysCalls).toContain(30);
    expect(tracker.requestLog.some((request) => request.pathname === `/clinician/patients/${PATIENT_ID}/checkins`)).toBe(true);
    expect(tracker.requestLog.some((request) => request.pathname === `/clinician/patients/${PATIENT_ID}/hydration/range`)).toBe(true);
    expect(tracker.requestLog.some((request) => request.pathname === '/clinician/dashboard/communication-overview')).toBe(false);
    expect(tracker.requestLog.some((request) => request.pathname === '/clinician/tasks')).toBe(false);
    expect(tracker.requestLog.some((request) => request.pathname === '/clinician/appointments/requests')).toBe(true);
    expect(tracker.requestLog.some((request) => request.pathname === `/clinician/patients/${PATIENT_ID}/rehab-phases`)).toBe(false);
    expect(tracker.requestLog.some((request) => request.pathname === `/clinician/patients/${PATIENT_ID}/insights`)).toBe(false);
  });

  it('keeps patient quick replies local/private and separate from shared coordination', async () => {
    const tracker = installPatientWorkspaceFetchMock();

    const { result } = renderHook(
      () => usePatientWorkspaceViewModel(),
      { wrapper: createWrapper(`/patients/${PATIENT_ID}/communications`) },
    );

    await waitFor(() => {
      expect(result.current.activeTab).toBe('communications');
      expect(result.current.communicationItems).toHaveLength(1);
    });

    act(() => {
      result.current.setPatientQuickReply('Keep monitoring tonight and check pain again tomorrow.');
    });

    await waitFor(() => {
      expect(result.current.patientQuickReply).toContain('Keep monitoring tonight');
    });

    act(() => {
      result.current.handlePatientQuickReply();
    });

    await waitFor(() => {
      expect(result.current.patientQuickReply).toBe('');
      expect(
        result.current.communicationTimeline.some(
          (event) =>
            event.kind === 'clinician-reply' &&
            event.localOnly &&
            event.preview.includes('Keep monitoring tonight'),
        ),
      ).toBe(true);
    });

    expect(
      tracker.requestLog.some((request) => request.pathname === `/clinician/patients/${PATIENT_ID}/coordination/notes` && request.method === 'POST'),
    ).toBe(false);
  });

  it('updates the review window from route state instead of local-only tab state', async () => {
    const tracker = installPatientWorkspaceFetchMock();

    const { result } = renderHook(
      () => usePatientWorkspaceViewModel(),
      { wrapper: createWrapper(`/patients/${PATIENT_ID}/overview?days=14`) },
    );

    await waitFor(() => {
      expect(result.current.selectedDays).toBe(14);
    });

    act(() => {
      result.current.setSelectedDays(30);
    });

    await waitFor(() => {
      expect(result.current.selectedDays).toBe(30);
    });

    expect(tracker.trendDaysCalls).toContain(14);
    expect(tracker.trendDaysCalls).toContain(30);
  });
});
