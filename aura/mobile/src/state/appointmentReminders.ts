import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

type ReminderMap = Record<string, string>;

const PREFIX = "aura:appointmentReminders:v1:";
const isExpoGo = Constants.appOwnership === "expo";
type NotificationsModule = typeof import("expo-notifications");

async function getNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === "web" || isExpoGo) {
    return null;
  }
  try {
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizeMap(value: unknown): ReminderMap {
  if (!value || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  const next: ReminderMap = {};
  for (const [key, candidate] of Object.entries(record)) {
    if (typeof key !== "string" || !key.trim()) {
      continue;
    }
    if (typeof candidate !== "string" || !candidate.trim()) {
      continue;
    }
    next[key] = candidate;
  }
  return next;
}

async function writeMap(patientId: string, map: ReminderMap): Promise<void> {
  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(map));
}

export async function getAllRemindersForPatient(patientId: string): Promise<ReminderMap> {
  if (!patientId.trim()) {
    return {};
  }
  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    if (!raw) {
      return {};
    }
    return normalizeMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function getReminderForRequest(
  patientId: string,
  requestId: string
): Promise<string | null> {
  if (!patientId.trim() || !requestId.trim()) {
    return null;
  }
  const map = await getAllRemindersForPatient(patientId);
  return typeof map[requestId] === "string" ? map[requestId] : null;
}

export async function setReminderForRequest(
  patientId: string,
  requestId: string,
  notificationId: string
): Promise<void> {
  if (!patientId.trim() || !requestId.trim() || !notificationId.trim()) {
    return;
  }
  const map = await getAllRemindersForPatient(patientId);
  map[requestId] = notificationId;
  await writeMap(patientId, map);
}

export async function clearReminderForRequest(
  patientId: string,
  requestId: string
): Promise<void> {
  if (!patientId.trim() || !requestId.trim()) {
    return;
  }
  const map = await getAllRemindersForPatient(patientId);
  const existing = map[requestId];
  if (existing) {
    const notifications = await getNotifications();
    if (notifications) {
      try {
        await notifications.cancelScheduledNotificationAsync(existing);
      } catch {
        // no-op: best effort cleanup
      }
    }
  }
  delete map[requestId];
  await writeMap(patientId, map);
}

export async function clearAllRemindersForPatient(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  const map = await getAllRemindersForPatient(patientId);
  const notifications = await getNotifications();
  await Promise.all(
    Object.values(map).map(async (notificationId) => {
      if (notifications) {
        try {
          await notifications.cancelScheduledNotificationAsync(notificationId);
        } catch {
          // no-op: best effort cleanup
        }
      }
    })
  );
  await AsyncStorage.removeItem(storageKey(patientId));
}
