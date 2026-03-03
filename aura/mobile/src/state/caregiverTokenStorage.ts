import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { logger } from "@/src/utils/logger";

export const CAREGIVER_TOKEN_KEY = "aura_caregiverToken_v1";
const CAREGIVER_PROFILE_KEY = "aura_caregiverProfile_v1";

function sanitizeSecureStoreKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

export type StoredCaregiverProfile = {
  id: string;
  displayName?: string;
};

function getWebLocalStorage(): Storage | null {
  if (typeof globalThis === "undefined") {
    return null;
  }

  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

async function getWebValue(key: string): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(key);
    if (value) {
      return value;
    }
  } catch (error) {
    logger.warn("AsyncStorage read failed on caregiver storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const storage = getWebLocalStorage();
    return storage?.getItem(key) ?? null;
  } catch (error) {
    logger.warn("localStorage read failed on caregiver storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function setWebValue(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
    return;
  } catch (error) {
    logger.warn("AsyncStorage write failed on caregiver storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const storage = getWebLocalStorage();
    storage?.setItem(key, value);
  } catch (error) {
    logger.warn("localStorage write failed on caregiver storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function clearWebValue(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    logger.warn("AsyncStorage remove failed on caregiver storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const storage = getWebLocalStorage();
    storage?.removeItem(key);
  } catch (error) {
    logger.warn("localStorage remove failed on caregiver storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function getSecureValue(key: string): Promise<string | null> {
  const safeKey = sanitizeSecureStoreKey(key);
  try {
    return await SecureStore.getItemAsync(safeKey);
  } catch (error) {
    logger.warn("SecureStore read failed on caregiver storage", {
      key: safeKey,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function setSecureValue(key: string, value: string): Promise<void> {
  const safeKey = sanitizeSecureStoreKey(key);
  try {
    await SecureStore.setItemAsync(safeKey, value);
  } catch (error) {
    logger.warn("SecureStore write failed on caregiver storage", {
      key: safeKey,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function clearSecureValue(key: string): Promise<void> {
  const safeKey = sanitizeSecureStoreKey(key);
  try {
    await SecureStore.deleteItemAsync(safeKey);
  } catch (error) {
    logger.warn("SecureStore delete failed on caregiver storage", {
      key: safeKey,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function getStoredValue(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return getWebValue(key);
  }
  return getSecureValue(key);
}

async function setStoredValue(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await setWebValue(key, value);
    return;
  }
  await setSecureValue(key, value);
}

async function clearStoredValue(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await clearWebValue(key);
    return;
  }
  await clearSecureValue(key);
}

function normalizeProfile(value: unknown): StoredCaregiverProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as { id?: unknown; displayName?: unknown };
  if (typeof record.id !== "string" || !record.id.trim()) {
    return null;
  }

  return {
    id: record.id.trim(),
    displayName:
      typeof record.displayName === "string" && record.displayName.trim()
        ? record.displayName.trim()
        : undefined,
  };
}

export async function getCaregiverToken(): Promise<string | null> {
  return getStoredValue(CAREGIVER_TOKEN_KEY);
}

export async function setCaregiverToken(token: string): Promise<void> {
  await setStoredValue(CAREGIVER_TOKEN_KEY, token);
}

export async function clearCaregiverToken(): Promise<void> {
  await clearStoredValue(CAREGIVER_TOKEN_KEY);
}

export async function getCaregiverProfile(): Promise<StoredCaregiverProfile | null> {
  const raw = await getStoredValue(CAREGIVER_PROFILE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setCaregiverProfile(
  profile: StoredCaregiverProfile
): Promise<void> {
  const normalized = normalizeProfile(profile);
  if (!normalized) {
    return;
  }
  await setStoredValue(CAREGIVER_PROFILE_KEY, JSON.stringify(normalized));
}

export async function clearCaregiverProfile(): Promise<void> {
  await clearStoredValue(CAREGIVER_PROFILE_KEY);
}

export async function clearCaregiverSessionStorage(): Promise<void> {
  await Promise.all([clearCaregiverToken(), clearCaregiverProfile()]);
}
