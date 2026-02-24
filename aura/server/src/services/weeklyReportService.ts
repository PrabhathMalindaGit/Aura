import Alert from "../models/Alert";
import CheckIn from "../models/CheckIn";
import ExerciseSession from "../models/ExerciseSession";
import HydrationLog from "../models/HydrationLog";
import NutritionLog from "../models/NutritionLog";
import PromInstance from "../models/PromInstance";

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
  sleep: {
    trackedNights: number;
    avgHours: number | null;
    avgQuality: number | null;
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

export class WeeklyReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeeklyReportValidationError";
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HYDRATION_TARGET_ML = 2000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function avg(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return roundToOne(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 100);
}

function dateOnlyRegexValid(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateOnly(dateOnly: string): Date {
  if (!dateOnlyRegexValid(dateOnly)) {
    throw new WeeklyReportValidationError("weekStart must be YYYY-MM-DD");
  }

  const [yearString, monthString, dayString] = dateOnly.split("-");
  const year = Number.parseInt(yearString, 10);
  const month = Number.parseInt(monthString, 10);
  const day = Number.parseInt(dayString, 10);

  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new WeeklyReportValidationError("weekStart must be a valid calendar date");
  }

  return utc;
}

function toDateOnlyUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function mondayWeekStartForNow(tzOffsetMinutes: number): string {
  const shiftedNow = new Date(Date.now() + tzOffsetMinutes * 60_000);
  const day = shiftedNow.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(
      shiftedNow.getUTCFullYear(),
      shiftedNow.getUTCMonth(),
      shiftedNow.getUTCDate() - daysSinceMonday
    )
  );

  return toDateOnlyUTC(monday);
}

function buildWeekWindow(weekStart: string, tzOffsetMinutes: number) {
  const baseDate = parseDateOnly(weekStart);

  // weekStart is interpreted as local midnight in the provided timezone offset.
  // Convert that local midnight into UTC by subtracting the offset.
  const startUtcMs = baseDate.getTime() - tzOffsetMinutes * 60_000;
  const endUtcMs = startUtcMs + 7 * MS_PER_DAY;

  const endDate = new Date(baseDate.getTime() + 7 * MS_PER_DAY);

  return {
    weekStart: toDateOnlyUTC(baseDate),
    weekEnd: toDateOnlyUTC(endDate),
    startUtc: new Date(startUtcMs),
    endUtc: new Date(endUtcMs),
  };
}

function getStringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildHeadline(input: {
  checkinCount: number;
  sessionCount: number;
  highRiskAlertsThisWeek: number;
}): string {
  if (input.highRiskAlertsThisWeek > 0) {
    return "This week included safety alerts and close monitoring.";
  }

  if (input.checkinCount === 0 && input.sessionCount === 0) {
    return "No check-ins or exercise sessions were recorded this week.";
  }

  return `You logged ${input.checkinCount} check-in${
    input.checkinCount === 1 ? "" : "s"
  } and ${input.sessionCount} exercise session${input.sessionCount === 1 ? "" : "s"} this week.`;
}

