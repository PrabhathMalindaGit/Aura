import AsyncStorage from "@react-native-async-storage/async-storage";

import type { CheckInItem } from "@/src/api/patient";
import {
  isBodyMapPainType,
  isBodyMapRegion,
  type BodyMapPainType,
  type BodyMapRegion,
} from "@/src/utils/bodyMapLabels";

const PREFIX = "aura:checkinsCache:v1:";
const MAX_CACHE_ITEMS = 400;

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizeCachedCheckIn(value: unknown): CheckInItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    id?: unknown;
    date?: unknown;
    createdAt?: unknown;
    pain?: unknown;
    mood?: unknown;
    adherence?: {
      exercises?: unknown;
      medication?: unknown;
    };
    sleep?: {
      hours?: unknown;
      quality?: unknown;
      disturbances?: unknown;
    };
    bodyMap?: {
      regions?: unknown;
    };
  };

  if (typeof item.id !== "string" || !item.id.trim()) {
    return null;
  }

  if (typeof item.pain !== "number" || !Number.isFinite(item.pain)) {
    return null;
  }

  if (typeof item.mood !== "number" || !Number.isFinite(item.mood)) {
    return null;
  }

  const exercises =
    typeof item.adherence?.exercises === "number" &&
    Number.isFinite(item.adherence.exercises)
      ? item.adherence.exercises
      : undefined;
  const hasExercises =
    typeof item.adherence?.exercises === "number" &&
    Number.isFinite(item.adherence.exercises);
  const medication =
    typeof item.adherence?.medication === "boolean"
      ? item.adherence.medication
      : undefined;
  const hasMedication = typeof medication === "boolean";
  const sleepHours =
    typeof item.sleep?.hours === "number" && Number.isFinite(item.sleep.hours)
      ? item.sleep.hours
      : undefined;
  const sleepQuality =
    typeof item.sleep?.quality === "number" && Number.isFinite(item.sleep.quality)
      ? item.sleep.quality
      : undefined;
  const sleepDisturbances =
    typeof item.sleep?.disturbances === "number" &&
    Number.isFinite(item.sleep.disturbances)
      ? item.sleep.disturbances
      : undefined;
  const hasSleep =
    typeof sleepHours === "number" ||
    typeof sleepQuality === "number" ||
    typeof sleepDisturbances === "number";

  const bodyMapRegions = Array.isArray(item.bodyMap?.regions)
    ? item.bodyMap.regions
        .map((entry) => {
          const region =
            entry && typeof entry === "object"
              ? (entry as {
                  region?: unknown;
                  intensity?: unknown;
                  type?: unknown;
                })
              : undefined;
          if (!region || !isBodyMapRegion(region.region)) {
            return null;
          }
          if (
            typeof region.intensity !== "number" ||
            !Number.isFinite(region.intensity) ||
            !Number.isInteger(region.intensity) ||
            region.intensity < 0 ||
            region.intensity > 10
          ) {
            return null;
          }
          if (!isBodyMapPainType(region.type)) {
            return null;
          }
          return {
            region: region.region,
            intensity: region.intensity,
            type: region.type,
          };
        })
        .filter(
          (
            region
          ): region is {
            region: BodyMapRegion;
            intensity: number;
            type: BodyMapPainType;
          } => Boolean(region)
        )
    : [];

  return {
    id: item.id.trim(),
    date: typeof item.date === "string" ? item.date : undefined,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
    pain: item.pain,
    mood: item.mood,
    adherence:
      hasExercises || hasMedication
        ? {
            exercises,
            medication,
          }
        : undefined,
    sleep: hasSleep
      ? {
          hours: sleepHours,
          quality: sleepQuality,
          disturbances: sleepDisturbances,
        }
      : undefined,
    bodyMap:
      bodyMapRegions.length > 0
        ? {
            regions: bodyMapRegions,
          }
        : undefined,
  };
}

function normalizeItems(items: CheckInItem[]): CheckInItem[] {
  const seenIds = new Set<string>();
  const normalized: CheckInItem[] = [];
  for (const item of items.slice(0, MAX_CACHE_ITEMS)) {
    const parsed = normalizeCachedCheckIn(item);
    if (!parsed || seenIds.has(parsed.id)) {
      continue;
    }
    seenIds.add(parsed.id);
    normalized.push(parsed);
  }
  return normalized;
}

export async function getCachedCheckins(
  patientId: string
): Promise<CheckInItem[] | null> {
  if (!patientId.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return normalizeItems(parsed as CheckInItem[]);
  } catch {
    return null;
  }
}

export async function setCachedCheckins(
  patientId: string,
  items: CheckInItem[]
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  const normalized = normalizeItems(items);
  try {
    await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(normalized));
  } catch {
    // Cache failure should not block progress UX.
  }
}

export async function clearCachedCheckins(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  try {
    await AsyncStorage.removeItem(storageKey(patientId));
  } catch {
    // Ignore cache cleanup failures.
  }
}
