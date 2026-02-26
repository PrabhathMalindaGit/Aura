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
  note?: string;
  startsAt: string;
  endsAt: string;
  modality: 'video';
  meetingLink?: string;
  reviewedAt?: string;
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