function buildHighlights(input: {
  checkinCount: number;
  sessionCount: number;
  avgPainDuring: number | null;
  highRiskAlertsThisWeek: number;
  dueNowCount: number;
  latestPromScore: { normalized: number; bandLabel: string } | null;
  trackedSleepNights: number;
  avgSleepHours: number | null;
  hydrationTrackedDays: number;
  hydrationAvgDailyMl: number | null;
  hydrationDaysMeetingTarget: number;
  nutritionTrackedDays: number;
  nutritionAvgFruitVegServings: number | null;
  nutritionProteinOkHighDays: number;
  nutritionAntiInflammatoryDays: number;
}): string[] {
  const highlights: string[] = [];

  if (input.checkinCount >= 5) {
    highlights.push(`Great consistency: you checked in ${input.checkinCount} days this week.`);
  } else if (input.checkinCount > 0) {
    highlights.push(`You completed ${input.checkinCount} check-in${input.checkinCount === 1 ? "" : "s"}.`);
  }

  if (input.sessionCount >= 3) {
    highlights.push(`You completed ${input.sessionCount} exercise sessions this week.`);
  }

  if (input.avgPainDuring !== null && input.avgPainDuring >= 4) {
    highlights.push("Some exercises caused higher pain this week.");
  }

  if (input.latestPromScore) {
    highlights.push(
      `Latest questionnaire score: ${input.latestPromScore.normalized}/100 (${input.latestPromScore.bandLabel}).`
    );
  }

  if (input.highRiskAlertsThisWeek > 0) {
    highlights.push("Safety alerts were triggered this week and your care team was notified.");
  }

  if (input.dueNowCount > 0) {
    highlights.push(`${input.dueNowCount} questionnaire${input.dueNowCount === 1 ? "" : "s"} still due.`);
  }

  if (input.trackedSleepNights >= 4 && input.avgSleepHours !== null && input.avgSleepHours < 6) {
    highlights.push("Sleep was short on average this week.");
  }

  if (
    input.hydrationTrackedDays >= 4 &&
    input.hydrationAvgDailyMl !== null &&
    input.hydrationAvgDailyMl < 1500
  ) {
    highlights.push("Hydration was low on average this week.");
  }

  if (input.hydrationDaysMeetingTarget >= 3) {
    highlights.push(
      `You met your hydration goal on ${input.hydrationDaysMeetingTarget} day${
        input.hydrationDaysMeetingTarget === 1 ? "" : "s"
      }.`
    );
  }

  if (input.nutritionTrackedDays >= 4 && input.nutritionProteinOkHighDays <= 1) {
    highlights.push("Protein intake looked low on most logged days.");
  }

  if (
    input.nutritionTrackedDays >= 4 &&
    input.nutritionAvgFruitVegServings !== null &&
    input.nutritionAvgFruitVegServings >= 4
  ) {
    highlights.push("Great fruit/veg consistency this week.");
  }

  if (input.nutritionAntiInflammatoryDays >= 3) {
    highlights.push(
      `You focused on anti-inflammatory foods on ${input.nutritionAntiInflammatoryDays} day${
        input.nutritionAntiInflammatoryDays === 1 ? "" : "s"
      }.`
    );
  }

  if (highlights.length === 0) {
    highlights.push("No major changes were detected this week.");
  }

  return highlights;
}

function buildNextSteps(input: {
  dueNowCount: number;
  highRiskAlertsThisWeek: number;
  avgPainDuring: number | null;
}): string[] {
  const nextSteps: string[] = ["Continue your plan as prescribed."];

  if (input.dueNowCount > 0) {
    nextSteps.push("Complete any due questionnaires.");
  }

  nextSteps.push("If pain spikes or symptoms change, submit a check-in.");

  if (input.highRiskAlertsThisWeek > 0 || (input.avgPainDuring !== null && input.avgPainDuring >= 4)) {
    nextSteps.push("Discuss higher pain or safety concerns with your clinician.");
  }

  return nextSteps;
}

