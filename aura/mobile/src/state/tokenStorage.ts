import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { logger } from "@/src/utils/logger";

export const TOKEN_KEY = "aura_patientToken_v1";
const LEGACY_TOKEN_KEY = "aura:patientToken:v1";

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

async function getWebValueFromAsyncStorage(key: string): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(key);
    if (value) {
      return value;
    }
  } catch (error) {
    logger.warn("AsyncStorage read failed on web token storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}

function getWebValueFromLocalStorage(key: string): string | null {
  try {
    const storage = getWebLocalStorage();
    return storage?.getItem(key) ?? null;
  } catch (error) {
    logger.warn("localStorage read failed on web token storage", {
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
    logger.warn("AsyncStorage write failed on web token storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const storage = getWebLocalStorage();
    storage?.setItem(key, value);
  } catch (error) {
    logger.warn("localStorage write failed on web token storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function removeWebValue(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    logger.warn("AsyncStorage remove failed on web token storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const storage = getWebLocalStorage();
    storage?.removeItem(key);
  } catch (error) {
    logger.warn("localStorage remove failed on web token storage", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function getWebToken(): Promise<string | null> {
  const current = await getWebValueFromAsyncStorage(TOKEN_KEY);
  if (current) {
    return current;
  }

  const legacy = await getWebValueFromAsyncStorage(LEGACY_TOKEN_KEY);
  if (legacy) {
    await setWebValue(TOKEN_KEY, legacy);
    await removeWebValue(LEGACY_TOKEN_KEY);
    return legacy;
  }

  const localCurrent = getWebValueFromLocalStorage(TOKEN_KEY);
  if (localCurrent) {
    return localCurrent;
  }

  const localLegacy = getWebValueFromLocalStorage(LEGACY_TOKEN_KEY);
  if (localLegacy) {
    await setWebValue(TOKEN_KEY, localLegacy);
    await removeWebValue(LEGACY_TOKEN_KEY);
    return localLegacy;
  }

  return null;
}

async function setWebToken(token: string): Promise<void> {
  await setWebValue(TOKEN_KEY, token);
  await removeWebValue(LEGACY_TOKEN_KEY);
}

async function clearWebToken(): Promise<void> {
  await Promise.all([removeWebValue(TOKEN_KEY), removeWebValue(LEGACY_TOKEN_KEY)]);
}

async function getSecureValue(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    logger.warn("SecureStore read failed", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function setSecureValue(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    logger.warn("SecureStore write failed", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function deleteSecureValue(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    logger.warn("SecureStore delete failed", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return getWebToken();
  }

  const current = await getSecureValue(TOKEN_KEY);
  if (current) {
    return current;
  }

  const legacy = await getSecureValue(LEGACY_TOKEN_KEY);
  if (!legacy) {
    return null;
  }

  await setSecureValue(TOKEN_KEY, legacy);
  await deleteSecureValue(LEGACY_TOKEN_KEY);
  return legacy;
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    await setWebToken(token);
    return;
  }

  await setSecureValue(TOKEN_KEY, token);
  await deleteSecureValue(LEGACY_TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    await clearWebToken();
    return;
  }

  await Promise.all([deleteSecureValue(TOKEN_KEY), deleteSecureValue(LEGACY_TOKEN_KEY)]);
}
