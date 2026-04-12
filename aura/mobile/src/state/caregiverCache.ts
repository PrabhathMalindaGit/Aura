import AsyncStorage from "@react-native-async-storage/async-storage";

import type { CaregiverSummary, CaregiverWeeklyReport } from "@/src/api/caregiver";

export type CaregiverCache = {
  cachedAt: number;
  summary?: CaregiverSummary;
  weeklyReportThisWeek?: CaregiverWeeklyReport;
  weeklyReportLastWeek?: CaregiverWeeklyReport;
};

type WeekPreset = "this" | "last";

const PREFIX = "aura:caregiverCache:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalize(value: unknown): CaregiverCache | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    cachedAt?: unknown;
    summary?: unknown;
    weeklyReportThisWeek?: unknown;
    weeklyReportLastWeek?: unknown;
  };
  if (typeof record.cachedAt !== "number" || !Number.isFinite(record.cachedAt)) {
    return null;
  }

  const next: CaregiverCache = {
    cachedAt: record.cachedAt,
  };

  if (record.summary && typeof record.summary === "object") {
    next.summary = record.summary as CaregiverSummary;
  }
  if (record.weeklyReportThisWeek && typeof record.weeklyReportThisWeek === "object") {
    next.weeklyReportThisWeek = record.weeklyReportThisWeek as CaregiverWeeklyReport;
  }
  if (record.weeklyReportLastWeek && typeof record.weeklyReportLastWeek === "object") {
    next.weeklyReportLastWeek = record.weeklyReportLastWeek as CaregiverWeeklyReport;
  }

  return next;
}

async function readCache(patientId: string): Promise<CaregiverCache | null> {
  if (!patientId.trim()) {
    return null;
  }
  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    if (!raw) {
      return null;
    }
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeCache(patientId: string, cache: CaregiverCache): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  try {
    await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(cache));
  } catch {
    // best effort
  }
}

export async function getCachedCaregiverData(
  patientId: string
): Promise<CaregiverCache | null> {
  return readCache(patientId);
}

export async function setCachedCaregiverSummary(
  patientId: string,
  summary: CaregiverSummary
): Promise<void> {
  const existing = (await readCache(patientId)) ?? { cachedAt: Date.now() };
  await writeCache(patientId, {
    ...existing,
    cachedAt: Date.now(),
    summary,
  });
}

export async function setCachedCaregiverWeeklyReport(
  patientId: string,
  preset: WeekPreset,
  report: CaregiverWeeklyReport
): Promise<void> {
  const existing = (await readCache(patientId)) ?? { cachedAt: Date.now() };
  await writeCache(patientId, {
    ...existing,
    cachedAt: Date.now(),
    weeklyReportThisWeek:
      preset === "this" ? report : existing.weeklyReportThisWeek,
    weeklyReportLastWeek:
      preset === "last" ? report : existing.weeklyReportLastWeek,
  });
}

export function getCachedCaregiverWeeklyReport(
  cache: CaregiverCache | null,
  preset: WeekPreset
): CaregiverWeeklyReport | null {
  if (!cache) {
    return null;
  }
  return preset === "this"
    ? cache.weeklyReportThisWeek ?? null
    : cache.weeklyReportLastWeek ?? null;
}

export async function clearCachedCaregiverData(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  try {
    await AsyncStorage.removeItem(storageKey(patientId));
  } catch {
    // ignore
  }
}

export async function clearAllCaregiverCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((key) => key.startsWith(PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {
    // ignore
  }
}
