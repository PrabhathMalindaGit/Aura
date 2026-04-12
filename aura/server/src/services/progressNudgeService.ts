import CheckIn from "../models/CheckIn";
import ExerciseSession from "../models/ExerciseSession";
import { generateWeeklyReport } from "./weeklyReportService";
import { getPatientRecoverySupportConfig } from "./patientRecoverySupportService";
import { getPatientThresholdConfig } from "./patientThresholdService";
import { deriveMissedCheckinsFromThreshold } from "./riskEvaluationService";
import { getPatientCareStatus, isIndependentModeEnabled } from "./patientCareStatusService";

export type RecoveryNudgeKind =
  | "improving_trend"
  | "worsening_trend"
  | "low_exercise_completion"
  | "missed_recent_checkins"
  | "weekly_summary_ready";

export type RecoveryNudge = {
  patientId: string;
  kind: RecoveryNudgeKind;
  ruleCode: string;
  title: string;
  message: string;
  evidenceWindow: string;
  generatedAt: string;
};

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

function toCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(now.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(
    monday.getDate()
  ).padStart(2, "0")}`;
}

export async function getRecoveryNudge(
  patientIdInput: string
): Promise<RecoveryNudge | null> {
  const patientId = patientIdInput.trim();
  const [config, thresholds, patientStatus, recentCheckins, recentSessions] = await Promise.all([
    getPatientRecoverySupportConfig(patientId),
    getPatientThresholdConfig(patientId),
    getPatientCareStatus(patientId),
    CheckIn.find({ patientId })
      .sort({ createdAt: -1 })
      .limit(8)
      .select({ createdAt: 1, date: 1, pain: 1, mood: 1, adherence: 1 })
      .lean(),
    ExerciseSession.find({
      patientId,
      startedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    })
      .sort({ startedAt: -1 })
      .limit(14)
      .select({ exercises: 1, startedAt: 1 })
      .lean(),
  ]);

  if (!config.nudgesEnabled) {
    return null;
  }

  if (patientStatus.status === "inactive") {
    return null;
  }

  const painValues = recentCheckins
    .map((item) => (typeof item.pain === "number" ? item.pain : null))
    .filter((value): value is number => value !== null);
  const adherenceValues = recentCheckins
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
  const adherenceRecent = average(adherenceValues.slice(0, 3));
  const adherencePrevious = average(adherenceValues.slice(3, 6));

  if (painRecent !== null && painPrevious !== null && painRecent >= painPrevious + 0.75) {
    return {
      patientId,
      kind: "worsening_trend",
      ruleCode: "WORSENING_PAIN_14D",
      title: "Recovery needs a closer look",
      message: "Pain has been higher this week than last week. Use today's check-in to note what changed.",
      evidenceWindow: "Recent 14 days",
      generatedAt: new Date().toISOString(),
    };
  }

  const sessionTotals = recentSessions.reduce(
    (acc, session) => {
      const exercises = Array.isArray(session.exercises)
        ? (session.exercises as Array<{ completed?: unknown }>)
        : [];
      acc.total += exercises.length;
      acc.completed += exercises.filter((item) => item.completed === true).length;
      return acc;
    },
    { completed: 0, total: 0 }
  );
  const completionRate = sessionTotals.total > 0 ? sessionTotals.completed / sessionTotals.total : null;

  if (completionRate !== null && sessionTotals.total >= 3 && completionRate < 0.6) {
    return {
      patientId,
      kind: "low_exercise_completion",
      ruleCode: "LOW_EXERCISE_COMPLETION_7D",
      title: "Plan activity is lower than usual",
      message: "Exercise completion has been lower this week than usual.",
      evidenceWindow: "Recent 7 days",
      generatedAt: new Date().toISOString(),
    };
  }

  const referenceDate =
    recentCheckins[0]?.createdAt instanceof Date
      ? recentCheckins[0].createdAt
      : recentCheckins[0]?.date
        ? parseDateOnly(recentCheckins[0].date)
        : null;
  const missed = deriveMissedCheckinsFromThreshold({
    patientStatus: patientStatus.status,
    referenceDate,
    now: new Date(),
    thresholds,
  });

  if (missed.flag) {
    return {
      patientId,
      kind: "missed_recent_checkins",
      ruleCode: "MISSED_CHECKINS_RECENT",
      title: "A check-in is due",
      message: "A recent check-in was missed. Record today's check-in so your recovery stays up to date.",
      evidenceWindow: `Threshold ${thresholds.missedCheckinDays} day${thresholds.missedCheckinDays === 1 ? "" : "s"}`,
      generatedAt: new Date().toISOString(),
    };
  }

  const weeklyReport = await generateWeeklyReport({
    patientId,
    weekStart: toCurrentWeekStart(),
    tzOffsetMinutes: 0,
  }).catch(() => null);

  if (weeklyReport && (weeklyReport.summary.highlights.length > 0 || weeklyReport.checkins.count > 0)) {
    return {
      patientId,
      kind: "weekly_summary_ready",
      ruleCode: "WEEKLY_SUMMARY_READY",
      title: "Weekly summary available",
      message: "Your weekly summary is ready to review.",
      evidenceWindow: `${weeklyReport.period.weekStart} to ${weeklyReport.period.weekEnd}`,
      generatedAt: new Date().toISOString(),
    };
  }

  if (
    painRecent !== null &&
    painPrevious !== null &&
    painRecent <= painPrevious - 0.75 &&
    (patientStatus.status === "active" || isIndependentModeEnabled(patientStatus))
  ) {
    return {
      patientId,
      kind: "improving_trend",
      ruleCode: "IMPROVING_PAIN_14D",
      title: "Recovery has been steadier",
      message: "Pain has improved over the last two weeks. Keep using check-ins to track what is helping.",
      evidenceWindow: "Recent 14 days",
      generatedAt: new Date().toISOString(),
    };
  }

  if (
    adherenceRecent !== null &&
    adherencePrevious !== null &&
    adherenceRecent <= adherencePrevious - 0.15
  ) {
    return {
      patientId,
      kind: "low_exercise_completion",
      ruleCode: "LOW_ADHERENCE_FROM_CHECKINS",
      title: "Exercise completion changed",
      message: "Exercise completion has been lower this week than usual.",
      evidenceWindow: "Recent 14 days",
      generatedAt: new Date().toISOString(),
    };
  }

  return null;
}
