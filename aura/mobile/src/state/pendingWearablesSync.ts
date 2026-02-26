import AsyncStorage from "@react-native-async-storage/async-storage";

import type { WearableDailyDay, WearableSource } from "@/src/api/wearables";

export type PendingWearablesSyncBatch = {
  localId: string;
  source: WearableSource;
  createdAt: string;
  days: WearableDailyDay[];
};

const PREFIX = "aura:pendingWearablesSync:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizeDay(value: unknown): WearableDailyDay | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as {
    date?: unknown;
    steps?: unknown;
    activeMinutes?: unknown;
    restingHr?: unknown;
  };
  if (typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
    return null;
  }

  const steps =
    typeof row.steps === "number" && Number.isFinite(row.steps)
      ? Math.max(0, Math.trunc(row.steps))
      : undefined;
  const activeMinutes =
    typeof row.activeMinutes === "number" && Number.isFinite(row.activeMinutes)
      ? Math.max(0, Math.trunc(row.activeMinutes))
      : undefined;
  const restingHr =
    typeof row.restingHr === "number" && Number.isFinite(row.restingHr)
      ? Math.max(0, Math.trunc(row.restingHr))
      : undefined;

  if (
    typeof steps !== "number" &&
    typeof activeMinutes !== "number" &&
    typeof restingHr !== "number"
  ) {
    return null;
  }

  return {
    date: row.date,
    ...(typeof steps === "number" ? { steps } : {}),
    ...(typeof activeMinutes === "number" ? { activeMinutes } : {}),
    ...(typeof restingHr === "number" ? { restingHr } : {}),
  };
}

function normalizeBatch(value: unknown): PendingWearablesSyncBatch | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    localId?: unknown;
    source?: unknown;
    createdAt?: unknown;
    days?: unknown;
  };
  if (
    typeof record.localId !== "string" ||
    !record.localId.trim() ||
    typeof record.createdAt !== "string" ||
    !Array.isArray(record.days)
  ) {
    return null;
  }

  const source: WearableSource =
    record.source === "healthkit_stub" || record.source === "googlefit_stub"
      ? record.source
      : "mock";

  const days = record.days
    .map((day) => normalizeDay(day))
    .filter((day): day is WearableDailyDay => Boolean(day))
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

  if (days.length === 0) {
    return null;
  }

  return {
    localId: record.localId,
    source,
    createdAt: record.createdAt,
    days,
  };
}

async function writeBatches(
  patientId: string,
  batches: PendingWearablesSyncBatch[]
): Promise<void> {
  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(batches));
}

export async function getPendingWearablesSync(
  patientId: string
): Promise<PendingWearablesSyncBatch[]> {
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
      .map((batch) => normalizeBatch(batch))
      .filter((batch): batch is PendingWearablesSyncBatch => Boolean(batch))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  } catch {
    return [];
  }
}

export async function addPendingWearablesSync(
  patientId: string,
  source: WearableSource,
  days: WearableDailyDay[]
): Promise<PendingWearablesSyncBatch> {
  if (!patientId.trim()) {
    throw new Error("patientId is required");
  }
  const normalizedDays = days
    .map((day) => normalizeDay(day))
    .filter((day): day is WearableDailyDay => Boolean(day))
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  if (normalizedDays.length === 0) {
    throw new Error("At least one valid day is required");
  }

  const batch: PendingWearablesSyncBatch = {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    createdAt: new Date().toISOString(),
    days: normalizedDays,
  };

  const existing = await getPendingWearablesSync(patientId);
  await writeBatches(patientId, [...existing, batch]);
  return batch;
}

export async function removePendingWearablesSyncBatch(
  patientId: string,
  localId: string
): Promise<void> {
  if (!patientId.trim() || !localId.trim()) {
    return;
  }
  const existing = await getPendingWearablesSync(patientId);
  await writeBatches(
    patientId,
    existing.filter((batch) => batch.localId !== localId)
  );
}

export async function clearPendingWearablesSync(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId));
}
