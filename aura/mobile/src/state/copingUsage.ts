import AsyncStorage from "@react-native-async-storage/async-storage";

import { formatRelativeFromNow } from "@/src/utils/date";

export type CopingToolKey = "breathing" | "grounding";

export type CopingUsage = {
  count: number;
  lastUsedAt: number | null;
};

const PREFIX = "aura:copingUsage:v1:";

const DEFAULT_USAGE: CopingUsage = {
  count: 0,
  lastUsedAt: null,
};

function storageKey(tool: CopingToolKey): string {
  return `${PREFIX}${tool}`;
}

function normalizeUsage(value: unknown): CopingUsage {
  if (!value || typeof value !== "object") {
    return DEFAULT_USAGE;
  }
  const record = value as { count?: unknown; lastUsedAt?: unknown };
  const count =
    typeof record.count === "number" && Number.isFinite(record.count) && record.count >= 0
      ? Math.floor(record.count)
      : 0;
  const lastUsedAt =
    typeof record.lastUsedAt === "number" &&
    Number.isFinite(record.lastUsedAt) &&
    record.lastUsedAt > 0
      ? Math.floor(record.lastUsedAt)
      : null;
  return { count, lastUsedAt };
}

export async function getUsage(tool: CopingToolKey): Promise<CopingUsage> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(tool));
    if (!raw) {
      return DEFAULT_USAGE;
    }
    return normalizeUsage(JSON.parse(raw));
  } catch {
    return DEFAULT_USAGE;
  }
}

export async function incrementUsage(tool: CopingToolKey): Promise<CopingUsage> {
  const current = await getUsage(tool);
  const next: CopingUsage = {
    count: current.count + 1,
    lastUsedAt: Date.now(),
  };
  try {
    await AsyncStorage.setItem(storageKey(tool), JSON.stringify(next));
  } catch {
    // Best effort persistence.
  }
  return next;
}

export async function resetUsage(tool: CopingToolKey): Promise<void> {
  await AsyncStorage.removeItem(storageKey(tool));
}

export async function resetAllUsage(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const usageKeys = keys.filter((key) => key.startsWith(PREFIX));
  if (usageKeys.length > 0) {
    await AsyncStorage.multiRemove(usageKeys);
  }
}

export function formatLastUsed(ts: number | null): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) {
    return "Never";
  }

  const now = new Date();
  const value = new Date(ts);
  if (!Number.isFinite(value.getTime())) {
    return "Never";
  }

  if (
    now.getFullYear() === value.getFullYear() &&
    now.getMonth() === value.getMonth() &&
    now.getDate() === value.getDate()
  ) {
    return "Today";
  }

  return formatRelativeFromNow(ts);
}
