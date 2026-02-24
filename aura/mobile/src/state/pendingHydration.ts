import AsyncStorage from "@react-native-async-storage/async-storage";

export type PendingHydrationEntry = {
  localId: string;
  date: string;
  amountMl: number;
  createdAt: string;
};

const PREFIX = "aura:pendingHydration:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizePending(value: unknown): PendingHydrationEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as {
    localId?: unknown;
    date?: unknown;
    amountMl?: unknown;
    createdAt?: unknown;
  };

  if (
    typeof entry.localId !== "string" ||
    !entry.localId.trim() ||
    typeof entry.date !== "string" ||
    !entry.date.trim() ||
    typeof entry.amountMl !== "number" ||
    !Number.isFinite(entry.amountMl) ||
    typeof entry.createdAt !== "string"
  ) {
    return null;
  }

  return {
    localId: entry.localId,
    date: entry.date,
    amountMl: Math.round(entry.amountMl),
    createdAt: entry.createdAt,
  };
}

async function writePending(
  patientId: string,
  entries: PendingHydrationEntry[]
): Promise<void> {
  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(entries));
}

export async function getPendingHydration(
  patientId: string
): Promise<PendingHydrationEntry[]> {
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
      .filter((entry): entry is PendingHydrationEntry => Boolean(entry));
  } catch {
    return [];
  }
}

export async function addPendingHydration(
  patientId: string,
  payload: { date: string; amountMl: number }
): Promise<PendingHydrationEntry> {
  if (!patientId.trim()) {
    throw new Error("patientId is required");
  }
  const entry: PendingHydrationEntry = {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: payload.date,
    amountMl: Math.round(payload.amountMl),
    createdAt: new Date().toISOString(),
  };
  const existing = await getPendingHydration(patientId);
  await writePending(patientId, [...existing, entry]);
  return entry;
}

export async function removePendingHydration(
  patientId: string,
  localId: string
): Promise<void> {
  if (!patientId.trim() || !localId.trim()) {
    return;
  }
  const existing = await getPendingHydration(patientId);
  await writePending(
    patientId,
    existing.filter((entry) => entry.localId !== localId)
  );
}

export async function clearPendingHydration(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId));
}
