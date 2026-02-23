import AsyncStorage from "@react-native-async-storage/async-storage";

export type ReminderPrefs = {
  enabled: boolean;
  hour: number;
  minute: number;
  notificationId?: string | null;
  updatedAt: number;
};

const PREFIX = "aura:reminderPrefs:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function defaultPrefs(): ReminderPrefs {
  return {
    enabled: false,
    hour: 19,
    minute: 0,
    notificationId: null,
    updatedAt: Date.now(),
  };
}

function normalizePrefs(value: unknown): ReminderPrefs | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ReminderPrefs>;
  if (typeof candidate.enabled !== "boolean") {
    return null;
  }
  if (typeof candidate.hour !== "number" || !Number.isFinite(candidate.hour)) {
    return null;
  }
  if (typeof candidate.minute !== "number" || !Number.isFinite(candidate.minute)) {
    return null;
  }

  return {
    enabled: candidate.enabled,
    hour: Math.min(23, Math.max(0, Math.floor(candidate.hour))),
    minute: Math.min(59, Math.max(0, Math.floor(candidate.minute))),
    notificationId:
      typeof candidate.notificationId === "string" ? candidate.notificationId : null,
    updatedAt:
      typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
        ? candidate.updatedAt
        : Date.now(),
  };
}

export async function getReminderPrefs(patientId: string): Promise<ReminderPrefs | null> {
  if (!patientId.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    if (!raw) {
      return defaultPrefs();
    }

    const parsed = JSON.parse(raw);
    return normalizePrefs(parsed) ?? defaultPrefs();
  } catch {
    return defaultPrefs();
  }
}

export async function setReminderPrefs(
  patientId: string,
  prefs: ReminderPrefs
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(prefs));
}

export async function clearReminderPrefs(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  await AsyncStorage.removeItem(storageKey(patientId));
}
