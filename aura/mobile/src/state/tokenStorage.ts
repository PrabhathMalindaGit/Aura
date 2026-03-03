import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { logger } from "@/src/utils/logger";

export const TOKEN_KEY = "aura_patientToken_v1";

function sanitizeSecureStoreKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

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

  const localCurrent = getWebValueFromLocalStorage(TOKEN_KEY);
  if (localCurrent) {
    return localCurrent;
  }

  return null;
}

async function setWebToken(token: string): Promise<void> {
  await setWebValue(TOKEN_KEY, token);
}

async function clearWebToken(): Promise<void> {
  await removeWebValue(TOKEN_KEY);
}

async function getSecureValue(key: string): Promise<string | null> {
  const safeKey = sanitizeSecureStoreKey(key);
  try {
    return await SecureStore.getItemAsync(safeKey);
  } catch (error) {
    logger.warn("SecureStore read failed", {
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
    logger.warn("SecureStore write failed", {
      key: safeKey,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function deleteSecureValue(key: string): Promise<void> {
  const safeKey = sanitizeSecureStoreKey(key);
  try {
    await SecureStore.deleteItemAsync(safeKey);
  } catch (error) {
    logger.warn("SecureStore delete failed", {
      key: safeKey,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return getWebToken();
  }

  return getSecureValue(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    await setWebToken(token);
    return;
  }

  await setSecureValue(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    await clearWebToken();
    return;
  }

  await deleteSecureValue(TOKEN_KEY);
}
