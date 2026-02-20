export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface AlertSource {
  type: 'checkin' | 'chat';
  sourceId: string;
}

export interface AlertItem {
  _id: string;
  patientId: string;
  risk: 'high' | 'low' | 'medium' | string;
  reason: string | string[];
  source: AlertSource;
  status: AlertStatus;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  seenAt?: string;
  seenBy?: string[];
  assignedTo?: string;
  assignedToName?: string;
  assignedAt?: string;
  assignmentSource?: 'manual' | 'auto';
  assignmentNote?: string;
  notificationChannel?: 'telegram' | 'email' | 'slack' | 'sms' | 'none';
  notificationStatus?: 'sent' | 'failed' | 'skipped' | 'unknown';
  notificationAttemptedAt?: string;
  notificationSentAt?: string;
  notificationFailedAt?: string;
  notificationError?: string;
  notificationMessageId?: string;
  notificationTarget?: string;
  notificationRetryCount?: number;
  lastNotificationEventId?: string;
  riskAuto?: RiskLevel | string;
  reasonsAuto?: string[];
  riskFinal?: RiskLevel | string;
  overrideReason?: string;
  overriddenAt?: string;
  overriddenBy?: string;
  overriddenByName?: string;
}

export interface CheckinEvent {
  type: 'checkin';
  id: string;
  date: string;
  pain: number;
  mood: number;
  adherence?: {
    exercises?: number;
    medication?: boolean;
  };
  notes?: string;
  createdAt: string;
}

export interface ChatContextMessage {
  text: string;
  createdAt: string;
}

export interface ChatEvent {
  type: 'chat';
  id: string;
  text: string;
  createdAt: string;
  role: 'user';
  context?: {
    before?: ChatContextMessage[];
    after?: ChatContextMessage[];
  };
}

export type TriggeringEvent = CheckinEvent | ChatEvent;

export interface TimelineEvent {
  type: string;
  at: string;
  label: string;
  detail?: string;
  status?: 'ok' | 'warn' | 'fail';
}

export interface TrendPointRaw {
  date: string;
  pain?: number;
  mood?: number;
  adherence?: {
    exercises?: number;
    medication?: boolean;
  };
  notes?: string;
}

export interface TrendPointNormalized {
  date: string;
  pain: number | null;
  mood: number | null;
  exercises: number | null;
  medication: boolean | null;
  notes?: string | null;
}

export type TrendPoint = TrendPointRaw;

export interface PatientContext {
  patientId: string;
  displayName?: string;
  status?: PatientStatus;
}

export interface TrendsResponse {
  ok: true;
  trends: TrendPointRaw[];
}

export type PatientStatus = 'active' | 'on_hold' | 'discharged' | 'inactive';

export interface PatientSummary {
  id: string;
  displayName?: string;
  status?: PatientStatus;
  lastCheckinAt?: string;
  openAlertCount?: number;
  lastPain?: number;
  clinicianId?: string;
}

export interface ListAlertsResponse {
  ok: true;
  alerts: AlertItem[];
}

export interface ListPatientsResponse {
  ok: true;
  patients: PatientSummary[];
}

export interface PatchAlertResponse {
  ok: true;
  alert: AlertItem;
}

export interface AlertContextResponse {
  ok: true;
  alert: AlertItem;
  triggeringEvent?: TriggeringEvent;
  timeline?: TimelineEvent[];
}

export interface AlertContextResult {
  alert: AlertItem;
  triggeringEvent?: TriggeringEvent;
  timeline?: TimelineEvent[];
}
