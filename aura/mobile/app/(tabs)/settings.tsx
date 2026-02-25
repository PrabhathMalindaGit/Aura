import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";

import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { API_BASE } from "@/src/config/env";
import {
  cancelReminder,
  getPermissionStatus,
  listScheduledRemindersCount,
  requestPermission,
  sanitizeReminderTime,
  scheduleDailyReminder,
  sendTestNotificationNow,
} from "@/src/services/reminders";
import { useAuth } from "@/src/state/auth";
import { clearCachedCheckins } from "@/src/state/checkinsCache";
import { clearAllLastErrors, useLastError } from "@/src/state/lastError";
import { useNetwork } from "@/src/state/network";
import { clearPending } from "@/src/state/pendingSessions";
import { getReminderPrefs, setReminderPrefs } from "@/src/state/reminderPrefs";
import { clearAllLastRefreshed } from "@/src/state/refresh";

const DEFAULT_HOUR = 19;
const DEFAULT_MINUTE = 0;
type ReminderTimeInput = ReturnType<typeof normalizeInputs>;

function twoDigit(value: number): string {
  return String(value).padStart(2, "0");
}

function parseNumericInput(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }
  return Number(value);
}

function normalizeInputs(hourInput: string, minuteInput: string): {
  hour: number;
  minute: number;
  isValid: boolean;
  message: string | null;
} {
  const rawHour = parseNumericInput(hourInput);
  const rawMinute = parseNumericInput(minuteInput);

  if (rawHour === null || rawMinute === null) {
    return {
      hour: DEFAULT_HOUR,
      minute: DEFAULT_MINUTE,
      isValid: false,
      message: "Enter numeric values for hour and minute.",
    };
  }

  if (rawHour < 0 || rawHour > 23 || rawMinute < 0 || rawMinute > 59) {
    return {
      hour: DEFAULT_HOUR,
      minute: DEFAULT_MINUTE,
      isValid: false,
      message: "Hour must be 0–23 and minute must be 0–59.",
    };
  }

  const normalized = sanitizeReminderTime(rawHour, rawMinute);
  return {
    ...normalized,
    isValid: true,
    message: null,
  };
}

