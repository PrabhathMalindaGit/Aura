import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { logger } from "@/src/utils/logger";

export const CAREGIVER_TOKEN_KEY = "aura_caregiverToken_v1";
const LEGACY_CAREGIVER_TOKEN_KEY = "aura:caregiverToken:v1";
const CAREGIVER_PROFILE_KEY = "aura_caregiverProfile_v1";
const LEGACY_CAREGIVER_PROFILE_KEY = "aura:caregiverProfile:v1";

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

async function getWebValueWithMigration(
  key: string,
  legacyKey: string | null
): Promise<string | null> {
  const current = await getWebValue(key);
  if (current || !legacyKey) {
    return current;
  }

  const legacy = await getWebValue(legacyKey);
  if (!legacy) {
    return null;
  }

  await setWebValue(key, legacy);
  await clearWebValue(legacyKey);
  return legacy;
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
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    logger.warn("SecureStore read failed on caregiver storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function getSecureValueWithMigration(
  key: string,
  legacyKey: string | null
): Promise<string | null> {
  const current = await getSecureValue(key);
  if (current || !legacyKey) {
    return current;
  }

  const legacy = await getSecureValue(legacyKey);
  if (!legacy) {
    return null;
  }

  await setSecureValue(key, legacy);
  await clearSecureValue(legacyKey);
  return legacy;
}

async function setSecureValue(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    logger.warn("SecureStore write failed on caregiver storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function clearSecureValue(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    logger.warn("SecureStore delete failed on caregiver storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function getStoredValue(
  key: string,
  legacyKey: string | null = null
): Promise<string | null> {
  if (Platform.OS === "web") {
    return getWebValueWithMigration(key, legacyKey);
  }
  return getSecureValueWithMigration(key, legacyKey);
}

async function setStoredValue(
  key: string,
  value: string,
  legacyKey: string | null = null
): Promise<void> {
  if (Platform.OS === "web") {
    await setWebValue(key, value);
    if (legacyKey) {
      await clearWebValue(legacyKey);
    }
    return;
  }
  await setSecureValue(key, value);
  if (legacyKey) {
    await clearSecureValue(legacyKey);
  }
}

async function clearStoredValue(
  key: string,
  legacyKey: string | null = null
): Promise<void> {
  if (Platform.OS === "web") {
    await Promise.all([
      clearWebValue(key),
      legacyKey ? clearWebValue(legacyKey) : Promise.resolve(),
    ]);
    return;
  }
  await Promise.all([
    clearSecureValue(key),
    legacyKey ? clearSecureValue(legacyKey) : Promise.resolve(),
  ]);
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
  return getStoredValue(CAREGIVER_TOKEN_KEY, LEGACY_CAREGIVER_TOKEN_KEY);
}

export async function setCaregiverToken(token: string): Promise<void> {
  await setStoredValue(CAREGIVER_TOKEN_KEY, token, LEGACY_CAREGIVER_TOKEN_KEY);
}

export async function clearCaregiverToken(): Promise<void> {
  await clearStoredValue(CAREGIVER_TOKEN_KEY, LEGACY_CAREGIVER_TOKEN_KEY);
}

export async function getCaregiverProfile(): Promise<StoredCaregiverProfile | null> {
  const raw = await getStoredValue(CAREGIVER_PROFILE_KEY, LEGACY_CAREGIVER_PROFILE_KEY);
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
  await setStoredValue(
    CAREGIVER_PROFILE_KEY,
    JSON.stringify(normalized),
    LEGACY_CAREGIVER_PROFILE_KEY
  );
}

export async function clearCaregiverProfile(): Promise<void> {
  await clearStoredValue(CAREGIVER_PROFILE_KEY, LEGACY_CAREGIVER_PROFILE_KEY);
}

export async function clearCaregiverSessionStorage(): Promise<void> {
  await Promise.all([clearCaregiverToken(), clearCaregiverProfile()]);
}
