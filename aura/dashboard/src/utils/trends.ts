import type { AlertItem, TrendPointNormalized, TrendPointRaw } from '../types/models';

const MS_IN_DAY = 24 * 60 * 60 * 1000;

export interface TrendSummaryMetrics {
  latestPain: number | null;
  latestMood: number | null;
  latestExercises: number | null;
  latestMedication: boolean | null;
  lastCheckinDate: string | null;
  avgPain7d: number | null;
  adherence7d: number | null;
}

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toDateKey(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value.slice(0, 10);
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

export function buildCalendarDateRange(days: 14 | 30, endDate: Date = new Date()): string[] {
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  const dates: string[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end.getTime() - offset * MS_IN_DAY);
    dates.push(toUtcDateKey(date));
  }

  return dates;
}

function normalizePoint(raw: TrendPointRaw | undefined, date: string): TrendPointNormalized {
  if (!raw) {
    return {
      date,
      pain: null,
      mood: null,
      exercises: null,
      medication: null,
      notes: null,
    };
  }

  return {
    date,
    pain: typeof raw.pain === 'number' ? raw.pain : null,
    mood: typeof raw.mood === 'number' ? raw.mood : null,
    exercises: typeof raw.adherence?.exercises === 'number' ? raw.adherence.exercises : null,
    medication: typeof raw.adherence?.medication === 'boolean' ? raw.adherence.medication : null,
    notes: raw.notes ?? null,
  };
}

export function normalizeTrendPoints(
  rawPoints: TrendPointRaw[],
  days: 14 | 30,
  endDate: Date = new Date(),
): TrendPointNormalized[] {
  const dateRange = buildCalendarDateRange(days, endDate);
  const byDate = new Map<string, TrendPointRaw>();

  rawPoints.forEach((point) => {
    const key = toDateKey(point.date);
    byDate.set(key, point);
  });

  return dateRange.map((date) => normalizePoint(byDate.get(date), date));
}

export function trendPointHasAnyData(point: TrendPointNormalized): boolean {
  return (
    point.pain !== null ||
    point.mood !== null ||
    point.exercises !== null ||
    point.medication !== null ||
    Boolean(point.notes)
  );
}

function latestNumericValue(
  points: TrendPointNormalized[],
  selector: (point: TrendPointNormalized) => number | null,
): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = selector(points[index]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function latestBooleanValue(
  points: TrendPointNormalized[],
  selector: (point: TrendPointNormalized) => boolean | null,
): boolean | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = selector(points[index]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function deriveTrendSummary(points: TrendPointNormalized[]): TrendSummaryMetrics {
  const lastCheckin = [...points].reverse().find((point) => trendPointHasAnyData(point));

  const lastSevenPoints = points.slice(-7);
  const painSamples = lastSevenPoints
    .map((point) => point.pain)
    .filter((value): value is number => value !== null);
  const exerciseSamples = lastSevenPoints
    .map((point) => point.exercises)
    .filter((value): value is number => value !== null);

  return {
    latestPain: latestNumericValue(points, (point) => point.pain),
    latestMood: latestNumericValue(points, (point) => point.mood),
    latestExercises: latestNumericValue(points, (point) => point.exercises),
    latestMedication: latestBooleanValue(points, (point) => point.medication),
    lastCheckinDate: lastCheckin?.date ?? null,
    avgPain7d: average(painSamples),
    adherence7d: average(exerciseSamples),
  };
}

export function alertsForDate(alerts: AlertItem[], dateKey: string): AlertItem[] {
  return alerts.filter((alert) => toDateKey(alert.createdAt) === dateKey);
}

export function filterAlertsForPatient(alerts: AlertItem[], patientId: string): AlertItem[] {
  return alerts.filter((alert) => alert.patientId === patientId);
}
