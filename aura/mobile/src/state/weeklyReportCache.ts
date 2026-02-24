import AsyncStorage from "@react-native-async-storage/async-storage";

import type { WeeklyReport } from "@/src/api/patient";

export type CachedWeeklyReport = {
  cachedAt: number;
  report: WeeklyReport;
};

const PREFIX = "aura:weeklyReportCache:v1:";

function storageKey(patientId: string, weekStart: string): string {
  return `${PREFIX}${patientId}:${weekStart}`;
}

function normalizeCached(value: unknown): CachedWeeklyReport | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    cachedAt?: unknown;
    report?: unknown;
  };

  if (typeof record.cachedAt !== "number" || !Number.isFinite(record.cachedAt)) {
    return null;
  }

  if (!record.report || typeof record.report !== "object") {
    return null;
  }

  const report = record.report as WeeklyReport;
  if (
    report.ok !== true ||
    typeof report.patientId !== "string" ||
    !report.patientId.trim() ||
    !report.period ||
    typeof report.period.weekStart !== "string" ||
    typeof report.period.weekEnd !== "string"
  ) {
    return null;
  }

  return {
    cachedAt: record.cachedAt,
    report,
  };
}

export async function getCachedWeeklyReport(
  patientId: string,
  weekStart: string
): Promise<CachedWeeklyReport | null> {
  if (!patientId.trim() || !weekStart.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId, weekStart));
    if (!raw) {
      return null;
    }

    return normalizeCached(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setCachedWeeklyReport(
  patientId: string,
  weekStart: string,
  report: WeeklyReport
): Promise<void> {
  if (!patientId.trim() || !weekStart.trim()) {
    return;
  }

  const payload: CachedWeeklyReport = {
    cachedAt: Date.now(),
    report,
  };

  try {
    await AsyncStorage.setItem(storageKey(patientId, weekStart), JSON.stringify(payload));
  } catch {
    // Cache writes are best effort.
  }
}

export async function clearCachedWeeklyReport(
  patientId: string,
  weekStart: string
): Promise<void> {
  if (!patientId.trim() || !weekStart.trim()) {
    return;
  }

  try {
    await AsyncStorage.removeItem(storageKey(patientId, weekStart));
  } catch {
    // Ignore cache cleanup failures.
  }
}

export async function clearAllWeeklyReportsForPatient(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  const allKeys = await AsyncStorage.getAllKeys();
  const reportKeys = allKeys.filter((key) => key.startsWith(`${PREFIX}${patientId}:`));
  if (reportKeys.length > 0) {
    await AsyncStorage.multiRemove(reportKeys);
  }
}
