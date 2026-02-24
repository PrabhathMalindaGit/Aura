import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MedicationListResponse } from "@/src/api/patient";

type StoredMedicationCache = {
  cachedAt: number;
  medications: MedicationListResponse["medications"];
};

const PREFIX = "aura:medicationsCache:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizeStoredCache(value: unknown): StoredMedicationCache | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const cache = value as {
    cachedAt?: unknown;
    medications?: unknown;
  };
  if (
    typeof cache.cachedAt !== "number" ||
    !Number.isFinite(cache.cachedAt) ||
    !Array.isArray(cache.medications)
  ) {
    return null;
  }

  const medications = cache.medications
    .filter((item): item is MedicationListResponse["medications"][number] => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const record = item as {
        id?: unknown;
        name?: unknown;
        type?: unknown;
        active?: unknown;
        instructions?: unknown;
        schedule?: unknown;
      };
      const schedule =
        record.schedule && typeof record.schedule === "object"
          ? (record.schedule as { times?: unknown })
          : null;
      return (
        typeof record.id === "string" &&
        typeof record.name === "string" &&
        (record.type === "medication" || record.type === "supplement") &&
        typeof record.active === "boolean" &&
        Array.isArray(schedule?.times)
      );
    })
    .map((item) => ({
      ...item,
      schedule: {
        times: [...new Set(item.schedule.times)].sort((left, right) =>
          left.localeCompare(right)
        ),
      },
    }));

  return {
    cachedAt: cache.cachedAt,
    medications,
  };
}

export async function getCachedMedications(
  patientId: string
): Promise<StoredMedicationCache | null> {
  if (!patientId.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    if (!raw) {
      return null;
    }
    return normalizeStoredCache(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setCachedMedications(
  patientId: string,
  payload: MedicationListResponse
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  const normalized: StoredMedicationCache = {
    cachedAt: Date.now(),
    medications: payload.medications,
  };
  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(normalized));
}

export async function clearCachedMedications(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId));
}
