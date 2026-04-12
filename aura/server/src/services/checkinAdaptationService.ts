import Alert from "../models/Alert";
import CareEvent from "../models/CareEvent";
import CheckIn from "../models/CheckIn";
import { deriveMissedCheckinsFromThreshold } from "./riskEvaluationService";
import { getPatientRecoverySupportConfig } from "./patientRecoverySupportService";
import { getPatientThresholdConfig } from "./patientThresholdService";
import { getPatientCareStatus } from "./patientCareStatusService";

export type CheckinAdaptationMode = "standard" | "shortened" | "expanded";

export type CheckinAdaptationDecision = {
  patientId: string;
  date: string;
  mode: CheckinAdaptationMode;
  reasonCodes: string[];
  explanation?: string;
  configVersion: number;
  generatedAt: string;
  optionalSections: string[];
};

function toDateOnlyLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean))
  ) as string[];
}

function buildExplanation(mode: CheckinAdaptationMode): string | undefined {
  if (mode === "shortened") {
    return "Today's check-in is shorter because recent recovery has been steady.";
  }

  if (mode === "expanded") {
    return "We're asking a few extra questions because recent recovery changed.";
  }

  return undefined;
}

function createDecision(input: {
  patientId: string;
  date: string;
  mode: CheckinAdaptationMode;
  reasonCodes: string[];
  configVersion: number;
}): CheckinAdaptationDecision {
  return {
    patientId: input.patientId,
    date: input.date,
    mode: input.mode,
    reasonCodes: input.reasonCodes,
    explanation: buildExplanation(input.mode),
    configVersion: input.configVersion,
    generatedAt: new Date().toISOString(),
    optionalSections:
      input.mode === "shortened"
        ? ["recovery_details", "daily_context"]
        : input.mode === "expanded"
          ? []
          : ["recovery_details", "daily_context"],
  };
}

async function logAdaptationDecision(
  decision: CheckinAdaptationDecision
): Promise<void> {
  const existing = await CareEvent.findOne({
    type: "CHECKIN_ADAPTATION_APPLIED",
    patientId: decision.patientId,
    "payload.date": decision.date,
    "payload.mode": decision.mode,
    "payload.configVersion": decision.configVersion,
  })
    .select({ _id: 1 })
    .lean();

  if (existing) {
    return;
  }

  await CareEvent.create({
    type: "CHECKIN_ADAPTATION_APPLIED",
    patientId: decision.patientId,
    payload: {
      date: decision.date,
      mode: decision.mode,
      reasonCodes: decision.reasonCodes,
      configVersion: decision.configVersion,
      generatedAt: decision.generatedAt,
    },
  });
}

