import Alert from "../models/Alert";
import CheckIn from "../models/CheckIn";
import ExercisePlan from "../models/ExercisePlan";
import ExerciseSession from "../models/ExerciseSession";
import Patient from "../models/Patient";
import { mapPatientCareStatus } from "./patientCareStatusService";
import {
  getPatientRecoverySupportConfig,
  type PatientRecoverySupportSnapshot,
} from "./patientRecoverySupportService";
import {
  getPatientThresholdConfig,
  type PatientThresholdSnapshot,
} from "./patientThresholdService";
import { deriveMissedCheckinsFromThreshold } from "./riskEvaluationService";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SHORTENING_LOOKBACK_DAYS = 14;
const EXERCISE_GUARDRAIL_WINDOW_DAYS = 7;
const RESOLVED_HIGH_RISK_ALERT_COOLDOWN_DAYS = 7;
const CARE_CHANGE_COOLDOWN_MS = 72 * 60 * 60 * 1000;

export type CheckinAdaptationMode = "standard" | "shortened" | "expanded";

export type CheckinAdaptationDecisionSource =
  | "persistent_force_full"
  | "temporary_force_full"
  | "hard_safety_expanded"
  | "cooldown_standard"
  | "adaptive_shortened"
  | "adaptive_standard_fallback"
  | "adaptive_expanded";

export type CheckinAdaptationReasonCategory =
  | "override"
  | "safety"
  | "cooldown"
  | "stability"
  | "adherence"
  | "engagement"
  | "configuration";

export type CheckinAdaptationReasonDetail = {
  code: string;
  label: string;
  category: CheckinAdaptationReasonCategory;
};

export type CheckinAdaptationOptionalSections = {
  recovery: boolean;
  support: boolean;
  dailyContext: boolean;
};

export type CheckinAdaptationDecision = {
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
  optionalSections: CheckinAdaptationOptionalSections;
};

export type CheckinAdaptationAuditPayload = {
  patientId: string;
  date: string;
  mode: CheckinAdaptationMode;
  decisionSource: CheckinAdaptationDecisionSource;
  reasonCodes: string[];
  reasonDetails: CheckinAdaptationReasonDetail[];
  clinicianSummary: string;
  configVersion: number;
  thresholdVersion: number;
  generatedAt: string;
  recentCheckinsCount: number;
  missedCheckins: {
    flag: boolean;
    count: number;
  };
  openAlertCount: number;
  recentResolvedHighRiskAlertCount: number;
  temporaryForceFullUntil?: string | null;
  exercisePlanUpdatedAt?: string;
  rehabUpdatedAt?: string;
  currentPhaseStartedAt?: string;
  thresholdUpdatedAt?: string;
  recoverySupportUpdatedAt?: string;
  checkinAdherenceRecent?: number | null;
  checkinAdherencePrevious?: number | null;
  exerciseSessionCompletionRecentRate?: number | null;
  exerciseSessionCompletionPreviousRate?: number | null;
  exerciseSessionCompletionRecentTracked?: number;
};

export type CheckinAdaptationEvaluation = {
  decision: CheckinAdaptationDecision;
  auditPayload: CheckinAdaptationAuditPayload;
};

type PatientRehabPhaseRecord = {
  key?: unknown;
  status?: unknown;
  startedAt?: unknown;
};

type PatientRecord = {
  patientId?: unknown;
  displayName?: unknown;
  status?: unknown;
  clinicianId?: unknown;
  discharge?: unknown;
  rehab?: {
    currentKey?: unknown;
    updatedAt?: unknown;
    phases?: PatientRehabPhaseRecord[];
  };
};

type RecentCheckinRecord = {
  createdAt?: Date;
  date?: string;
  pain?: number;
  mood?: number;
  adherence?: {
    exercises?: unknown;
  };
  support?: {
    needsUrgentHelp?: unknown;
    feelsSafe?: unknown;
  };
  risk?: {
    level?: unknown;
  };
};

type ExerciseSessionRecord = {
  startedAt?: Date;
  exercises?: Array<{
    completed?: unknown;
  }>;
};

