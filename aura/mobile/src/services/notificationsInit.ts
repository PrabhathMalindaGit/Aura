import Constants from "expo-constants";
import { Platform } from "react-native";

let initialized = false;
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

function configureNotificationHandler(notifications: NotificationsModule): void {
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function configureAndroidChannelAsync(): Promise<void> {
  const notifications = await getNotifications();
  if (Platform.OS !== "android" || !notifications) {
    return;
  }

  await notifications.setNotificationChannelAsync("reminders", {
    name: "Reminders",
    importance: notifications.AndroidImportance.DEFAULT,
  });
}

async function initializeNotifications(): Promise<void> {
  if (initialized) {
    return;
  }
  initialized = true;

  const notifications = await getNotifications();
  if (!notifications) {
    return;
  }

  try {
    configureNotificationHandler(notifications);
  } catch {
    // Ignore handler registration errors for unsupported environments.
  }

  void configureAndroidChannelAsync().catch(() => {
    // Ignore channel setup errors in unsupported environments.
  });
}

void initializeNotifications();
