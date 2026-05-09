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
  bodyMap?: {
    regions: Array<{
      region: string;
      intensity: number;
      type: string;
    }>;
  };
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
  bodyMap?: {
    regions: Array<{
      region: string;
      intensity: number;
      type: string;
    }>;
  };
  adherence?: {
    exercises?: number;
    medication?: boolean;
  };
  sleep?: {
    hours?: number;
    quality?: number;
    disturbances?: number;
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

export interface CheckinsRangeResponse {
  ok: true;
  checkins: TrendPointRaw[];
}

export interface HydrationDayTotal {
  date: string;
  totalMl: number;
  metTarget?: boolean;
}

export interface HydrationRangeResponse {
  ok: true;
  patientId?: string;
  from: string;
  to: string;
  targetMl: number;
  days: HydrationDayTotal[];
}

export type NutritionProtein = 'low' | 'ok' | 'high';
export type NutritionMealRegularity = 'irregular' | 'mostly' | 'regular';
export type NutritionAppetite = 'low' | 'normal' | 'high';

export interface NutritionEntry {
  id: string;
  date: string;
  protein: NutritionProtein;
  fruitVegServings: number;
  antiInflammatoryFocus: boolean;
  mealRegularity: NutritionMealRegularity;
  appetite?: NutritionAppetite;
  notes?: string;
  createdAt: string;
}

export interface NutritionDay {
  date: string;
  entry: NutritionEntry | null;
}

export interface NutritionRangeResponse {
  ok: true;
  patientId?: string;
  from: string;
  to: string;
  days: NutritionDay[];
}

export type WearableSource = 'mock' | 'healthkit_stub' | 'googlefit_stub';

export interface WearableDailyDay {
  date: string;
  steps?: number;
  activeMinutes?: number;
  restingHr?: number;
}

export interface WearablesSummaryResponse {
  ok: true;
  patientId?: string;
  source: WearableSource;
  from: string;
  to: string;
  trackedDays: number;
  avgSteps: number | null;
  avgActiveMinutes: number | null;
  avgRestingHr: number | null;
  totalSteps: number;
  totalActiveMinutes: number;
}

export interface WearablesDailyResponse {
  ok: true;
  patientId?: string;
  source: WearableSource;
  from: string;
  to: string;
  days: WearableDailyDay[];
}

export type MedicationType = 'medication' | 'supplement';
export type MedicationDoseStatus = 'due' | 'taken' | 'skipped';

export interface MedicationDose {
  time: string;
  status: MedicationDoseStatus;
  loggedAt?: string;
  logId?: string;
}

export interface MedicationItem {
  id: string;
  name: string;
  type: MedicationType;
  instructions?: string;
  active: boolean;
  schedule: {
    times: string[];
  };
}

export interface MedicationListResponse {
  ok: true;
  patientId?: string;
  medications: MedicationItem[];
}

export interface MedicationAdherenceDay {
  date: string;
  taken: number;
  skipped: number;
  totalScheduled: number;
}

export interface MedicationAdherenceRangeResponse {
  ok: true;
  patientId?: string;
  from: string;
  to: string;
  days: MedicationAdherenceDay[];
}

export type AppointmentSlotStatus = 'available' | 'closed';
export type AppointmentRequestStatus = 'pending' | 'approved' | 'rejected' | 'canceled';
export type AppointmentWorkflowStatus =
  | 'upcoming'
  | 'awaiting_confirmation'
  | 'completed'
  | 'missed'
  | 'reschedule_requested';

export interface AppointmentSlot {
  slotId: string;
  clinicianId?: string;
  clinicianName?: string;
  startsAt: string;
  endsAt: string;
  modality: 'video';
  meetingLink?: string;
  status?: AppointmentSlotStatus;
  createdAt?: string;
}

export interface AppointmentSlotsResponse {
  ok: true;
  items: AppointmentSlot[];
}

export interface AppointmentRequestItem {
  requestId: string;
  slotId: string;
  patientId: string;
  status: AppointmentRequestStatus;
  workflowStatus?: AppointmentWorkflowStatus;
  note?: string;
  startsAt: string;
  endsAt: string;
  modality: 'video';
  meetingLink?: string;
  reviewedAt?: string;
  updatedAt?: string;
  reviewedBy?: {
    clinicianId: string;
    name?: string;
  };
  createdAt: string;
}

export interface AppointmentRequestsResponse {
  ok: true;
  items: AppointmentRequestItem[];
}

export type SymptomPhotoKind = 'swelling' | 'wound' | 'rash' | 'other';

export interface SymptomPhotoItem {
  id: string;
  date: string;
  kind: SymptomPhotoKind;
  notePreview?: string;
  source?: string;
  status?: string;
  fileUrl?: string;
  photoUrl?: string;
  imageUrl?: string;
  url?: string;
  createdAt: string;
}

export interface SymptomPhotoMeta {
  ok: true;
  id: string;
  patientId?: string;
  date: string;
  kind: SymptomPhotoKind;
  note?: string;
  createdAt: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PatientPhotosResponse {
  ok: true;
  patientId: string;
  items: SymptomPhotoItem[];
}

export type InsightStatus = 'pending' | 'approved' | 'rejected';
export type InsightCategory =
  | 'adherence'
  | 'symptoms'
  | 'recovery'
  | 'safety'
  | 'habits'
  | 'questionnaires';
export type InsightConfidence = 'low' | 'medium' | 'high';

export interface InsightItem {
  id: string;
  patientId: string;
  patientDisplayName?: string;
  status: InsightStatus;
  title: string;
  message: string;
  category: InsightCategory;
  confidence: InsightConfidence;
  priority: number;
  windowDays: number;
  createdAt: string;
  reviewedAt?: string;
}

export interface InsightsQueueResponse {
  ok: true;
  items: InsightItem[];
}

export interface PatientInsightsResponse {
  ok: true;
  patientId: string;
  items: InsightItem[];
}

export interface GenerateInsightsResponse {
  ok: true;
  patientId: string;
  windowDays: number;
  created: number;
  skipped: number;
}

export type PatientStatus = 'active' | 'on_hold' | 'discharged' | 'inactive';

export interface ClinicianActorAttribution {
  clinicianId: string;
  name?: string;
}

export interface PatientDischarge {
  dischargedAt?: string;
  dischargedBy?: ClinicianActorAttribution;
  independentModeEnabled?: boolean;
  summary?: string;
  contactInstructions?: string;
  reactivatedAt?: string | null;
  reactivatedBy?: ClinicianActorAttribution;
  lastExportedAt?: string;
  lastExportedBy?: ClinicianActorAttribution;
}

export interface PatientProfileDetail {
  patientId: string;
  displayName?: string;
  status: PatientStatus;
  clinicianId?: string;
  discharge?: PatientDischarge;
  createdAt?: string;
  updatedAt?: string;
}

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

export type DashboardItemPriority = 'low' | 'medium' | 'high' | 'urgent';
export type DashboardPriorityQueueItemType =
  | 'alert'
  | 'task'
  | 'missed_checkin'
  | 'communication'
  | 'appointment_exception';

export interface DashboardSummary {
  openAlertsCount: number;
  assignedToMeAlertsCount: number;
  pendingInsightsCount: number;
  todayAppointmentsCount: number;
  missedCheckinsCount: number;
  openFollowUpTasksCount: number;
  messagesNeedingResponseCount: number;
}

export interface DashboardSummaryResponse {
  ok: true;
  summary: DashboardSummary;
}

export interface DashboardPriorityQueueItem {
  id: string;
  itemType: DashboardPriorityQueueItemType;
  patientId: string;
  title: string;
  subtitle?: string;
  priority: DashboardItemPriority;
  status: string;
  source: string;
  createdAt: string;
  dueAt?: string;
  linkedEntityId?: string;
  linkedEntityType?: string;
  meta?: Record<string, unknown>;
}

export interface DashboardPriorityQueueResponse {
  ok: true;
  items: DashboardPriorityQueueItem[];
}

export interface DashboardSafetyEvent {
  id: string;
  type: string;
  patientId: string;
  alertId?: string;
  createdAt: string;
  summary: string;
  alertStatus?: string;
  notificationStatus?: string;
  meta?: Record<string, unknown>;
}

export interface DashboardRecentSafetyEventsResponse {
  ok: true;
  items: DashboardSafetyEvent[];
}

export interface DashboardTodayAppointmentItem {
  id: string;
  patientId: string;
  clinicianId?: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentWorkflowStatus;
  requestStatus: AppointmentRequestStatus;
  modality: 'video';
  meetingLink?: string;
  note?: string;
  updatedAt: string;
}

export interface DashboardTodayAppointmentsResponse {
  ok: true;
  items: DashboardTodayAppointmentItem[];
}

export interface DashboardFollowUpTaskItem {
  id: string;
  patientId: string;
  title: string;
  priority: DashboardItemPriority;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled' | string;
  dueAt?: string;
  type: string;
  linkedAlertId?: string;
  linkedAppointmentId?: string;
  linkedMessageId?: string;
  updatedAt: string;
}

export interface DashboardFollowUpTasksResponse {
  ok: true;
  items: DashboardFollowUpTaskItem[];
}

export interface DashboardCommunicationOverviewCounts {
  needsResponseCount: number;
  flaggedBySafetyCount: number;
  followUpRequestedCount: number;
}

export interface DashboardCommunicationOverviewItem {
  id: string;
  patientId: string;
  patientName: string;
  messageId?: string;
  needsResponse: boolean;
  flaggedBySafety: boolean;
  followUpRequested: boolean;
  linkedTaskId?: string;
  messageCreatedAt: string;
  messagePreview?: string;
  patientRiskLevel?: 'low' | 'high' | string;
  openAlertCount?: number;
  lastCheckinAt?: string;
  lastPainScore?: number;
  responseState?: 'reviewing' | 'delayed' | string;
  responseDueAt?: string;
  responseDelayed?: boolean;
  responseDelayHours?: number;
  responseAgeHours?: number;
  reviewedAfterLatestInbound?: boolean;
  lastReviewedAt?: string;
  lastReviewedBy?: {
    clinicianId: string;
    displayName?: string;
  };
  resolutionKind?: 'no_follow_up_needed';
  thresholdSummary?: PatientThresholdConfig;
}

export interface DashboardCommunicationOverview {
  counts: DashboardCommunicationOverviewCounts;
  items: DashboardCommunicationOverviewItem[];
}

export interface DashboardCommunicationOverviewResponse {
  ok: true;
  overview: DashboardCommunicationOverview;
}

export type ClinicianCoordinationNextStep =
  | 'monitoring'
  | 'alerts'
  | 'communication'
  | 'tasks'
  | 'appointments'
  | 'plan';

export interface ClinicianCoordinationAuthorSnapshot {
  clinicianId: string;
  displayName: string;
}

export type ClinicianCoordinationFollowUpOwner =
  | { kind: 'unassigned' }
  | {
      kind: 'clinician';
      clinicianId: string;
      displayName: string;
    }
  | {
      kind: 'custom';
      label: string;
    };

export interface ClinicianCoordinationCurrentHandoff {
  summary: string;
  nextStep: ClinicianCoordinationNextStep;
  followUpOwner: ClinicianCoordinationFollowUpOwner;
  linkedTaskId?: string;
  linkedTask?: ClinicianCoordinationLinkedTaskSummary | null;
  updatedBy: ClinicianCoordinationAuthorSnapshot;
  updatedAt: string;
}

export interface ClinicianCoordinationLinkedTaskSummary {
  id: string;
  title: string;
  type: ClinicianTaskType;
  priority: ClinicianTaskPriority;
  status: ClinicianTaskStatus | string;
  dueAt?: string;
  assignedTo?: string;
  source?: {
    type?: string;
    entityType?: string;
    entityId?: string;
    label?: string;
  };
  updatedAt: string;
}

export interface ClinicianCoordinationNoteItem {
  id: string;
  text: string;
  createdBy: ClinicianCoordinationAuthorSnapshot;
  createdAt: string;
}

export interface ClinicianCoordinationRecord {
  patientId: string;
  currentHandoff: ClinicianCoordinationCurrentHandoff | null;
  noteHistory: ClinicianCoordinationNoteItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PatientCoordinationResponse {
  ok: true;
  coordination: ClinicianCoordinationRecord | null;
}

export interface PutPatientCurrentHandoffPayload {
  summary?: string;
  nextStep?: ClinicianCoordinationNextStep;
  followUpOwner?: ClinicianCoordinationFollowUpOwner;
  linkedTaskId?: string | null;
  messageId?: string;
  updatedBy?: string;
  updatedByName?: string;
}

export interface AppendPatientCoordinationNotePayload {
  text: string;
  messageId?: string;
  createdBy?: string;
  createdByName?: string;
}

export type ClinicianTaskType =
  | 'follow_up'
  | 'appointment'
  | 'safety_review'
  | 'adherence_review'
  | 'communication'
  | 'custom';

export type ClinicianTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ClinicianTaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export interface ClinicianTaskItem {
  id: string;
  patientId: string;
  title: string;
  description?: string;
  type: ClinicianTaskType;
  priority: ClinicianTaskPriority;
  status: ClinicianTaskStatus;
  dueAt?: string;
  assignedTo?: string;
  createdBy: string;
  source?: {
    type?: string;
    entityType?: string;
    entityId?: string;
    label?: string;
  };
  linkedAlertId?: string;
  linkedAppointmentId?: string;
  linkedMessageId?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface ClinicianTasksResponse {
  ok: true;
  tasks: ClinicianTaskItem[];
}

export interface ClinicianTaskMutationResponse {
  ok: true;
  task: ClinicianTaskItem;
}

export type WorklistSortOption =
  | 'priority'
  | 'updatedAt'
  | 'lastCheckinAt'
  | 'patientName'
  | 'nextAppointmentAt';

export interface WorklistRecord {
  patientId: string;
  patientName: string;
  patientStatus: PatientStatus;
  rehabPhase?: string;
  lastCheckinAt?: string;
  openAlertsCount: number;
  latestRiskLevel: 'low' | 'high' | string;
  lastPainScore?: number;
  adherenceSummary: {
    exercisesPct?: number;
    medicationTaken?: boolean;
  };
  nextAppointmentAt?: string;
  missedCheckins: {
    flag: boolean;
    count: number;
  };
  communicationNeedsResponse: boolean;
  communicationSummary?: {
    needsResponseCount: number;
    flaggedBySafetyCount: number;
    latestMessageAt?: string;
    delayedResponse: boolean;
    responseDelayed?: boolean;
    responseDelayHours?: number;
    responseAgeHours?: number;
    responseDueAt?: string;
    reviewedAfterLatestInbound?: boolean;
    lastReviewedAt?: string;
    lastReviewedBy?: {
      clinicianId: string;
      displayName?: string;
    };
    resolutionKind?: 'no_follow_up_needed';
  };
  activeTaskCount: number;
  proms?: {
    dueCount: number;
    overdueCount: number;
    nextDueAt?: string;
  };
  thresholdSummary?: PatientThresholdConfig;
  topIssue?: string;
  reviewReason?: string;
  priorityScore: number;
  updatedAt: string;
}

export interface WorklistResponse {
  ok: true;
  items: WorklistRecord[];
  total: number;
}

export interface PatchAlertResponse {
  ok: true;
  alert: AlertItem;
}

export interface AlertContextResponse {
  ok: true;
  alert: AlertItem;
  triggering?: unknown;
  triggeringEvent?: TriggeringEvent;
  timeline?: TimelineEvent[];
  auditTrail?: SafetyAuditEntry[];
}

export interface AlertContextResult {
  alert: AlertItem;
  triggeringEvent?: TriggeringEvent;
  timeline?: TimelineEvent[];
  auditTrail?: SafetyAuditEntry[];
}

export interface PatientThresholdConfig {
  patientId: string;
  painHighThreshold: number;
  missedCheckinDays: number;
  responseDelayHours: number;
  safetyFlaggedResponseDelayHours: number;
  rationale?: string;
  version: number;
  configured: boolean;
  updatedAt?: string;
  createdAt?: string;
  updatedBy?: {
    clinicianId: string;
    name?: string;
  };
}

export interface PatientThresholdConfigResponse {
  ok: true;
  patientId: string;
  thresholds: PatientThresholdConfig;
}

export interface PutPatientThresholdConfigPayload {
  painHighThreshold: number;
  missedCheckinDays: number;
  responseDelayHours: number;
  safetyFlaggedResponseDelayHours: number;
  rationale?: string;
}

export type RecoverySupportCheckinMode = 'standard' | 'adaptive' | 'force_full';
export type CheckinAdaptationMode = 'standard' | 'shortened' | 'expanded';
export type CheckinAdaptationDecisionSource =
  | 'persistent_force_full'
  | 'temporary_force_full'
  | 'hard_safety_expanded'
  | 'cooldown_standard'
  | 'adaptive_shortened'
  | 'adaptive_standard_fallback'
  | 'adaptive_expanded';
export type CheckinAdaptationReasonCategory =
  | 'override'
  | 'safety'
  | 'cooldown'
  | 'stability'
  | 'adherence'
  | 'engagement'
  | 'configuration';

export interface CheckinAdaptationReasonDetail {
  code: string;
  label: string;
  category: CheckinAdaptationReasonCategory;
}

export interface CheckinAdaptationDecision {
  patientId: string;
  date: string;
  mode: CheckinAdaptationMode;
  decisionSource: CheckinAdaptationDecisionSource;
  reasonCodes: string[];
  reasonDetails: CheckinAdaptationReasonDetail[];
  clinicianSummary: string;
  explanation?: string;
  configVersion: number;
  thresholdVersion: number;
  generatedAt: string;
  optionalSections: {
    recovery: boolean;
    support: boolean;
    dailyContext: boolean;
  };
}

export interface CheckinAdaptationHistoryEntry {
  id: string;
  recordedAt: string;
  surface: 'patient_checkin';
  decision: CheckinAdaptationDecision;
}

export interface RecoveryNudge {
  patientId: string;
  kind:
    | 'improving_trend'
    | 'worsening_trend'
    | 'low_exercise_completion'
    | 'missed_recent_checkins'
    | 'weekly_summary_ready';
  ruleCode: string;
  title: string;
  message: string;
  evidenceWindow: string;
  generatedAt: string;
}

export interface PatientRecoverySupportConfig {
  patientId: string;
  checkinMode: RecoverySupportCheckinMode;
  nudgesEnabled: boolean;
  rationale?: string;
  temporaryForceFullUntil?: string | null;
  version: number;
  updatedBy?: ClinicianActorAttribution;
  createdAt?: string;
  updatedAt?: string;
  configured: boolean;
}

export interface PatientRecoverySupportResponse {
  ok: true;
  patientId: string;
  recoverySupport: PatientRecoverySupportConfig;
  adaptationDecision?: CheckinAdaptationDecision | null;
  adaptationHistory?: CheckinAdaptationHistoryEntry[];
  recoveryNudge?: RecoveryNudge | null;
}

export interface PutPatientRecoverySupportPayload {
  checkinMode: RecoverySupportCheckinMode;
  nudgesEnabled: boolean;
  rationale?: string;
  temporaryForceFullUntil?: string | null;
}

export interface CaregiverAccessItem {
  inviteId: string;
  relationship?: string;
  caregiverName?: string;
  codeHint?: string;
  expiresAt?: string;
  usedAt?: string;
  revokedAt?: string;
  lastAccessedAt?: string;
  createdAt?: string;
}

export interface PatientCaregiverAccessResponse {
  ok: true;
  patientId: string;
  items: CaregiverAccessItem[];
}

export interface DischargePatientPayload {
  summary: string;
  contactInstructions?: string;
  independentModeEnabled?: boolean;
  requestedBy?: string;
  requestedByName?: string;
}

export interface ReactivatePatientPayload {
  status: 'active' | 'on_hold';
  rationale?: string;
  requestedBy?: string;
  requestedByName?: string;
}

export interface PatientProfileMutationResponse {
  ok: true;
  patient: PatientProfileDetail;
}

export interface DischargeSummary {
  patientId: string;
  patientName: string;
  status: 'discharged' | 'inactive';
  dischargedAt?: string;
  independentModeEnabled: boolean;
  summary?: string;
  recentTrendSummary: string;
  weeklyHeadline?: string;
  planStatus: string;
  nextSteps: string[];
  safetyInstructions: string[];
  generatedAt: string;
}

export interface DischargeSummaryResponse {
  ok: true;
  patientId: string;
  summary: DischargeSummary | null;
}

export interface SafetyAuditEntry {
  id: string;
  patientId: string;
  alertId?: string;
  eventType: string;
  summary: string;
  occurredAt: string;
  actor?: {
    clinicianId?: string;
    name?: string;
  };
  notificationStatus?: string;
  meta?: Record<string, unknown>;
}

export interface PatientSafetyEventsResponse {
  ok: true;
  patientId: string;
  items: SafetyAuditEntry[];
}

export type ExercisePlanIntensity = 'easy' | 'moderate' | 'hard';

export interface ExercisePlanItem {
  key: string;
  name: string;
  instructions: string;
  sets?: number;
  reps?: number;
  holdSeconds?: number;
  restSeconds?: number;
  intensity?: ExercisePlanIntensity;
  videoUrl?: string;
  contraindications?: string[];
  order: number;
}

export interface ExercisePlan {
  title: string;
  timezone?: string;
  daysOfWeek: number[];
  items: ExercisePlanItem[];
  version: number;
  updatedAt: string;
  updatedBy?: {
    clinicianId: string;
    name?: string;
  };
}

export interface ExercisePlanResponse {
  ok: true;
  patientId: string;
  plan: ExercisePlan | null;
}

export interface ExercisePlanRevision {
  id: string;
  patientId: string;
  version: number;
  savedAt: string;
  savedBy?: {
    clinicianId: string;
    name?: string;
  };
  snapshot: ExercisePlan | null;
}

export interface ExercisePlanHistoryResponse {
  ok: true;
  patientId: string;
  items: ExercisePlanRevision[];
}

export type RehabStatus = 'locked' | 'current' | 'done';

export interface RehabPhase {
  key: string;
  title: string;
  description?: string;
  order: number;
  status: RehabStatus;
  startedAt: string | null;
  completedAt: string | null;
}

export interface RehabPayload {
  currentKey: string | null;
  phases: RehabPhase[];
  updatedAt: string;
  updatedBy?: {
    clinicianId: string;
    name?: string;
  };
}

export interface RehabResponse {
  ok: true;
  patientId: string;
  rehab: RehabPayload;
}

export type ExerciseSessionStatus = 'completed' | 'abandoned';
export type ExerciseSessionDifficulty = 'easy' | 'ok' | 'hard';

export interface ExerciseSessionExercise {
  itemKey: string;
  nameSnapshot: string;
  order: number;
  planned?: {
    sets?: number;
    reps?: number;
    holdSeconds?: number;
    restSeconds?: number;
  };
  completed: boolean;
  setsDone?: number;
  repsDone?: number;
  difficulty?: ExerciseSessionDifficulty;
  painDuring?: number;
  note?: string;
  completedAt?: string;
}

export interface ExerciseSessionListItem {
  id: string;
  startedAt: string;
  durationSeconds: number;
  exerciseCount: number;
  completedCount: number;
  avgPainDuring?: number;
  planTitle?: string;
}

export interface ExerciseSessionDetail extends ExerciseSessionListItem {
  endedAt: string;
  status: ExerciseSessionStatus;
  planVersion?: number;
  planDayOfWeek?: number;
  exercises: ExerciseSessionExercise[];
}

export interface ExerciseSessionsListResponse {
  ok: true;
  patientId?: string;
  sessions: ExerciseSessionListItem[];
}

export interface ExerciseSessionResponse {
  ok: true;
  session: ExerciseSessionDetail;
}

export type PromBandKey = 'green' | 'amber' | 'red';

export interface PromScore {
  raw: number;
  normalized: number;
  bandKey: PromBandKey;
  bandLabel: string;
}

export interface PromDueCard {
  id: string;
  templateKey: string;
  title: string;
  dueAt: string;
  status: 'due' | 'completed';
}

export interface PromHistoryRow {
  id: string;
  templateKey: string;
  title: string;
  completedAt: string;
  score: {
    normalized: number;
    bandKey?: PromBandKey;
    bandLabel: string;
  } | null;
}

export interface PromQuestion {
  id: string;
  text: string;
  type: 'likert';
  min: number;
  max: number;
  labels?: {
    minLabel?: string;
    maxLabel?: string;
  };
  required?: boolean;
  reverse?: boolean;
}

export interface PromAnswer {
  questionId: string;
  value: number;
}

export interface PromInstanceDetail {
  id: string;
  patientId?: string;
  templateKey: string;
  templateVersion: number;
  title: string;
  dueAt: string;
  status: 'due' | 'completed';
  completedAt: string | null;
  questions: PromQuestion[];
  answers: PromAnswer[];
  score: PromScore | null;
}

export interface ClinicianPatientPromsResponse {
  ok: true;
  patientId: string;
  due: PromDueCard[];
  completed: PromHistoryRow[];
}

export interface ClinicianPromDetailResponse {
  ok: true;
  prom: PromInstanceDetail;
}

export interface WeeklyReportPeriod {
  weekStart: string;
  weekEnd: string;
  tzOffsetMinutes: number | null;
}

export interface WeeklyReportPayload {
  ok: true;
  patientId: string;
  period: WeeklyReportPeriod;
  summary: {
    headline: string;
    highlights: string[];
    nextSteps: string[];
  };
  checkins: {
    count: number;
    avgPain: number | null;
    avgMood: number | null;
    avgExercisesPct: number | null;
    medicationYesPct: number | null;
    notesCount: number;
  };
  bodyMap: {
    topRegions: Array<{
      region: string;
      label: string;
      count: number;
      avgIntensity: number | null;
    }>;
  };
  sleep: {
    trackedNights: number;
    avgHours: number | null;
    avgQuality: number | null;
  };
  photos: {
    uploadedThisWeek: number;
    kinds: {
      swelling: number;
      wound: number;
      rash: number;
      other: number;
    };
  };
  hydration: {
    trackedDays: number;
    avgDailyMl: number | null;
    totalMl: number;
    daysMeetingTarget: number;
    targetMl: number;
  };
  nutrition: {
    trackedDays: number;
    avgFruitVegServings: number | null;
    proteinOkHighDays: number;
    antiInflammatoryDays: number;
    regularMealsDays: number;
  };
  wearables: {
    trackedDays: number;
    avgSteps: number | null;
    avgActiveMinutes: number | null;
    source: WearableSource;
  };
  medications: {
    scheduledDoses: number;
    takenDoses: number;
    skippedDoses: number;
    adherencePct: number | null;
  };
  exercises: {
    sessionCount: number;
    totalDurationMinutes: number;
    completedExercises: number;
    totalExercises: number;
    avgPainDuring: number | null;
    difficulty: {
      easy: number;
      ok: number;
      hard: number;
    };
  };
  proms: {
    dueNowCount: number;
    completedThisWeekCount: number;
    latestCompleted: {
      id: string;
      title: string;
      normalized: number;
      bandLabel: string;
      completedAt: string;
    } | null;
  };
  safety: {
    alertsCreatedThisWeek: number;
    highRiskAlertsThisWeek: number;
  };
}
