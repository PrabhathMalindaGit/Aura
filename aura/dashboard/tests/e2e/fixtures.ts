import type { AlertItem, PatientSummary, TrendPointRaw } from '../../src/types/models';

function daysAgoDate(days: number): Date {
  const value = new Date();
  value.setUTCHours(10, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() - days);
  return value;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const BASE_TIME_ISO = daysAgoDate(0).toISOString();

export const FIXTURE_PATIENT_ID = 'p1';
export const FIXTURE_ALERT_ID = 'a1';
export const FIXTURE_DAY_DRILLDOWN_DATE = isoDate(daysAgoDate(2));

export const FIXTURE_PATIENTS: PatientSummary[] = [
  {
    id: FIXTURE_PATIENT_ID,
    displayName: 'Patient P1',
    status: 'active',
    openAlertCount: 1,
    lastCheckinAt: daysAgoDate(1).toISOString(),
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
  createdAt: new Date(daysAgoDate(0).getTime() - 2 * 60 * 1000).toISOString(),
  updatedAt: new Date(daysAgoDate(0).getTime() - 2 * 60 * 1000).toISOString(),
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
    date: isoDate(daysAgoDate(12)),
    pain: 5,
    mood: 3,
    adherence: { exercises: 0.4, medication: true },
  },
  {
    date: isoDate(daysAgoDate(9)),
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
    date: isoDate(daysAgoDate(1)),
    pain: 4,
    mood: 4,
    adherence: { exercises: 0.8, medication: true },
  },
];

export const FIXTURE_TRENDS_30: TrendPointRaw[] = [
  {
    date: isoDate(daysAgoDate(26)),
    pain: 8,
    mood: 2,
    adherence: { exercises: 0.2, medication: false },
  },
  {
    date: isoDate(daysAgoDate(20)),
    pain: 7,
    mood: 3,
    adherence: { exercises: 0.3, medication: true },
  },
  ...FIXTURE_TRENDS_14,
];
