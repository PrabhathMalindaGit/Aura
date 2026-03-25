import { apiFetchJson, type ApiError } from "@/src/api/client";
import type { Patient, Risk } from "@/src/types/models";
import {
  isBodyMapPainType,
  isBodyMapRegion,
  type BodyMapPainType,
  type BodyMapRegion,
} from "@/src/utils/bodyMapLabels";
import type {
  CheckinMedicationStatus,
  CheckinSymptomFlag,
} from "@/src/types/checkin";

type PatientLike = {
  id?: string;
  patientId?: string;
  displayName?: string;
};

type LoginApiPayload = {
  token?: string;
  patient?: PatientLike;
};

type MeApiPayload = {
  ok?: boolean;
  patient?: PatientLike;
} & PatientLike;

export type LoginResponse = {
  token: string;
  patient: Patient | null;
};

export type CheckInCreatePayload = {
  date: string;
  mood: number;
  pain: number;
  symptoms?: {
    flags?: CheckinSymptomFlag[];
  };
  adherence: {
    exercises: number;
    medication: boolean;
    medicationStatus?: CheckinMedicationStatus;
    medicationReason?: string;
  };
  recovery?: {
    difficultyLevel?: number;
    confidenceLevel?: number;
    mobilityLevel?: number;
  };
  support?: {
    stressLevel?: number;
    feelsSafe?: boolean;
    wantsFollowUp?: boolean;
    wantsExtraSupport?: boolean;
    needsUrgentHelp?: boolean;
  };
  sleep?: {
    hours?: number;
    quality?: number;
    disturbances?: number;
  };
  dailySignals?: {
    hydrationLevel?: number;
    energyLevel?: number;
  };
  bodyMap?: {
    primaryRegion?: BodyMapRegion;
    regions: Array<{
      region: BodyMapRegion;
      intensity: number;
      type: BodyMapPainType;
    }>;
  };
  notes?: string;
};

export type CheckInCreateResponse = {
  ok: boolean;
  checkInId?: string;
  risk?: Risk;
  alertId?: string | null;
};

export type HydrationEntry = {
  id: string;
  amountMl: number;
  createdAt: string;
  pending?: boolean;
  localId?: string;
};

export type HydrationLogPayload = {
  date?: string;
  amountMl: number;
  clientMutationId?: string;
};

export type HydrationTodayResponse = {
  ok: boolean;
  date: string;
  totalMl: number;
  targetMl: number;
  entries: HydrationEntry[];
};

export type HydrationDayTotal = {
  date: string;
  totalMl: number;
  metTarget?: boolean;
};

export type HydrationRangeResponse = {
  ok: boolean;
  from: string;
  to: string;
  targetMl: number;
  days: HydrationDayTotal[];
};

export type NutritionProtein = "low" | "ok" | "high";
export type NutritionMealRegularity = "irregular" | "mostly" | "regular";
export type NutritionAppetite = "low" | "normal" | "high";

export type NutritionEntry = {
  id: string;
  date: string;
  protein: NutritionProtein;
  fruitVegServings: number;
  antiInflammatoryFocus: boolean;
  mealRegularity: NutritionMealRegularity;
  appetite?: NutritionAppetite;
  notes?: string;
  createdAt: string;
  pending?: boolean;
  localId?: string;
};

export type NutritionLogPayload = {
  date?: string;
  protein: NutritionProtein;
  fruitVegServings: number;
  antiInflammatoryFocus: boolean;
  mealRegularity: NutritionMealRegularity;
  appetite?: NutritionAppetite;
  notes?: string;
  clientMutationId?: string;
};

export type NutritionTodayResponse = {
  ok: boolean;
  date: string;
  entry: NutritionEntry | null;
};

export type NutritionDay = {
  date: string;
  entry: NutritionEntry | null;
};

export type NutritionRangeResponse = {
  ok: boolean;
  from: string;
  to: string;
  days: NutritionDay[];
};

export type MedicationType = "medication" | "supplement";
export type MedicationDoseStatus = "due" | "taken" | "skipped";

export type MedicationDose = {
  time: string;
  status: MedicationDoseStatus;
  loggedAt?: string;
  logId?: string;
  pending?: boolean;
  localId?: string;
};

export type MedicationItem = {
  id: string;
  name: string;
  type: MedicationType;
  instructions?: string;
  active: boolean;
  schedule: {
    times: string[];
  };
};

export type MedicationListResponse = {
  ok: boolean;
  medications: MedicationItem[];
};

export type MedicationTodayItem = {
  medicationId: string;
  name: string;
  type: MedicationType;
  instructions?: string;
  doses: MedicationDose[];
};

export type MedicationTodayResponse = {
  ok: boolean;
  date: string;
  items: MedicationTodayItem[];
};

export type MedicationLogPayload = {
  medicationId: string;
  date?: string;
  time: string;
  status: "taken" | "skipped";
  note?: string;
};

export type MedicationLogResult = {
  ok: boolean;
  id?: string;
  date: string;
  time: string;
  status: "taken" | "skipped";
  loggedAt?: string;
};

export type MedicationAdherenceDay = {
  date: string;
  taken: number;
  skipped: number;
  totalScheduled: number;
};

export type MedicationAdherenceRangeResponse = {
  ok: boolean;
  from: string;
  to: string;
  days: MedicationAdherenceDay[];
};

export type SymptomPhotoKind = "swelling" | "wound" | "rash" | "other";

export type SymptomPhotoItem = {
  id: string;
  date: string;
  kind: SymptomPhotoKind;
  notePreview?: string;
  createdAt: string;
  pending?: boolean;
  localId?: string;
  localFileUri?: string;
};

export type SymptomPhotoMeta = {
  id: string;
  date: string;
  kind: SymptomPhotoKind;
  note?: string;
  createdAt: string;
  mimeType: string;
  sizeBytes: number;
  patientId?: string;
};

export type PhotoUploadPayload = {
  uri: string;
  mimeType: string;
  date?: string;
  kind: SymptomPhotoKind;
  note?: string;
};

export type PhotoUploadResponse = {
  ok: boolean;
  id: string;
  date: string;
  kind: SymptomPhotoKind;
  createdAt: string;
};

export type InsightCategory =
  | "adherence"
  | "symptoms"
  | "recovery"
  | "safety"
  | "habits"
  | "questionnaires";

export type InsightConfidence = "low" | "medium" | "high";

export type ApprovedInsight = {
  id: string;
  title: string;
  message: string;
  category: InsightCategory;
  confidence: InsightConfidence;
  priority: number;
  createdAt: string;
  reviewedAt?: string;
};

export type ExercisePlanItem = {
  key: string;
  name: string;
  instructions: string;
  sets?: number;
  reps?: number;
  holdSeconds?: number;
  restSeconds?: number;
  intensity?: "easy" | "moderate" | "hard";
  videoUrl?: string;
  contraindications?: string[];
  order: number;
};

export type TodayExercisePlan = {
  title: string;
  timezone?: string;
  daysOfWeek: number[];
  items: ExercisePlanItem[];
  version: number;
  updatedAt: string;
};

export type TodayPlanResponse = {
  ok: boolean;
  patientId: string;
  date: string;
  dayOfWeek: number;
  plan: TodayExercisePlan | null;
};

export type RehabPhaseStatus = "locked" | "current" | "done";

export type RehabPhase = {
  key: string;
  title: string;
  description?: string;
  order: number;
  status: RehabPhaseStatus;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type RehabPayload = {
  currentKey: string | null;
  phases: RehabPhase[];
  updatedAt?: string;
  updatedBy?: {
    clinicianId: string;
    name?: string;
  };
};

export type PromBandKey = "green" | "amber" | "red";

export type PromScore = {
  raw: number;
  normalized: number;
  bandKey: PromBandKey;
  bandLabel: string;
};

export type PromDueCard = {
  id: string;
  templateKey: string;
  title: string;
  dueAt: string;
  status: "due" | "completed";
};

export type PromHistoryRow = {
  id: string;
  templateKey: string;
  title: string;
  completedAt: string;
  score: {
    normalized: number;
    bandKey?: PromBandKey;
    bandLabel: string;
  } | null;
};

export type PromQuestion = {
  id: string;
  text: string;
  type: "likert";
  min: number;
  max: number;
  labels?: {
    minLabel?: string;
    maxLabel?: string;
  };
  required: boolean;
};

export type PromAnswer = {
  questionId: string;
  value: number;
};

export type PromInstance = {
  id: string;
  templateKey: string;
  templateVersion: number;
  title: string;
  dueAt: string;
  status: "due" | "completed";
  completedAt: string | null;
  questions: PromQuestion[];
  answers: PromAnswer[];
  score: PromScore | null;
};

export type PromSubmitResponse = {
  ok: boolean;
  id?: string;
  completedAt?: string;
  score: PromScore | null;
};

export type WeeklyReport = {
  ok: true;
  patientId: string;
  period: {
    weekStart: string;
    weekEnd: string;
    tzOffsetMinutes: number | null;
  };
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
      region: BodyMapRegion;
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
    source: "mock" | "healthkit_stub" | "googlefit_stub";
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
};

export type ExerciseSessionStatus = "completed" | "abandoned";
export type ExerciseSessionDifficulty = "easy" | "ok" | "hard";

export type ExerciseSessionExercisePayload = {
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
};

export type ExerciseSessionCreatePayload = {
  startedAt: string;
  endedAt: string;
  planVersion?: number;
  planTitle?: string;
  planDayOfWeek?: number;
  status?: ExerciseSessionStatus;
  exercises: ExerciseSessionExercisePayload[];
};

export type ExerciseSessionCreateResponse = {
  ok: boolean;
  sessionId?: string;
  createdAt?: string;
};

export type ExerciseSessionListItem = {
  id: string;
  startedAt: string;
  durationSeconds: number;
  exerciseCount: number;
  completedCount: number;
  avgPainDuring?: number;
  planTitle?: string;
};

export type ExerciseSessionDetail = ExerciseSessionListItem & {
  endedAt: string;
  status: ExerciseSessionStatus;
  planVersion?: number;
  planDayOfWeek?: number;
  exercises: ExerciseSessionExercisePayload[];
};

export type CheckInItem = {
  id: string;
  date?: string;
  createdAt?: string;
  pain: number;
  mood: number;
  symptoms?: {
    flags?: CheckinSymptomFlag[];
  };
  adherence?: {
    exercises?: number;
    medication?: boolean;
    medicationStatus?: CheckinMedicationStatus;
    medicationReason?: string;
  };
  recovery?: {
    difficultyLevel?: number;
    confidenceLevel?: number;
    mobilityLevel?: number;
  };
  support?: {
    stressLevel?: number;
    feelsSafe?: boolean;
    wantsFollowUp?: boolean;
    wantsExtraSupport?: boolean;
    needsUrgentHelp?: boolean;
  };
  sleep?: {
    hours?: number;
    quality?: number;
    disturbances?: number;
  };
  dailySignals?: {
    hydrationLevel?: number;
    energyLevel?: number;
  };
  bodyMap?: {
    primaryRegion?: BodyMapRegion;
    regions: Array<{
      region: BodyMapRegion;
      intensity: number;
      type: BodyMapPainType;
    }>;
  };
  notes?: string;
};

export type ChatRole = "patient" | "assistant" | "system";

export type ChatItem = {
  id?: string;
  role: ChatRole;
  text: string;
  createdAt?: string;
};

export type ChatSendResponse = {
  ok?: boolean;
  risk?: { level: "low" | "high"; reasonCodes?: string[] };
  alertId?: string | null;
  assistant?: { text?: string; message?: string; reply?: string };
  reply?: string;
  message?: string;
  messages?: {
    user?: unknown;
    assistant?: unknown;
  };
};

function toPatient(value: PatientLike | null | undefined): Patient | null {
  if (!value) {
    return null;
  }

  const id = value.id ?? value.patientId;
  if (!id || !id.trim()) {
    return null;
  }

  return {
    id,
    displayName: value.displayName,
  };
}

function invalidResponseError(message: string): ApiError {
  return {
    title: "Unexpected response",
    message,
    kind: "unknown",
    retryable: false,
  };
}

export async function login(accessCode: string): Promise<LoginResponse> {
  const payload = await apiFetchJson<LoginApiPayload>("/patient/auth/login", {
    method: "POST",
    body: { accessCode },
  });

  if (!payload?.token || typeof payload.token !== "string") {
    throw invalidResponseError("Sign-in response did not include a token.");
  }

  return {
    token: payload.token,
    patient: toPatient(payload.patient),
  };
}

export async function getMe(token: string): Promise<Patient> {
  const payload = await apiFetchJson<MeApiPayload>("/patient/me", {
    method: "GET",
    token,
  });

  const patient = payload?.patient ? toPatient(payload.patient) : toPatient(payload);
  if (!patient) {
    throw invalidResponseError("Could not parse patient profile.");
  }

  return patient;
}

function toRisk(value: unknown): Risk | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as { level?: unknown; reasonCodes?: unknown };
  if (candidate.level !== "low" && candidate.level !== "high") {
    return undefined;
  }

  const reasonCodes = Array.isArray(candidate.reasonCodes)
    ? candidate.reasonCodes
        .map((code) => (typeof code === "string" ? code : null))
        .filter((code): code is string => Boolean(code))
    : undefined;

  return {
    level: candidate.level,
    reasonCodes,
  };
}

