import { createHash } from "node:crypto";

import Alert from "../models/Alert";
import CheckIn from "../models/CheckIn";
import ExerciseSession from "../models/ExerciseSession";
import HydrationLog from "../models/HydrationLog";
import InsightSuggestion from "../models/InsightSuggestion";
import Medication from "../models/Medication";
import MedicationLog from "../models/MedicationLog";
import MedicationSchedule from "../models/MedicationSchedule";
import PromInstance from "../models/PromInstance";
import type { AuthUser } from "../types/auth";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type InsightCategory =
  | "adherence"
  | "symptoms"
  | "recovery"
  | "safety"
  | "habits"
  | "questionnaires";

type InsightConfidence = "low" | "medium" | "high";

type InsightEvidence = {
  checkinsCount?: number;
  avgPain?: number | null;
  avgMood?: number | null;
  sleepAvgHours?: number | null;
  hydrationAvgMl?: number | null;
  medsAdherencePct?: number | null;
  sessionsCount?: number | null;
  promsDueNow?: number;
  promsLatestScore?: number | null;
  highRiskAlertsCount?: number;
};

export type InsightCandidate = {
  title: string;
  message: string;
  category: InsightCategory;
  confidence: InsightConfidence;
  priority: number;
  fingerprint: string;
  evidence?: InsightEvidence;
};

type MetricsSnapshot = {
  patientId: string;
  windowDays: number;
  windowStart: Date;
  windowEnd: Date;
  checkinsCount: number;
  avgPain: number | null;
  avgMood: number | null;
  sleepAvgHours: number | null;
  hydrationAvgMl: number | null;
  medsAdherencePct: number | null;
  sessionsCount: number;
  promsDueNow: number;
  promsLatestScore: number | null;
  highRiskAlertsCount: number;
  previousAvgPain: number | null;
};

export class InsightSuggestionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsightSuggestionValidationError";
  }
}

