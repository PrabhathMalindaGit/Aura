import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

import type { SymptomPhotoKind } from "@/src/api/patient";

export type PendingPhotoUpload = {
  localId: string;
  date: string;
  kind: SymptomPhotoKind;
  note?: string;
  localFileUri: string;
  mimeType: string;
  createdAt: string;
};

const PREFIX = "aura:pendingPhotoUploads:v1:";
const PENDING_DIR_NAME = "pendingPhotos";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

export function getPendingPhotosDirectoryUri(): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }
  return `${FileSystem.documentDirectory}${PENDING_DIR_NAME}`;
}

export async function ensurePendingPhotosDirectory(): Promise<string | null> {
  const dir = getPendingPhotosDirectoryUri();
  if (!dir) {
    return null;
  }
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
  } catch {
    return null;
  }
}

function normalizeKind(value: unknown): SymptomPhotoKind | null {
  if (
    value === "swelling" ||
    value === "wound" ||
    value === "rash" ||
    value === "other"
  ) {
    return value;
  }
  return null;
}

function normalizePending(value: unknown): PendingPhotoUpload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    localId?: unknown;
    date?: unknown;
    kind?: unknown;
    note?: unknown;
    localFileUri?: unknown;
    mimeType?: unknown;
    createdAt?: unknown;
  };
  const kind = normalizeKind(record.kind);
  if (
    typeof record.localId !== "string" ||
    !record.localId.trim() ||
    typeof record.date !== "string" ||
    !record.date.trim() ||
    !kind ||
    typeof record.localFileUri !== "string" ||
    !record.localFileUri.trim() ||
    typeof record.mimeType !== "string" ||
    !record.mimeType.trim() ||
    typeof record.createdAt !== "string" ||
    !record.createdAt.trim()
  ) {
    return null;
  }

  return {
    localId: record.localId,
    date: record.date,
    kind,
    note:
      typeof record.note === "string" && record.note.trim()
        ? record.note.trim().slice(0, 280)
        : undefined,
    localFileUri: record.localFileUri,
    mimeType: record.mimeType,
    createdAt: record.createdAt,
  };
}

async function writePending(
  patientId: string,
  entries: PendingPhotoUpload[]
): Promise<void> {
  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(entries));
}

export async function getPendingPhotoUploads(
  patientId: string
): Promise<PendingPhotoUpload[]> {
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
      .filter((entry): entry is PendingPhotoUpload => Boolean(entry))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  } catch {
    return [];
  }
}

export async function addPendingPhotoUpload(
  patientId: string,
  payload: Omit<PendingPhotoUpload, "localId" | "createdAt">
): Promise<PendingPhotoUpload> {
  if (!patientId.trim()) {
    throw new Error("patientId is required");
  }
  const entry: PendingPhotoUpload = {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: payload.date,
    kind: payload.kind,
    note: payload.note?.trim().slice(0, 280),
    localFileUri: payload.localFileUri,
    mimeType: payload.mimeType,
    createdAt: new Date().toISOString(),
  };
  const existing = await getPendingPhotoUploads(patientId);
  await writePending(patientId, [...existing, entry]);
  return entry;
}

export async function removePendingPhotoUpload(
  patientId: string,
  localId: string
): Promise<void> {
  if (!patientId.trim() || !localId.trim()) {
    return;
  }
  const existing = await getPendingPhotoUploads(patientId);
  await writePending(
    patientId,
    existing.filter((entry) => entry.localId !== localId)
  );
}

export async function clearPendingPhotoUploads(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId));
}

export async function clearPendingPhotosDirectory(): Promise<void> {
  const dir = getPendingPhotosDirectoryUri();
  if (!dir) {
    return;
  }
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
  } catch {
    // Best effort cleanup.
  }
}