export async function createCheckin(
  token: string,
  payload: CheckInCreatePayload
): Promise<CheckInCreateResponse> {
  const response = await apiFetchJson<{
    ok?: unknown;
    checkInId?: unknown;
    risk?: unknown;
    alertId?: unknown;
  }>("/patient/checkins", {
    method: "POST",
    token,
    body: payload,
  });

  const checkInId =
    typeof response.checkInId === "string" ? response.checkInId : undefined;
  const alertId =
    typeof response.alertId === "string" ? response.alertId : null;

  return {
    ok: response.ok !== false,
    checkInId,
    risk: toRisk(response.risk),
    alertId,
  };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeExercisePlanItem(value: unknown): ExercisePlanItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    key?: unknown;
    name?: unknown;
    instructions?: unknown;
    sets?: unknown;
    reps?: unknown;
    holdSeconds?: unknown;
    restSeconds?: unknown;
    intensity?: unknown;
    videoUrl?: unknown;
    contraindications?: unknown;
    order?: unknown;
  };

  const key = typeof item.key === "string" ? item.key.trim() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const instructions =
    typeof item.instructions === "string" ? item.instructions.trim() : "";
  const order = toFiniteNumber(item.order);

  if (!key || !name || !instructions || order === null) {
    return null;
  }

  const intensity =
    item.intensity === "easy" ||
    item.intensity === "moderate" ||
    item.intensity === "hard"
      ? item.intensity
      : undefined;

  const contraindications = Array.isArray(item.contraindications)
    ? item.contraindications
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : undefined;

  return {
    key,
    name,
    instructions,
    sets: toFiniteNumber(item.sets) ?? undefined,
    reps: toFiniteNumber(item.reps) ?? undefined,
    holdSeconds: toFiniteNumber(item.holdSeconds) ?? undefined,
    restSeconds: toFiniteNumber(item.restSeconds) ?? undefined,
    intensity,
    videoUrl: typeof item.videoUrl === "string" ? item.videoUrl : undefined,
    contraindications: contraindications?.length ? contraindications : undefined,
    order,
  };
}

function normalizeTodayPlan(value: unknown): TodayExercisePlan | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    title?: unknown;
    timezone?: unknown;
    daysOfWeek?: unknown;
    items?: unknown;
    version?: unknown;
    updatedAt?: unknown;
  };

  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const version = toFiniteNumber(candidate.version);
  const updatedAt =
    typeof candidate.updatedAt === "string" ? candidate.updatedAt : undefined;

  if (!title || version === null || !updatedAt) {
    return null;
  }

  const daysOfWeek = Array.isArray(candidate.daysOfWeek)
    ? candidate.daysOfWeek
        .map((day) => toFiniteNumber(day))
        .filter((day): day is number => day !== null && day >= 0 && day <= 6)
    : [];
  const normalizedItems = Array.isArray(candidate.items)
    ? candidate.items
        .map((item) => normalizeExercisePlanItem(item))
        .filter((item): item is ExercisePlanItem => Boolean(item))
    : [];

  return {
    title,
    timezone: typeof candidate.timezone === "string" ? candidate.timezone : undefined,
    daysOfWeek,
    items: [...normalizedItems].sort((left, right) => left.order - right.order),
    version,
    updatedAt,
  };
}

function normalizeRehabPhase(value: unknown): RehabPhase | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const phase = value as {
    key?: unknown;
    title?: unknown;
    description?: unknown;
    order?: unknown;
    status?: unknown;
    startedAt?: unknown;
    completedAt?: unknown;
  };

  const key = typeof phase.key === "string" ? phase.key.trim() : "";
  const title = typeof phase.title === "string" ? phase.title.trim() : "";
  const order = toFiniteNumber(phase.order);
  if (!key || !title || order === null) {
    return null;
  }

  const status: RehabPhaseStatus =
    phase.status === "done" || phase.status === "current" || phase.status === "locked"
      ? phase.status
      : "locked";

  return {
    key,
    title,
    description:
      typeof phase.description === "string" && phase.description.trim()
        ? phase.description.trim()
        : undefined,
    order,
    status,
    startedAt: typeof phase.startedAt === "string" ? phase.startedAt : null,
    completedAt: typeof phase.completedAt === "string" ? phase.completedAt : null,
  };
}

function normalizeRehabPayload(value: unknown): RehabPayload {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const phases = Array.isArray(record.phases)
    ? record.phases
        .map((phase) => normalizeRehabPhase(phase))
        .filter((phase): phase is RehabPhase => Boolean(phase))
        .sort((left, right) => left.order - right.order)
    : [];

  const currentKeyCandidate =
    typeof record.currentKey === "string" && record.currentKey.trim()
      ? record.currentKey.trim()
      : null;
  const currentKey =
    currentKeyCandidate && phases.some((phase) => phase.key === currentKeyCandidate)
      ? currentKeyCandidate
      : phases.length > 0
        ? phases.find((phase) => phase.status === "current")?.key ?? null
        : null;

  const updatedByRecord =
    record.updatedBy && typeof record.updatedBy === "object"
      ? (record.updatedBy as { clinicianId?: unknown; name?: unknown })
      : undefined;

  return {
    currentKey,
    phases,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
    updatedBy:
      updatedByRecord && typeof updatedByRecord.clinicianId === "string"
        ? {
            clinicianId: updatedByRecord.clinicianId,
            name:
              typeof updatedByRecord.name === "string"
                ? updatedByRecord.name
                : undefined,
          }
        : undefined,
  };
}