export default function SettingsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const network = useNetwork();
  const reminderPermissionError = useLastError("reminderPermission");
  const reminderScheduleError = useLastError("reminderSchedule");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [devNotice, setDevNotice] = useState<string | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [hourInput, setHourInput] = useState(String(DEFAULT_HOUR));
  const [minuteInput, setMinuteInput] = useState(twoDigit(DEFAULT_MINUTE));
  const [notificationId, setNotificationId] = useState<string | null>(null);
  const [reminderNotice, setReminderNotice] = useState<{
    variant: "info" | "warning" | "error";
    title: string;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const [timeValidationError, setTimeValidationError] = useState<string | null>(null);
  const [isReminderBusy, setIsReminderBusy] = useState(false);

  const patientName = auth.patient?.displayName ?? auth.patient?.id ?? "Unknown";
  const patientId = auth.patient?.id ?? "";
  const timePreview = useMemo(() => {
    const normalized = normalizeInputs(hourInput, minuteInput);
    if (!normalized.isValid) {
      return "--:--";
    }
    return `${twoDigit(normalized.hour)}:${twoDigit(normalized.minute)}`;
  }, [hourInput, minuteInput]);

  useEffect(() => {
    if (!patientId) {
      setReminderEnabled(false);
      setHourInput(String(DEFAULT_HOUR));
      setMinuteInput(twoDigit(DEFAULT_MINUTE));
      setNotificationId(null);
      return;
    }

    let active = true;
    void (async () => {
      const prefs = await getReminderPrefs(patientId);
      if (!active || !prefs) {
        return;
      }
      setReminderEnabled(prefs.enabled);
      setHourInput(String(prefs.hour));
      setMinuteInput(twoDigit(prefs.minute));
      setNotificationId(prefs.notificationId ?? null);
    })();

    return () => {
      active = false;
    };
  }, [patientId]);

  const persistReminderPrefs = async (
    enabled: boolean,
    hour: number,
    minute: number,
    nextNotificationId: string | null
  ) => {
    if (!patientId) {
      return;
    }
    await setReminderPrefs(patientId, {
      enabled,
      hour,
      minute,
      notificationId: nextNotificationId,
      updatedAt: Date.now(),
    });
  };

  const openSystemSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      setReminderNotice({
        variant: "warning",
        title: "Settings unavailable",
        message: "Open your device settings and enable notifications for Aura.",
      });
    }
  };

  const enableReminder = async (nextTime?: ReminderTimeInput) => {
    const normalized = nextTime ?? normalizeInputs(hourInput, minuteInput);
    if (!normalized.isValid) {
      setTimeValidationError(normalized.message);
      setReminderEnabled(false);
      return;
    }

    setTimeValidationError(null);
    setIsReminderBusy(true);
    setReminderNotice(null);

    try {
      let permission = await getPermissionStatus();
      if (permission !== "granted") {
        permission = await requestPermission();
      }

      if (permission !== "granted") {
        setReminderEnabled(false);
        if (notificationId) {
          await cancelReminder(notificationId);
          setNotificationId(null);
        }
        await reminderPermissionError.setLocalError({
          title: "Notifications are off",
          message: "Enable notifications in system settings to use reminders.",
          kind: "validation",
          retryable: true,
        });
        await persistReminderPrefs(false, normalized.hour, normalized.minute, null);
        setReminderNotice({
          variant: "warning",
          title: "Notifications are off for Aura",
          message: "Enable them in system settings.",
          actionLabel: "Open Settings",
          onAction: () => {
            void openSystemSettings();
          },
        });
        return;
      }

      await reminderPermissionError.clear();

      if (notificationId) {
        await cancelReminder(notificationId);
      }

      const scheduledId = await scheduleDailyReminder({
        hour: normalized.hour,
        minute: normalized.minute,
        channelId: "reminders",
      });
      setNotificationId(scheduledId);
      setReminderEnabled(true);
      setHourInput(String(normalized.hour));
      setMinuteInput(twoDigit(normalized.minute));
      await persistReminderPrefs(true, normalized.hour, normalized.minute, scheduledId);
      await reminderScheduleError.clear();
      setReminderNotice({
        variant: "info",
        title: "Reminder enabled",
        message: `Daily reminder set for ${twoDigit(normalized.hour)}:${twoDigit(
          normalized.minute
        )}.`,
      });
    } catch {
      setReminderEnabled(false);
      await reminderScheduleError.setLocalError({
        title: "Couldn’t schedule reminder",
        message: "Try again in a moment.",
        kind: "unknown",
        retryable: true,
      });
      setReminderNotice({
        variant: "error",
        title: "Couldn’t schedule reminder",
        message: "Try again in a moment.",
      });
    } finally {
      setIsReminderBusy(false);
    }
  };

  const disableReminder = async () => {
    const normalized = normalizeInputs(hourInput, minuteInput);
    setIsReminderBusy(true);
    try {
      if (notificationId) {
        await cancelReminder(notificationId);
      }
      setReminderEnabled(false);
      setNotificationId(null);
      await persistReminderPrefs(
        false,
        normalized.hour,
        normalized.minute,
        null
      );
      await reminderScheduleError.clear();
      setReminderNotice({
        variant: "info",
        title: "Reminder disabled",
        message: "Daily reminder is turned off.",
      });
    } catch {
      await reminderScheduleError.setLocalError({
        title: "Couldn’t disable reminder",
        message: "Please try again.",
        kind: "unknown",
        retryable: true,
      });
      setReminderNotice({
        variant: "error",
        title: "Couldn’t disable reminder",
        message: "Please try again.",
      });
    } finally {
      setIsReminderBusy(false);
    }
  };

  const rescheduleWithCurrentTime = async (nextTime?: ReminderTimeInput) => {
    if (!reminderEnabled) {
      return;
    }
    await enableReminder(nextTime);
  };

  const handleHourBlur = () => {
    const parsed = parseNumericInput(hourInput);
    const normalized = sanitizeReminderTime(
      parsed ?? DEFAULT_HOUR,
      parseNumericInput(minuteInput) ?? DEFAULT_MINUTE
    );
    setHourInput(String(normalized.hour));
    setMinuteInput(twoDigit(normalized.minute));
    if (reminderEnabled) {
      void rescheduleWithCurrentTime({
        hour: normalized.hour,
        minute: normalized.minute,
        isValid: true,
        message: null,
      });
    }
  };

  const handleMinuteBlur = () => {
    const parsed = parseNumericInput(minuteInput);
    const normalized = sanitizeReminderTime(
      parseNumericInput(hourInput) ?? DEFAULT_HOUR,
      parsed ?? DEFAULT_MINUTE
    );
    setHourInput(String(normalized.hour));
    setMinuteInput(twoDigit(normalized.minute));
    if (reminderEnabled) {
      void rescheduleWithCurrentTime({
        hour: normalized.hour,
        minute: normalized.minute,
        isValid: true,
        message: null,
      });
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      "Log out?",
      "You’ll need your access code to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log out",
          style: "destructive",
          onPress: () => {
            void handleSignOut();
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    setLogoutError(null);
    setIsSigningOut(true);
    try {
      await auth.signOut();
    } catch {
      setLogoutError("Couldn’t log out. Please try again.");
      setIsSigningOut(false);
    }
  };

  const handleClearRefreshStamps = async () => {
    await clearAllLastRefreshed();
    setDevNotice("Cleared last refreshed stamps.");
  };

  const handleClearLastErrors = async () => {
    await clearAllLastErrors();
    setDevNotice("Cleared last errors.");
  };

  const handleClearSavedProgress = async () => {
    if (!auth.patient?.id) {
      return;
    }

    await clearCachedCheckins(auth.patient.id);
    setDevNotice("Cleared saved progress cache.");
  };

  const handleClearPendingSessions = async () => {
    if (!auth.patient?.id) {
      return;
    }

    await clearPending(auth.patient.id);
    setDevNotice("Cleared pending exercise sessions.");
  };

  const handleReminderToggle = (nextValue: boolean) => {
    if (isReminderBusy) {
      return;
    }
    if (nextValue) {
      void enableReminder();
    } else {
      void disableReminder();
    }
  };

  const handleSendTestReminder = async () => {
    try {
      await sendTestNotificationNow();
      setDevNotice("Scheduled a test notification.");
    } catch {
      setDevNotice("Could not schedule a test notification.");
    }
  };

  const handleListScheduled = async () => {
    try {
      const count = await listScheduledRemindersCount();
      Alert.alert("Scheduled notifications", `${count}`);
    } catch {
      Alert.alert("Scheduled notifications", "Unable to read scheduled notifications.");
    }
  };

  return (
    <Screen title="Settings">
      <ScrollView contentContainerStyle={styles.container}>
        <Section title="Daily reminder">
          <Text style={styles.line}>
            Reminders: {reminderEnabled ? "On" : "Off"}
          </Text>
          <Text style={styles.line}>Time: {timePreview}</Text>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Enable daily reminder</Text>
            <Switch
              value={reminderEnabled}
              onValueChange={handleReminderToggle}
              disabled={!patientId || isReminderBusy}
            />
          </View>

          <View style={styles.timeRow}>
            <View style={styles.timeInputWrap}>
              <Text style={styles.timeLabel}>Hour (0-23)</Text>
              <TextInput
                value={hourInput}
                onChangeText={setHourInput}
                onBlur={handleHourBlur}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.timeInput}
                editable={!isReminderBusy}
              />
            </View>
            <View style={styles.timeInputWrap}>
              <Text style={styles.timeLabel}>Minute (0-59)</Text>
              <TextInput
                value={minuteInput}
                onChangeText={setMinuteInput}
                onBlur={handleMinuteBlur}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.timeInput}
                editable={!isReminderBusy}
              />
            </View>
          </View>

          {timeValidationError ? (
            <InlineNotice
              variant="warning"
              title="Invalid time"
              message={timeValidationError}
            />
          ) : null}

          <LastFailedAttempt
            label="Last reminder permission issue"
            value={reminderPermissionError.label}
            title={reminderPermissionError.lastError?.title}
            message={reminderPermissionError.lastError?.message}
            onClear={
              reminderPermissionError.lastError
                ? reminderPermissionError.clear
                : undefined
            }
            compact
          />
          <LastFailedAttempt
            label="Last reminder scheduling issue"
            value={reminderScheduleError.label}
            title={reminderScheduleError.lastError?.title}
            message={reminderScheduleError.lastError?.message}
            onClear={
              reminderScheduleError.lastError
                ? reminderScheduleError.clear
                : undefined
            }
            compact
          />

          {reminderNotice ? (
            <InlineNotice
              variant={reminderNotice.variant}
              title={reminderNotice.title}
              message={reminderNotice.message}
              actionLabel={reminderNotice.actionLabel}
              onAction={reminderNotice.onAction}
            />
          ) : null}

          {__DEV__ ? (
            <>
              <PrimaryButton
                label="Send test notification now"
                onPress={() => {
                  void handleSendTestReminder();
                }}
                disabled={isReminderBusy}
              />
              <PrimaryButton
                label="List scheduled notifications (debug)"
                onPress={() => {
                  void handleListScheduled();
                }}
                disabled={isReminderBusy}
              />
            </>
          ) : null}
        </Section>

        <Section title="Session">
          <Text style={styles.line}>Status: {auth.status}</Text>
          <Text style={styles.line}>Patient: {patientName}</Text>
          <Text style={styles.line}>API: {API_BASE}</Text>
          <Text style={styles.line}>
            Offline: {network.isOffline ? "Yes" : "No"}
          </Text>
        </Section>

        <Section title="Caregiver access">
          <Text style={styles.line}>
            Generate and revoke temporary caregiver invite codes.
          </Text>
          <PrimaryButton
            label="Manage caregiver invites"
            onPress={() => {
              router.push("/caregiver-invite" as Href);
            }}
          />
        </Section>

        <Section title="Logout">
          <PrimaryButton
            label={isSigningOut ? "Signing out…" : "Log out"}
            loading={isSigningOut}
            disabled={isSigningOut}
            onPress={confirmSignOut}
          />
          {logoutError ? (
            <InlineNotice
              variant="error"
              title="Logout failed"
              message={logoutError}
            />
          ) : null}
        </Section>

        {__DEV__ ? (
          <Section title="Developer tools">
            <PrimaryButton
              label="Clear last refreshed stamps"
              onPress={() => {
                void handleClearRefreshStamps();
              }}
            />
            <PrimaryButton
              label="Clear last errors"
              onPress={() => {
                void handleClearLastErrors();
              }}
            />
            <PrimaryButton
              label="Clear saved progress"
              onPress={() => {
                void handleClearSavedProgress();
              }}
              disabled={!auth.patient?.id}
            />
            <PrimaryButton
              label="Clear pending sessions"
              onPress={() => {
                void handleClearPendingSessions();
              }}
              disabled={!auth.patient?.id}
            />
            {devNotice ? (
              <InlineNotice
                variant="info"
                title="Developer"
                message={devNotice}
                actionLabel="Dismiss"
                onAction={() => setDevNotice(null)}
              />
            ) : null}
          </Section>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  line: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 4,
  },
  switchRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  switchLabel: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  timeRow: {
    flexDirection: "row",
    gap: 10,
  },
  timeInputWrap: {
    flex: 1,
    gap: 6,
  },
  timeLabel: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  timeInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#ffffff",
  },
});
