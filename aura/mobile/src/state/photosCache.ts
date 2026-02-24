import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SymptomPhotoItem } from "@/src/api/patient";

export type CachedPhotosList = {
  cachedAt: number;
  items: SymptomPhotoItem[];
};

const PREFIX = "aura:photosCache:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizeItem(value: unknown): SymptomPhotoItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as {
    id?: unknown;
    date?: unknown;
    kind?: unknown;
    notePreview?: unknown;
    createdAt?: unknown;
    pending?: unknown;
    localId?: unknown;
    localFileUri?: unknown;
  };
  if (
    typeof item.id !== "string" ||
    !item.id ||
    typeof item.date !== "string" ||
    !item.date ||
    typeof item.createdAt !== "string" ||
    !item.createdAt
  ) {
    return null;
  }

  const kind =
    item.kind === "swelling" ||
    item.kind === "wound" ||
    item.kind === "rash" ||
    item.kind === "other"
      ? item.kind
      : "other";

  return {
    id: item.id,
    date: item.date,
    kind,
    notePreview:
      typeof item.notePreview === "string" && item.notePreview.trim()
        ? item.notePreview.trim()
        : undefined,
    createdAt: item.createdAt,
    pending: item.pending === true ? true : undefined,
    localId: typeof item.localId === "string" ? item.localId : undefined,
    localFileUri:
      typeof item.localFileUri === "string" ? item.localFileUri : undefined,
  };
}

function normalizeCache(value: unknown): CachedPhotosList | null {
  if (!value || typeof value !== "object") {
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

  const items = record.items
    .map((entry) => normalizeItem(entry))
    .filter((entry): entry is SymptomPhotoItem => Boolean(entry));

  return {
    cachedAt: record.cachedAt,
    items,
  };
}

export async function getCachedPhotosList(
  patientId: string
): Promise<CachedPhotosList | null> {
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

export async function setCachedPhotosList(
  patientId: string,
  items: SymptomPhotoItem[]
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  try {
    await AsyncStorage.setItem(
      storageKey(patientId),
      JSON.stringify({
        cachedAt: Date.now(),
        items,
      } satisfies CachedPhotosList)
    );
  } catch {
    // Best effort cache.
  }
}

export async function clearCachedPhotosList(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId));
}
