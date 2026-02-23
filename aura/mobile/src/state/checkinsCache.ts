import AsyncStorage from "@react-native-async-storage/async-storage";

import type { CheckInItem } from "@/src/api/patient";

const PREFIX = "aura:checkinsCache:v1:";
const MAX_CACHE_ITEMS = 400;

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizeCachedCheckIn(value: unknown): CheckInItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    id?: unknown;
    date?: unknown;
    createdAt?: unknown;
    pain?: unknown;
    mood?: unknown;
    adherence?: {
      exercises?: unknown;
      medication?: unknown;
    };
  };

  if (typeof item.id !== "string" || !item.id.trim()) {
    return null;
  }

  if (typeof item.pain !== "number" || !Number.isFinite(item.pain)) {
    return null;
  }

  if (typeof item.mood !== "number" || !Number.isFinite(item.mood)) {
    return null;
  }

  const exercises =
    typeof item.adherence?.exercises === "number" &&
    Number.isFinite(item.adherence.exercises)
      ? item.adherence.exercises
      : undefined;
  const hasExercises =
    typeof item.adherence?.exercises === "number" &&
    Number.isFinite(item.adherence.exercises);
  const medication =
    typeof item.adherence?.medication === "boolean"
      ? item.adherence.medication
      : undefined;
  const hasMedication = typeof medication === "boolean";

  return {
    id: item.id.trim(),
    date: typeof item.date === "string" ? item.date : undefined,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
    pain: item.pain,
    mood: item.mood,
    adherence:
      hasExercises || hasMedication
        ? {
            exercises,
            medication,
          }
        : undefined,
  };
}

function normalizeItems(items: CheckInItem[]): CheckInItem[] {
  return items
    .slice(0, MAX_CACHE_ITEMS)
    .map((item) => normalizeCachedCheckIn(item))
    .filter((item): item is CheckInItem => Boolean(item));
}

export async function getCachedCheckins(
  patientId: string
): Promise<CheckInItem[] | null> {
  if (!patientId.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return normalizeItems(parsed as CheckInItem[]);
  } catch {
    return null;
  }
}

export async function setCachedCheckins(
  patientId: string,
  items: CheckInItem[]
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  const normalized = normalizeItems(items);
  try {
    await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(normalized));
  } catch {
    // Cache failure should not block progress UX.
  }
}

export async function clearCachedCheckins(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  try {
    await AsyncStorage.removeItem(storageKey(patientId));
  } catch {
    // Ignore cache cleanup failures.
  }
}
