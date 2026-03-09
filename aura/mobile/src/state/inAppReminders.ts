import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ReminderReadState } from "@/src/types/reminder";

const PREFIX = "aura:inAppReminders:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function emptyState(): ReminderReadState {
  return {
    readById: {},
    updatedAt: Date.now(),
  };
}

function normalizeReadMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const next: Record<string, number> = {};

  for (const [key, candidate] of Object.entries(record)) {
    if (!key.trim()) {
      continue;
    }
    if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate <= 0) {
      continue;
    }
    next[key] = candidate;
  }

  return next;
}

function normalizeState(value: unknown): ReminderReadState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as {
    readById?: unknown;
    updatedAt?: unknown;
  };

  return {
    readById: normalizeReadMap(record.readById),
    updatedAt:
      typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : Date.now(),
  };
}

async function writeState(patientId: string, state: ReminderReadState): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(state));
}

export async function getReminderReadState(patientId: string): Promise<ReminderReadState> {
  if (!patientId.trim()) {
    return emptyState();
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    if (!raw) {
      return emptyState();
    }
    return normalizeState(JSON.parse(raw)) ?? emptyState();
  } catch {
    return emptyState();
  }
}

export async function markReminderRead(
  patientId: string,
  reminderId: string,
): Promise<ReminderReadState> {
  if (!patientId.trim() || !reminderId.trim()) {
    return getReminderReadState(patientId);
  }

  const current = await getReminderReadState(patientId);
  const next: ReminderReadState = {
    readById: {
      ...current.readById,
      [reminderId]: Date.now(),
    },
    updatedAt: Date.now(),
  };
  await writeState(patientId, next);
  return next;
}

export async function markAllRemindersRead(
  patientId: string,
  reminderIds: string[],
): Promise<ReminderReadState> {
  if (!patientId.trim()) {
    return getReminderReadState(patientId);
  }

  const current = await getReminderReadState(patientId);
  const timestamp = Date.now();
  const readById = { ...current.readById };

  for (const reminderId of reminderIds) {
    if (typeof reminderId !== "string" || !reminderId.trim()) {
      continue;
    }
    readById[reminderId] = timestamp;
  }

  const next: ReminderReadState = {
    readById,
    updatedAt: timestamp,
  };
  await writeState(patientId, next);
  return next;
}

export async function syncReminderReadState(
  patientId: string,
  reminderIds: string[],
): Promise<ReminderReadState> {
  if (!patientId.trim()) {
    return emptyState();
  }

  const current = await getReminderReadState(patientId);
  const allowedIds = new Set(
    reminderIds.filter((reminderId): reminderId is string => Boolean(reminderId?.trim())),
  );
  const nextReadById: Record<string, number> = {};

  for (const [reminderId, readAt] of Object.entries(current.readById)) {
    if (allowedIds.has(reminderId)) {
      nextReadById[reminderId] = readAt;
    }
  }

  const next: ReminderReadState = {
    readById: nextReadById,
    updatedAt: Date.now(),
  };
  await writeState(patientId, next);
  return next;
}

export async function clearReminderReadState(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  await AsyncStorage.removeItem(storageKey(patientId));
}