export class InsightSuggestionNotFoundError extends Error {
  constructor() {
    super("Insight suggestion not found");
    this.name = "InsightSuggestionNotFoundError";
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function avg(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 100);
}

function toDateOnlyUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function parseDateOnlyUtc(value: string): Date | null {
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

function compareDateOnly(left: string, right: string): number {
  return Date.parse(`${left}T00:00:00.000Z`) - Date.parse(`${right}T00:00:00.000Z`);
}

function getStringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function dateRangeDateOnly(start: Date, endExclusive: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );
  while (cursor.getTime() < endExclusive.getTime()) {
    dates.push(toDateOnlyUTC(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function scheduleAppliesOnDate(
  schedule: {
    daysOfWeek?: unknown;
    startDate?: unknown;
    endDate?: unknown;
  },
  date: string
): boolean {
  const parsed = parseDateOnlyUtc(date);
  if (!parsed) {
    return false;
  }

  const rawDays = Array.isArray(schedule.daysOfWeek)
    ? schedule.daysOfWeek
    : [0, 1, 2, 3, 4, 5, 6];
  const days = rawDays.filter(
    (value): value is number => Number.isInteger(value) && value >= 0 && value <= 6
  );
  const dayOfWeek = parsed.getUTCDay();
  if (!days.includes(dayOfWeek)) {
    return false;
  }

  const startDate = getStringValue(schedule.startDate);
  const endDate = getStringValue(schedule.endDate);
  if (startDate && compareDateOnly(date, startDate) < 0) {
    return false;
  }
  if (endDate && compareDateOnly(date, endDate) > 0) {
    return false;
  }
  return true;
}

function windowForDays(windowDays: number, windowEnd = new Date()) {
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 60) {
    throw new InsightSuggestionValidationError("windowDays must be an integer between 1 and 60");
  }
  const end = new Date(
    Date.UTC(
      windowEnd.getUTCFullYear(),
      windowEnd.getUTCMonth(),
      windowEnd.getUTCDate() + 1
    )
  );
  const start = new Date(end.getTime() - windowDays * MS_PER_DAY);
  return {
    windowStart: start,
    windowEnd: end,
  };
}

function buildFingerprint(input: {
  patientId: string;
  windowStart: Date;
  windowEnd: Date;
  category: InsightCategory;
  title: string;
  message: string;
}): string {
  return createHash("sha1")
    .update(
      JSON.stringify({
        patientId: input.patientId,
        windowStart: input.windowStart.toISOString(),
        windowEnd: input.windowEnd.toISOString(),
        category: input.category,
        title: input.title,
        message: input.message,
      })
    )
    .digest("hex");
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const maybeError = error as { code?: unknown };
  return maybeError.code === 11000;
}

async function collectMetrics(
  patientId: string,
  windowDays: number,
  windowEndInput = new Date()
): Promise<MetricsSnapshot> {
  const { windowStart, windowEnd } = windowForDays(windowDays, windowEndInput);

  const checkinsPromise = CheckIn.find({
    patientId,
    createdAt: { $gte: windowStart, $lt: windowEnd },
  })
    .select({
      pain: 1,
      mood: 1,
      sleep: 1,
      createdAt: 1,
    })
    .lean();

  const previousCheckinsPromise = CheckIn.find({
    patientId,
    createdAt: {
      $gte: new Date(windowStart.getTime() - windowDays * MS_PER_DAY),
      $lt: windowStart,
    },
  })
    .select({ pain: 1 })
    .lean();

  const sessionsCountPromise = ExerciseSession.countDocuments({
    patientId,
    startedAt: { $gte: windowStart, $lt: windowEnd },
  });

  const promsDueNowPromise = PromInstance.countDocuments({
    patientId,
    status: "due",
  });

  const latestPromPromise = PromInstance.findOne({
    patientId,
    status: "completed",
  })
    .sort({ completedAt: -1, updatedAt: -1 })
    .select({ score: 1 })
    .lean();

  const highRiskAlertsCountPromise = Alert.countDocuments({
    patientId,
    risk: "high",
    createdAt: { $gte: windowStart, $lt: windowEnd },
  });

  const dateKeys = dateRangeDateOnly(windowStart, windowEnd);
  const firstDate = dateKeys[0];
  const lastDate = dateKeys[dateKeys.length - 1];

  const hydrationPromise = firstDate && lastDate
    ? HydrationLog.aggregate<{ _id: string; totalMl: number }>([
        {
          $match: {
            patientId,
            date: {
              $gte: firstDate,
              $lte: lastDate,
            },
          },
        },
        {
          $group: {
            _id: "$date",
            totalMl: { $sum: "$amountMl" },
          },
        },
      ])
    : Promise.resolve([]);

  const activeMedsPromise = Medication.find({
    patientId,
    active: true,
  })
    .select({ _id: 1 })
    .lean();

  const [checkins, previousCheckins, sessionsCount, promsDueNow, latestProm, highRiskAlertsCount, hydrationRows, activeMeds] =
    await Promise.all([
      checkinsPromise,
      previousCheckinsPromise,
      sessionsCountPromise,
      promsDueNowPromise,
      latestPromPromise,
      highRiskAlertsCountPromise,
      hydrationPromise,
      activeMedsPromise,
    ]);

  const medicationIds = activeMeds.map((med) => med._id);
  let medsAdherencePct: number | null = null;
  if (medicationIds.length > 0 && firstDate && lastDate) {
    const [schedules, medicationLogs] = await Promise.all([
      MedicationSchedule.find({
        patientId,
        medicationId: { $in: medicationIds },
      })
        .select({ times: 1, daysOfWeek: 1, startDate: 1, endDate: 1 })
        .lean(),
      MedicationLog.find({
        patientId,
        date: {
          $gte: firstDate,
          $lte: lastDate,
        },
      })
        .select({ status: 1 })
        .lean(),
    ]);

    let scheduledDoses = 0;
    for (const date of dateKeys) {
      for (const schedule of schedules) {
        if (!scheduleAppliesOnDate(schedule, date)) {
          continue;
        }
        const times = Array.isArray(schedule.times) ? schedule.times : [];
        scheduledDoses += times.length;
      }
    }

    const takenDoses = medicationLogs.filter((log) => log.status === "taken").length;
    medsAdherencePct = pct(takenDoses, scheduledDoses);
  }

  const pains = checkins.map((item) => item.pain).filter(isFiniteNumber);
  const moods = checkins.map((item) => item.mood).filter(isFiniteNumber);
  const sleepHours = checkins
    .map((item) => (isFiniteNumber(item.sleep?.hours) ? item.sleep.hours : null))
    .filter((value): value is number => value !== null);
  const previousPains = previousCheckins
    .map((item) => item.pain)
    .filter(isFiniteNumber);
  const hydrationTotals = hydrationRows
    .map((item) => item.totalMl)
    .filter(isFiniteNumber);
  const latestPromScore =
    latestProm && latestProm.score && isFiniteNumber(latestProm.score.normalized)
      ? latestProm.score.normalized
      : null;

  return {
    patientId,
    windowDays,
    windowStart,
    windowEnd,
    checkinsCount: checkins.length,
    avgPain: avg(pains),
    avgMood: avg(moods),
    sleepAvgHours: avg(sleepHours),
    hydrationAvgMl: avg(hydrationTotals),
    medsAdherencePct,
    sessionsCount,
    promsDueNow,
    promsLatestScore: latestPromScore,
    highRiskAlertsCount,
    previousAvgPain: avg(previousPains),
  };
}

function buildCandidates(metrics: MetricsSnapshot): InsightCandidate[] {
  const candidates: InsightCandidate[] = [];

  if (metrics.checkinsCount >= 5) {
    const title = "Great check-in consistency";
    const message = `You checked in on ${metrics.checkinsCount} days. Keeping a steady routine helps your rehab plan stay on track.`;
    candidates.push({
      title,
      message,
      category: "adherence",
      confidence: "high",
      priority: 2,
      fingerprint: buildFingerprint({
        patientId: metrics.patientId,
        windowStart: metrics.windowStart,
        windowEnd: metrics.windowEnd,
        category: "adherence",
        title,
        message,
      }),
      evidence: {
        checkinsCount: metrics.checkinsCount,
        avgPain: metrics.avgPain,
        avgMood: metrics.avgMood,
      },
    });
  }

  if (
    metrics.avgPain !== null &&
    metrics.previousAvgPain !== null &&
    metrics.avgPain < metrics.previousAvgPain
  ) {
    const title = "Pain trend improving";
    const message =
      "Your average pain is lower compared with the previous period. Keep following your plan as prescribed.";
    candidates.push({
      title,
      message,
      category: "recovery",
      confidence: "medium",
      priority: 3,
      fingerprint: buildFingerprint({
        patientId: metrics.patientId,
        windowStart: metrics.windowStart,
        windowEnd: metrics.windowEnd,
        category: "recovery",
        title,
        message,
      }),
      evidence: {
        avgPain: metrics.avgPain,
      },
    });
  }

  if (metrics.sleepAvgHours !== null && metrics.sleepAvgHours < 6) {
    const title = "Sleep was short on average";
    const message =
      "Your average sleep was under 6 hours on logged nights. If you can, aim for consistent rest to support recovery.";
    candidates.push({
      title,
      message,
      category: "habits",
      confidence: "medium",
      priority: 3,
      fingerprint: buildFingerprint({
        patientId: metrics.patientId,
        windowStart: metrics.windowStart,
        windowEnd: metrics.windowEnd,
        category: "habits",
        title,
        message,
      }),
      evidence: {
        sleepAvgHours: metrics.sleepAvgHours,
      },
    });
  }

  if (metrics.hydrationAvgMl !== null && metrics.hydrationAvgMl < 1500) {
    const title = "Hydration was low on average";
    const message = "Your logged hydration was below 1.5L on average. Small, regular drinks can help.";
    candidates.push({
      title,
      message,
      category: "habits",
      confidence: "medium",
      priority: 2,
      fingerprint: buildFingerprint({
        patientId: metrics.patientId,
        windowStart: metrics.windowStart,
        windowEnd: metrics.windowEnd,
        category: "habits",
        title,
        message,
      }),
      evidence: {
        hydrationAvgMl: metrics.hydrationAvgMl,
      },
    });
  }

  if (metrics.medsAdherencePct !== null && metrics.medsAdherencePct < 60) {
    const title = "Medication consistency slipped";
    const message =
      "Some scheduled doses were missed. If you’re unsure about your plan, check with your clinician.";
    candidates.push({
      title,
      message,
      category: "adherence",
      confidence: "medium",
      priority: 4,
      fingerprint: buildFingerprint({
        patientId: metrics.patientId,
        windowStart: metrics.windowStart,
        windowEnd: metrics.windowEnd,
        category: "adherence",
        title,
        message,
      }),
      evidence: {
        medsAdherencePct: metrics.medsAdherencePct,
      },
    });
  }

  if (metrics.promsDueNow > 0) {
    const title = "Questionnaire due";
    const message = `You have ${metrics.promsDueNow} questionnaire(s) due. Completing them helps your care team track progress.`;
    candidates.push({
      title,
      message,
      category: "questionnaires",
      confidence: "high",
      priority: 3,
      fingerprint: buildFingerprint({
        patientId: metrics.patientId,
        windowStart: metrics.windowStart,
        windowEnd: metrics.windowEnd,
        category: "questionnaires",
        title,
        message,
      }),
      evidence: {
        promsDueNow: metrics.promsDueNow,
        promsLatestScore: metrics.promsLatestScore,
      },
    });
  }

  if (metrics.highRiskAlertsCount > 0) {
    const title = "Safety event recorded";
    const message =
      "A safety alert was triggered recently. If you feel worse or unsafe, contact your care team.";
    candidates.push({
      title,
      message,
      category: "safety",
      confidence: "high",
      priority: 5,
      fingerprint: buildFingerprint({
        patientId: metrics.patientId,
        windowStart: metrics.windowStart,
        windowEnd: metrics.windowEnd,
        category: "safety",
        title,
        message,
      }),
      evidence: {
        highRiskAlertsCount: metrics.highRiskAlertsCount,
      },
    });
  }

  return candidates
    .sort((left, right) => right.priority - left.priority || left.title.localeCompare(right.title))
    .slice(0, 6);
}

export async function computeInsightCandidates(
  patientId: string,
  windowDays: number,
  windowEnd = new Date()
): Promise<InsightCandidate[]> {
  const normalizedPatientId = patientId.trim();
  if (!normalizedPatientId) {
    throw new InsightSuggestionValidationError("patientId is required");
  }

  const metrics = await collectMetrics(normalizedPatientId, windowDays, windowEnd);
  return buildCandidates(metrics);
}

export async function upsertPendingInsights(
  patientId: string,
  windowDays = 14
): Promise<{ created: number; skipped: number }> {
  const normalizedPatientId = patientId.trim();
  if (!normalizedPatientId) {
    throw new InsightSuggestionValidationError("patientId is required");
  }

  const metrics = await collectMetrics(normalizedPatientId, windowDays, new Date());
  const candidates = buildCandidates(metrics);
  const existingRows = await InsightSuggestion.find({
    patientId: normalizedPatientId,
    fingerprint: { $in: candidates.map((candidate) => candidate.fingerprint) },
  })
    .select({ fingerprint: 1 })
    .lean();
  const existingFingerprints = new Set(
    existingRows
      .map((row) => (typeof row.fingerprint === "string" ? row.fingerprint : ""))
      .filter(Boolean)
  );
  let created = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    if (existingFingerprints.has(candidate.fingerprint)) {
      skipped += 1;
      continue;
    }
    try {
      await InsightSuggestion.create({
        patientId: normalizedPatientId,
        windowDays: metrics.windowDays,
        windowStart: metrics.windowStart,
        windowEnd: metrics.windowEnd,
        status: "pending",
        title: candidate.title,
        message: candidate.message,
        category: candidate.category,
        confidence: candidate.confidence,
        priority: candidate.priority,
        fingerprint: candidate.fingerprint,
        evidence: candidate.evidence,
      });
      created += 1;
      existingFingerprints.add(candidate.fingerprint);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { created, skipped };
}

async function reviewInsight(
  insightId: string,
  status: "approved" | "rejected",
  clinicianUser: AuthUser
) {
  const reviewedBy = {
    clinicianId: clinicianUser.id,
    name: clinicianUser.name?.trim() || undefined,
  };

  const updated = await InsightSuggestion.findByIdAndUpdate(
    insightId,
    {
      $set: {
        status,
        reviewedBy,
        reviewedAt: new Date(),
      },
    },
    {
      new: true,
    }
  );

  if (!updated) {
    throw new InsightSuggestionNotFoundError();
  }

  return updated;
}

export async function approveInsight(insightId: string, clinicianUser: AuthUser) {
  return reviewInsight(insightId, "approved", clinicianUser);
}

export async function rejectInsight(insightId: string, clinicianUser: AuthUser) {
  return reviewInsight(insightId, "rejected", clinicianUser);
}
