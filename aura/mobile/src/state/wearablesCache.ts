import AsyncStorage from "@react-native-async-storage/async-storage";

import type { WearableDailyDay, WearablesSummary } from "@/src/api/wearables";

export type WearablesCache = {
  cachedAt: number;
  lastSyncAt: number | null;
  summary: WearablesSummary | null;
  last7Days: WearableDailyDay[];
};

const PREFIX = "aura:wearablesCache:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizeDay(value: unknown): WearableDailyDay | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    date?: unknown;
    steps?: unknown;
    activeMinutes?: unknown;
    restingHr?: unknown;
  };
  if (typeof record.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
    return null;
  }

  const steps =
    typeof record.steps === "number" && Number.isFinite(record.steps)
      ? Math.max(0, Math.trunc(record.steps))
      : undefined;
  const activeMinutes =
    typeof record.activeMinutes === "number" && Number.isFinite(record.activeMinutes)
      ? Math.max(0, Math.trunc(record.activeMinutes))
      : undefined;
  const restingHr =
    typeof record.restingHr === "number" && Number.isFinite(record.restingHr)
      ? Math.max(0, Math.trunc(record.restingHr))
      : undefined;

  if (
    typeof steps !== "number" &&
    typeof activeMinutes !== "number" &&
    typeof restingHr !== "number"
  ) {
    return null;
  }

  return {
    date: record.date,
    ...(typeof steps === "number" ? { steps } : {}),
    ...(typeof activeMinutes === "number" ? { activeMinutes } : {}),
    ...(typeof restingHr === "number" ? { restingHr } : {}),
  };
}

function normalizeSummary(value: unknown): WearablesSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    source?: unknown;
    from?: unknown;
    to?: unknown;
    trackedDays?: unknown;
    avgSteps?: unknown;
    avgActiveMinutes?: unknown;
    avgRestingHr?: unknown;
    totalSteps?: unknown;
    totalActiveMinutes?: unknown;
  };

  if (
    typeof record.from !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(record.from) ||
    typeof record.to !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(record.to)
  ) {
    return null;
  }

  const source =
    record.source === "healthkit_stub" || record.source === "googlefit_stub"
      ? record.source
      : "mock";

  return {
    source,
    from: record.from,
    to: record.to,
    trackedDays:
      typeof record.trackedDays === "number" && Number.isFinite(record.trackedDays)
        ? Math.max(0, Math.trunc(record.trackedDays))
        : 0,
    avgSteps:
      typeof record.avgSteps === "number" && Number.isFinite(record.avgSteps)
        ? record.avgSteps
        : null,
    avgActiveMinutes:
      typeof record.avgActiveMinutes === "number" && Number.isFinite(record.avgActiveMinutes)
        ? record.avgActiveMinutes
        : null,
    avgRestingHr:
      typeof record.avgRestingHr === "number" && Number.isFinite(record.avgRestingHr)
        ? record.avgRestingHr
        : null,
    totalSteps:
      typeof record.totalSteps === "number" && Number.isFinite(record.totalSteps)
        ? Math.max(0, Math.trunc(record.totalSteps))
        : 0,
    totalActiveMinutes:
      typeof record.totalActiveMinutes === "number" && Number.isFinite(record.totalActiveMinutes)
        ? Math.max(0, Math.trunc(record.totalActiveMinutes))
        : 0,
  };
}

function normalizeCache(value: unknown): WearablesCache | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    cachedAt?: unknown;
    lastSyncAt?: unknown;
    summary?: unknown;
    last7Days?: unknown;
  };

  if (typeof record.cachedAt !== "number" || !Number.isFinite(record.cachedAt)) {
    return null;
  }
  if (!Array.isArray(record.last7Days)) {
    return null;
  }

  const summary =
    record.summary === null || typeof record.summary === "undefined"
      ? null
      : normalizeSummary(record.summary);
  if (record.summary && !summary) {
    return null;
  }

  return {
    cachedAt: record.cachedAt,
    lastSyncAt:
      typeof record.lastSyncAt === "number" && Number.isFinite(record.lastSyncAt)
        ? record.lastSyncAt
        : null,
    summary,
    last7Days: record.last7Days
      .map((row) => normalizeDay(row))
      .filter((row): row is WearableDailyDay => Boolean(row))
      .sort((left, right) => Date.parse(left.date) - Date.parse(right.date)),
  };
}

export async function getCachedWearables(patientId: string): Promise<WearablesCache | null> {
  if (!patientId.trim()) {
    return null;
  }
  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    if (!raw) {
      return null;
    }
    return normalizeCache(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setCachedWearables(
  patientId: string,
  payload: {
    summary: WearablesSummary | null;
    last7Days: WearableDailyDay[];
    lastSyncAt?: number | null;
  }
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  const data: WearablesCache = {
    cachedAt: Date.now(),
    lastSyncAt:
      typeof payload.lastSyncAt === "number" && Number.isFinite(payload.lastSyncAt)
        ? payload.lastSyncAt
        : null,
    summary: payload.summary,
    last7Days: payload.last7Days
      .map((row) => normalizeDay(row))
      .filter((row): row is WearableDailyDay => Boolean(row))
      .sort((left, right) => Date.parse(left.date) - Date.parse(right.date)),
  };

  try {
    await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(data));
  } catch {
    // Best effort cache.
  }
}

export async function clearCachedWearables(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId));
}