export async function getCheckinAdaptationDecision(input: {
  patientId: string;
  date?: string;
}): Promise<CheckinAdaptationDecision> {
  const patientId = input.patientId.trim();
  const date = input.date?.trim() || toDateOnlyLocal(new Date());
  const [config, thresholds, patientStatus, recentCheckins, openAlertsCount, recentHighRiskAlertsCount] =
    await Promise.all([
      getPatientRecoverySupportConfig(patientId),
      getPatientThresholdConfig(patientId),
      getPatientCareStatus(patientId),
      CheckIn.find({ patientId })
        .sort({ createdAt: -1 })
        .limit(6)
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
        createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      }),
    ]);

  if (config.checkinMode === "force_full" || config.checkinMode === "standard") {
    return createDecision({
      patientId,
      date,
      mode: "standard",
      reasonCodes: config.checkinMode === "force_full" ? ["FORCE_FULL"] : [],
      configVersion: config.version,
    });
  }

  const latestCheckin = recentCheckins[0] as
    | {
        createdAt?: Date;
        date?: string;
        pain?: number;
        mood?: number;
        adherence?: { exercises?: number };
        support?: {
          needsUrgentHelp?: boolean;
          feelsSafe?: boolean;
        };
        risk?: { level?: string };
      }
    | undefined;

  const referenceDate =
    latestCheckin?.createdAt instanceof Date
      ? latestCheckin.createdAt
      : latestCheckin?.date
        ? parseDateOnly(latestCheckin.date)
        : null;

  const missedCheckins = deriveMissedCheckinsFromThreshold({
    patientStatus: patientStatus.status,
    referenceDate,
    now: new Date(),
    thresholds,
  });

  const painValues = recentCheckins
    .map((item) => (typeof item.pain === "number" ? item.pain : null))
    .filter((item): item is number => item !== null);
  const moodValues = recentCheckins
    .map((item) => (typeof item.mood === "number" ? item.mood : null))
    .filter((item): item is number => item !== null);
  const adherenceValues = recentCheckins
    .map((item) => {
      const exercises =
        item.adherence && typeof item.adherence === "object"
          ? (item.adherence as { exercises?: unknown }).exercises
          : null;
      return typeof exercises === "number" ? exercises : null;
    })
    .filter((item): item is number => item !== null);

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

  const latestPain = typeof latestCheckin?.pain === "number" ? latestCheckin.pain : null;
  const latestSupport =
    latestCheckin?.support && typeof latestCheckin.support === "object"
      ? (latestCheckin.support as {
          needsUrgentHelp?: boolean;
          feelsSafe?: boolean;
        })
      : undefined;

  const recentHardSafetyAnswer =
    latestSupport?.needsUrgentHelp === true || latestSupport?.feelsSafe === false;
  const expandReasonCodes = unique([
    latestPain !== null && latestPain >= thresholds.painHighThreshold
      ? "PAIN_THRESHOLD_BREACHED"
      : null,
    openAlertsCount > 0 ? "OPEN_SAFETY_EVENT" : null,
    recentHighRiskAlertsCount > 0 ? "RECENT_HIGH_RISK_ALERT" : null,
    worseningPain || worseningMood || worseningAdherence ? "RECOVERY_WORSENING" : null,
    adherenceRecent !== null && adherenceRecent < 0.5 ? "LOW_EXERCISE_COMPLETION" : null,
    recentHardSafetyAnswer ? "RECENT_SAFETY_RESPONSE" : null,
    latestCheckin?.risk && typeof latestCheckin.risk === "object" && latestCheckin.risk.level === "high"
      ? "RECENT_HIGH_RISK_CHECKIN"
      : null,
  ]);

  if (expandReasonCodes.length > 0) {
    const decision = createDecision({
      patientId,
      date,
      mode: "expanded",
      reasonCodes: expandReasonCodes,
      configVersion: config.version,
    });
    await logAdaptationDecision(decision);
    return decision;
  }

  const hasEnoughRecentCheckins = recentCheckins.length >= 4;
  const shortenReasonCodes = unique([
    hasEnoughRecentCheckins ? "RECENT_CHECKINS_SUFFICIENT" : null,
    openAlertsCount === 0 ? "NO_OPEN_SAFETY_EVENTS" : null,
    recentHighRiskAlertsCount === 0 ? "NO_RECENT_HIGH_RISK_ALERTS" : null,
    !missedCheckins.flag ? "CHECKINS_ON_TRACK" : null,
    !worseningPain && !worseningMood && !worseningAdherence ? "RECOVERY_STEADY" : null,
    !recentHardSafetyAnswer ? "NO_RECENT_SAFETY_CONCERN" : null,
  ]);

  if (
    hasEnoughRecentCheckins &&
    openAlertsCount === 0 &&
    recentHighRiskAlertsCount === 0 &&
    !missedCheckins.flag &&
    !worseningPain &&
    !worseningMood &&
    !worseningAdherence &&
    !recentHardSafetyAnswer
  ) {
    const decision = createDecision({
      patientId,
      date,
      mode: "shortened",
      reasonCodes: shortenReasonCodes,
      configVersion: config.version,
    });
    await logAdaptationDecision(decision);
    return decision;
  }

  const decision = createDecision({
    patientId,
    date,
    mode: "standard",
    reasonCodes: unique([
      !hasEnoughRecentCheckins ? "INSUFFICIENT_RECENT_CHECKINS" : null,
      missedCheckins.flag ? "MISSED_CHECKIN_BREACH" : null,
    ]),
    configVersion: config.version,
  });
  await logAdaptationDecision(decision);
  return decision;
}
