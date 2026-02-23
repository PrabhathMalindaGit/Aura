import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ChatItem } from "@/src/api/patient";

const PREFIX = "aura:chatCache:v1:";
const MAX_CACHE_ITEMS = 200;

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
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

function normalizeItems(items: ChatItem[]): ChatItem[] {
  return items
    .slice(-MAX_CACHE_ITEMS)
    .map((item) => normalizeCachedItem(item))
    .filter((item): item is ChatItem => Boolean(item));
}

export async function getCachedChat(patientId: string): Promise<ChatItem[] | null> {
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

    return normalizeItems(parsed as ChatItem[]);
  } catch {
    return null;
  }
}

export async function setCachedChat(
  patientId: string,
  items: ChatItem[]
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  const normalized = normalizeItems(items);
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
    await AsyncStorage.removeItem(storageKey(patientId));
  } catch {
    // Ignore cache deletion errors.
  }
}
