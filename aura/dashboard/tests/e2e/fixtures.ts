import type {
  AlertItem,
  DashboardCommunicationOverview,
  DashboardFollowUpTaskItem,
  DashboardPriorityQueueItem,
  DashboardSafetyEvent,
  DashboardSummary,
  DashboardTodayAppointmentItem,
  PatientSummary,
  TrendPointRaw,
  WorklistRecord,
} from '../../src/types/models';

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

export const FIXTURE_DASHBOARD_SUMMARY: DashboardSummary = {
  openAlertsCount: 1,
  assignedToMeAlertsCount: 1,
  pendingInsightsCount: 2,
  todayAppointmentsCount: 1,
  missedCheckinsCount: 1,
  openFollowUpTasksCount: 1,
  messagesNeedingResponseCount: 1,
};

export const FIXTURE_DASHBOARD_PRIORITY_QUEUE: DashboardPriorityQueueItem[] = [
  {
    id: 'queue-alert-1',
    itemType: 'alert',
    patientId: FIXTURE_PATIENT_ID,
    title: 'Assigned high-risk alert',
    subtitle: 'Pain escalation requires review',
    priority: 'high',
    status: 'open',
    source: 'checkin',
    createdAt: BASE_TIME_ISO,
    linkedEntityId: FIXTURE_ALERT_ID,
    linkedEntityType: 'alert',
  },
];

export const FIXTURE_DASHBOARD_SAFETY_EVENTS: DashboardSafetyEvent[] = [
  {
    id: 'event-1',
    type: 'NOTIFICATION_SENT',
    patientId: FIXTURE_PATIENT_ID,
    alertId: FIXTURE_ALERT_ID,
    createdAt: BASE_TIME_ISO,
    summary: 'Telegram escalation sent successfully.',
    alertStatus: 'open',
    notificationStatus: 'sent',
  },
];

export const FIXTURE_DASHBOARD_APPOINTMENTS: DashboardTodayAppointmentItem[] = [
  {
    id: 'appointment-1',
    patientId: FIXTURE_PATIENT_ID,
    clinicianId: 'clinician-1',
    startsAt: new Date(daysAgoDate(0).setUTCHours(13, 0, 0, 0)).toISOString(),
    endsAt: new Date(daysAgoDate(0).setUTCHours(13, 30, 0, 0)).toISOString(),
    status: 'awaiting_confirmation',
    requestStatus: 'pending',
    modality: 'video',
    note: 'Waiting for patient confirmation.',
    updatedAt: BASE_TIME_ISO,
  },
];

export const FIXTURE_DASHBOARD_TASKS: DashboardFollowUpTaskItem[] = [
  {
    id: 'task-1',
    patientId: FIXTURE_PATIENT_ID,
    title: 'Review safety escalation',
    priority: 'urgent',
    status: 'open',
    dueAt: BASE_TIME_ISO,
    type: 'safety_review',
    linkedAlertId: FIXTURE_ALERT_ID,
    updatedAt: BASE_TIME_ISO,
  },
];

export const FIXTURE_DASHBOARD_COMMUNICATION: DashboardCommunicationOverview = {
  counts: {
    needsResponseCount: 1,
    flaggedBySafetyCount: 1,
    followUpRequestedCount: 1,
  },
  items: [
    {
      id: 'communication-1',
      patientId: FIXTURE_PATIENT_ID,
      patientName: 'Patient P1',
      messageId: 'message-1',
      needsResponse: true,
      flaggedBySafety: true,
      followUpRequested: true,
      linkedTaskId: 'task-1',
      messageCreatedAt: BASE_TIME_ISO,
      messagePreview: 'Pain is much worse after exercise today.',
    },
  ],
};

export const FIXTURE_WORKLIST_ITEMS: WorklistRecord[] = [
  {
    patientId: FIXTURE_PATIENT_ID,
    patientName: 'Patient P1',
    patientStatus: 'active',
    rehabPhase: 'Strength & Control',
    lastCheckinAt: daysAgoDate(1).toISOString(),
    openAlertsCount: 1,
    latestRiskLevel: 'high',
    lastPainScore: 7,
    adherenceSummary: {
      exercisesPct: 0.4,
      medicationTaken: false,
    },
    nextAppointmentAt: new Date(daysAgoDate(0).setUTCHours(13, 0, 0, 0)).toISOString(),
    missedCheckins: {
      flag: false,
      count: 0,
    },
    communicationNeedsResponse: true,
    activeTaskCount: 1,
    topIssue: 'High pain escalation',
    reviewReason: 'Patient communication and safety review both need follow-up.',
    priorityScore: 90,
    updatedAt: BASE_TIME_ISO,
  },
  {
    patientId: 'p2',
    patientName: 'Patient P2',
    patientStatus: 'on_hold',
    rehabPhase: 'Return to mobility',
    lastCheckinAt: daysAgoDate(5).toISOString(),
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
    topIssue: 'Missed daily check-ins',
    reviewReason: 'Follow-up before the next rehab step is recommended.',
    priorityScore: 48,
    updatedAt: BASE_TIME_ISO,
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
