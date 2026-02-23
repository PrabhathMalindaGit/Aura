import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

let initialized = false;

function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function configureAndroidChannelAsync(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync("reminders", {
    name: "Reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function initializeNotifications(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  try {
    configureNotificationHandler();
  } catch {
    // Ignore handler registration errors for unsupported environments.
  }

  void configureAndroidChannelAsync().catch(() => {
    // Ignore channel setup errors in unsupported environments.
  });
}

initializeNotifications();
