import AsyncStorage from "@react-native-async-storage/async-storage";

import type { NutritionLogPayload } from "@/src/api/patient";

export type PendingNutritionEntry = {
  localId: string;
  date: string;
  payload: NutritionLogPayload;
  createdAt: string;
};

const PREFIX = "aura:pendingNutrition:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizePending(value: unknown): PendingNutritionEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as {
    localId?: unknown;
    date?: unknown;
    payload?: unknown;
    createdAt?: unknown;
  };
  if (
    typeof entry.localId !== "string" ||
    !entry.localId.trim() ||
    typeof entry.date !== "string" ||
    !entry.date.trim() ||
    !entry.payload ||
    typeof entry.payload !== "object" ||
    typeof entry.createdAt !== "string"
  ) {
    return null;
  }

  const payload = entry.payload as NutritionLogPayload;
  if (
    payload.protein !== "low" &&
    payload.protein !== "ok" &&
    payload.protein !== "high"
  ) {
    return null;
  }
  if (
    payload.mealRegularity !== "irregular" &&
    payload.mealRegularity !== "mostly" &&
    payload.mealRegularity !== "regular"
  ) {
    return null;
  }
  if (
    typeof payload.fruitVegServings !== "number" ||
    !Number.isFinite(payload.fruitVegServings)
  ) {
    return null;
  }
  if (typeof payload.antiInflammatoryFocus !== "boolean") {
    return null;
  }

  return {
    localId: entry.localId,
    date: entry.date,
    payload: {
      ...payload,
      fruitVegServings: Math.round(payload.fruitVegServings),
      notes: typeof payload.notes === "string" ? payload.notes : undefined,
      appetite:
        payload.appetite === "low" ||
        payload.appetite === "normal" ||
        payload.appetite === "high"
          ? payload.appetite
          : undefined,
    },
    createdAt: entry.createdAt,
  };
}

async function writePending(patientId: string, entries: PendingNutritionEntry[]): Promise<void> {
  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(entries));
}

export async function getPendingNutrition(
  patientId: string
): Promise<PendingNutritionEntry[]> {
  if (!patientId.trim()) {
    return [];
  }
  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => normalizePending(entry))
      .filter((entry): entry is PendingNutritionEntry => Boolean(entry));
  } catch {
    return [];
  }
}

export async function addPendingNutrition(
  patientId: string,
  payload: NutritionLogPayload
): Promise<PendingNutritionEntry> {
  if (!patientId.trim()) {
    throw new Error("patientId is required");
  }

  const entry: PendingNutritionEntry = {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date:
      typeof payload.date === "string" && payload.date.trim()
        ? payload.date
        : new Date().toISOString().slice(0, 10),
    payload: {
      ...payload,
      fruitVegServings: Math.round(payload.fruitVegServings),
      notes: typeof payload.notes === "string" ? payload.notes.slice(0, 280) : undefined,
    },
    createdAt: new Date().toISOString(),
  };

  const existing = await getPendingNutrition(patientId);
  await writePending(patientId, [...existing, entry]);
  return entry;
}

export async function removePendingNutrition(
  patientId: string,
  localId: string
): Promise<void> {
  if (!patientId.trim() || !localId.trim()) {
    return;
  }

  const existing = await getPendingNutrition(patientId);
  await writePending(
    patientId,
    existing.filter((entry) => entry.localId !== localId)
  );
}

export async function clearPendingNutrition(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  await AsyncStorage.removeItem(storageKey(patientId));
}
