import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MedicationTodayResponse } from "@/src/api/patient";

type StoredMedicationTodayCache = {
  cachedAt: number;
  date: string;
  items: MedicationTodayResponse["items"];
};

const PREFIX = "aura:medicationTodayCache:v1:";

function storageKey(patientId: string, date: string): string {
  return `${PREFIX}${patientId}:${date}`;
}

function normalizeStored(value: unknown): StoredMedicationTodayCache | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    cachedAt?: unknown;
    date?: unknown;
    items?: unknown;
  };
  if (
    typeof record.cachedAt !== "number" ||
    !Number.isFinite(record.cachedAt) ||
    typeof record.date !== "string" ||
    !Array.isArray(record.items)
  ) {
    return null;
  }

  const items = record.items
    .filter((item): item is MedicationTodayResponse["items"][number] => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const row = item as {
        medicationId?: unknown;
        name?: unknown;
        type?: unknown;
        doses?: unknown;
      };
      return (
        typeof row.medicationId === "string" &&
        typeof row.name === "string" &&
        (row.type === "medication" || row.type === "supplement") &&
        Array.isArray(row.doses)
      );
    })
    .map((item) => ({
      ...item,
      doses: item.doses
        .filter(
          (dose): dose is MedicationTodayResponse["items"][number]["doses"][number] =>
            Boolean(
              dose &&
                typeof dose === "object" &&
                typeof (dose as { time?: unknown }).time === "string" &&
                ((dose as { status?: unknown }).status === "due" ||
                  (dose as { status?: unknown }).status === "taken" ||
                  (dose as { status?: unknown }).status === "skipped")
            )
        )
        .sort((left, right) => left.time.localeCompare(right.time)),
    }));

  return {
    cachedAt: record.cachedAt,
    date: record.date,
    items,
  };
}

export async function getCachedMedicationToday(
  patientId: string,
  date: string
): Promise<StoredMedicationTodayCache | null> {
  if (!patientId.trim() || !date.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId, date));
    if (!raw) {
      return null;
    }
    return normalizeStored(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setCachedMedicationToday(
  patientId: string,
  payload: MedicationTodayResponse
): Promise<void> {
  if (!patientId.trim() || !payload.date.trim()) {
    return;
  }

  const record: StoredMedicationTodayCache = {
    cachedAt: Date.now(),
    date: payload.date,
    items: payload.items,
  };

  await AsyncStorage.setItem(storageKey(patientId, payload.date), JSON.stringify(record));
}

export async function clearCachedMedicationToday(
  patientId: string,
  date: string
): Promise<void> {
  if (!patientId.trim() || !date.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId, date));
}

export async function clearAllMedicationTodayCacheForPatient(
  patientId: string
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  const keys = await AsyncStorage.getAllKeys();
  const matches = keys.filter((key) => key.startsWith(`${PREFIX}${patientId}:`));
  if (matches.length > 0) {
    await AsyncStorage.multiRemove(matches);
  }
}
