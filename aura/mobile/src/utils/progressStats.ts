import type { CheckInItem } from "@/src/api/patient";

export type ProgressSummary = {
  days: 14 | 30;
  checkinCount: number;
  avgPain: number | null;
  avgMood: number | null;
  avgExerciseAdherencePct: number | null;
  medicationYesPct: number | null;
  avgSleepHours: number | null;
  avgSleepQuality: number | null;
};

function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function parseCheckinTime(item: CheckInItem): number {
  if (item.date) {
    const dateTs = Date.parse(item.date);
    if (Number.isFinite(dateTs)) {
      return dateTs;
    }
  }

  if (item.createdAt) {
    const createdTs = Date.parse(item.createdAt);
    if (Number.isFinite(createdTs)) {
      return createdTs;
    }
  }

  return Number.NaN;
}

export function inLastDays(item: CheckInItem, days: number): boolean {
  const ts = parseCheckinTime(item);
  if (!Number.isFinite(ts)) {
    return false;
  }

  const windowMs = days * 24 * 60 * 60 * 1000;
  const threshold = Date.now() - windowMs;
  return ts >= threshold;
}

export function avg(numbers: number[]): number | null {
  if (numbers.length === 0) {
    return null;
  }

  const total = numbers.reduce((sum, value) => sum + value, 0);
  return total / numbers.length;
}

export function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return (numerator / denominator) * 100;
}

export function computeSummary(
  items: CheckInItem[],
  days: 14 | 30
): ProgressSummary {
  const scoped = items.filter((item) => inLastDays(item, days));

  const painValues = scoped.map((item) => item.pain);
  const moodValues = scoped.map((item) => item.mood);
  const exercises = scoped
    .map((item) => item.adherence?.exercises)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const medicationValues = scoped
    .map((item) => item.adherence?.medication)
    .filter((value): value is boolean => typeof value === "boolean");
  const sleepHoursValues = scoped
    .map((item) => item.sleep?.hours)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const sleepQualityValues = scoped
    .map((item) => item.sleep?.quality)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const avgPain = avg(painValues);
  const avgMood = avg(moodValues);
  const avgExerciseRatio = avg(exercises);
  const medicationYes = medicationValues.filter(Boolean).length;
  const medicationYesPct = pct(medicationYes, medicationValues.length);
  const avgSleepHours = avg(sleepHoursValues);
  const avgSleepQuality = avg(sleepQualityValues);

  return {
    days,
    checkinCount: scoped.length,
    avgPain: avgPain === null ? null : roundTo(avgPain, 1),
    avgMood: avgMood === null ? null : roundTo(avgMood, 1),
    avgExerciseAdherencePct:
      avgExerciseRatio === null ? null : Math.round(avgExerciseRatio * 100),
    medicationYesPct:
      medicationYesPct === null ? null : Math.round(medicationYesPct),
    avgSleepHours: avgSleepHours === null ? null : roundTo(avgSleepHours, 1),
    avgSleepQuality: avgSleepQuality === null ? null : roundTo(avgSleepQuality, 1),
  };
}
