import Constants from "expo-constants";
import { Platform } from "react-native";

const REMINDER_TITLE = "Aura check-in";
const REMINDER_BODY = "How are you feeling today? Tap to complete your check-in.";
const isExpoGo = Constants.appOwnership === "expo";

type NotificationsModule = typeof import("expo-notifications");

type ReminderPermissionStatus = "granted" | "denied" | "undetermined";

function clampHour(hour: number): number {
  if (!Number.isFinite(hour)) {
    return 19;
  }
  return Math.min(23, Math.max(0, Math.floor(hour)));
}

function clampMinute(minute: number): number {
  if (!Number.isFinite(minute)) {
    return 0;
  }
  return Math.min(59, Math.max(0, Math.floor(minute)));
}

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

function toPermissionStatus(status: {
  granted?: boolean;
  canAskAgain?: boolean;
} | null): ReminderPermissionStatus {
  if (status?.granted) {
    return "granted";
  }
  if (status && !status.canAskAgain) {
    return "denied";
  }
  return "undetermined";
}

export async function getPermissionStatus(): Promise<ReminderPermissionStatus> {
  const notifications = await getNotifications();
  if (!notifications) {
    return "denied";
  }
  try {
    const permissions = await notifications.getPermissionsAsync();
    return toPermissionStatus(permissions);
  } catch {
    return "denied";
  }
}

export async function requestPermission(): Promise<"granted" | "denied"> {
  const notifications = await getNotifications();
  if (!notifications) {
    return "denied";
  }
  try {
    const permissions = await notifications.requestPermissionsAsync();
    return permissions.granted ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export async function scheduleDailyReminder(options: {
  hour: number;
  minute: number;
  channelId?: "reminders";
}): Promise<string | null> {
  const hour = clampHour(options.hour);
  const minute = clampMinute(options.minute);
  const channelId = options.channelId ?? "reminders";
  const notifications = await getNotifications();
  if (!notifications) {
    return null;
  }

  try {
    const identifier = await notifications.scheduleNotificationAsync({
      content: {
        title: REMINDER_TITLE,
        body: REMINDER_BODY,
      },
      trigger: {
        type: notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        ...(Platform.OS === "android" ? { channelId } : {}),
      },
    });
    return identifier;
  } catch {
    return null;
  }
}

export async function cancelReminder(notificationId: string): Promise<void> {
  if (!notificationId.trim()) {
    return;
  }
  const notifications = await getNotifications();
  if (!notifications) {
    return;
  }
  try {
    await notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // no-op: unsupported environments should not crash reminder settings.
  }
}

export async function sendTestNotificationNow(): Promise<void> {
  const notifications = await getNotifications();
  if (!notifications) {
    return;
  }
  try {
    await notifications.scheduleNotificationAsync({
      content: {
        title: REMINDER_TITLE,
        body: REMINDER_BODY,
      },
      trigger: null,
    });
  } catch {
    // no-op: this helper is diagnostic and should never crash app runtime.
  }
}

export async function listScheduledRemindersCount(): Promise<number> {
  const notifications = await getNotifications();
  if (!notifications) {
    return 0;
  }
  try {
    const all = await notifications.getAllScheduledNotificationsAsync();
    return all.length;
  } catch {
    return 0;
  }
}

export function sanitizeReminderTime(hour: number, minute: number): {
  hour: number;
  minute: number;
} {
  return {
    hour: clampHour(hour),
    minute: clampMinute(minute),
  };
}
