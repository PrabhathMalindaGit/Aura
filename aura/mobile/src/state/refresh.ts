import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatRelativeFromNow } from "@/src/utils/date";

export type RefreshKey =
  | "home"
  | "chat"
  | "checkins"
  | "progress"
  | "exercisePlan";

const PREFIX = "aura:lastRefreshed:";
const RELATIVE_TICK_MS = 30000;

function storageKey(key: RefreshKey): string {
  return `${PREFIX}${key}`;
}

function parseTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export async function getLastRefreshed(key: RefreshKey): Promise<number | null> {
  try {
    const value = await AsyncStorage.getItem(storageKey(key));
    return parseTimestamp(value);
  } catch {
    return null;
  }
}

export async function setLastRefreshedNow(key: RefreshKey): Promise<number> {
  const ts = Date.now();
  await setLastRefreshedAt(key, ts);
  return ts;
}

export async function setLastRefreshedAt(
  key: RefreshKey,
  ts: number
): Promise<void> {
  if (!Number.isFinite(ts) || ts <= 0) {
    throw new Error("Invalid timestamp");
  }

  await AsyncStorage.setItem(storageKey(key), String(ts));
}

export async function clearLastRefreshed(key: RefreshKey): Promise<void> {
  await AsyncStorage.removeItem(storageKey(key));
}

export async function clearAllLastRefreshed(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const refreshKeys = keys.filter((key) => key.startsWith(PREFIX));
  if (refreshKeys.length > 0) {
    await AsyncStorage.multiRemove(refreshKeys);
  }
}

export function useLastRefreshed(key: RefreshKey): {
  lastRefreshedAt: number | null;
  label: string;
  refreshLocal: () => Promise<void>;
  reload: () => Promise<void>;
} {
  const [lastRefreshedAt, setLastRefreshedAtState] = useState<number | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  const reload = useCallback(async () => {
    const stored = await getLastRefreshed(key);
    setLastRefreshedAtState(stored);
  }, [key]);

  const refreshLocal = useCallback(async () => {
    const ts = await setLastRefreshedNow(key);
    setLastRefreshedAtState(ts);
  }, [key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(Date.now());
    }, RELATIVE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const label = useMemo(() => {
    if (!lastRefreshedAt) {
      return "Never";
    }
    return formatRelativeFromNow(lastRefreshedAt);
  }, [lastRefreshedAt, tick]);

  return {
    lastRefreshedAt,
    label,
    refreshLocal,
    reload,
  };
}
