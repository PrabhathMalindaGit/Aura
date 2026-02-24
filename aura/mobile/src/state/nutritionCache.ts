import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  NutritionDay,
  NutritionEntry,
  NutritionTodayResponse,
} from "@/src/api/patient";

export type CachedNutritionDay = {
  cachedAt: number;
  date: string;
  entry: NutritionEntry | null;
};

const PREFIX = "aura:nutritionCache:v1:";

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

function normalizeNutritionEntry(value: unknown): NutritionEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as NutritionEntry;
  if (
    typeof entry.id !== "string" ||
    typeof entry.date !== "string" ||
    (entry.protein !== "low" && entry.protein !== "ok" && entry.protein !== "high") ||
    typeof entry.fruitVegServings !== "number" ||
    typeof entry.antiInflammatoryFocus !== "boolean" ||
    (entry.mealRegularity !== "irregular" &&
      entry.mealRegularity !== "mostly" &&
      entry.mealRegularity !== "regular") ||
    typeof entry.createdAt !== "string"
  ) {
    return null;
  }

  return {
    ...entry,
    fruitVegServings: Math.round(entry.fruitVegServings),
    notes: typeof entry.notes === "string" ? entry.notes : undefined,
    appetite:
      entry.appetite === "low" || entry.appetite === "normal" || entry.appetite === "high"
        ? entry.appetite
        : undefined,
    pending: entry.pending === true ? true : undefined,
    localId: typeof entry.localId === "string" ? entry.localId : undefined,
  };
}

function normalizeCached(value: unknown): CachedNutritionDay | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    cachedAt?: unknown;
    date?: unknown;
    entry?: unknown;
  };

  if (
    typeof record.cachedAt !== "number" ||
    !Number.isFinite(record.cachedAt) ||
    typeof record.date !== "string"
  ) {
    return null;
  }

  const normalizedEntry =
    record.entry === null || typeof record.entry === "undefined"
      ? null
      : normalizeNutritionEntry(record.entry);
  if (record.entry && !normalizedEntry) {
    return null;
  }

  return {
    cachedAt: record.cachedAt,
    date: record.date,
    entry: normalizedEntry,
  };
}

export async function getCachedNutritionDay(
  patientId: string,
  date: string
): Promise<CachedNutritionDay | null> {
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

export async function setCachedNutritionDay(
  patientId: string,
  payload: CachedNutritionDay
): Promise<void> {
  if (!patientId.trim() || !payload.date.trim()) {
    return;
  }
  try {
    await AsyncStorage.setItem(storageKey(patientId, payload.date), JSON.stringify(payload));
  } catch {
    // Best effort cache.
  }
}

export async function setCachedNutritionToday(
  patientId: string,
  today: NutritionTodayResponse
): Promise<void> {
  await setCachedNutritionDay(patientId, {
    cachedAt: Date.now(),
    date: today.date,
    entry: today.entry,
  });
}

export async function mergeCachedNutritionDays(
  patientId: string,
  days: NutritionDay[]
): Promise<void> {
  if (!patientId.trim() || days.length === 0) {
    return;
  }

  const updates = days.map((day) => ({
    cachedAt: Date.now(),
    date: day.date,
    entry: day.entry,
  }));
  await Promise.all(
    updates.map((entry) => setCachedNutritionDay(patientId, entry))
  );
}

export async function getCachedNutritionRange(
  patientId: string,
  from: string,
  to: string
): Promise<{ from: string; to: string; days: NutritionDay[] } | null> {
  if (!patientId.trim() || !from.trim() || !to.trim()) {
    return null;
  }
  if (compareDateOnly(from, to) > 0) {
    return null;
  }

  const dates = expandDateRangeInclusive(from, to);
  const entries = await Promise.all(dates.map((date) => getCachedNutritionDay(patientId, date)));
  const hasAny = entries.some((entry) => Boolean(entry));
  if (!hasAny) {
    return null;
  }

  return {
    from,
    to,
    days: dates.map((date, index) => ({
      date,
      entry: entries[index]?.entry ?? null,
    })),
  };
}

export async function clearCachedNutritionDay(
  patientId: string,
  date: string
): Promise<void> {
  if (!patientId.trim() || !date.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId, date));
}

export async function clearAllNutritionCacheForPatient(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  const keys = await AsyncStorage.getAllKeys();
  const nutritionKeys = keys.filter((key) => key.startsWith(`${PREFIX}${patientId}:`));
  if (nutritionKeys.length > 0) {
    await AsyncStorage.multiRemove(nutritionKeys);
  }
}
