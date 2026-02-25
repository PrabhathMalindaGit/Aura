import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ApprovedInsight } from "@/src/api/patient";

export type CachedInsights = {
  cachedAt: number;
  items: ApprovedInsight[];
};

const PREFIX = "aura:insightsCache:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizeInsight(value: unknown): ApprovedInsight | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const insight = value as {
    id?: unknown;
    title?: unknown;
    message?: unknown;
    category?: unknown;
    confidence?: unknown;
    priority?: unknown;
    createdAt?: unknown;
    reviewedAt?: unknown;
  };
  if (
    typeof insight.id !== "string" ||
    !insight.id.trim() ||
    typeof insight.title !== "string" ||
    !insight.title.trim() ||
    typeof insight.message !== "string" ||
    !insight.message.trim() ||
    typeof insight.createdAt !== "string" ||
    !insight.createdAt.trim() ||
    typeof insight.priority !== "number" ||
    !Number.isFinite(insight.priority)
  ) {
    return null;
  }

  const category =
    insight.category === "adherence" ||
    insight.category === "symptoms" ||
    insight.category === "recovery" ||
    insight.category === "safety" ||
    insight.category === "questionnaires" ||
    insight.category === "habits"
      ? insight.category
      : "habits";
  const confidence =
    insight.confidence === "high" ||
    insight.confidence === "medium" ||
    insight.confidence === "low"
      ? insight.confidence
      : "low";

  return {
    id: insight.id,
    title: insight.title.trim().slice(0, 80),
    message: insight.message.trim().slice(0, 280),
    category,
    confidence,
    priority: Math.max(1, Math.min(5, Math.round(insight.priority))),
    createdAt: insight.createdAt,
    reviewedAt:
      typeof insight.reviewedAt === "string" && insight.reviewedAt.trim()
        ? insight.reviewedAt
        : undefined,
  };
}

function normalizeCache(value: unknown): CachedInsights | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { cachedAt?: unknown; items?: unknown };
  if (
    typeof record.cachedAt !== "number" ||
    !Number.isFinite(record.cachedAt) ||
    !Array.isArray(record.items)
  ) {
    return null;
  }
  const items = record.items
    .map((entry) => normalizeInsight(entry))
    .filter((entry): entry is ApprovedInsight => Boolean(entry))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  return {
    cachedAt: record.cachedAt,
    items,
  };
}

export async function getCachedInsights(
  patientId: string
): Promise<CachedInsights | null> {
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

export async function setCachedInsights(
  patientId: string,
  items: ApprovedInsight[]
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
      } satisfies CachedInsights)
    );
  } catch {
    // Best effort cache.
  }
}

export async function clearCachedInsights(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId));
}
