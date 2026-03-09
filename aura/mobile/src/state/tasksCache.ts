import AsyncStorage from "@react-native-async-storage/async-storage";

import type { PatientTaskItem } from "@/src/types/task";

const PREFIX = "aura:tasksCache:v1:";

type StoredTasksCache = {
  cachedAt: number;
  items: PatientTaskItem[];
};

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function isTaskItem(value: unknown): value is PatientTaskItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as {
    id?: unknown;
    title?: unknown;
    type?: unknown;
    priority?: unknown;
    status?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    patientCompletable?: unknown;
  };

  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    (record.type === "follow_up" ||
      record.type === "appointment" ||
      record.type === "safety_review" ||
      record.type === "adherence_review" ||
      record.type === "communication" ||
      record.type === "custom") &&
    (record.priority === "low" ||
      record.priority === "medium" ||
      record.priority === "high" ||
      record.priority === "urgent") &&
    (record.status === "open" ||
      record.status === "in_progress" ||
      record.status === "completed" ||
      record.status === "cancelled") &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    typeof record.patientCompletable === "boolean"
  );
}

function normalizeCache(value: unknown): StoredTasksCache | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as {
    cachedAt?: unknown;
    items?: unknown;
  };

  if (
    typeof record.cachedAt !== "number" ||
    !Number.isFinite(record.cachedAt) ||
    !Array.isArray(record.items)
  ) {
    return null;
  }

  const items = record.items.filter((item): item is PatientTaskItem => isTaskItem(item));

  return {
    cachedAt: record.cachedAt,
    items,
  };
}

export async function getCachedTasks(patientId: string): Promise<StoredTasksCache | null> {
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

export async function setCachedTasks(patientId: string, items: PatientTaskItem[]): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  const payload: StoredTasksCache = {
    cachedAt: Date.now(),
    items,
  };

  try {
    await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(payload));
  } catch {
    // Ignore cache write failures.
  }
}

export async function clearCachedTasks(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  try {
    await AsyncStorage.removeItem(storageKey(patientId));
  } catch {
    // Ignore cache cleanup failures.
  }
}
