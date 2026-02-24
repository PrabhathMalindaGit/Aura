import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  HydrationDayTotal,
  HydrationEntry,
  HydrationTodayResponse,
} from "@/src/api/patient";

export type CachedHydrationDay = {
  cachedAt: number;
  date: string;
  totalMl: number;
  targetMl: number;
  entries: HydrationEntry[];
};

const PREFIX = "aura:hydrationCache:v1:";

function storageKey(patientId: string, date: string): string {
  return `${PREFIX}${patientId}:${date}`;
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

function addDays(dateOnly: string, deltaDays: number): string {
  const parsed = parseDateOnly(dateOnly);
  if (!parsed) {
    return dateOnly;
  }
  const shifted = new Date(parsed.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function compareDateOnly(left: string, right: string): number {
  return Date.parse(`${left}T00:00:00.000Z`) - Date.parse(`${right}T00:00:00.000Z`);
}

function expandDateRangeInclusive(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (compareDateOnly(cursor, to) <= 0) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function normalizeEntry(value: unknown): HydrationEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entry = value as {
    id?: unknown;
    amountMl?: unknown;
    createdAt?: unknown;
    pending?: unknown;
    localId?: unknown;
  };
  if (
    typeof entry.id !== "string" ||
    typeof entry.amountMl !== "number" ||
    !Number.isFinite(entry.amountMl) ||
    typeof entry.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: entry.id,
    amountMl: Math.round(entry.amountMl),
    createdAt: entry.createdAt,
    pending: entry.pending === true ? true : undefined,
    localId: typeof entry.localId === "string" ? entry.localId : undefined,
  };
}

function normalizeCached(value: unknown): CachedHydrationDay | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    cachedAt?: unknown;
    date?: unknown;
    totalMl?: unknown;
    targetMl?: unknown;
    entries?: unknown;
  };

  if (
    typeof record.cachedAt !== "number" ||
    !Number.isFinite(record.cachedAt) ||
    typeof record.date !== "string" ||
    typeof record.totalMl !== "number" ||
    !Number.isFinite(record.totalMl)
  ) {
    return null;
  }

  const entries = Array.isArray(record.entries)
    ? record.entries
        .map((entry) => normalizeEntry(entry))
        .filter((entry): entry is HydrationEntry => Boolean(entry))
    : [];

  return {
    cachedAt: record.cachedAt,
    date: record.date,
    totalMl: Math.round(record.totalMl),
    targetMl:
      typeof record.targetMl === "number" && Number.isFinite(record.targetMl)
        ? Math.round(record.targetMl)
        : 2000,
    entries,
  };
}

export async function getCachedHydrationDay(
  patientId: string,
  date: string
): Promise<CachedHydrationDay | null> {
  if (!patientId.trim() || !date.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId, date));
    if (!raw) {
      return null;
    }
    return normalizeCached(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setCachedHydrationDay(
  patientId: string,
  payload: CachedHydrationDay
): Promise<void> {
  if (!patientId.trim() || !payload.date.trim()) {
    return;
  }

  try {
    await AsyncStorage.setItem(
      storageKey(patientId, payload.date),
      JSON.stringify(payload)
    );
  } catch {
    // Best effort cache.
  }
}

export async function setCachedHydrationToday(
  patientId: string,
  today: HydrationTodayResponse
): Promise<void> {
  await setCachedHydrationDay(patientId, {
    cachedAt: Date.now(),
    date: today.date,
    totalMl: today.totalMl,
    targetMl: today.targetMl,
    entries: today.entries,
  });
}

export async function mergeCachedHydrationDayTotals(
  patientId: string,
  days: HydrationDayTotal[],
  targetMl = 2000
): Promise<void> {
  if (!patientId.trim() || days.length === 0) {
    return;
  }

  const updates = await Promise.all(
    days.map(async (day) => {
      const existing = await getCachedHydrationDay(patientId, day.date);
      return {
        cachedAt: Date.now(),
        date: day.date,
        totalMl: day.totalMl,
        targetMl,
        entries: existing?.entries ?? [],
      } satisfies CachedHydrationDay;
    })
  );

  await Promise.all(updates.map((entry) => setCachedHydrationDay(patientId, entry)));
}

export async function getCachedHydrationRange(
  patientId: string,
  from: string,
  to: string
): Promise<{ from: string; to: string; targetMl: number; days: HydrationDayTotal[] } | null> {
  if (!patientId.trim() || !from.trim() || !to.trim()) {
    return null;
  }
  if (compareDateOnly(from, to) > 0) {
    return null;
  }

  const dates = expandDateRangeInclusive(from, to);
  const entries = await Promise.all(dates.map((date) => getCachedHydrationDay(patientId, date)));
  const hasAny = entries.some((entry) => Boolean(entry));
  if (!hasAny) {
    return null;
  }

  const targetMl = entries.find((entry) => entry)?.targetMl ?? 2000;
  const days = dates.map((date, index) => ({
    date,
    totalMl: entries[index]?.totalMl ?? 0,
    metTarget: (entries[index]?.totalMl ?? 0) >= targetMl,
  }));

  return {
    from,
    to,
    targetMl,
    days,
  };
}

export async function clearCachedHydrationDay(
  patientId: string,
  date: string
): Promise<void> {
  if (!patientId.trim() || !date.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId, date));
}

export async function clearAllHydrationCacheForPatient(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  const keys = await AsyncStorage.getAllKeys();
  const hydrationKeys = keys.filter((key) => key.startsWith(`${PREFIX}${patientId}:`));
  if (hydrationKeys.length > 0) {
    await AsyncStorage.multiRemove(hydrationKeys);
  }
}
