import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ChatItem } from "@/src/api/patient";

const V1_PREFIX = "aura:chatCache:v1:";
const V2_PREFIX = "aura:chatCache:v2:";
const MAX_CACHE_ITEMS = 200;

export type ChatLocalAttemptStatus = "sending" | "failed" | "unknown";

export type ChatLocalAttempt = {
  text: string;
  status: ChatLocalAttemptStatus;
  createdAt?: string;
};

export type CachedChatRecord = {
  confirmedMessages: ChatItem[];
  cachedAt: string;
  localAttempt: ChatLocalAttempt | null;
};

function storageKey(patientId: string): string {
  return `${V2_PREFIX}${patientId}`;
}

function legacyStorageKey(patientId: string): string {
  return `${V1_PREFIX}${patientId}`;
}

function normalizeCachedItem(value: unknown): ChatItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    id?: unknown;
    role?: unknown;
    text?: unknown;
    createdAt?: unknown;
  };

  if (
    (item.role !== "patient" && item.role !== "assistant" && item.role !== "system") ||
    typeof item.text !== "string" ||
    !item.text.trim()
  ) {
    return null;
  }

  return {
    id: typeof item.id === "string" ? item.id : undefined,
    role: item.role,
    text: item.text.trim(),
    createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
  };
}

function normalizeConfirmedMessages(items: ChatItem[]): ChatItem[] {
  return items
    .slice(-MAX_CACHE_ITEMS)
    .map((item) => normalizeCachedItem(item))
    .filter((item): item is ChatItem => Boolean(item));
}

function normalizeLocalAttempt(value: unknown): ChatLocalAttempt | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const attempt = value as {
    text?: unknown;
    status?: unknown;
    createdAt?: unknown;
  };
  const text = typeof attempt.text === "string" ? attempt.text.trim() : "";
  if (!text) {
    return null;
  }

  const rawStatus =
    attempt.status === "sending" || attempt.status === "failed" || attempt.status === "unknown"
      ? attempt.status
      : null;
  if (!rawStatus) {
    return null;
  }

  return {
    text,
    status: rawStatus === "sending" ? "unknown" : rawStatus,
    createdAt: typeof attempt.createdAt === "string" ? attempt.createdAt : undefined,
  };
}

function normalizeRecord(value: unknown): CachedChatRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as {
    confirmedMessages?: unknown;
    cachedAt?: unknown;
    localAttempt?: unknown;
  };

  const confirmedMessages = Array.isArray(record.confirmedMessages)
    ? normalizeConfirmedMessages(record.confirmedMessages as ChatItem[])
    : [];
  const cachedAt =
    typeof record.cachedAt === "string" && record.cachedAt.trim()
      ? record.cachedAt
      : new Date().toISOString();

  return {
    confirmedMessages,
    cachedAt,
    localAttempt: normalizeLocalAttempt(record.localAttempt),
  };
}

export async function getCachedChat(patientId: string): Promise<CachedChatRecord | null> {
  if (!patientId.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    if (!raw) {
      return null;
    }

    return normalizeRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setCachedChat(
  patientId: string,
  record: {
    confirmedMessages: ChatItem[];
    localAttempt?: ChatLocalAttempt | null;
    cachedAt?: string;
  }
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  const normalized: CachedChatRecord = {
    confirmedMessages: normalizeConfirmedMessages(record.confirmedMessages),
    cachedAt:
      typeof record.cachedAt === "string" && record.cachedAt.trim()
        ? record.cachedAt
        : new Date().toISOString(),
    localAttempt: normalizeLocalAttempt(record.localAttempt),
  };

  try {
    await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(normalized));
  } catch {
    // Cache failures should not block the chat flow.
  }
}

export async function clearCachedChat(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  try {
    await Promise.all([
      AsyncStorage.removeItem(storageKey(patientId)),
      AsyncStorage.removeItem(legacyStorageKey(patientId)),
    ]);
  } catch {
    // Ignore cache deletion errors.
  }
}