function normalizeWeeklyReport(value: unknown): WeeklyReport | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    ok?: unknown;
    patientId?: unknown;
    period?: {
      weekStart?: unknown;
      weekEnd?: unknown;
      tzOffsetMinutes?: unknown;
    };
    summary?: {
      headline?: unknown;
      highlights?: unknown;
      nextSteps?: unknown;
    };
    checkins?: {
      count?: unknown;
      avgPain?: unknown;
      avgMood?: unknown;
      avgExercisesPct?: unknown;
      medicationYesPct?: unknown;
      notesCount?: unknown;
    };
    bodyMap?: {
      topRegions?: unknown;
    };
    sleep?: {
      trackedNights?: unknown;
      avgHours?: unknown;
      avgQuality?: unknown;
    };
    photos?: {
      uploadedThisWeek?: unknown;
      kinds?: {
        swelling?: unknown;
        wound?: unknown;
        rash?: unknown;
        other?: unknown;
      };
    };
    hydration?: {
      trackedDays?: unknown;
      avgDailyMl?: unknown;
      totalMl?: unknown;
      daysMeetingTarget?: unknown;
      targetMl?: unknown;
    };
    nutrition?: {
      trackedDays?: unknown;
      avgFruitVegServings?: unknown;
      proteinOkHighDays?: unknown;
      antiInflammatoryDays?: unknown;
      regularMealsDays?: unknown;
    };
    wearables?: {
      trackedDays?: unknown;
      avgSteps?: unknown;
      avgActiveMinutes?: unknown;
      source?: unknown;
    };
    medications?: {
      scheduledDoses?: unknown;
      takenDoses?: unknown;
      skippedDoses?: unknown;
      adherencePct?: unknown;
    };
    exercises?: {
      sessionCount?: unknown;
      totalDurationMinutes?: unknown;
      completedExercises?: unknown;
      totalExercises?: unknown;
      avgPainDuring?: unknown;
      difficulty?: {
        easy?: unknown;
        ok?: unknown;
        hard?: unknown;
      };
    };
    proms?: {
      dueNowCount?: unknown;
      completedThisWeekCount?: unknown;
      latestCompleted?: {
        id?: unknown;
        title?: unknown;
        normalized?: unknown;
        bandLabel?: unknown;
        completedAt?: unknown;
      } | null;
    };
    safety?: {
      alertsCreatedThisWeek?: unknown;
      highRiskAlertsThisWeek?: unknown;
    };
  };

  const patientId =
    typeof record.patientId === "string" ? record.patientId.trim() : "";
  const weekStart =
    typeof record.period?.weekStart === "string" ? record.period.weekStart.trim() : "";
  const weekEnd =
    typeof record.period?.weekEnd === "string" ? record.period.weekEnd.trim() : "";
  const headline =
    typeof record.summary?.headline === "string" ? record.summary.headline.trim() : "";

  if (!patientId || !weekStart || !weekEnd || !headline) {
    return null;
  }

  const highlights = Array.isArray(record.summary?.highlights)
    ? record.summary.highlights
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  const nextSteps = Array.isArray(record.summary?.nextSteps)
    ? record.summary.nextSteps
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  const count = toFiniteNumber(record.checkins?.count) ?? 0;
  const notesCount = toFiniteNumber(record.checkins?.notesCount) ?? 0;
  const sessionCount = toFiniteNumber(record.exercises?.sessionCount) ?? 0;
  const totalDurationMinutes = toFiniteNumber(record.exercises?.totalDurationMinutes) ?? 0;
  const completedExercises = toFiniteNumber(record.exercises?.completedExercises) ?? 0;
  const totalExercises = toFiniteNumber(record.exercises?.totalExercises) ?? 0;
  const dueNowCount = toFiniteNumber(record.proms?.dueNowCount) ?? 0;
  const completedThisWeekCount = toFiniteNumber(record.proms?.completedThisWeekCount) ?? 0;
  const alertsCreatedThisWeek = toFiniteNumber(record.safety?.alertsCreatedThisWeek) ?? 0;
  const highRiskAlertsThisWeek = toFiniteNumber(record.safety?.highRiskAlertsThisWeek) ?? 0;
  const trackedSleepNights = toFiniteNumber(record.sleep?.trackedNights) ?? 0;
  const photosUploadedThisWeek = toFiniteNumber(record.photos?.uploadedThisWeek) ?? 0;
  const photosSwelling = toFiniteNumber(record.photos?.kinds?.swelling) ?? 0;
  const photosWound = toFiniteNumber(record.photos?.kinds?.wound) ?? 0;
  const photosRash = toFiniteNumber(record.photos?.kinds?.rash) ?? 0;
  const photosOther = toFiniteNumber(record.photos?.kinds?.other) ?? 0;
  const hydrationTrackedDays = toFiniteNumber(record.hydration?.trackedDays) ?? 0;
  const hydrationTotalMl = toFiniteNumber(record.hydration?.totalMl) ?? 0;
  const hydrationDaysMeetingTarget =
    toFiniteNumber(record.hydration?.daysMeetingTarget) ?? 0;
  const hydrationTargetMl = toFiniteNumber(record.hydration?.targetMl) ?? 2000;
  const nutritionTrackedDays = toFiniteNumber(record.nutrition?.trackedDays) ?? 0;
  const nutritionProteinOkHighDays =
    toFiniteNumber(record.nutrition?.proteinOkHighDays) ?? 0;
  const nutritionAntiInflammatoryDays =
    toFiniteNumber(record.nutrition?.antiInflammatoryDays) ?? 0;
  const nutritionRegularMealsDays =
    toFiniteNumber(record.nutrition?.regularMealsDays) ?? 0;
  const wearablesTrackedDays = toFiniteNumber(record.wearables?.trackedDays) ?? 0;
  const wearablesSource =
    record.wearables?.source === "healthkit_stub" ||
    record.wearables?.source === "googlefit_stub"
      ? record.wearables.source
      : "mock";
  const medicationScheduledDoses =
    toFiniteNumber(record.medications?.scheduledDoses) ?? 0;
  const medicationTakenDoses = toFiniteNumber(record.medications?.takenDoses) ?? 0;
  const medicationSkippedDoses =
    toFiniteNumber(record.medications?.skippedDoses) ?? 0;

  const bodyMapTopRegions = Array.isArray(record.bodyMap?.topRegions)
    ? record.bodyMap.topRegions
        .map((entry) => {
          const row =
            entry && typeof entry === "object"
              ? (entry as {
                  region?: unknown;
                  label?: unknown;
                  count?: unknown;
                  avgIntensity?: unknown;
                })
              : undefined;
          if (!row || !isBodyMapRegion(row.region)) {
            return null;
          }
          const label =
            typeof row.label === "string" && row.label.trim()
              ? row.label.trim()
              : row.region;
          const countValue = toFiniteNumber(row.count);
          if (countValue === null) {
            return null;
          }
          return {
            region: row.region,
            label,
            count: Math.max(0, Math.trunc(countValue)),
            avgIntensity: toFiniteNumber(row.avgIntensity),
          };
        })
        .filter(
          (
            item
          ): item is {
            region: BodyMapRegion;
            label: string;
            count: number;
            avgIntensity: number | null;
          } => Boolean(item)
        )
    : [];

  const latestCompleted =
    record.proms?.latestCompleted &&
    typeof record.proms.latestCompleted === "object" &&
    typeof record.proms.latestCompleted.id === "string" &&
    typeof record.proms.latestCompleted.title === "string" &&
    typeof record.proms.latestCompleted.normalized === "number" &&
    typeof record.proms.latestCompleted.bandLabel === "string" &&
    typeof record.proms.latestCompleted.completedAt === "string"
      ? {
          id: record.proms.latestCompleted.id,
          title: record.proms.latestCompleted.title,
          normalized: record.proms.latestCompleted.normalized,
          bandLabel: record.proms.latestCompleted.bandLabel,
          completedAt: record.proms.latestCompleted.completedAt,
        }
      : null;

  return {
    ok: true,
    patientId,
    period: {
      weekStart,
      weekEnd,
      tzOffsetMinutes:
        typeof record.period?.tzOffsetMinutes === "number"
          ? record.period.tzOffsetMinutes
          : null,
    },
    summary: {
      headline,
      highlights,
      nextSteps,
    },
    checkins: {
      count,
      avgPain: toFiniteNumber(record.checkins?.avgPain),
      avgMood: toFiniteNumber(record.checkins?.avgMood),
      avgExercisesPct: toFiniteNumber(record.checkins?.avgExercisesPct),
      medicationYesPct: toFiniteNumber(record.checkins?.medicationYesPct),
      notesCount,
    },
    bodyMap: {
      topRegions: bodyMapTopRegions,
    },
    sleep: {
      trackedNights: trackedSleepNights,
      avgHours: toFiniteNumber(record.sleep?.avgHours),
      avgQuality: toFiniteNumber(record.sleep?.avgQuality),
    },
    photos: {
      uploadedThisWeek: Math.max(0, Math.trunc(photosUploadedThisWeek)),
      kinds: {
        swelling: Math.max(0, Math.trunc(photosSwelling)),
        wound: Math.max(0, Math.trunc(photosWound)),
        rash: Math.max(0, Math.trunc(photosRash)),
        other: Math.max(0, Math.trunc(photosOther)),
      },
    },
    hydration: {
      trackedDays: hydrationTrackedDays,
      avgDailyMl: toFiniteNumber(record.hydration?.avgDailyMl),
      totalMl: hydrationTotalMl,
      daysMeetingTarget: hydrationDaysMeetingTarget,
      targetMl: hydrationTargetMl,
    },
    nutrition: {
      trackedDays: nutritionTrackedDays,
      avgFruitVegServings: toFiniteNumber(record.nutrition?.avgFruitVegServings),
      proteinOkHighDays: nutritionProteinOkHighDays,
      antiInflammatoryDays: nutritionAntiInflammatoryDays,
      regularMealsDays: nutritionRegularMealsDays,
    },
    wearables: {
      trackedDays: wearablesTrackedDays,
      avgSteps: toFiniteNumber(record.wearables?.avgSteps),
      avgActiveMinutes: toFiniteNumber(record.wearables?.avgActiveMinutes),
      source: wearablesSource,
    },
    medications: {
      scheduledDoses: medicationScheduledDoses,
      takenDoses: medicationTakenDoses,
      skippedDoses: medicationSkippedDoses,
      adherencePct: toFiniteNumber(record.medications?.adherencePct),
    },
    exercises: {
      sessionCount,
      totalDurationMinutes,
      completedExercises,
      totalExercises,
      avgPainDuring: toFiniteNumber(record.exercises?.avgPainDuring),
      difficulty: {
        easy: toFiniteNumber(record.exercises?.difficulty?.easy) ?? 0,
        ok: toFiniteNumber(record.exercises?.difficulty?.ok) ?? 0,
        hard: toFiniteNumber(record.exercises?.difficulty?.hard) ?? 0,
      },
    },
    proms: {
      dueNowCount,
      completedThisWeekCount,
      latestCompleted,
    },
    safety: {
      alertsCreatedThisWeek,
      highRiskAlertsThisWeek,
    },
  };
}

function normalizeIsoString(value: unknown): string | null {
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

function normalizePromScore(value: unknown): PromScore | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const score = value as {
    raw?: unknown;
    normalized?: unknown;
    bandKey?: unknown;
    bandLabel?: unknown;
  };

  const raw = toFiniteNumber(score.raw);
  const normalized = toFiniteNumber(score.normalized);
  const bandKey =
    score.bandKey === "green" || score.bandKey === "amber" || score.bandKey === "red"
      ? score.bandKey
      : null;
  const bandLabel =
    typeof score.bandLabel === "string" && score.bandLabel.trim()
      ? score.bandLabel.trim()
      : null;

  if (raw === null || normalized === null || !bandKey || !bandLabel) {
    return null;
  }

  return {
    raw,
    normalized,
    bandKey,
    bandLabel,
  };
}

function normalizePromDueCard(value: unknown): PromDueCard | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const card = value as {
    id?: unknown;
    _id?: unknown;
    templateKey?: unknown;
    title?: unknown;
    titleSnapshot?: unknown;
    dueAt?: unknown;
    status?: unknown;
  };

  const id = typeof (card.id ?? card._id) === "string" ? String(card.id ?? card._id).trim() : "";
  const templateKey = typeof card.templateKey === "string" ? card.templateKey.trim() : "";
  const titleSource = card.title ?? card.titleSnapshot;
  const title = typeof titleSource === "string" ? titleSource.trim() : "";
  const dueAt = normalizeIsoString(card.dueAt);
  const status: "due" | "completed" = card.status === "completed" ? "completed" : "due";

  if (!id || !templateKey || !title || !dueAt) {
    return null;
  }

  return {
    id,
    templateKey,
    title,
    dueAt,
    status,
  };
}

function normalizePromHistoryRow(value: unknown): PromHistoryRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as {
    id?: unknown;
    _id?: unknown;
    templateKey?: unknown;
    title?: unknown;
    titleSnapshot?: unknown;
    completedAt?: unknown;
    score?: unknown;
  };

  const id = typeof (row.id ?? row._id) === "string" ? String(row.id ?? row._id).trim() : "";
  const templateKey = typeof row.templateKey === "string" ? row.templateKey.trim() : "";
  const titleSource = row.title ?? row.titleSnapshot;
  const title = typeof titleSource === "string" ? titleSource.trim() : "";
  const completedAt = normalizeIsoString(row.completedAt);
  if (!id || !templateKey || !title || !completedAt) {
    return null;
  }

  const score = normalizePromScore(row.score);
  return {
    id,
    templateKey,
    title,
    completedAt,
    score: score
      ? {
          normalized: score.normalized,
          bandKey: score.bandKey,
          bandLabel: score.bandLabel,
        }
      : null,
  };
}

