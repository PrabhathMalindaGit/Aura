import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { logger } from "@/src/utils/logger";

export const TOKEN_KEY = "aura:patientToken:v1";

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

async function getWebToken(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(TOKEN_KEY);
    if (value) {
      return value;
    }
  } catch (error) {
    logger.warn("AsyncStorage read failed on web token storage", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const storage = getWebLocalStorage();
    return storage?.getItem(TOKEN_KEY) ?? null;
  } catch (error) {
    logger.warn("localStorage read failed on web token storage", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function setWebToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return;
  } catch (error) {
    logger.warn("AsyncStorage write failed on web token storage", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const storage = getWebLocalStorage();
    storage?.setItem(TOKEN_KEY, token);
  } catch (error) {
    logger.warn("localStorage write failed on web token storage", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function clearWebToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    logger.warn("AsyncStorage remove failed on web token storage", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const storage = getWebLocalStorage();
    storage?.removeItem(TOKEN_KEY);
  } catch (error) {
    logger.warn("localStorage remove failed on web token storage", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return getWebToken();
  }

  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error) {
    logger.warn("SecureStore read failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    await setWebToken(token);
    return;
  }

  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {
    logger.warn("SecureStore write failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    await clearWebToken();
    return;
  }

  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    logger.warn("SecureStore delete failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
