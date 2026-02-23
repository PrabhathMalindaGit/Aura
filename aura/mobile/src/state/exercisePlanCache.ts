import AsyncStorage from "@react-native-async-storage/async-storage";

import type { TodayPlanResponse } from "@/src/api/patient";

export type CachedExercisePlan = {
  cachedAt: number;
  response: TodayPlanResponse;
};

const PREFIX = "aura:exercisePlanCache:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCachedValue(value: unknown): CachedExercisePlan | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    cachedAt?: unknown;
    response?: unknown;
  };

  if (!isFiniteNumber(candidate.cachedAt)) {
    return null;
  }

  if (!candidate.response || typeof candidate.response !== "object") {
    return null;
  }

  const responseRecord = candidate.response as Partial<TodayPlanResponse>;
  if (
    typeof responseRecord.ok !== "boolean" ||
    typeof responseRecord.patientId !== "string" ||
    typeof responseRecord.date !== "string" ||
    !isFiniteNumber(responseRecord.dayOfWeek)
  ) {
    return null;
  }

  return {
    cachedAt: candidate.cachedAt,
    response: responseRecord as TodayPlanResponse,
  };
}

export async function getCachedExercisePlan(
  patientId: string
): Promise<CachedExercisePlan | null> {
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

export async function setCachedExercisePlan(
  patientId: string,
  response: TodayPlanResponse
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  const payload: CachedExercisePlan = {
    cachedAt: Date.now(),
    response,
  };

  try {
    await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(payload));
  } catch {
    // Caching is best effort only.
  }
}

export async function clearCachedExercisePlan(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  try {
    await AsyncStorage.removeItem(storageKey(patientId));
  } catch {
    // Ignore cache deletion failures.
  }
}