function normalizePromQuestion(value: unknown): PromQuestion | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const question = value as {
    id?: unknown;
    text?: unknown;
    type?: unknown;
    min?: unknown;
    max?: unknown;
    labels?: { minLabel?: unknown; maxLabel?: unknown };
    required?: unknown;
  };

  const id = typeof question.id === "string" ? question.id.trim() : "";
  const text = typeof question.text === "string" ? question.text.trim() : "";
  const min = toFiniteNumber(question.min);
  const max = toFiniteNumber(question.max);
  if (!id || !text || min === null || max === null) {
    return null;
  }

  return {
    id,
    text,
    type: "likert",
    min,
    max,
    labels:
      question.labels && typeof question.labels === "object"
        ? {
            minLabel:
              typeof question.labels.minLabel === "string"
                ? question.labels.minLabel
                : undefined,
            maxLabel:
              typeof question.labels.maxLabel === "string"
                ? question.labels.maxLabel
                : undefined,
          }
        : undefined,
    required: question.required !== false,
  };
}

function normalizePromAnswer(value: unknown): PromAnswer | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const answer = value as { questionId?: unknown; value?: unknown };
  const questionId =
    typeof answer.questionId === "string" ? answer.questionId.trim() : "";
  const numericValue = toFiniteNumber(answer.value);
  if (!questionId || numericValue === null) {
    return null;
  }

  return {
    questionId,
    value: numericValue,
  };
}

function normalizePromInstance(value: unknown): PromInstance | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const instance = value as {
    id?: unknown;
    _id?: unknown;
    templateKey?: unknown;
    templateVersion?: unknown;
    title?: unknown;
    titleSnapshot?: unknown;
    dueAt?: unknown;
    status?: unknown;
    completedAt?: unknown;
    questions?: unknown;
    questionsSnapshot?: unknown;
    answers?: unknown;
    score?: unknown;
  };

  const id =
    typeof (instance.id ?? instance._id) === "string"
      ? String(instance.id ?? instance._id).trim()
      : "";
  const templateKey =
    typeof instance.templateKey === "string" ? instance.templateKey.trim() : "";
  const titleSource = instance.title ?? instance.titleSnapshot;
  const title = typeof titleSource === "string" ? titleSource.trim() : "";
  const templateVersion = toFiniteNumber(instance.templateVersion) ?? 1;
  const dueAt = normalizeIsoString(instance.dueAt);
  const status: "due" | "completed" = instance.status === "completed" ? "completed" : "due";
  const completedAt = normalizeIsoString(instance.completedAt);
  if (!id || !templateKey || !title || !dueAt) {
    return null;
  }

  const questionsSource = Array.isArray(instance.questions)
    ? instance.questions
    : Array.isArray(instance.questionsSnapshot)
      ? instance.questionsSnapshot
      : [];
  const questions = questionsSource
    .map((entry) => normalizePromQuestion(entry))
    .filter((entry): entry is PromQuestion => Boolean(entry));

  const answers = Array.isArray(instance.answers)
    ? instance.answers
        .map((entry) => normalizePromAnswer(entry))
        .filter((entry): entry is PromAnswer => Boolean(entry))
    : [];

  return {
    id,
    templateKey,
    templateVersion,
    title,
    dueAt,
    status,
    completedAt,
    questions,
    answers,
    score: normalizePromScore(instance.score),
  };
}

function normalizeBodyMapRegionEntry(
  value: unknown
): {
  region: BodyMapRegion;
  intensity: number;
  type: BodyMapPainType;
} | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as { region?: unknown; intensity?: unknown; type?: unknown };
  if (!isBodyMapRegion(item.region)) {
    return null;
  }
  if (
    typeof item.intensity !== "number" ||
    !Number.isFinite(item.intensity) ||
    !Number.isInteger(item.intensity) ||
    item.intensity < 0 ||
    item.intensity > 10
  ) {
    return null;
  }
  if (!isBodyMapPainType(item.type)) {
    return null;
  }

  return {
    region: item.region,
    intensity: item.intensity,
    type: item.type,
  };
}

function normalizeBodyMap(value: unknown): CheckInItem["bodyMap"] | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as { regions?: unknown; primaryRegion?: unknown };
  const regionsSource = Array.isArray(record.regions)
    ? (record.regions as unknown[])
    : [];

  const regions = regionsSource
    .map((item) => normalizeBodyMapRegionEntry(item))
    .filter(
      (
        item
      ): item is {
        region: BodyMapRegion;
        intensity: number;
        type: BodyMapPainType;
      } => Boolean(item)
    );

  if (regions.length === 0) {
    return undefined;
  }

  return {
    primaryRegion: isBodyMapRegion(record.primaryRegion)
      ? record.primaryRegion
      : undefined,
    regions,
  };
}

function normalizeSymptomFlags(value: unknown): CheckInItem["symptoms"] | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const flags = Array.isArray((value as { flags?: unknown }).flags)
    ? ((value as { flags: unknown[] }).flags as unknown[]).filter(
        (item): item is CheckinSymptomFlag =>
          item === "stiffness" ||
          item === "swelling" ||
          item === "fatigue" ||
          item === "mobility_difficulty"
      )
    : [];

  return flags.length > 0 ? { flags } : undefined;
}

function normalizeCheckInItem(value: unknown): CheckInItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    id?: unknown;
    _id?: unknown;
    checkInId?: unknown;
    date?: unknown;
    createdAt?: unknown;
    pain?: unknown;
    mood?: unknown;
    adherence?: {
      exercises?: unknown;
      medication?: unknown;
      medicationStatus?: unknown;
      medicationReason?: unknown;
    };
    symptoms?: unknown;
    recovery?: {
      difficultyLevel?: unknown;
      confidenceLevel?: unknown;
      mobilityLevel?: unknown;
    };
    support?: {
      stressLevel?: unknown;
      feelsSafe?: unknown;
      wantsFollowUp?: unknown;
      wantsExtraSupport?: unknown;
      needsUrgentHelp?: unknown;
    };
    sleep?: {
      hours?: unknown;
      quality?: unknown;
      disturbances?: unknown;
    };
    dailySignals?: {
      hydrationLevel?: unknown;
      energyLevel?: unknown;
    };
    bodyMap?: unknown;
    notes?: unknown;
  };

  const idSource = item.id ?? item._id ?? item.checkInId;
  const id = typeof idSource === "string" ? idSource : null;
  if (!id || !id.trim()) {
    return null;
  }

  const pain = toFiniteNumber(item.pain);
  const mood = toFiniteNumber(item.mood);
  if (pain === null || mood === null) {
    return null;
  }

  const exercises = toFiniteNumber(item.adherence?.exercises);
  const medication =
    typeof item.adherence?.medication === "boolean"
      ? item.adherence.medication
      : undefined;
  const medicationStatus: CheckinMedicationStatus | undefined =
    item.adherence?.medicationStatus === "taken" ||
    item.adherence?.medicationStatus === "missed" ||
    item.adherence?.medicationStatus === "not_applicable"
      ? item.adherence.medicationStatus
      : undefined;
  const medicationReason =
    typeof item.adherence?.medicationReason === "string" &&
    item.adherence.medicationReason.trim()
      ? item.adherence.medicationReason.trim()
      : undefined;

  const adherence =
    exercises !== null ||
    typeof medication === "boolean" ||
    medicationStatus !== undefined ||
    medicationReason !== undefined
      ? {
          exercises: exercises !== null ? exercises : undefined,
          medication,
          medicationStatus,
          medicationReason,
        }
      : undefined;

  const sleepHours = toFiniteNumber(item.sleep?.hours);
  const sleepQuality = toFiniteNumber(item.sleep?.quality);
  const sleepDisturbances = toFiniteNumber(item.sleep?.disturbances);
  const sleep =
    sleepHours !== null || sleepQuality !== null || sleepDisturbances !== null
      ? {
          hours: sleepHours ?? undefined,
          quality: sleepQuality ?? undefined,
          disturbances: sleepDisturbances ?? undefined,
        }
      : undefined;

  const difficultyLevel = toFiniteNumber(item.recovery?.difficultyLevel);
  const confidenceLevel = toFiniteNumber(item.recovery?.confidenceLevel);
  const mobilityLevel = toFiniteNumber(item.recovery?.mobilityLevel);
  const recovery =
    difficultyLevel !== null || confidenceLevel !== null || mobilityLevel !== null
      ? {
          difficultyLevel: difficultyLevel ?? undefined,
          confidenceLevel: confidenceLevel ?? undefined,
          mobilityLevel: mobilityLevel ?? undefined,
        }
      : undefined;

  const stressLevel = toFiniteNumber(item.support?.stressLevel);
  const support =
    stressLevel !== null ||
    typeof item.support?.feelsSafe === "boolean" ||
    typeof item.support?.wantsFollowUp === "boolean" ||
    typeof item.support?.wantsExtraSupport === "boolean" ||
    typeof item.support?.needsUrgentHelp === "boolean"
      ? {
          stressLevel: stressLevel ?? undefined,
          feelsSafe:
            typeof item.support?.feelsSafe === "boolean"
              ? item.support.feelsSafe
              : undefined,
          wantsFollowUp:
            typeof item.support?.wantsFollowUp === "boolean"
              ? item.support.wantsFollowUp
              : undefined,
          wantsExtraSupport:
            typeof item.support?.wantsExtraSupport === "boolean"
              ? item.support.wantsExtraSupport
              : undefined,
          needsUrgentHelp:
            typeof item.support?.needsUrgentHelp === "boolean"
              ? item.support.needsUrgentHelp
              : undefined,
        }
      : undefined;

  const hydrationLevel = toFiniteNumber(item.dailySignals?.hydrationLevel);
  const energyLevel = toFiniteNumber(item.dailySignals?.energyLevel);
  const dailySignals =
    hydrationLevel !== null || energyLevel !== null
      ? {
          hydrationLevel: hydrationLevel ?? undefined,
          energyLevel: energyLevel ?? undefined,
        }
      : undefined;

  return {
    id: id.trim(),
    date: typeof item.date === "string" ? item.date : undefined,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
    pain,
    mood,
    symptoms: normalizeSymptomFlags(item.symptoms),
    adherence,
    recovery,
    support,
    sleep,
    dailySignals,
    bodyMap: normalizeBodyMap(item.bodyMap),
    notes: typeof item.notes === "string" ? item.notes : undefined,
  };
}

