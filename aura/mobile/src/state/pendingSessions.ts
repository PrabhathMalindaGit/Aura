import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ExerciseSessionCreatePayload } from "@/src/api/patient";

const PREFIX = "aura:pendingExerciseSessions:v1:";

export type PendingExerciseSession = {
  localId: string;
  createdAt: string;
  payload: ExerciseSessionCreatePayload;
};

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function trimNote(note?: string): string | undefined {
  if (typeof note !== "string") {
    return undefined;
  }
  const trimmed = note.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > 280 ? trimmed.slice(0, 280) : trimmed;
}

function normalizePayload(
  payload: ExerciseSessionCreatePayload
): ExerciseSessionCreatePayload {
  return {
    startedAt: payload.startedAt,
    endedAt: payload.endedAt,
    planVersion: payload.planVersion,
    planTitle: payload.planTitle,
    planDayOfWeek: payload.planDayOfWeek,
    status: payload.status,
    exercises: payload.exercises.map((exercise) => ({
      ...exercise,
      note: trimNote(exercise.note),
    })),
  };
}

function normalizePending(value: unknown): PendingExerciseSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    localId?: unknown;
    createdAt?: unknown;
    payload?: unknown;
  };
  if (
    typeof item.localId !== "string" ||
    !item.localId ||
    typeof item.createdAt !== "string" ||
    !item.createdAt ||
    !item.payload ||
    typeof item.payload !== "object"
  ) {
    return null;
  }

  const payload = item.payload as ExerciseSessionCreatePayload;
  if (
    typeof payload.startedAt !== "string" ||
    typeof payload.endedAt !== "string" ||
    !Array.isArray(payload.exercises)
  ) {
    return null;
  }

  return {
    localId: item.localId,
    createdAt: item.createdAt,
    payload: normalizePayload(payload),
  };
}

export async function getPending(
  patientId: string
): Promise<PendingExerciseSession[]> {
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
      .filter((entry): entry is PendingExerciseSession => Boolean(entry));
  } catch {
    return [];
  }
}

export async function addPending(
  patientId: string,
  payload: ExerciseSessionCreatePayload
): Promise<PendingExerciseSession> {
  const localId = `pending-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const entry: PendingExerciseSession = {
    localId,
    createdAt: new Date().toISOString(),
    payload: normalizePayload(payload),
  };

  const existing = await getPending(patientId);
  const next = [...existing, entry];
  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(next));
  return entry;
}

export async function removePending(
  patientId: string,
  localId: string
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  const existing = await getPending(patientId);
  const next = existing.filter((entry) => entry.localId !== localId);
  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(next));
}

export async function clearPending(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  await AsyncStorage.removeItem(storageKey(patientId));
}
