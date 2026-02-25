import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatRelativeFromNow } from "@/src/utils/date";

export type ErrorKey =
  | "auth"
  | "checkinSubmit"
  | "chatSend"
  | "chatLoad"
  | "progressLoad"
  | "reminderPermission"
  | "reminderSchedule"
  | "exercisePlanLoad"
  | "exerciseSessionSave"
  | "exerciseSessionsLoad"
  | "rehabPhasesLoad"
  | "promsLoad"
  | "promSubmit"
  | "hydrationLoad"
  | "hydrationLog"
  | "nutritionLoad"
  | "nutritionLog"
  | "medicationsLoad"
  | "medicationLog"
  | "insightsLoad"
  | "weeklyReportLoad"
  | "photosLoad"
  | "photoUpload";

export type LastErrorRecord = {
  key: ErrorKey;
  title: string;
  message: string;
  kind: "offline" | "network" | "server" | "validation" | "unknown";
  retryable: boolean;
  at: number;
  detail?: string;
};

const PREFIX = "aura:lastError:";
const RELATIVE_TICK_MS = 30000;

function storageKey(key: ErrorKey): string {
  return `${PREFIX}${key}`;
}

function parseStoredRecord(raw: string | null): LastErrorRecord | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LastErrorRecord>;
    if (
      !parsed ||
      typeof parsed.key !== "string" ||
      typeof parsed.title !== "string" ||
      typeof parsed.message !== "string" ||
      typeof parsed.retryable !== "boolean" ||
      typeof parsed.at !== "number" ||
      !Number.isFinite(parsed.at)
    ) {
      return null;
    }

    const allowedKinds = new Set<LastErrorRecord["kind"]>([
      "offline",
      "network",
      "server",
      "validation",
      "unknown",
    ]);
    const parsedKind = parsed.kind;
    const kind: LastErrorRecord["kind"] =
      typeof parsedKind === "string" &&
      allowedKinds.has(parsedKind as LastErrorRecord["kind"])
        ? (parsedKind as LastErrorRecord["kind"])
        : "unknown";

    return {
      key: parsed.key as ErrorKey,
      title: parsed.title,
      message: parsed.message,
      kind,
      retryable: parsed.retryable,
      at: parsed.at,
      detail: typeof parsed.detail === "string" ? parsed.detail : undefined,
    };
  } catch {
    return null;
  }
}

export async function getLastError(key: ErrorKey): Promise<LastErrorRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    const parsed = parseStoredRecord(raw);
    if (parsed && parsed.key === key) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setLastError(record: LastErrorRecord): Promise<void> {
  await AsyncStorage.setItem(storageKey(record.key), JSON.stringify(record));
}

export async function clearLastError(key: ErrorKey): Promise<void> {
  await AsyncStorage.removeItem(storageKey(key));
}

export async function clearAllLastErrors(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const errorKeys = keys.filter((key) => key.startsWith(PREFIX));
  if (errorKeys.length > 0) {
    await AsyncStorage.multiRemove(errorKeys);
  }
}

export function useLastError(key: ErrorKey): {
  lastError: LastErrorRecord | null;
  label: string;
  setLocalError: (
    partial: Omit<LastErrorRecord, "at" | "key"> & { detail?: string }
  ) => Promise<void>;
  clear: () => Promise<void>;
  reload: () => Promise<void>;
} {
  const [lastError, setLastErrorState] = useState<LastErrorRecord | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  const reload = useCallback(async () => {
    const stored = await getLastError(key);
    setLastErrorState(stored);
  }, [key]);

  const setLocalError = useCallback(
    async (partial: Omit<LastErrorRecord, "at" | "key"> & { detail?: string }) => {
      const record: LastErrorRecord = {
        key,
        title: partial.title,
        message: partial.message,
        kind: partial.kind,
        retryable: partial.retryable,
        at: Date.now(),
        detail: partial.detail,
      };
      await setLastError(record);
      setLastErrorState(record);
    },
    [key]
  );

  const clear = useCallback(async () => {
    await clearLastError(key);
    setLastErrorState(null);
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
    if (!lastError) {
      return "Never";
    }
    return formatRelativeFromNow(lastError.at);
  }, [lastError, tick]);

  return {
    lastError,
    label,
    setLocalError,
    clear,
    reload,
  };
}