function normalizeSessionExercise(
  value: unknown
): ExerciseSessionExercisePayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    itemKey?: unknown;
    nameSnapshot?: unknown;
    order?: unknown;
    planned?: {
      sets?: unknown;
      reps?: unknown;
      holdSeconds?: unknown;
      restSeconds?: unknown;
    };
    completed?: unknown;
    setsDone?: unknown;
    repsDone?: unknown;
    difficulty?: unknown;
    painDuring?: unknown;
    note?: unknown;
    completedAt?: unknown;
  };

  const itemKey =
    typeof item.itemKey === "string" ? item.itemKey.trim() : "";
  const nameSnapshot =
    typeof item.nameSnapshot === "string" ? item.nameSnapshot.trim() : "";
  const order = toFiniteNumber(item.order);
  if (!itemKey || !nameSnapshot || order === null) {
    return null;
  }

  const planned =
    item.planned && typeof item.planned === "object"
      ? {
          sets: toFiniteNumber(item.planned.sets) ?? undefined,
          reps: toFiniteNumber(item.planned.reps) ?? undefined,
          holdSeconds: toFiniteNumber(item.planned.holdSeconds) ?? undefined,
          restSeconds: toFiniteNumber(item.planned.restSeconds) ?? undefined,
        }
      : undefined;

  const difficulty =
    item.difficulty === "easy" ||
    item.difficulty === "ok" ||
    item.difficulty === "hard"
      ? item.difficulty
      : undefined;

  const painDuring = toFiniteNumber(item.painDuring);
  const note = typeof item.note === "string" ? item.note.trim() : "";

  return {
    itemKey,
    nameSnapshot,
    order,
    planned,
    completed: item.completed === true,
    setsDone: toFiniteNumber(item.setsDone) ?? undefined,
    repsDone: toFiniteNumber(item.repsDone) ?? undefined,
    difficulty,
    painDuring: painDuring ?? undefined,
    note: note ? note : undefined,
    completedAt:
      typeof item.completedAt === "string" ? item.completedAt : undefined,
  };
}

function normalizeSessionListItem(value: unknown): ExerciseSessionListItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    id?: unknown;
    _id?: unknown;
    startedAt?: unknown;
    durationSeconds?: unknown;
    exerciseCount?: unknown;
    completedCount?: unknown;
    avgPainDuring?: unknown;
    planTitle?: unknown;
  };

  const id = typeof (item.id ?? item._id) === "string" ? String(item.id ?? item._id) : "";
  const startedAt = typeof item.startedAt === "string" ? item.startedAt : "";
  const durationSeconds = toFiniteNumber(item.durationSeconds);
  const exerciseCount = toFiniteNumber(item.exerciseCount);
  const completedCount = toFiniteNumber(item.completedCount);

  if (!id || !startedAt || durationSeconds === null || exerciseCount === null || completedCount === null) {
    return null;
  }

  const avgPainDuring = toFiniteNumber(item.avgPainDuring);
  const planTitle = typeof item.planTitle === "string" ? item.planTitle : undefined;

  return {
    id,
    startedAt,
    durationSeconds,
    exerciseCount,
    completedCount,
    avgPainDuring: avgPainDuring ?? undefined,
    planTitle,
  };
}

function normalizeSessionDetail(value: unknown): ExerciseSessionDetail | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    endedAt?: unknown;
    status?: unknown;
    planVersion?: unknown;
    planDayOfWeek?: unknown;
    exercises?: unknown;
  };
  const base = normalizeSessionListItem(record);
  if (!base) {
    return null;
  }

  const endedAt = typeof record.endedAt === "string" ? record.endedAt : "";
  if (!endedAt) {
    return null;
  }

  const status: ExerciseSessionStatus =
    record.status === "abandoned" ? "abandoned" : "completed";

  const exercises = Array.isArray(record.exercises)
    ? record.exercises
        .map((entry) => normalizeSessionExercise(entry))
        .filter((entry): entry is ExerciseSessionExercisePayload => Boolean(entry))
        .sort((left, right) => left.order - right.order)
    : [];

  return {
    ...base,
    endedAt,
    status,
    planVersion: toFiniteNumber(record.planVersion) ?? undefined,
    planDayOfWeek: toFiniteNumber(record.planDayOfWeek) ?? undefined,
    exercises,
  };
}

function parseCheckInTimestamp(item: CheckInItem): number {
  const dateTs = item.date ? Date.parse(item.date) : Number.NaN;
  if (Number.isFinite(dateTs)) {
    return dateTs;
  }

  const createdTs = item.createdAt ? Date.parse(item.createdAt) : Number.NaN;
  if (Number.isFinite(createdTs)) {
    return createdTs;
  }

  return 0;
}

function sortCheckInsDesc(items: CheckInItem[]): CheckInItem[] {
  return [...items].sort((a, b) => parseCheckInTimestamp(b) - parseCheckInTimestamp(a));
}

function normalizeHydrationEntry(value: unknown): HydrationEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as {
    id?: unknown;
    _id?: unknown;
    amountMl?: unknown;
    createdAt?: unknown;
  };
  const id = typeof entry.id === "string" ? entry.id : typeof entry._id === "string" ? entry._id : "";
  const amountMl = toFiniteNumber(entry.amountMl);
  const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : "";

  if (!id || amountMl === null || !createdAt) {
    return null;
  }

  return {
    id,
    amountMl: Math.round(amountMl),
    createdAt,
  };
}

function normalizeHydrationDayTotal(value: unknown): HydrationDayTotal | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const day = value as {
    date?: unknown;
    totalMl?: unknown;
    metTarget?: unknown;
  };
  const date = typeof day.date === "string" ? day.date : "";
  const totalMl = toFiniteNumber(day.totalMl);
  if (!date || totalMl === null) {
    return null;
  }

  return {
    date,
    totalMl: Math.round(totalMl),
    metTarget: typeof day.metTarget === "boolean" ? day.metTarget : undefined,
  };
}

function normalizeHydrationToday(value: unknown): HydrationTodayResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    ok?: unknown;
    date?: unknown;
    totalMl?: unknown;
    targetMl?: unknown;
    entries?: unknown;
    items?: unknown;
  };

  const date = typeof record.date === "string" ? record.date : "";
  const totalMl = toFiniteNumber(record.totalMl);
  if (!date || totalMl === null) {
    return null;
  }

  const source = Array.isArray(record.entries)
    ? record.entries
    : Array.isArray(record.items)
      ? record.items
      : [];
  const entries = source
    .map((entry) => normalizeHydrationEntry(entry))
    .filter((entry): entry is HydrationEntry => Boolean(entry))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  return {
    ok: record.ok !== false,
    date,
    totalMl: Math.round(totalMl),
    targetMl: toFiniteNumber(record.targetMl) ?? 2000,
    entries,
  };
}

function normalizeHydrationRange(value: unknown): HydrationRangeResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    ok?: unknown;
    from?: unknown;
    to?: unknown;
    targetMl?: unknown;
    days?: unknown;
    items?: unknown;
  };

  const from = typeof record.from === "string" ? record.from : "";
  const to = typeof record.to === "string" ? record.to : "";
  if (!from || !to) {
    return null;
  }

  const source = Array.isArray(record.days)
    ? record.days
    : Array.isArray(record.items)
      ? record.items
      : [];
  const days = source
    .map((entry) => normalizeHydrationDayTotal(entry))
    .filter((entry): entry is HydrationDayTotal => Boolean(entry))
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

  return {
    ok: record.ok !== false,
    from,
    to,
    targetMl: toFiniteNumber(record.targetMl) ?? 2000,
    days,
  };
}

function normalizeNutritionEntry(value: unknown): NutritionEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as {
    id?: unknown;
    _id?: unknown;
    date?: unknown;
    protein?: unknown;
    fruitVegServings?: unknown;
    antiInflammatoryFocus?: unknown;
    mealRegularity?: unknown;
    appetite?: unknown;
    notes?: unknown;
    createdAt?: unknown;
    pending?: unknown;
    localId?: unknown;
  };

  const id =
    typeof entry.id === "string"
      ? entry.id
      : typeof entry._id === "string"
        ? entry._id
        : "";
  const date = typeof entry.date === "string" ? entry.date : "";
  const protein =
    entry.protein === "low" || entry.protein === "ok" || entry.protein === "high"
      ? entry.protein
      : null;
  const fruitVegServings = toFiniteNumber(entry.fruitVegServings);
  const antiInflammatoryFocus =
    typeof entry.antiInflammatoryFocus === "boolean"
      ? entry.antiInflammatoryFocus
      : null;
  const mealRegularity =
    entry.mealRegularity === "irregular" ||
    entry.mealRegularity === "mostly" ||
    entry.mealRegularity === "regular"
      ? entry.mealRegularity
      : null;
  const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : "";

  if (
    !id ||
    !date ||
    !protein ||
    fruitVegServings === null ||
    antiInflammatoryFocus === null ||
    !mealRegularity ||
    !createdAt
  ) {
    return null;
  }

  const appetite =
    entry.appetite === "low" || entry.appetite === "normal" || entry.appetite === "high"
      ? entry.appetite
      : undefined;
  const notes =
    typeof entry.notes === "string" && entry.notes.trim() ? entry.notes.trim() : undefined;

  return {
    id,
    date,
    protein,
    fruitVegServings: Math.round(fruitVegServings),
    antiInflammatoryFocus,
    mealRegularity,
    appetite,
    notes,
    createdAt,
    pending: entry.pending === true ? true : undefined,
    localId: typeof entry.localId === "string" ? entry.localId : undefined,
  };
}

function normalizeNutritionToday(value: unknown): NutritionTodayResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    ok?: unknown;
    date?: unknown;
    entry?: unknown;
    item?: unknown;
    nutrition?: unknown;
  };
  const date = typeof record.date === "string" ? record.date : "";
  if (!date) {
    return null;
  }

  const entryCandidate =
    record.entry ?? record.item ?? (record.nutrition as { entry?: unknown } | undefined)?.entry;
  const entry =
    entryCandidate === null || typeof entryCandidate === "undefined"
      ? null
      : normalizeNutritionEntry(entryCandidate);

  if (entryCandidate && !entry) {
    return null;
  }

  return {
    ok: record.ok !== false,
    date,
    entry,
  };
}

function normalizeNutritionRange(value: unknown): NutritionRangeResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    ok?: unknown;
    from?: unknown;
    to?: unknown;
    days?: unknown;
    items?: unknown;
  };
  const from = typeof record.from === "string" ? record.from : "";
  const to = typeof record.to === "string" ? record.to : "";
  if (!from || !to) {
    return null;
  }

  const source = Array.isArray(record.days)
    ? record.days
    : Array.isArray(record.items)
      ? record.items
      : [];

  const days: NutritionDay[] = [];
  for (const value of source) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const day = value as {
      date?: unknown;
      entry?: unknown;
      item?: unknown;
    };
    const date = typeof day.date === "string" ? day.date : "";
    if (!date) {
      continue;
    }

    const entryCandidate = day.entry ?? day.item;
    const entry =
      entryCandidate === null || typeof entryCandidate === "undefined"
        ? null
        : normalizeNutritionEntry(entryCandidate);
    if (entryCandidate && !entry) {
      continue;
    }

    days.push({
      date,
      entry,
    });
  }

  days.sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

  return {
    ok: record.ok !== false,
    from,
    to,
    days,
  };
}

