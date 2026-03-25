import AsyncStorage from "@react-native-async-storage/async-storage";

import type { PromDueCard, PromHistoryRow, PromInstance } from "@/src/api/patient";

type PromsCacheRecord = {
  cachedAt: number;
  dueCards: PromDueCard[];
  historyRows: PromHistoryRow[];
  instancesById: Record<string, PromInstance>;
};

const PREFIX = "aura:promsCache:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeDueCard(value: unknown): PromDueCard | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const card = value as {
    id?: unknown;
    templateKey?: unknown;
    title?: unknown;
    dueAt?: unknown;
    status?: unknown;
  };

  if (!isString(card.id) || !isString(card.templateKey) || !isString(card.title) || !isString(card.dueAt)) {
    return null;
  }

  return {
    id: card.id,
    templateKey: card.templateKey,
    title: card.title,
    dueAt: card.dueAt,
    status: card.status === "completed" ? "completed" : "due",
  };
}

function normalizeHistoryRow(value: unknown): PromHistoryRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as {
    id?: unknown;
    templateKey?: unknown;
    title?: unknown;
    completedAt?: unknown;
    score?: unknown;
  };

  if (!isString(row.id) || !isString(row.templateKey) || !isString(row.title) || !isString(row.completedAt)) {
    return null;
  }

  const scoreRecord = row.score as
    | {
        normalized?: unknown;
        bandKey?: unknown;
        bandLabel?: unknown;
      }
    | undefined;
  const normalized = typeof scoreRecord?.normalized === "number" ? scoreRecord.normalized : null;
  const bandLabel = typeof scoreRecord?.bandLabel === "string" ? scoreRecord.bandLabel : null;

  return {
    id: row.id,
    templateKey: row.templateKey,
    title: row.title,
    completedAt: row.completedAt,
    score:
      normalized !== null && bandLabel
        ? {
            normalized,
            bandKey:
              scoreRecord?.bandKey === "green" ||
              scoreRecord?.bandKey === "amber" ||
              scoreRecord?.bandKey === "red"
                ? scoreRecord.bandKey
                : undefined,
            bandLabel,
          }
        : null,
  };
}

function normalizeInstance(value: unknown): PromInstance | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const instance = value as PromInstance;
  if (!isString(instance.id) || !isString(instance.templateKey) || !isString(instance.title) || !isString(instance.dueAt)) {
    return null;
  }

  if (!Array.isArray(instance.questions) || !Array.isArray(instance.answers)) {
    return null;
  }

  return instance;
}

function parseCache(raw: string | null): PromsCacheRecord | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PromsCacheRecord>;
    const cachedAt = typeof parsed.cachedAt === "number" && Number.isFinite(parsed.cachedAt)
      ? parsed.cachedAt
      : Date.now();

    const dueCards = Array.isArray(parsed.dueCards)
      ? parsed.dueCards
          .map((entry) => normalizeDueCard(entry))
          .filter((entry): entry is PromDueCard => Boolean(entry))
      : [];

    const historyRows = Array.isArray(parsed.historyRows)
      ? parsed.historyRows
          .map((entry) => normalizeHistoryRow(entry))
          .filter((entry): entry is PromHistoryRow => Boolean(entry))
      : [];

    const instancesByIdEntries =
      parsed.instancesById && typeof parsed.instancesById === "object"
        ? Object.entries(parsed.instancesById)
            .map(([id, instance]) => {
              const normalized = normalizeInstance(instance);
              if (!normalized) {
                return null;
              }
              return [id, normalized] as const;
            })
            .filter((entry): entry is readonly [string, PromInstance] => Boolean(entry))
        : [];

    return {
      cachedAt,
      dueCards,
      historyRows,
      instancesById: Object.fromEntries(instancesByIdEntries),
    };
  } catch {
    return null;
  }
}

export async function getCachedProms(patientId: string): Promise<PromsCacheRecord | null> {
  if (!patientId.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    return parseCache(raw);
  } catch {
    return null;
  }
}

export async function setCachedProms(
  patientId: string,
  payload: {
    dueCards: PromDueCard[];
    historyRows: PromHistoryRow[];
    instancesById?: Record<string, PromInstance>;
  }
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  const existing = await getCachedProms(patientId);
  const next: PromsCacheRecord = {
    cachedAt: Date.now(),
    dueCards: payload.dueCards,
    historyRows: payload.historyRows,
    instancesById: {
      ...(existing?.instancesById ?? {}),
      ...(payload.instancesById ?? {}),
    },
  };

  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(next));
}

export async function setCachedPromDueCards(
  patientId: string,
  dueCards: PromDueCard[]
): Promise<void> {
  const existing = await getCachedProms(patientId);
  const next: PromsCacheRecord = {
    cachedAt: Date.now(),
    dueCards,
    historyRows: existing?.historyRows ?? [],
    instancesById: existing?.instancesById ?? {},
  };

  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(next));
}

export async function getCachedPromInstance(
  patientId: string,
  promId: string
): Promise<PromInstance | null> {
  const cache = await getCachedProms(patientId);
  if (!cache) {
    return null;
  }

  const instance = cache.instancesById[promId];
  return instance ?? null;
}

export async function setCachedPromInstance(
  patientId: string,
  instance: PromInstance
): Promise<void> {
  const existing = await getCachedProms(patientId);
  const next: PromsCacheRecord = {
    cachedAt: Date.now(),
    dueCards: existing?.dueCards ?? [],
    historyRows: existing?.historyRows ?? [],
    instancesById: {
      ...(existing?.instancesById ?? {}),
      [instance.id]: instance,
    },
  };

  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(next));
}

export async function clearPromsCache(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId));
}