export async function generateWeeklyReport(options: {
  patientId: string;
  weekStart?: string;
  tzOffsetMinutes?: number | null;
}): Promise<WeeklyReport> {
  const patientId = options.patientId.trim();
  if (!patientId) {
    throw new WeeklyReportValidationError("patientId is required");
  }

  const tzOffsetMinutes =
    options.tzOffsetMinutes === null || options.tzOffsetMinutes === undefined
      ? 0
      : options.tzOffsetMinutes;

  if (!isFiniteNumber(tzOffsetMinutes) || !Number.isInteger(tzOffsetMinutes)) {
    throw new WeeklyReportValidationError("tzOffsetMinutes must be an integer");
  }

  if (tzOffsetMinutes < -840 || tzOffsetMinutes > 840) {
    throw new WeeklyReportValidationError("tzOffsetMinutes must be between -840 and 840");
  }

  const resolvedWeekStart = options.weekStart?.trim()
    ? options.weekStart.trim()
    : mondayWeekStartForNow(tzOffsetMinutes);

  const { weekStart, weekEnd, startUtc, endUtc } = buildWeekWindow(
    resolvedWeekStart,
    tzOffsetMinutes
  );

  const [
    checkins,
    sessions,
    completedProms,
    dueNowCount,
    weekAlerts,
    weekHighRiskAlerts,
    hydrationRows,
    nutritionRows,
  ] =
    await Promise.all([
      CheckIn.find({
        patientId,
        createdAt: {
          $gte: startUtc,
          $lt: endUtc,
        },
      })
        .select({ pain: 1, mood: 1, adherence: 1, sleep: 1, notes: 1, createdAt: 1 })
        .lean(),
      ExerciseSession.find({
        patientId,
        startedAt: {
          $gte: startUtc,
          $lt: endUtc,
        },
      })
        .select({ durationSeconds: 1, exercises: 1, startedAt: 1 })
        .lean(),
      PromInstance.find({
        patientId,
        status: "completed",
        completedAt: {
          $gte: startUtc,
          $lt: endUtc,
        },
      })
        .sort({ completedAt: -1 })
        .select({ titleSnapshot: 1, completedAt: 1, score: 1 })
        .lean(),
      PromInstance.countDocuments({
        patientId,
        status: "due",
      }),
      Alert.countDocuments({
        patientId,
        createdAt: {
          $gte: startUtc,
          $lt: endUtc,
        },
      }),
      Alert.countDocuments({
        patientId,
        risk: "high",
        createdAt: {
          $gte: startUtc,
          $lt: endUtc,
        },
      }),
      HydrationLog.find({
        patientId,
        date: {
          $gte: weekStart,
          $lt: weekEnd,
        },
      })
        .select({ date: 1, amountMl: 1 })
        .lean(),
      NutritionLog.find({
        patientId,
        date: {
          $gte: weekStart,
          $lt: weekEnd,
        },
      })
        .sort({ date: 1, createdAt: -1 })
        .select({
          date: 1,
          protein: 1,
          fruitVegServings: 1,
          antiInflammatoryFocus: 1,
          mealRegularity: 1,
          createdAt: 1,
        })
        .lean(),
    ]);

  const painValues: number[] = [];
  const moodValues: number[] = [];
  const exerciseAdherenceValues: number[] = [];
  const sleepHoursValues: number[] = [];
  const sleepQualityValues: number[] = [];
  let medicationWithField = 0;
  let medicationYesCount = 0;
  let notesCount = 0;

  for (const checkin of checkins) {
    if (typeof checkin.pain === "number" && Number.isFinite(checkin.pain)) {
      painValues.push(checkin.pain);
    }

    if (typeof checkin.mood === "number" && Number.isFinite(checkin.mood)) {
      moodValues.push(checkin.mood);
    }

    const adherence =
      checkin.adherence && typeof checkin.adherence === "object"
        ? (checkin.adherence as { exercises?: unknown; medication?: unknown })
        : undefined;

    if (adherence && typeof adherence.exercises === "number" && Number.isFinite(adherence.exercises)) {
      exerciseAdherenceValues.push(adherence.exercises);
    }

    if (adherence && typeof adherence.medication === "boolean") {
      medicationWithField += 1;
      if (adherence.medication) {
        medicationYesCount += 1;
      }
    }

    const sleep =
      checkin.sleep && typeof checkin.sleep === "object"
        ? (checkin.sleep as { hours?: unknown; quality?: unknown })
        : undefined;
    if (sleep && typeof sleep.hours === "number" && Number.isFinite(sleep.hours)) {
      sleepHoursValues.push(sleep.hours);
    }
    if (sleep && typeof sleep.quality === "number" && Number.isFinite(sleep.quality)) {
      sleepQualityValues.push(sleep.quality);
    }

    if (getStringValue(checkin.notes)) {
      notesCount += 1;
    }
  }

  let completedExercises = 0;
  let totalExercises = 0;
  let totalDurationSeconds = 0;
  const sessionPainValues: number[] = [];
  const difficulty = {
    easy: 0,
    ok: 0,
    hard: 0,
  };

  for (const session of sessions) {
    if (typeof session.durationSeconds === "number" && Number.isFinite(session.durationSeconds)) {
      totalDurationSeconds += session.durationSeconds;
    }

    const exercises = Array.isArray(session.exercises)
      ? (session.exercises as Array<{
          completed?: unknown;
          painDuring?: unknown;
          difficulty?: unknown;
        }>)
      : [];

    totalExercises += exercises.length;

    for (const exercise of exercises) {
      if (exercise.completed === true) {
        completedExercises += 1;
      }

      if (typeof exercise.painDuring === "number" && Number.isFinite(exercise.painDuring)) {
        sessionPainValues.push(exercise.painDuring);
      }

      if (exercise.difficulty === "easy" || exercise.difficulty === "ok" || exercise.difficulty === "hard") {
        difficulty[exercise.difficulty] += 1;
      }
    }
  }

  const latestCompletedProm = completedProms[0] as
    | {
        _id?: unknown;
        titleSnapshot?: unknown;
        completedAt?: unknown;
        score?: {
          normalized?: unknown;
          bandLabel?: unknown;
        };
      }
    | undefined;

  const latestPromNormalized =
    typeof latestCompletedProm?.score?.normalized === "number" &&
    Number.isFinite(latestCompletedProm.score.normalized)
      ? latestCompletedProm.score.normalized
      : null;

  const latestPromBandLabel = getStringValue(latestCompletedProm?.score?.bandLabel) ?? "";

  const latestCompleted =
    latestCompletedProm &&
    typeof latestCompletedProm._id !== "undefined" &&
    latestPromNormalized !== null &&
    latestPromBandLabel &&
    latestCompletedProm.completedAt instanceof Date
      ? {
          id: String(latestCompletedProm._id),
          title: getStringValue(latestCompletedProm.titleSnapshot) ?? "Questionnaire",
          normalized: Math.round(latestPromNormalized),
          bandLabel: latestPromBandLabel,
          completedAt: latestCompletedProm.completedAt.toISOString(),
        }
      : null;

  const checkinsSummary = {
    count: checkins.length,
    avgPain: avg(painValues),
    avgMood: avg(moodValues),
    avgExercisesPct:
      exerciseAdherenceValues.length > 0
        ? Math.round((exerciseAdherenceValues.reduce((sum, value) => sum + value, 0) /
            exerciseAdherenceValues.length) *
            100)
        : null,
    medicationYesPct: pct(medicationYesCount, medicationWithField),
    notesCount,
  };

  const sleepSummary = {
    trackedNights: Math.max(sleepHoursValues.length, sleepQualityValues.length),
    avgHours: avg(sleepHoursValues),
    avgQuality: avg(sleepQualityValues),
  };

  const hydrationTotalsByDay = new Map<string, number>();
  for (const row of hydrationRows) {
    const date = getStringValue((row as { date?: unknown }).date);
    const amountMl = (row as { amountMl?: unknown }).amountMl;
    if (!date || typeof amountMl !== "number" || !Number.isFinite(amountMl)) {
      continue;
    }
    hydrationTotalsByDay.set(date, (hydrationTotalsByDay.get(date) ?? 0) + amountMl);
  }
  const hydrationDailyTotals = [...hydrationTotalsByDay.values()];
  const hydrationSummary = {
    trackedDays: hydrationDailyTotals.length,
    avgDailyMl: avg(hydrationDailyTotals),
    totalMl: Math.round(hydrationDailyTotals.reduce((sum, value) => sum + value, 0)),
    daysMeetingTarget: hydrationDailyTotals.filter((value) => value >= HYDRATION_TARGET_ML).length,
    targetMl: HYDRATION_TARGET_ML,
  };

  const nutritionLatestByDay = new Map<
    string,
    {
      protein?: unknown;
      fruitVegServings?: unknown;
      antiInflammatoryFocus?: unknown;
      mealRegularity?: unknown;
    }
  >();
  for (const row of nutritionRows) {
    const date = getStringValue((row as { date?: unknown }).date);
    if (!date || nutritionLatestByDay.has(date)) {
      continue;
    }
    nutritionLatestByDay.set(date, row);
  }

  const nutritionDayEntries = [...nutritionLatestByDay.values()];
  const fruitVegValues: number[] = [];
  let proteinOkHighDays = 0;
  let antiInflammatoryDays = 0;
  let regularMealsDays = 0;

  for (const row of nutritionDayEntries) {
    if (
      typeof row.fruitVegServings === "number" &&
      Number.isFinite(row.fruitVegServings)
    ) {
      fruitVegValues.push(row.fruitVegServings);
    }

    if (row.protein === "ok" || row.protein === "high") {
      proteinOkHighDays += 1;
    }

    if (row.antiInflammatoryFocus === true) {
      antiInflammatoryDays += 1;
    }

    if (row.mealRegularity === "mostly" || row.mealRegularity === "regular") {
      regularMealsDays += 1;
    }
  }

  const nutritionSummary = {
    trackedDays: nutritionDayEntries.length,
    avgFruitVegServings: avg(fruitVegValues),
    proteinOkHighDays,
    antiInflammatoryDays,
    regularMealsDays,
  };

  const exercisesSummary = {
    sessionCount: sessions.length,
    totalDurationMinutes: Math.round(totalDurationSeconds / 60),
    completedExercises,
    totalExercises,
    avgPainDuring: avg(sessionPainValues),
    difficulty,
  };

  const promsSummary = {
    dueNowCount,
    completedThisWeekCount: completedProms.length,
    latestCompleted,
  };

  const safetySummary = {
    alertsCreatedThisWeek: weekAlerts,
    highRiskAlertsThisWeek: weekHighRiskAlerts,
  };

  const highlights = buildHighlights({
    checkinCount: checkinsSummary.count,
    sessionCount: exercisesSummary.sessionCount,
    avgPainDuring: exercisesSummary.avgPainDuring,
    highRiskAlertsThisWeek: safetySummary.highRiskAlertsThisWeek,
    dueNowCount: promsSummary.dueNowCount,
    latestPromScore: latestCompleted
      ? {
          normalized: latestCompleted.normalized,
          bandLabel: latestCompleted.bandLabel,
        }
      : null,
    trackedSleepNights: sleepSummary.trackedNights,
    avgSleepHours: sleepSummary.avgHours,
    hydrationTrackedDays: hydrationSummary.trackedDays,
    hydrationAvgDailyMl: hydrationSummary.avgDailyMl,
    hydrationDaysMeetingTarget: hydrationSummary.daysMeetingTarget,
    nutritionTrackedDays: nutritionSummary.trackedDays,
    nutritionAvgFruitVegServings: nutritionSummary.avgFruitVegServings,
    nutritionProteinOkHighDays: nutritionSummary.proteinOkHighDays,
    nutritionAntiInflammatoryDays: nutritionSummary.antiInflammatoryDays,
  });

  const nextSteps = buildNextSteps({
    dueNowCount: promsSummary.dueNowCount,
    highRiskAlertsThisWeek: safetySummary.highRiskAlertsThisWeek,
    avgPainDuring: exercisesSummary.avgPainDuring,
  });

  return {
    ok: true,
    patientId,
    period: {
      weekStart,
      weekEnd,
      tzOffsetMinutes,
    },
    summary: {
      headline: buildHeadline({
        checkinCount: checkinsSummary.count,
        sessionCount: exercisesSummary.sessionCount,
        highRiskAlertsThisWeek: safetySummary.highRiskAlertsThisWeek,
      }),
      highlights,
      nextSteps,
    },
    checkins: checkinsSummary,
    sleep: sleepSummary,
    hydration: hydrationSummary,
    nutrition: nutritionSummary,
    exercises: exercisesSummary,
    proms: promsSummary,
    safety: safetySummary,
  };
}

export function getMondayWeekStartISO(tzOffsetMinutes: number): string {
  return mondayWeekStartForNow(tzOffsetMinutes);
}