function normalizeMedicationType(value: unknown): MedicationType {
  return value === "supplement" ? "supplement" : "medication";
}

function normalizeMedicationDose(value: unknown): MedicationDose | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const dose = value as {
    time?: unknown;
    status?: unknown;
    loggedAt?: unknown;
    logId?: unknown;
    pending?: unknown;
    localId?: unknown;
  };

  const time = typeof dose.time === "string" ? dose.time : "";
  if (!time || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
    return null;
  }

  const status =
    dose.status === "taken" || dose.status === "skipped" || dose.status === "due"
      ? dose.status
      : null;
  if (!status) {
    return null;
  }

  return {
    time,
    status,
    loggedAt: typeof dose.loggedAt === "string" ? dose.loggedAt : undefined,
    logId: typeof dose.logId === "string" ? dose.logId : undefined,
    pending: dose.pending === true ? true : undefined,
    localId: typeof dose.localId === "string" ? dose.localId : undefined,
  };
}

function normalizeMedicationItem(value: unknown): MedicationItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    id?: unknown;
    _id?: unknown;
    name?: unknown;
    type?: unknown;
    instructions?: unknown;
    active?: unknown;
    schedule?: unknown;
    times?: unknown;
  };

  const id =
    typeof item.id === "string"
      ? item.id
      : typeof item._id === "string"
        ? item._id
        : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!id || !name) {
    return null;
  }

  const scheduleRecord =
    item.schedule && typeof item.schedule === "object"
      ? (item.schedule as { times?: unknown })
      : null;
  const rawTimes = Array.isArray(scheduleRecord?.times)
    ? scheduleRecord?.times
    : Array.isArray(item.times)
      ? item.times
      : [];

  const times = rawTimes
    .filter((time): time is string => typeof time === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(time))
    .sort((left, right) => left.localeCompare(right));

  return {
    id,
    name,
    type: normalizeMedicationType(item.type),
    instructions:
      typeof item.instructions === "string" && item.instructions.trim()
        ? item.instructions.trim()
        : undefined,
    active: item.active !== false,
    schedule: {
      times: [...new Set(times)],
    },
  };
}

function normalizeMedicationTodayItem(value: unknown): MedicationTodayItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as {
    medicationId?: unknown;
    id?: unknown;
    name?: unknown;
    type?: unknown;
    instructions?: unknown;
    doses?: unknown;
  };

  const medicationId =
    typeof item.medicationId === "string"
      ? item.medicationId
      : typeof item.id === "string"
        ? item.id
        : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!medicationId || !name) {
    return null;
  }

  const doses = Array.isArray(item.doses)
    ? item.doses
        .map((dose) => normalizeMedicationDose(dose))
        .filter((dose): dose is MedicationDose => Boolean(dose))
        .sort((left, right) => left.time.localeCompare(right.time))
    : [];

  return {
    medicationId,
    name,
    type: normalizeMedicationType(item.type),
    instructions:
      typeof item.instructions === "string" && item.instructions.trim()
        ? item.instructions.trim()
        : undefined,
    doses,
  };
}

function normalizeMedicationList(value: unknown): MedicationListResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    ok?: unknown;
    medications?: unknown;
    items?: unknown;
  };

  const source = Array.isArray(record.medications)
    ? record.medications
    : Array.isArray(record.items)
      ? record.items
      : [];

  return {
    ok: record.ok !== false,
    medications: source
      .map((item) => normalizeMedicationItem(item))
      .filter((item): item is MedicationItem => Boolean(item)),
  };
}

function normalizeMedicationToday(value: unknown): MedicationTodayResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    ok?: unknown;
    date?: unknown;
    items?: unknown;
    medications?: unknown;
  };
  const date = typeof record.date === "string" ? record.date : "";
  if (!date) {
    return null;
  }

  const source = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.medications)
      ? record.medications
      : [];

  return {
    ok: record.ok !== false,
    date,
    items: source
      .map((item) => normalizeMedicationTodayItem(item))
      .filter((item): item is MedicationTodayItem => Boolean(item)),
  };
}

function normalizeMedicationAdherenceDay(value: unknown): MedicationAdherenceDay | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const day = value as {
    date?: unknown;
    taken?: unknown;
    skipped?: unknown;
    totalScheduled?: unknown;
  };

  const date = typeof day.date === "string" ? day.date : "";
  const taken = toFiniteNumber(day.taken);
  const skipped = toFiniteNumber(day.skipped);
  const totalScheduled = toFiniteNumber(day.totalScheduled);
  if (!date || taken === null || skipped === null || totalScheduled === null) {
    return null;
  }

  return {
    date,
    taken: Math.max(0, Math.round(taken)),
    skipped: Math.max(0, Math.round(skipped)),
    totalScheduled: Math.max(0, Math.round(totalScheduled)),
  };
}

function normalizeMedicationAdherenceRange(value: unknown): MedicationAdherenceRangeResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    ok?: unknown;
    from?: unknown;
    to?: unknown;
    days?: unknown;
    items?: unknown;
  };
  const from = typeof record.from === "string" ? record.from : "";
  const to = typeof record.to === "string" ? record.to : "";
  if (!from || !to) {
    return null;
  }

  const source = Array.isArray(record.days)
    ? record.days
    : Array.isArray(record.items)
      ? record.items
      : [];

  const days = source
    .map((day) => normalizeMedicationAdherenceDay(day))
    .filter((day): day is MedicationAdherenceDay => Boolean(day))
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

  return {
    ok: record.ok !== false,
    from,
    to,
    days,
  };
}

function normalizeSymptomPhotoKind(value: unknown): SymptomPhotoKind {
  return value === "swelling" || value === "wound" || value === "rash"
    ? value
    : "other";
}

function normalizeSymptomPhotoItem(value: unknown): SymptomPhotoItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as {
    id?: unknown;
    _id?: unknown;
    date?: unknown;
    kind?: unknown;
    notePreview?: unknown;
    createdAt?: unknown;
    pending?: unknown;
    localId?: unknown;
    localFileUri?: unknown;
  };

  const id =
    typeof item.id === "string"
      ? item.id
      : typeof item._id === "string"
        ? item._id
        : "";
  const date = typeof item.date === "string" ? item.date : "";
  const createdAt = typeof item.createdAt === "string" ? item.createdAt : "";
  if (!id || !date || !createdAt) {
    return null;
  }

  return {
    id,
    date,
    kind: normalizeSymptomPhotoKind(item.kind),
    notePreview:
      typeof item.notePreview === "string" && item.notePreview.trim()
        ? item.notePreview.trim()
        : undefined,
    createdAt,
    pending: item.pending === true ? true : undefined,
    localId: typeof item.localId === "string" ? item.localId : undefined,
    localFileUri:
      typeof item.localFileUri === "string" ? item.localFileUri : undefined,
  };
}

function normalizeSymptomPhotoMeta(value: unknown): SymptomPhotoMeta | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const meta = value as {
    id?: unknown;
    _id?: unknown;
    date?: unknown;
    kind?: unknown;
    note?: unknown;
    createdAt?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
    patientId?: unknown;
  };

  const id =
    typeof meta.id === "string"
      ? meta.id
      : typeof meta._id === "string"
        ? meta._id
        : "";
  const date = typeof meta.date === "string" ? meta.date : "";
  const createdAt = typeof meta.createdAt === "string" ? meta.createdAt : "";
  const mimeType = typeof meta.mimeType === "string" ? meta.mimeType : "";
  const sizeBytes = toFiniteNumber(meta.sizeBytes);
  if (!id || !date || !createdAt || !mimeType || sizeBytes === null) {
    return null;
  }

  return {
    id,
    date,
    kind: normalizeSymptomPhotoKind(meta.kind),
    note: typeof meta.note === "string" ? meta.note : undefined,
    createdAt,
    mimeType,
    sizeBytes: Math.max(0, Math.trunc(sizeBytes)),
    patientId:
      typeof meta.patientId === "string" && meta.patientId.trim()
        ? meta.patientId
        : undefined,
  };
}

function normalizeInsightCategory(value: unknown): InsightCategory {
  if (
    value === "adherence" ||
    value === "symptoms" ||
    value === "recovery" ||
    value === "safety" ||
    value === "questionnaires"
  ) {
    return value;
  }
  return "habits";
}

function normalizeInsightConfidence(value: unknown): InsightConfidence {
  if (value === "high" || value === "medium") {
    return value;
  }
  return "low";
}

function normalizeApprovedInsight(value: unknown): ApprovedInsight | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    id?: unknown;
    _id?: unknown;
    title?: unknown;
    message?: unknown;
    category?: unknown;
    confidence?: unknown;
    priority?: unknown;
    createdAt?: unknown;
    reviewedAt?: unknown;
  };

  const id =
    typeof record.id === "string"
      ? record.id
      : typeof record._id === "string"
        ? record._id
        : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  const priority = toFiniteNumber(record.priority);
  if (!id || !title || !message || !createdAt || priority === null) {
    return null;
  }

  return {
    id,
    title: title.slice(0, 80),
    message: message.slice(0, 280),
    category: normalizeInsightCategory(record.category),
    confidence: normalizeInsightConfidence(record.confidence),
    priority: Math.max(1, Math.min(5, Math.round(priority))),
    createdAt,
    reviewedAt:
      typeof record.reviewedAt === "string" && record.reviewedAt.trim()
        ? record.reviewedAt
        : undefined,
  };
}

export async function logHydration(
  token: string,
  payload: HydrationLogPayload
): Promise<HydrationEntry> {
  const response = await apiFetchJson<{
    id?: unknown;
    _id?: unknown;
    amountMl?: unknown;
    createdAt?: unknown;
    ok?: unknown;
  }>("/patient/hydration/log", {
    method: "POST",
    token,
    body: payload,
  });

  const normalized = normalizeHydrationEntry(response);
  if (!normalized) {
    throw invalidResponseError("Could not parse hydration log response.");
  }

  return normalized;
}

export async function logNutrition(
  token: string,
  payload: NutritionLogPayload
): Promise<NutritionEntry> {
  const response = await apiFetchJson<{
    entry?: unknown;
    nutrition?: unknown;
    data?: unknown;
  }>("/patient/nutrition/log", {
    method: "POST",
    token,
    body: payload,
  });

  const normalized =
    normalizeNutritionEntry(response.entry) ??
    normalizeNutritionEntry(response.nutrition) ??
    normalizeNutritionEntry(response.data) ??
    normalizeNutritionEntry(response);
  if (!normalized) {
    throw invalidResponseError("Could not parse nutrition log response.");
  }

  return normalized;
}

