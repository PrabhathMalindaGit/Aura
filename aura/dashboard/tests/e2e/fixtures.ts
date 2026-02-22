import type { AlertItem, PatientSummary, TrendPointRaw } from '../../src/types/models';

const BASE_TIME_ISO = '2026-02-22T10:00:00.000Z';

export const FIXTURE_PATIENT_ID = 'p1';
export const FIXTURE_ALERT_ID = 'a1';
export const FIXTURE_DAY_DRILLDOWN_DATE = '2026-02-18';

export const FIXTURE_PATIENTS: PatientSummary[] = [
  {
    id: FIXTURE_PATIENT_ID,
    displayName: 'Patient P1',
    status: 'active',
    openAlertCount: 1,
    lastCheckinAt: '2026-02-21T08:00:00.000Z',
    lastPain: 7,
  },
];

export const FIXTURE_OPEN_ALERT: AlertItem = {
  _id: FIXTURE_ALERT_ID,
  patientId: FIXTURE_PATIENT_ID,
  risk: 'high',
  reason: ['PAIN_GE_THRESHOLD'],
  source: {
    type: 'checkin',
    sourceId: 'checkin-001',
  },
  status: 'open',
  createdAt: '2026-02-22T09:58:00.000Z',
  updatedAt: '2026-02-22T09:58:00.000Z',
  notificationChannel: 'telegram',
  notificationStatus: 'unknown',
};

export const FIXTURE_ACK_ALERT: AlertItem = {
  ...FIXTURE_OPEN_ALERT,
  status: 'acknowledged',
  updatedAt: BASE_TIME_ISO,
  acknowledgedAt: BASE_TIME_ISO,
};

export const FIXTURE_RESOLVED_ALERT: AlertItem = {
  ...FIXTURE_OPEN_ALERT,
  status: 'resolved',
  updatedAt: BASE_TIME_ISO,
  resolvedAt: BASE_TIME_ISO,
};

export const FIXTURE_ALERTS_BY_STATUS: Record<'open' | 'acknowledged' | 'resolved', AlertItem[]> = {
  open: [FIXTURE_OPEN_ALERT],
  acknowledged: [],
  resolved: [],
};

export const FIXTURE_TRENDS_14: TrendPointRaw[] = [
  {
    date: '2026-02-10',
    pain: 5,
    mood: 3,
    adherence: { exercises: 0.4, medication: true },
  },
  {
    date: '2026-02-12',
    pain: 7,
    mood: 2,
    adherence: { exercises: 0.2, medication: false },
  },
  {
    date: FIXTURE_DAY_DRILLDOWN_DATE,
    pain: 6,
    mood: 3,
    adherence: { exercises: 0.7, medication: true },
    notes: 'Synthetic note for deterministic testing.',
  },
  {
    date: '2026-02-21',
    pain: 4,
    mood: 4,
    adherence: { exercises: 0.8, medication: true },
  },
];

export const FIXTURE_TRENDS_30: TrendPointRaw[] = [
  {
    date: '2026-01-26',
    pain: 8,
    mood: 2,
    adherence: { exercises: 0.2, medication: false },
  },
  {
    date: '2026-01-30',
    pain: 7,
    mood: 3,
    adherence: { exercises: 0.3, medication: true },
  },
  ...FIXTURE_TRENDS_14,
];
