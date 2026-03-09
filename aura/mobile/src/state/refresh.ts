import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatRelativeFromNow } from "@/src/utils/date";

export type RefreshKey =
  | "home"
  | "chat"
  | "checkins"
  | "progress"
  | "exercisePlan"
  | "exerciseSessions"
  | "rehabPhases"
  | "proms"
  | "hydration"
  | "nutrition"
  | "medications"
  | "wearables"
  | "appointments"
  | "tasks"
  | "insights"
  | "caregiver"
  | "weeklyReport"
  | "photos";

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
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setLastRefreshedSafe = useCallback((value: number | null) => {
    if (!mountedRef.current) {
      return;
    }
    setLastRefreshedAtState((previous) => (previous === value ? previous : value));
  }, []);

  const reload = useCallback(async () => {
    const stored = await getLastRefreshed(key);
    setLastRefreshedSafe(stored);
  }, [key, setLastRefreshedSafe]);

  const refreshLocal = useCallback(async () => {
    const ts = await setLastRefreshedNow(key);
    setLastRefreshedSafe(ts);
  }, [key, setLastRefreshedSafe]);

  useEffect(() => {
    let active = true;
    void getLastRefreshed(key).then((stored) => {
      if (!active || !mountedRef.current) {
        return;
      }
      setLastRefreshedAtState((previous) => (previous === stored ? previous : stored));
    });
    return () => {
      active = false;
    };
  }, [key]);

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

  return useMemo(
    () => ({
      lastRefreshedAt,
      label,
      refreshLocal,
      reload,
    }),
    [label, lastRefreshedAt, refreshLocal, reload]
  );
}