export async function getNutritionToday(
  token: string,
  date?: string
): Promise<NutritionTodayResponse> {
  const query = new URLSearchParams();
  if (date) {
    query.set("date", date);
  }
  const path = query.toString()
    ? `/patient/nutrition/today?${query.toString()}`
    : "/patient/nutrition/today";

  const payload = await apiFetchJson<{
    data?: unknown;
    nutrition?: unknown;
  }>(path, {
    method: "GET",
    token,
  });

  const normalized =
    normalizeNutritionToday(payload.data) ??
    normalizeNutritionToday(payload.nutrition) ??
    normalizeNutritionToday(payload);
  if (!normalized) {
    throw invalidResponseError("Could not parse nutrition today response.");
  }

  return normalized;
}

export async function getNutritionRange(
  token: string,
  params: { from: string; to: string }
): Promise<NutritionRangeResponse> {
  const query = new URLSearchParams();
  query.set("from", params.from);
  query.set("to", params.to);

  const payload = await apiFetchJson<{
    data?: unknown;
    nutrition?: unknown;
  }>(`/patient/nutrition/range?${query.toString()}`, {
    method: "GET",
    token,
  });

  const normalized =
    normalizeNutritionRange(payload.data) ??
    normalizeNutritionRange(payload.nutrition) ??
    normalizeNutritionRange(payload);
  if (!normalized) {
    throw invalidResponseError("Could not parse nutrition range response.");
  }

  return normalized;
}

export async function getHydrationToday(
  token: string,
  date?: string
): Promise<HydrationTodayResponse> {
  const query = new URLSearchParams();
  if (date) {
    query.set("date", date);
  }
  const path = query.toString()
    ? `/patient/hydration/today?${query.toString()}`
    : "/patient/hydration/today";

  const payload = await apiFetchJson<{
    data?: unknown;
    hydration?: unknown;
  }>(path, {
    method: "GET",
    token,
  });

  const normalized =
    normalizeHydrationToday(payload.data) ??
    normalizeHydrationToday(payload.hydration) ??
    normalizeHydrationToday(payload);
  if (!normalized) {
    throw invalidResponseError("Could not parse hydration total response.");
  }

  return normalized;
}

export async function getHydrationRange(
  token: string,
  params: { from: string; to: string }
): Promise<HydrationRangeResponse> {
  const query = new URLSearchParams();
  query.set("from", params.from);
  query.set("to", params.to);

  const payload = await apiFetchJson<{
    data?: unknown;
    hydration?: unknown;
  }>(`/patient/hydration/range?${query.toString()}`, {
    method: "GET",
    token,
  });

  const normalized =
    normalizeHydrationRange(payload.data) ??
    normalizeHydrationRange(payload.hydration) ??
    normalizeHydrationRange(payload);
  if (!normalized) {
    throw invalidResponseError("Could not parse hydration range response.");
  }

  return normalized;
}

export async function getMedications(token: string): Promise<MedicationListResponse> {
  const payload = await apiFetchJson<{
    data?: unknown;
    medications?: unknown;
  }>("/patient/medications", {
    method: "GET",
    token,
  });

  const normalized =
    normalizeMedicationList(payload.data) ??
    normalizeMedicationList(payload.medications) ??
    normalizeMedicationList(payload);
  if (!normalized) {
    throw invalidResponseError("Could not parse medications response.");
  }
  return normalized;
}

export async function getMedicationToday(
  token: string,
  params?: { date?: string; tzOffsetMinutes?: number }
): Promise<MedicationTodayResponse> {
  const query = new URLSearchParams();
  if (params?.date) {
    query.set("date", params.date);
  }
  if (typeof params?.tzOffsetMinutes === "number" && Number.isFinite(params.tzOffsetMinutes)) {
    query.set("tzOffsetMinutes", String(Math.trunc(params.tzOffsetMinutes)));
  }

  const path = query.toString()
    ? `/patient/medications/today?${query.toString()}`
    : "/patient/medications/today";

  const payload = await apiFetchJson<{
    data?: unknown;
    medications?: unknown;
  }>(path, {
    method: "GET",
    token,
  });

  const normalized =
    normalizeMedicationToday(payload.data) ??
    normalizeMedicationToday(payload.medications) ??
    normalizeMedicationToday(payload);
  if (!normalized) {
    throw invalidResponseError("Could not parse medication today response.");
  }
  return normalized;
}

export async function logMedicationDose(
  token: string,
  payload: MedicationLogPayload
): Promise<MedicationLogResult> {
  const response = await apiFetchJson<{
    ok?: unknown;
    id?: unknown;
    date?: unknown;
    time?: unknown;
    status?: unknown;
    loggedAt?: unknown;
    data?: unknown;
  }>("/patient/medications/log", {
    method: "POST",
    token,
    body: payload,
  });

  const record =
    response.data && typeof response.data === "object"
      ? ({ ...response.data, ...response } as typeof response)
      : response;

  const date = typeof record.date === "string" ? record.date : "";
  const time = typeof record.time === "string" ? record.time : "";
  const status = record.status === "taken" || record.status === "skipped" ? record.status : null;
  if (!date || !time || !status) {
    throw invalidResponseError("Could not parse medication log response.");
  }

  return {
    ok: record.ok !== false,
    id: typeof record.id === "string" ? record.id : undefined,
    date,
    time,
    status,
    loggedAt: typeof record.loggedAt === "string" ? record.loggedAt : undefined,
  };
}

export async function getMedicationAdherenceRange(
  token: string,
  params: { from: string; to: string }
): Promise<MedicationAdherenceRangeResponse> {
  const query = new URLSearchParams();
  query.set("from", params.from);
  query.set("to", params.to);

  const payload = await apiFetchJson<{
    data?: unknown;
    medications?: unknown;
  }>(`/patient/medications/logs/range?${query.toString()}`, {
    method: "GET",
    token,
  });

  const normalized =
    normalizeMedicationAdherenceRange(payload.data) ??
    normalizeMedicationAdherenceRange(payload.medications) ??
    normalizeMedicationAdherenceRange(payload);
  if (!normalized) {
    throw invalidResponseError("Could not parse medication adherence response.");
  }
  return normalized;
}

function fallbackFileName(mimeType: string): string {
  const extension =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/heic"
          ? "heic"
          : mimeType === "image/heif"
            ? "heif"
            : "jpg";
  return `symptom-photo.${extension}`;
}

export async function uploadPhoto(
  token: string,
  payload: PhotoUploadPayload
): Promise<PhotoUploadResponse> {
  const form = new FormData();
  if (payload.date) {
    form.append("date", payload.date);
  }
  form.append("kind", payload.kind);
  if (payload.note && payload.note.trim()) {
    form.append("note", payload.note.trim().slice(0, 280));
  }

  const uri = payload.uri;
  const fileNameCandidate =
    typeof uri === "string" && uri.includes("/") ? uri.split("/").pop() : "";
  const fileName =
    typeof fileNameCandidate === "string" && fileNameCandidate.trim()
      ? fileNameCandidate
      : fallbackFileName(payload.mimeType);

  form.append("file", {
    uri,
    name: fileName,
    type: payload.mimeType,
  } as any);

  const response = await apiFetchJson<{
    ok?: unknown;
    id?: unknown;
    _id?: unknown;
    date?: unknown;
    kind?: unknown;
    createdAt?: unknown;
    data?: unknown;
  }>("/patient/photos", {
    method: "POST",
    token,
    body: form,
  });

  const record =
    response.data && typeof response.data === "object"
      ? ({ ...response, ...response.data } as typeof response)
      : response;
  const id =
    typeof record.id === "string"
      ? record.id
      : typeof record._id === "string"
        ? record._id
        : "";
  const date = typeof record.date === "string" ? record.date : "";
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  if (!id || !date || !createdAt) {
    throw invalidResponseError("Could not parse symptom photo upload response.");
  }

  return {
    ok: record.ok !== false,
    id,
    date,
    kind: normalizeSymptomPhotoKind(record.kind),
    createdAt,
  };
}

export async function listPhotos(
  token: string,
  params?: { limit?: number; from?: string; to?: string }
): Promise<SymptomPhotoItem[]> {
  const query = new URLSearchParams();
  if (typeof params?.limit === "number" && Number.isFinite(params.limit)) {
    query.set("limit", String(Math.max(1, Math.trunc(params.limit))));
  }
  if (params?.from) {
    query.set("from", params.from);
  }
  if (params?.to) {
    query.set("to", params.to);
  }
  const path = query.toString()
    ? `/patient/photos?${query.toString()}`
    : "/patient/photos";

  const payload = await apiFetchJson<{
    items?: unknown;
    photos?: unknown;
    data?: unknown;
  }>(path, {
    method: "GET",
    token,
  });

  const source = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.photos)
      ? payload.photos
      : Array.isArray(payload.data)
        ? payload.data
        : [];

  return source
    .map((item) => normalizeSymptomPhotoItem(item))
    .filter((item): item is SymptomPhotoItem => Boolean(item))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export async function getPhotoMeta(
  token: string,
  photoId: string
): Promise<SymptomPhotoMeta> {
  const payload = await apiFetchJson<{
    photo?: unknown;
    item?: unknown;
    data?: unknown;
  }>(`/patient/photos/${encodeURIComponent(photoId)}/meta`, {
    method: "GET",
    token,
  });

  const normalized =
    normalizeSymptomPhotoMeta(payload.photo) ??
    normalizeSymptomPhotoMeta(payload.item) ??
    normalizeSymptomPhotoMeta(payload.data) ??
    normalizeSymptomPhotoMeta(payload);

  if (!normalized) {
    throw invalidResponseError("Could not parse symptom photo metadata.");
  }

  return normalized;
}

