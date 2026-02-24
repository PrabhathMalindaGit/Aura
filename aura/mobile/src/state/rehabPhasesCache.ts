import AsyncStorage from "@react-native-async-storage/async-storage";

import type { RehabPayload } from "@/src/api/patient";

export type CachedRehabPhases = {
  cachedAt: number;
  rehab: RehabPayload;
};

const PREFIX = "aura:rehabPhasesCache:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCachedValue(value: unknown): CachedRehabPhases | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    cachedAt?: unknown;
    rehab?: unknown;
  };

  if (!isFiniteNumber(candidate.cachedAt)) {
    return null;
  }

  if (!candidate.rehab || typeof candidate.rehab !== "object") {
    return null;
  }

  return {
    cachedAt: candidate.cachedAt,
    rehab: candidate.rehab as RehabPayload,
  };
}

export async function getCachedRehabPhases(
  patientId: string
): Promise<CachedRehabPhases | null> {
  if (!patientId.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return normalizeCachedValue(parsed);
  } catch {
    return null;
  }
}

export async function setCachedRehabPhases(
  patientId: string,
  rehab: RehabPayload
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  const payload: CachedRehabPhases = {
    cachedAt: Date.now(),
    rehab,
  };

  try {
    await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(payload));
  } catch {
    // Cache failures should not block rehab journey UX.
  }
}

export async function clearCachedRehabPhases(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  try {
    await AsyncStorage.removeItem(storageKey(patientId));
  } catch {
    // Ignore cleanup failures.
  }
}