type SessionCompletionMetrics = {
  recentRate: number | null;
  previousRate: number | null;
  recentTracked: number;
  risky: boolean;
  reasonDetails: CheckinAdaptationReasonDetail[];
};

function toDateOnlyLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearString, monthString, dayString] = value.split("-");
  const year = Number.parseInt(yearString, 10);
  const month = Number.parseInt(monthString, 10);
  const day = Number.parseInt(dayString, 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampRate(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function toIsoString(value: unknown): string | undefined {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return undefined;
  }

  return value.toISOString();
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function isRecent(value: Date | null | undefined, now: Date, windowMs: number): boolean {
  if (!value) {
    return false;
  }

  return now.getTime() - value.getTime() <= windowMs;
}

function reasonDetail(
  code: string,
  label: string,
  category: CheckinAdaptationReasonCategory,
): CheckinAdaptationReasonDetail {
  return { code, label, category };
}

function dedupeReasonDetails(
  details: Array<CheckinAdaptationReasonDetail | null | undefined>,
): CheckinAdaptationReasonDetail[] {
  const byCode = new Map<string, CheckinAdaptationReasonDetail>();
  for (const detail of details) {
    if (detail && !byCode.has(detail.code)) {
      byCode.set(detail.code, detail);
    }
  }
  return Array.from(byCode.values());
}

function formatDateLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function buildOptionalSections(
  mode: CheckinAdaptationMode,
): CheckinAdaptationOptionalSections {
  if (mode === "expanded") {
    return {
      recovery: false,
      support: false,
      dailyContext: false,
    };
  }

  return {
    recovery: true,
    support: true,
    dailyContext: true,
  };
}

function buildPatientExplanation(
  source: CheckinAdaptationDecisionSource,
): string | undefined {
  if (source === "adaptive_shortened") {
    return "Today’s check-in starts with the most important questions. You can add more detail anytime.";
  }

  if (source === "hard_safety_expanded" || source === "adaptive_expanded") {
    return "Today’s check-in includes a few extra detail prompts because recent recovery changed.";
  }

  if (source === "temporary_force_full" || source === "cooldown_standard") {
    return "Today’s check-in includes the full set of questions while recent care updates settle.";
  }

  return undefined;
}

function buildClinicianSummary(input: {
  source: CheckinAdaptationDecisionSource;
  details: CheckinAdaptationReasonDetail[];
  temporaryForceFullUntil?: string | null;
}): string {
  switch (input.source) {
    case "persistent_force_full":
      return "Full flow is locked by the persistent clinician force-full setting.";
    case "temporary_force_full": {
      const expiryLabel = formatDateLabel(input.temporaryForceFullUntil);
      return expiryLabel
        ? `Full flow is temporarily locked until ${expiryLabel}.`
        : "Full flow is temporarily locked by clinician override.";
    }
    case "hard_safety_expanded":
      return "Expanded prompts are active because current safety signals need more detail.";
    case "cooldown_standard":
      return "Full flow is active while recent safety or care changes settle.";
    case "adaptive_shortened":
      return "Shortened prompts are active because recent recovery has stayed stable.";
    case "adaptive_expanded":
      return "Expanded prompts are active because recent recovery signals worsened.";
    case "adaptive_standard_fallback":
    default:
      return "Full flow stays active because shortening criteria were not met.";
  }
}

function createDecision(input: {
  patientId: string;
  date: string;
  mode: CheckinAdaptationMode;
  source: CheckinAdaptationDecisionSource;
  reasonDetails: CheckinAdaptationReasonDetail[];
  configVersion: number;
  thresholdVersion: number;
  generatedAt: string;
  temporaryForceFullUntil?: string | null;
}): CheckinAdaptationDecision {
  const reasonDetails = dedupeReasonDetails(input.reasonDetails);

  return {
    patientId: input.patientId,
    date: input.date,
    mode: input.mode,
    decisionSource: input.source,
    reasonCodes: reasonDetails.map((detail) => detail.code),
    reasonDetails,
    clinicianSummary: buildClinicianSummary({
      source: input.source,
      details: reasonDetails,
      temporaryForceFullUntil: input.temporaryForceFullUntil,
    }),
    explanation: buildPatientExplanation(input.source),
    configVersion: input.configVersion,
    thresholdVersion: input.thresholdVersion,
    generatedAt: input.generatedAt,
    optionalSections: buildOptionalSections(input.mode),
  };
}

function getCheckinReferenceDate(checkin: RecentCheckinRecord | undefined): Date | null {
  if (!checkin) {
    return null;
  }

  if (checkin.createdAt instanceof Date && Number.isFinite(checkin.createdAt.getTime())) {
    return checkin.createdAt;
  }

  return typeof checkin.date === "string" ? parseDateOnly(checkin.date) : null;
}

function getCurrentPhaseStartedAt(patient: PatientRecord | null): Date | null {
  const rehabRecord =
    patient?.rehab && typeof patient.rehab === "object" ? patient.rehab : undefined;
  const phases = Array.isArray(rehabRecord?.phases) ? rehabRecord.phases : [];
  const currentKey =
    typeof rehabRecord?.currentKey === "string" ? rehabRecord.currentKey : null;

  const currentPhase =
    phases.find((phase) => typeof phase?.key === "string" && phase.key === currentKey) ??
    phases.find((phase) => phase?.status === "current");

  return asDate(currentPhase?.startedAt);
}

function computeSessionCompletionMetrics(
  sessions: ExerciseSessionRecord[],
  now: Date,
): SessionCompletionMetrics {
  const recentWindowStart = new Date(
    now.getTime() - EXERCISE_GUARDRAIL_WINDOW_DAYS * MS_PER_DAY,
  );
  const previousWindowStart = new Date(
    now.getTime() - EXERCISE_GUARDRAIL_WINDOW_DAYS * 2 * MS_PER_DAY,
  );

  let recentTracked = 0;
  let recentCompleted = 0;
  let previousTracked = 0;
  let previousCompleted = 0;

  for (const session of sessions) {
    const startedAt = asDate(session.startedAt);
    if (!startedAt) {
      continue;
    }

    const exercises = Array.isArray(session.exercises) ? session.exercises : [];
    const tracked = exercises.length;
    const completed = exercises.filter((item) => item?.completed === true).length;

    if (startedAt >= recentWindowStart) {
      recentTracked += tracked;
      recentCompleted += completed;
      continue;
    }

    if (startedAt >= previousWindowStart) {
      previousTracked += tracked;
      previousCompleted += completed;
    }
  }

  const recentRate = recentTracked > 0 ? recentCompleted / recentTracked : null;
  const previousRate = previousTracked > 0 ? previousCompleted / previousTracked : null;
  const lowRecentRate = recentTracked >= 3 && recentRate !== null && recentRate < 0.6;
  const droppedRate =
    recentTracked >= 3 &&
    recentRate !== null &&
    previousRate !== null &&
    recentRate <= previousRate - 0.2;

  return {
    recentRate: clampRate(recentRate),
    previousRate: clampRate(previousRate),
    recentTracked,
    risky: lowRecentRate || droppedRate,
    reasonDetails: dedupeReasonDetails([
      lowRecentRate
        ? reasonDetail(
            "EXERCISE_SESSION_COMPLETION_LOW",
            "Recent exercise completion fell below 60%.",
            "adherence",
          )
        : null,
      droppedRate
        ? reasonDetail(
            "EXERCISE_SESSION_COMPLETION_DROP",
            "Recent exercise completion dropped versus the prior week.",
            "adherence",
          )
        : null,
    ]),
  };
}

function buildAuditPayload(input: {
  patientId: string;
  date: string;
  decision: CheckinAdaptationDecision;
  recentCheckinsCount: number;
  missedCheckins: { flag: boolean; count: number };
  openAlertCount: number;
  recentResolvedHighRiskAlertCount: number;
  temporaryForceFullUntil?: string | null;
  exercisePlanUpdatedAt?: string;
  rehabUpdatedAt?: string;
  currentPhaseStartedAt?: string;
  thresholdUpdatedAt?: string;
  recoverySupportUpdatedAt?: string;
  checkinAdherenceRecent?: number | null;
  checkinAdherencePrevious?: number | null;
  exerciseSessionCompletionRecentRate?: number | null;
  exerciseSessionCompletionPreviousRate?: number | null;
  exerciseSessionCompletionRecentTracked?: number;
}): CheckinAdaptationAuditPayload {
  return {
    patientId: input.patientId,
    date: input.date,
    mode: input.decision.mode,
    decisionSource: input.decision.decisionSource,
    reasonCodes: input.decision.reasonCodes,
    reasonDetails: input.decision.reasonDetails,
    clinicianSummary: input.decision.clinicianSummary,
    configVersion: input.decision.configVersion,
    thresholdVersion: input.decision.thresholdVersion,
    generatedAt: input.decision.generatedAt,
    recentCheckinsCount: input.recentCheckinsCount,
    missedCheckins: input.missedCheckins,
    openAlertCount: input.openAlertCount,
    recentResolvedHighRiskAlertCount: input.recentResolvedHighRiskAlertCount,
    temporaryForceFullUntil: input.temporaryForceFullUntil ?? null,
    exercisePlanUpdatedAt: input.exercisePlanUpdatedAt,
    rehabUpdatedAt: input.rehabUpdatedAt,
    currentPhaseStartedAt: input.currentPhaseStartedAt,
    thresholdUpdatedAt: input.thresholdUpdatedAt,
    recoverySupportUpdatedAt: input.recoverySupportUpdatedAt,
    checkinAdherenceRecent: input.checkinAdherenceRecent ?? null,
    checkinAdherencePrevious: input.checkinAdherencePrevious ?? null,
    exerciseSessionCompletionRecentRate:
      input.exerciseSessionCompletionRecentRate ?? null,
    exerciseSessionCompletionPreviousRate:
      input.exerciseSessionCompletionPreviousRate ?? null,
    exerciseSessionCompletionRecentTracked:
      input.exerciseSessionCompletionRecentTracked ?? 0,
  };
}

async function loadAdaptationInputs(
  patientId: string,
  now: Date,
): Promise<{
  config: PatientRecoverySupportSnapshot;
  thresholds: PatientThresholdSnapshot;
  patient: PatientRecord | null;
  recentCheckins: RecentCheckinRecord[];
  openAlertCount: number;
  recentResolvedHighRiskAlertCount: number;
  exercisePlanUpdatedAt?: string;
  rehabUpdatedAt?: string;
  currentPhaseStartedAt?: string;
  sessions: ExerciseSessionRecord[];
}> {
  const recentResolvedWindowStart = new Date(
    now.getTime() - RESOLVED_HIGH_RISK_ALERT_COOLDOWN_DAYS * MS_PER_DAY,
  );
  const priorSessionWindowStart = new Date(
    now.getTime() - EXERCISE_GUARDRAIL_WINDOW_DAYS * 2 * MS_PER_DAY,
  );

  const [
    config,
    thresholds,
    patient,
    recentCheckins,
    openAlertCount,
    recentResolvedHighRiskAlertCount,
    exercisePlan,
    sessions,
  ] = await Promise.all([
    getPatientRecoverySupportConfig(patientId),
    getPatientThresholdConfig(patientId),
    Patient.findOne({ patientId })
      .select({ patientId: 1, displayName: 1, status: 1, clinicianId: 1, discharge: 1, rehab: 1 })
      .lean(),
    CheckIn.find({ patientId })
      .sort({ createdAt: -1 })
      .limit(8)
      .select({
        createdAt: 1,
        date: 1,
        pain: 1,
        mood: 1,
        adherence: 1,
        support: 1,
        risk: 1,
      })
      .lean(),
    Alert.countDocuments({ patientId, status: "open" }),
    Alert.countDocuments({
      patientId,
      risk: "high",
      status: { $in: ["acknowledged", "resolved"] },
      $or: [
        { acknowledgedAt: { $gte: recentResolvedWindowStart } },
        { resolvedAt: { $gte: recentResolvedWindowStart } },
      ],
    }),
    ExercisePlan.findOne({ patientId }).select({ updatedAt: 1 }).lean(),
    ExerciseSession.find({
      patientId,
      startedAt: { $gte: priorSessionWindowStart },
    })
      .sort({ startedAt: -1 })
      .select({ startedAt: 1, exercises: 1 })
      .lean(),
  ]);

  const patientRecord = (patient as PatientRecord | null) ?? null;
  const rehabRecord =
    patientRecord?.rehab && typeof patientRecord.rehab === "object"
      ? patientRecord.rehab
      : undefined;

  return {
    config,
    thresholds,
    patient: patientRecord,
    recentCheckins: recentCheckins as RecentCheckinRecord[],
    openAlertCount,
    recentResolvedHighRiskAlertCount,
    exercisePlanUpdatedAt: toIsoString(exercisePlan?.updatedAt),
    rehabUpdatedAt: toIsoString(rehabRecord?.updatedAt),
    currentPhaseStartedAt: toIsoString(getCurrentPhaseStartedAt(patientRecord)),
    sessions: sessions as ExerciseSessionRecord[],
  };
}

export async function evaluateCheckinAdaptationDecision(input: {
  patientId: string;
  date?: string;
  now?: Date;
}): Promise<CheckinAdaptationEvaluation> {
  const patientId = input.patientId.trim();
  const now = input.now instanceof Date ? input.now : new Date();
  const date = input.date?.trim() || toDateOnlyLocal(now);
  const generatedAt = now.toISOString();

  const {
    config,
    thresholds,
    patient,
    recentCheckins,
    openAlertCount,
    recentResolvedHighRiskAlertCount,
    exercisePlanUpdatedAt,
    rehabUpdatedAt,
    currentPhaseStartedAt,
    sessions,
  } = await loadAdaptationInputs(patientId, now);

  const patientStatus = mapPatientCareStatus(patient, patientId);
  const latestCheckin = recentCheckins[0];
  const latestCheckinDate = getCheckinReferenceDate(latestCheckin);
  const missedCheckins = deriveMissedCheckinsFromThreshold({
    patientStatus: patientStatus.status,
    referenceDate: latestCheckinDate,
    now,
    thresholds,
  });

  const recentCheckinsWithinWindow = recentCheckins.filter((item) => {
    const referenceDate = getCheckinReferenceDate(item);
    return referenceDate
      ? now.getTime() - referenceDate.getTime() <= SHORTENING_LOOKBACK_DAYS * MS_PER_DAY
      : false;
  });

  const trendWindowCheckins = recentCheckinsWithinWindow.slice(0, 6);
  const painValues = trendWindowCheckins
    .map((item) => (typeof item.pain === "number" ? item.pain : null))
    .filter((value): value is number => value !== null);
  const moodValues = trendWindowCheckins
    .map((item) => (typeof item.mood === "number" ? item.mood : null))
    .filter((value): value is number => value !== null);
  const adherenceValues = trendWindowCheckins
    .map((item) => {
      const exercises =
        item.adherence && typeof item.adherence === "object"
          ? (item.adherence as { exercises?: unknown }).exercises
          : null;
      return typeof exercises === "number" ? exercises : null;
    })
    .filter((value): value is number => value !== null);

  const painRecent = average(painValues.slice(0, 3));
  const painPrevious = average(painValues.slice(3, 6));
  const moodRecent = average(moodValues.slice(0, 3));
  const moodPrevious = average(moodValues.slice(3, 6));
  const adherenceRecent = average(adherenceValues.slice(0, 3));
  const adherencePrevious = average(adherenceValues.slice(3, 6));

  const worseningPain =
    painRecent !== null && painPrevious !== null && painRecent >= painPrevious + 0.75;
  const worseningMood =
    moodRecent !== null && moodPrevious !== null && moodRecent <= moodPrevious - 0.5;
  const worseningAdherence =
    adherenceRecent !== null &&
    ((adherencePrevious !== null && adherenceRecent <= adherencePrevious - 0.15) ||
      adherenceRecent < 0.5);

  const latestPain =
    latestCheckin && typeof latestCheckin.pain === "number" ? latestCheckin.pain : null;
  const latestSupport =
    latestCheckin?.support && typeof latestCheckin.support === "object"
      ? latestCheckin.support
      : undefined;
  const recentHardSafetyAnswer =
    latestSupport?.needsUrgentHelp === true || latestSupport?.feelsSafe === false;
  const latestRiskHigh = latestCheckin?.risk?.level === "high";

  const temporaryForceFullUntil =
    typeof config.temporaryForceFullUntil === "string" &&
    config.temporaryForceFullUntil.trim()
      ? config.temporaryForceFullUntil
      : null;
  const temporaryForceFullDate = asDate(temporaryForceFullUntil);
  const temporaryForceFullActive =
    temporaryForceFullDate !== null &&
    temporaryForceFullDate.getTime() > now.getTime();

  const hardSafetyDetails = dedupeReasonDetails([
    latestPain !== null && latestPain >= thresholds.painHighThreshold
      ? reasonDetail(
          "PAIN_THRESHOLD_BREACHED",
          "Latest pain reached the patient threshold.",
          "safety",
        )
      : null,
    openAlertCount > 0
      ? reasonDetail(
          "OPEN_ALERT_PRESENT",
          "There is an open safety alert.",
          "safety",
        )
      : null,
    recentHardSafetyAnswer
      ? reasonDetail(
          "RECENT_UNSAFE_SUPPORT_RESPONSE",
          "Latest support response requested urgent help or marked safety concern.",
          "safety",
        )
      : null,
    latestRiskHigh
      ? reasonDetail(
          "LATEST_HIGH_RISK_CHECKIN",
          "Latest check-in risk is high.",
          "safety",
        )
      : null,
  ]);

  const resolvedSafetyCooldown = openAlertCount === 0 && recentResolvedHighRiskAlertCount > 0;
  const careChangeCooldownDetails = dedupeReasonDetails([
    isRecent(asDate(exercisePlanUpdatedAt), now, CARE_CHANGE_COOLDOWN_MS)
      ? reasonDetail(
          "EXERCISE_PLAN_UPDATED_RECENTLY",
          "Exercise plan was updated within the last 72 hours.",
          "cooldown",
        )
      : null,
    isRecent(asDate(rehabUpdatedAt), now, CARE_CHANGE_COOLDOWN_MS)
      ? reasonDetail(
          "REHAB_PHASE_UPDATED_RECENTLY",
          "Rehab phase was updated within the last 72 hours.",
          "cooldown",
        )
      : null,
    isRecent(asDate(currentPhaseStartedAt), now, CARE_CHANGE_COOLDOWN_MS)
      ? reasonDetail(
          "REHAB_PHASE_STARTED_RECENTLY",
          "Current rehab phase started within the last 72 hours.",
          "cooldown",
        )
      : null,
    isRecent(asDate(thresholds.updatedAt), now, CARE_CHANGE_COOLDOWN_MS)
      ? reasonDetail(
          "THRESHOLD_UPDATED_RECENTLY",
          "Threshold settings changed within the last 72 hours.",
          "cooldown",
        )
      : null,
    isRecent(asDate(config.updatedAt), now, CARE_CHANGE_COOLDOWN_MS)
      ? reasonDetail(
          "RECOVERY_SUPPORT_UPDATED_RECENTLY",
          "Recovery support settings changed within the last 72 hours.",
          "cooldown",
        )
      : null,
  ]);
  const sessionCompletion = computeSessionCompletionMetrics(sessions, now);

  const auditBase = {
    patientId,
    date,
    recentCheckinsCount: recentCheckinsWithinWindow.length,
    missedCheckins,
    openAlertCount,
    recentResolvedHighRiskAlertCount,
    temporaryForceFullUntil,
    exercisePlanUpdatedAt,
    rehabUpdatedAt,
    currentPhaseStartedAt,
    thresholdUpdatedAt: thresholds.updatedAt,
    recoverySupportUpdatedAt: config.updatedAt,
    checkinAdherenceRecent: clampRate(adherenceRecent),
    checkinAdherencePrevious: clampRate(adherencePrevious),
    exerciseSessionCompletionRecentRate: sessionCompletion.recentRate,
    exerciseSessionCompletionPreviousRate: sessionCompletion.previousRate,
    exerciseSessionCompletionRecentTracked: sessionCompletion.recentTracked,
  };

  if (config.checkinMode === "force_full") {
    const decision = createDecision({
      patientId,
      date,
      mode: "standard",
      source: "persistent_force_full",
      reasonDetails: [
        reasonDetail(
          "FORCE_FULL",
          "Persistent force-full mode is enabled by the care team.",
          "override",
        ),
      ],
      configVersion: config.version,
      thresholdVersion: thresholds.version,
      generatedAt,
      temporaryForceFullUntil,
    });

    return {
      decision,
      auditPayload: buildAuditPayload({
        ...auditBase,
        decision,
      }),
    };
  }

  if (config.checkinMode === "standard") {
    const decision = createDecision({
      patientId,
      date,
      mode: "standard",
      source: "adaptive_standard_fallback",
      reasonDetails: [
        reasonDetail(
          "ADAPTIVE_MODE_DISABLED",
          "Adaptive mode is disabled for this patient.",
          "configuration",
        ),
      ],
      configVersion: config.version,
      thresholdVersion: thresholds.version,
      generatedAt,
      temporaryForceFullUntil,
    });

    return {
      decision,
      auditPayload: buildAuditPayload({
        ...auditBase,
        decision,
      }),
    };
  }

  if (temporaryForceFullActive) {
    const decision = createDecision({
      patientId,
      date,
      mode: "standard",
      source: "temporary_force_full",
      reasonDetails: [
        reasonDetail(
          "TEMPORARY_FORCE_FULL",
          "Temporary full-flow override is active.",
          "override",
        ),
      ],
      configVersion: config.version,
      thresholdVersion: thresholds.version,
      generatedAt,
      temporaryForceFullUntil,
    });

    return {
      decision,
      auditPayload: buildAuditPayload({
        ...auditBase,
        decision,
      }),
    };
  }

  if (hardSafetyDetails.length > 0) {
    const decision = createDecision({
      patientId,
      date,
      mode: "expanded",
      source: "hard_safety_expanded",
      reasonDetails: hardSafetyDetails,
      configVersion: config.version,
      thresholdVersion: thresholds.version,
      generatedAt,
      temporaryForceFullUntil,
    });

    return {
      decision,
      auditPayload: buildAuditPayload({
        ...auditBase,
        decision,
      }),
    };
  }

  if (resolvedSafetyCooldown) {
    const decision = createDecision({
      patientId,
      date,
      mode: "standard",
      source: "cooldown_standard",
      reasonDetails: [
        reasonDetail(
          "RESOLVED_HIGH_RISK_ALERT_COOLDOWN",
          "A resolved high-risk alert remains within the 7-day cooldown window.",
          "cooldown",
        ),
      ],
      configVersion: config.version,
      thresholdVersion: thresholds.version,
      generatedAt,
      temporaryForceFullUntil,
    });

    return {
      decision,
      auditPayload: buildAuditPayload({
        ...auditBase,
        decision,
      }),
    };
  }

  if (careChangeCooldownDetails.length > 0) {
    const decision = createDecision({
      patientId,
      date,
      mode: "standard",
      source: "cooldown_standard",
      reasonDetails: careChangeCooldownDetails,
      configVersion: config.version,
      thresholdVersion: thresholds.version,
      generatedAt,
      temporaryForceFullUntil,
    });

    return {
      decision,
      auditPayload: buildAuditPayload({
        ...auditBase,
        decision,
      }),
    };
  }

  const hasEnoughRecentCheckins = recentCheckinsWithinWindow.length >= 4;
  const recentAdherenceStable = adherenceRecent !== null && adherenceRecent >= 0.7;
  const lowRecentPain =
    latestPain !== null ? latestPain < thresholds.painHighThreshold : true;
  const worseningSignals = worseningPain || worseningMood || worseningAdherence;
  const stableForShortening =
    hasEnoughRecentCheckins &&
    !missedCheckins.flag &&
    !latestRiskHigh &&
    lowRecentPain &&
    !worseningSignals &&
    recentAdherenceStable &&
    !sessionCompletion.risky;

  if (stableForShortening) {
    const decision = createDecision({
      patientId,
      date,
      mode: "shortened",
      source: "adaptive_shortened",
      reasonDetails: [
        reasonDetail(
          "RECENT_CHECKINS_SUFFICIENT",
          "At least four recent check-ins are available within 14 days.",
          "stability",
        ),
        reasonDetail(
          "RECOVERY_STABLE",
          "Pain, mood, and adherence stayed stable across recent check-ins.",
          "stability",
        ),
        reasonDetail(
          "RECENT_ADHERENCE_STABLE",
          "Recent exercise adherence stayed at or above 70%.",
          "adherence",
        ),
      ],
      configVersion: config.version,
      thresholdVersion: thresholds.version,
      generatedAt,
      temporaryForceFullUntil,
    });

    return {
      decision,
      auditPayload: buildAuditPayload({
        ...auditBase,
        decision,
      }),
    };
  }

  if (worseningSignals) {
    const decision = createDecision({
      patientId,
      date,
      mode: "expanded",
      source: "adaptive_expanded",
      reasonDetails: [
        worseningPain
          ? reasonDetail(
              "WORSENING_PAIN",
              "Recent pain trend worsened.",
              "stability",
            )
          : null,
        worseningMood
          ? reasonDetail(
              "WORSENING_MOOD",
              "Recent mood trend worsened.",
              "stability",
            )
          : null,
        worseningAdherence
          ? reasonDetail(
              "WORSENING_ADHERENCE",
              "Recent check-in adherence worsened.",
              "adherence",
            )
          : null,
        ...sessionCompletion.reasonDetails,
      ],
      configVersion: config.version,
      thresholdVersion: thresholds.version,
      generatedAt,
      temporaryForceFullUntil,
    });

    return {
      decision,
      auditPayload: buildAuditPayload({
        ...auditBase,
        decision,
      }),
    };
  }

  const fallbackDetails = dedupeReasonDetails([
    !hasEnoughRecentCheckins
      ? reasonDetail(
          "INSUFFICIENT_RECENT_CHECKINS",
          "Fewer than four recent check-ins are available within 14 days.",
          "engagement",
        )
      : null,
    missedCheckins.flag
      ? reasonDetail(
          "MISSED_CHECKIN_BREACH",
          "Recent check-ins fell outside the patient threshold.",
          "engagement",
        )
      : null,
    adherenceRecent === null
      ? reasonDetail(
          "ADHERENCE_DATA_INCOMPLETE",
          "Recent exercise adherence data is incomplete.",
          "adherence",
        )
      : null,
    adherenceRecent !== null && adherenceRecent < 0.7
      ? reasonDetail(
          "RECENT_ADHERENCE_BELOW_STABLE_THRESHOLD",
          "Recent exercise adherence stayed below the 70% shortening threshold.",
          "adherence",
        )
      : null,
    !lowRecentPain
      ? reasonDetail(
          "PAIN_BELOW_SHORTENING_THRESHOLD_NOT_MET",
          "Latest pain did not stay below the patient threshold.",
          "safety",
        )
      : null,
    latestRiskHigh
      ? reasonDetail(
          "LATEST_CHECKIN_HIGH_RISK",
          "Latest check-in still carries a high-risk assessment.",
          "safety",
        )
      : null,
    ...sessionCompletion.reasonDetails,
  ]);

  const decision = createDecision({
    patientId,
    date,
    mode: "standard",
    source: "adaptive_standard_fallback",
    reasonDetails: fallbackDetails,
    configVersion: config.version,
    thresholdVersion: thresholds.version,
    generatedAt,
    temporaryForceFullUntil,
  });

  return {
    decision,
    auditPayload: buildAuditPayload({
      ...auditBase,
      decision,
    }),
  };
}

export async function getCheckinAdaptationDecision(input: {
  patientId: string;
  date?: string;
}): Promise<CheckinAdaptationDecision> {
  const evaluation = await evaluateCheckinAdaptationDecision(input);
  return evaluation.decision;
}
