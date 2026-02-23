import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const REMINDER_TITLE = "Aura check-in";
const REMINDER_BODY = "How are you feeling today? Tap to complete your check-in.";

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

function toPermissionStatus(
  status: Notifications.NotificationPermissionsStatus
): ReminderPermissionStatus {
  if (status.granted) {
    return "granted";
  }
  if (!status.canAskAgain) {
    return "denied";
  }
  return "undetermined";
}

export async function getPermissionStatus(): Promise<ReminderPermissionStatus> {
  const permissions = await Notifications.getPermissionsAsync();
  return toPermissionStatus(permissions);
}

export async function requestPermission(): Promise<"granted" | "denied"> {
  const permissions = await Notifications.requestPermissionsAsync();
  return permissions.granted ? "granted" : "denied";
}

export async function scheduleDailyReminder(options: {
  hour: number;
  minute: number;
  channelId?: "reminders";
}): Promise<string> {
  const hour = clampHour(options.hour);
  const minute = clampMinute(options.minute);
  const channelId = options.channelId ?? "reminders";

  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: REMINDER_TITLE,
        body: REMINDER_BODY,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        ...(Platform.OS === "android" ? { channelId } : {}),
      },
    });
    return identifier;
  } catch {
    throw new Error("Could not schedule daily reminder.");
  }
}

export async function cancelReminder(notificationId: string): Promise<void> {
  if (!notificationId.trim()) {
    return;
  }
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export async function sendTestNotificationNow(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: REMINDER_TITLE,
        body: REMINDER_BODY,
      },
      trigger: null,
    });
  } catch {
    throw new Error("Could not send test notification.");
  }
}

export async function listScheduledRemindersCount(): Promise<number> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.length;
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
