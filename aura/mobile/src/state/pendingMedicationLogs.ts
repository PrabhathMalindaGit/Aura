import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MedicationLogPayload } from "@/src/api/patient";

export type PendingMedicationLog = {
  localId: string;
  medicationId: string;
  date: string;
  time: string;
  status: "taken" | "skipped";
  note?: string;
  createdAt: string;
};

const PREFIX = "aura:pendingMedicationLogs:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizePending(value: unknown): PendingMedicationLog | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    localId?: unknown;
    medicationId?: unknown;
    date?: unknown;
    time?: unknown;
    status?: unknown;
    note?: unknown;
    createdAt?: unknown;
  };
  if (
    typeof record.localId !== "string" ||
    typeof record.medicationId !== "string" ||
    typeof record.date !== "string" ||
    typeof record.time !== "string" ||
    (record.status !== "taken" && record.status !== "skipped") ||
    typeof record.createdAt !== "string"
  ) {
    return null;
  }
  return {
    localId: record.localId,
    medicationId: record.medicationId,
    date: record.date,
    time: record.time,
    status: record.status,
    note: typeof record.note === "string" ? record.note : undefined,
    createdAt: record.createdAt,
  };
}

async function writePending(patientId: string, entries: PendingMedicationLog[]): Promise<void> {
  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(entries));
}

export async function getPendingMedicationLogs(
  patientId: string
): Promise<PendingMedicationLog[]> {
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
      .map((value) => normalizePending(value))
      .filter((value): value is PendingMedicationLog => Boolean(value));
  } catch {
    return [];
  }
}

export async function addPendingMedicationLog(
  patientId: string,
  payload: MedicationLogPayload
): Promise<PendingMedicationLog> {
  if (!patientId.trim()) {
    throw new Error("patientId is required");
  }
  const entry: PendingMedicationLog = {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    medicationId: payload.medicationId,
    date: payload.date ?? new Date().toISOString().slice(0, 10),
    time: payload.time,
    status: payload.status,
    note: typeof payload.note === "string" ? payload.note.slice(0, 280) : undefined,
    createdAt: new Date().toISOString(),
  };
  const existing = await getPendingMedicationLogs(patientId);
  await writePending(patientId, [...existing, entry]);
  return entry;
}

export async function removePendingMedicationLog(
  patientId: string,
  localId: string
): Promise<void> {
  if (!patientId.trim() || !localId.trim()) {
    return;
  }
  const existing = await getPendingMedicationLogs(patientId);
  await writePending(
    patientId,
    existing.filter((entry) => entry.localId !== localId)
  );
}

export async function clearPendingMedicationLogs(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId));
}