export async function getApprovedInsights(
  token: string,
  limit: number = 5
): Promise<ApprovedInsight[]> {
  const query = new URLSearchParams();
  if (Number.isFinite(limit)) {
    query.set("limit", String(Math.max(1, Math.trunc(limit))));
  }
  const path = query.toString()
    ? `/patient/insights?${query.toString()}`
    : "/patient/insights";

  const payload = await apiFetchJson<{
    items?: unknown;
    insights?: unknown;
    data?: unknown;
  }>(path, {
    method: "GET",
    token,
  });

  const source = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.insights)
      ? payload.insights
      : Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload as unknown)
          ? (payload as unknown[])
          : [];

  return source
    .map((item) => normalizeApprovedInsight(item))
    .filter((item): item is ApprovedInsight => Boolean(item))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export async function deleteHydrationEntry(token: string, id: string): Promise<void> {
  await apiFetchJson(`/patient/hydration/entries/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });
}

export async function listCheckins(
  token: string,
  params?: { from?: string; to?: string; limit?: number }
): Promise<CheckInItem[]> {
  const query = new URLSearchParams();
  if (params?.from) {
    query.set("from", params.from);
  }
  if (params?.to) {
    query.set("to", params.to);
  }
  if (typeof params?.limit === "number" && Number.isFinite(params.limit)) {
    query.set("limit", String(params.limit));
  }

  const path = query.toString()
    ? `/patient/checkins?${query.toString()}`
    : "/patient/checkins";

  const payload = await apiFetchJson<
    | CheckInItem[]
    | {
        items?: unknown;
        checkins?: unknown;
      }
  >(path, {
    method: "GET",
    token,
  });

  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.checkins)
        ? payload.checkins
        : [];

  const normalized = rawItems
    .map((item) => normalizeCheckInItem(item))
    .filter((item): item is CheckInItem => Boolean(item));

  const sorted = sortCheckInsDesc(normalized);
  const seen = new Set<string>();
  return sorted.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

export async function getTodayExercisePlan(
  token: string,
  params?: { date?: string; tzOffsetMinutes?: number }
): Promise<TodayPlanResponse> {
  const query = new URLSearchParams();
  if (params?.date) {
    query.set("date", params.date);
  }
  if (
    typeof params?.tzOffsetMinutes === "number" &&
    Number.isFinite(params.tzOffsetMinutes)
  ) {
    query.set("tzOffsetMinutes", String(Math.trunc(params.tzOffsetMinutes)));
  }

  const path = query.toString()
    ? `/patient/exercise-plan/today?${query.toString()}`
    : "/patient/exercise-plan/today";

  const payload = await apiFetchJson<{
    ok?: unknown;
    patientId?: unknown;
    date?: unknown;
    dayOfWeek?: unknown;
    plan?: unknown;
  }>(path, {
    method: "GET",
    token,
  });

  const patientId =
    typeof payload.patientId === "string" ? payload.patientId : "";
  const date = typeof payload.date === "string" ? payload.date : "";
  const dayOfWeek = toFiniteNumber(payload.dayOfWeek) ?? 0;
  const plan = normalizeTodayPlan(payload.plan);

  return {
    ok: payload.ok !== false,
    patientId,
    date,
    dayOfWeek,
    plan,
  };
}

export async function getRehabPhases(token: string): Promise<RehabPayload> {
  const payload = await apiFetchJson<{
    rehab?: unknown;
    phases?: unknown;
    currentKey?: unknown;
    updatedAt?: unknown;
    updatedBy?: unknown;
  }>("/patient/rehab-phases", {
    method: "GET",
    token,
  });

  if (payload.rehab && typeof payload.rehab === "object") {
    return normalizeRehabPayload(payload.rehab);
  }

  return normalizeRehabPayload(payload);
}

export async function getWeeklyReport(
  token: string,
  params?: { weekStart?: string; tzOffsetMinutes?: number }
): Promise<WeeklyReport> {
  const query = new URLSearchParams();
  if (params?.weekStart) {
    query.set("weekStart", params.weekStart);
  }
  if (
    typeof params?.tzOffsetMinutes === "number" &&
    Number.isFinite(params.tzOffsetMinutes)
  ) {
    query.set("tzOffsetMinutes", String(Math.trunc(params.tzOffsetMinutes)));
  }

  const path = query.toString()
    ? `/patient/reports/weekly?${query.toString()}`
    : "/patient/reports/weekly";

  const payload = await apiFetchJson<{
    report?: unknown;
    data?: unknown;
  }>(path, {
    method: "GET",
    token,
  });

  const normalized =
    normalizeWeeklyReport(payload.report) ??
    normalizeWeeklyReport(payload.data) ??
    normalizeWeeklyReport(payload);

  if (!normalized) {
    throw invalidResponseError("Could not parse weekly report response.");
  }

  return normalized;
}

export async function createExerciseSession(
  token: string,
  payload: ExerciseSessionCreatePayload
): Promise<ExerciseSessionCreateResponse> {
  const response = await apiFetchJson<{
    ok?: unknown;
    sessionId?: unknown;
    createdAt?: unknown;
  }>("/patient/exercise-sessions", {
    method: "POST",
    token,
    body: payload,
  });

  return {
    ok: response.ok !== false,
    sessionId:
      typeof response.sessionId === "string" ? response.sessionId : undefined,
    createdAt:
      typeof response.createdAt === "string" ? response.createdAt : undefined,
  };
}

export async function listExerciseSessions(
  token: string,
  limit = 20
): Promise<ExerciseSessionListItem[]> {
  const payload = await apiFetchJson<
    | ExerciseSessionListItem[]
    | {
        sessions?: unknown;
        items?: unknown;
      }
  >(`/patient/exercise-sessions?limit=${encodeURIComponent(String(limit))}`, {
    method: "GET",
    token,
  });

  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.sessions)
      ? payload.sessions
      : Array.isArray(payload.items)
        ? payload.items
        : [];

  return source
    .map((entry) => normalizeSessionListItem(entry))
    .filter((entry): entry is ExerciseSessionListItem => Boolean(entry))
    .sort(
      (left, right) =>
        Date.parse(right.startedAt) - Date.parse(left.startedAt)
    );
}

export async function getExerciseSession(
  token: string,
  sessionId: string
): Promise<ExerciseSessionDetail> {
  const payload = await apiFetchJson<{
    session?: unknown;
    data?: unknown;
  }>(`/patient/exercise-sessions/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    token,
  });

  const detail =
    normalizeSessionDetail(payload.session) ?? normalizeSessionDetail(payload.data);
  if (!detail) {
    throw invalidResponseError("Could not parse exercise session detail.");
  }

  return detail;
}

export async function getDueProms(
  token: string,
  limit = 10
): Promise<PromDueCard[]> {
  const payload = await apiFetchJson<
    | PromDueCard[]
    | {
        due?: unknown;
        items?: unknown;
      }
  >(`/patient/proms/due?limit=${encodeURIComponent(String(limit))}`, {
    method: "GET",
    token,
  });

  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.due)
      ? payload.due
      : Array.isArray(payload?.items)
        ? payload.items
        : [];

  return source
    .map((entry) => normalizePromDueCard(entry))
    .filter((entry): entry is PromDueCard => Boolean(entry))
    .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt));
}

export async function getPromHistory(
  token: string,
  limit = 20
): Promise<PromHistoryRow[]> {
  const payload = await apiFetchJson<
    | PromHistoryRow[]
    | {
        history?: unknown;
        items?: unknown;
      }
  >(`/patient/proms/history?limit=${encodeURIComponent(String(limit))}`, {
    method: "GET",
    token,
  });

  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.history)
      ? payload.history
      : Array.isArray(payload?.items)
        ? payload.items
        : [];

  return source
    .map((entry) => normalizePromHistoryRow(entry))
    .filter((entry): entry is PromHistoryRow => Boolean(entry))
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
}

export async function getPromInstance(
  token: string,
  promId: string
): Promise<PromInstance> {
  const payload = await apiFetchJson<{
    prom?: unknown;
    instance?: unknown;
    data?: unknown;
  }>(`/patient/proms/${encodeURIComponent(promId)}`, {
    method: "GET",
    token,
  });

  const instance =
    normalizePromInstance(payload.prom) ??
    normalizePromInstance(payload.instance) ??
    normalizePromInstance(payload.data) ??
    normalizePromInstance(payload);

  if (!instance) {
    throw invalidResponseError("Could not parse questionnaire detail.");
  }

  return instance;
}

export async function submitProm(
  token: string,
  promId: string,
  answers: PromAnswer[]
): Promise<PromSubmitResponse> {
  const payload = await apiFetchJson<{
    ok?: unknown;
    id?: unknown;
    completedAt?: unknown;
    score?: unknown;
  }>(`/patient/proms/${encodeURIComponent(promId)}/submit`, {
    method: "POST",
    token,
    body: { answers },
  });

  return {
    ok: payload.ok !== false,
    id: typeof payload.id === "string" ? payload.id : undefined,
    completedAt:
      typeof payload.completedAt === "string" ? payload.completedAt : undefined,
    score: normalizePromScore(payload.score),
  };
}

function toChatRole(value: unknown): ChatRole {
  if (value === "assistant" || value === "system" || value === "patient") {
    return value;
  }
  if (value === "user") {
    return "patient";
  }
  return "assistant";
}

function toChatItem(value: unknown): ChatItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    _id?: unknown;
    role?: unknown;
    text?: unknown;
    message?: unknown;
    content?: unknown;
    createdAt?: unknown;
  };
  const textSource = candidate.text ?? candidate.message ?? candidate.content;
  const text = typeof textSource === "string" ? textSource.trim() : "";
  if (!text) {
    return null;
  }

  const id =
    typeof candidate.id === "string"
      ? candidate.id
      : typeof candidate._id === "string"
        ? candidate._id
        : undefined;
  const createdAt =
    typeof candidate.createdAt === "string" ? candidate.createdAt : undefined;

  return {
    id,
    role: toChatRole(candidate.role),
    text,
    createdAt,
  };
}

function sortChatItemsAscending(items: ChatItem[]): ChatItem[] {
  return [...items].sort((a, b) => {
    const aTs = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
    const bTs = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;
    if (!Number.isFinite(aTs) && !Number.isFinite(bTs)) {
      return 0;
    }
    if (!Number.isFinite(aTs)) {
      return 1;
    }
    if (!Number.isFinite(bTs)) {
      return -1;
    }
    return aTs - bTs;
  });
}

export async function chatHistory(token: string, limit = 50): Promise<ChatItem[]> {
  const payload = await apiFetchJson<
    | ChatItem[]
    | {
        items?: unknown;
        messages?: unknown;
      }
  >(`/patient/chat/history?limit=${encodeURIComponent(String(limit))}`, {
    method: "GET",
    token,
  });

  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.messages)
        ? payload.messages
        : [];

  const normalized = source
    .map((item) => toChatItem(item))
    .filter((item): item is ChatItem => Boolean(item));

  return sortChatItemsAscending(normalized);
}

export async function sendChat(
  token: string,
  message: string
): Promise<ChatSendResponse> {
  return apiFetchJson<ChatSendResponse>("/patient/chat/send", {
    method: "POST",
    token,
    body: { message },
  });
}

export function extractConfirmedSendMessages(resp: ChatSendResponse): {
  user: ChatItem | null;
  assistant: ChatItem | null;
} {
  const messages =
    resp.messages && typeof resp.messages === "object" ? resp.messages : undefined;

  return {
    user: toChatItem(messages?.user),
    assistant: toChatItem(messages?.assistant),
  };
}

export function extractAssistantText(resp: ChatSendResponse): string | null {
  const { assistant } = extractConfirmedSendMessages(resp);
  if (assistant?.text) {
    return assistant.text.trim();
  }

  const value =
    resp.reply ??
    resp.assistant?.reply ??
    resp.assistant?.text ??
    resp.assistant?.message;

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (
    typeof resp.message === "string" &&
    resp.message.trim() &&
    resp.risk?.level !== "high" &&
    !resp.alertId
  ) {
    return resp.message.trim();
  }

  return null;
}
