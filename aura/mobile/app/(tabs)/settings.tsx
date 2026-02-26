import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
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
import { resetAllUsage } from "@/src/state/copingUsage";
import { clearCachedCheckins } from "@/src/state/checkinsCache";
import { clearAllLastErrors, useLastError } from "@/src/state/lastError";
import { useNetwork } from "@/src/state/network";
import { clearPending } from "@/src/state/pendingSessions";
import { getReminderPrefs, setReminderPrefs } from "@/src/state/reminderPrefs";
import { clearAllLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
import { resetDemoState } from "@/src/utils/demoReset";

// Layout: Single Screen wrapper; avoid nested ScrollView.
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
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const network = useNetwork();
  const reminderPermissionError = useLastError("reminderPermission");
  const reminderScheduleError = useLastError("reminderSchedule");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isResettingDemo, setIsResettingDemo] = useState(false);
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
  const [isDeveloperExpanded, setIsDeveloperExpanded] = useState(false);
  const isDeveloperModeVisible = __DEV__;

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
      await persistReminderPrefs(false, normalized.hour, normalized.minute, null);
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

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Continue",
        style: "destructive",
        onPress: onConfirm,
      },
    ]);
  };

  const confirmSignOut = () => {
    Alert.alert("Log out?", "You’ll need your access code to sign in again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          void handleSignOut();
        },
      },
    ]);
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
    setDevNotice("Cleared last failed attempt records.");
  };

  const handleClearSavedProgress = async () => {
    if (!patientId) {
      return;
    }
    await clearCachedCheckins(patientId);
    setDevNotice("Cleared saved progress cache.");
  };

  const handleClearPendingSessions = async () => {
    if (!patientId) {
      return;
    }
    await clearPending(patientId);
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

  const runReset = async (includeSignOut = false) => {
    if (!patientId || isResettingDemo) {
      return;
    }

    setIsResettingDemo(true);
    setDevNotice(null);
    try {
      await resetDemoState({
        patientId,
        includeSignOut,
      });

      if (includeSignOut) {
        await auth.signOut();
        return;
      }

      setDevNotice("Reset demo state and cleared local demo caches/pending queues.");
    } catch {
      setDevNotice("Could not complete demo reset.");
    } finally {
      setIsResettingDemo(false);
    }
  };

  const handleResetCopingUsage = async () => {
    try {
      await resetAllUsage();
      setDevNotice("Reset coping tool usage counters.");
    } catch {
      setDevNotice("Could not reset coping usage.");
    }
  };

  return (
    <Screen title="Settings" scroll contentContainerStyle={styles.container}>
        <Section title="Account / Profile">
          <Text style={styles.line}>Patient: {patientName}</Text>
          <Text style={styles.line}>Session: {auth.status}</Text>
          <PrimaryButton
            label={isSigningOut ? "Signing out…" : "Log out"}
            loading={isSigningOut}
            disabled={isSigningOut}
            onPress={confirmSignOut}
          />
          {logoutError ? (
            <InlineNotice variant="error" title="Logout failed" message={logoutError} />
          ) : null}
        </Section>

        <Section title="Reminders">
          <Text style={styles.line}>Reminders: {reminderEnabled ? "On" : "Off"}</Text>
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
            <InlineNotice variant="warning" title="Invalid time" message={timeValidationError} />
          ) : null}

          <LastFailedAttempt
            label="Last reminder permission issue"
            value={reminderPermissionError.label}
            title={reminderPermissionError.lastError?.title}
            message={reminderPermissionError.lastError?.message}
            onClear={reminderPermissionError.lastError ? reminderPermissionError.clear : undefined}
            compact
          />
          <LastFailedAttempt
            label="Last reminder scheduling issue"
            value={reminderScheduleError.label}
            title={reminderScheduleError.lastError?.title}
            message={reminderScheduleError.lastError?.message}
            onClear={reminderScheduleError.lastError ? reminderScheduleError.clear : undefined}
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
        </Section>

        <Section title="Caregiver">
          <Text style={styles.line}>Generate and revoke temporary caregiver invite codes.</Text>
          <PrimaryButton
            label="Manage caregiver invites"
            onPress={() => {
              router.push("/caregiver-invite" as Href);
            }}
          />
        </Section>

        <Section title="Support & Safety plan">
          <Text style={styles.line}>
            If you feel unsafe or symptoms escalate, use Safety for immediate guidance.
          </Text>
          <PrimaryButton
            label="Open Safety"
            onPress={() => {
              router.push("/safety" as never);
            }}
          />
        </Section>

        <Section title="App info">
          <Text style={styles.line}>Offline: {network.isOffline ? "Yes" : "No"}</Text>
          <Text style={styles.line}>API base: {API_BASE}</Text>
        </Section>

        {/* IMPORTANT: Keep Developer Mode in this single location; do not duplicate via mapped sections. */}
        {isDeveloperModeVisible ? (
          <Section title="Developer Mode">
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsDeveloperExpanded((current) => !current)}
              style={({ pressed }) => [
                styles.devToggle,
                pressed ? styles.devTogglePressed : null,
              ]}
            >
              <Text style={styles.devToggleTitle}>Developer tools</Text>
              <Text style={styles.devToggleState}>
                {isDeveloperExpanded ? "Hide" : "Show"}
              </Text>
            </Pressable>

            {isDeveloperExpanded ? (
              <View style={styles.devPanel}>
                <Text style={styles.devGroupTitle}>Demo data</Text>
                <PrimaryButton
                  label={isResettingDemo ? "Resetting…" : "Reset demo state"}
                  loading={isResettingDemo}
                  disabled={!patientId || isResettingDemo}
                  onPress={() =>
                    confirmAction(
                      "Reset demo state?",
                      "This clears local demo caches, drafts, and pending queues for this patient.",
                      () => {
                        void runReset(false);
                      }
                    )
                  }
                />
                <PrimaryButton
                  label={isResettingDemo ? "Resetting…" : "Reset + sign out"}
                  loading={isResettingDemo}
                  disabled={!patientId || isResettingDemo}
                  onPress={() =>
                    confirmAction(
                      "Reset and sign out?",
                      "This clears local demo state for this patient and signs out.",
                      () => {
                        void runReset(true);
                      }
                    )
                  }
                />
                <PrimaryButton
                  label="Reset coping usage"
                  disabled={!patientId}
                  onPress={() =>
                    confirmAction(
                      "Reset coping usage?",
                      "This clears local breathing and grounding usage counters.",
                      () => {
                        void handleResetCopingUsage();
                      }
                    )
                  }
                />

                <Text style={styles.devGroupTitle}>Cache and sync</Text>
                <PrimaryButton
                  label="Clear last refreshed stamps"
                  onPress={() =>
                    confirmAction(
                      "Clear refresh stamps?",
                      "This removes local last-refreshed timestamps.",
                      () => {
                        void handleClearRefreshStamps();
                      }
                    )
                  }
                />
                <PrimaryButton
                  label="Clear last failed attempts"
                  onPress={() =>
                    confirmAction(
                      "Clear last failed attempts?",
                      "This removes locally stored error history.",
                      () => {
                        void handleClearLastErrors();
                      }
                    )
                  }
                />
                <PrimaryButton
                  label="Clear saved progress cache"
                  disabled={!patientId}
                  onPress={() =>
                    confirmAction(
                      "Clear saved progress?",
                      "This removes cached check-ins for this patient on this device.",
                      () => {
                        void handleClearSavedProgress();
                      }
                    )
                  }
                />
                <PrimaryButton
                  label="Clear pending sessions"
                  disabled={!patientId}
                  onPress={() =>
                    confirmAction(
                      "Clear pending sessions?",
                      "This removes locally queued exercise session uploads.",
                      () => {
                        void handleClearPendingSessions();
                      }
                    )
                  }
                />

                <Text style={styles.devGroupTitle}>Safety and testing</Text>
                <PrimaryButton
                  label="Open Safety screen (test)"
                  onPress={() =>
                    router.push({
                      pathname: "/safety",
                      params: {
                        alertId: "demo-alert",
                        reasonCodes: "PAIN_GE_THRESHOLD",
                      },
                    })
                  }
                />
                <PrimaryButton
                  label="Send test notification now"
                  onPress={() => {
                    void handleSendTestReminder();
                  }}
                  disabled={isReminderBusy}
                />
                <PrimaryButton
                  label="List scheduled notifications"
                  onPress={() => {
                    void handleListScheduled();
                  }}
                  disabled={isReminderBusy}
                />

                <Text style={styles.devGroupTitle}>Preset helpers</Text>
                <PrimaryButton
                  label="Open Check-in (low-risk preset)"
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/checkin",
                      params: { devPreset: "low", devToken: String(Date.now()) },
                    })
                  }
                />
                <PrimaryButton
                  label="Open Check-in (high-risk preset)"
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/checkin",
                      params: { devPreset: "high", devToken: String(Date.now()) },
                    })
                  }
                />
                <PrimaryButton
                  label="Open Chat (low-risk draft)"
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/chat",
                      params: { devPreset: "low", devToken: String(Date.now()) },
                    })
                  }
                />
                <PrimaryButton
                  label="Open Chat (high-risk draft)"
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/chat",
                      params: { devPreset: "high", devToken: String(Date.now()) },
                    })
                  }
                />

                <Text style={styles.devGroupTitle}>Diagnostics</Text>
                <Text style={styles.devLine}>Auth: {auth.status}</Text>
                <Text style={styles.devLine}>Patient ID: {patientId || "none"}</Text>
                <Text style={styles.devLine}>
                  Network: {network.isOffline ? "Offline" : "Online"}
                </Text>
                <Text style={styles.devLine}>API: {API_BASE}</Text>

                {devNotice ? (
                  <InlineNotice
                    variant="info"
                    title="Developer"
                    message={devNotice}
                    actionLabel="Dismiss"
                    onAction={() => setDevNotice(null)}
                  />
                ) : null}
              </View>
            ) : (
              <Text style={styles.devHint}>
                Hidden by default. Expand for local demo and debug actions.
              </Text>
            )}
          </Section>
        ) : null}
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.xs,
      paddingBottom: tokens.spacing.xl,
    },
    line: {
      fontSize: 14,
      lineHeight: 20,
      color: tokens.colors.textMuted,
      marginBottom: tokens.spacing.xs,
    },
    switchRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
    },
    switchLabel: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      color: tokens.colors.text,
      fontWeight: tokens.typography.weights.medium,
    },
    timeRow: {
      flexDirection: "row",
      gap: tokens.spacing.md,
    },
    timeInputWrap: {
      flex: 1,
      gap: tokens.spacing.sm - 2,
    },
    timeLabel: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
      fontWeight: tokens.typography.weights.medium,
    },
    timeInput: {
      minHeight: 42,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.sm,
      paddingHorizontal: tokens.spacing.md - 2,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.text,
      backgroundColor: tokens.colors.surface,
    },
    devToggle: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.md - 2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: tokens.colors.surfaceElevated,
    },
    devTogglePressed: {
      opacity: 0.8,
    },
    devToggleTitle: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.text,
    },
    devToggleState: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.textMuted,
    },
    devHint: {
      marginTop: tokens.spacing.sm,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    devPanel: {
      marginTop: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    devGroupTitle: {
      marginTop: tokens.spacing.sm - 2,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: "700",
      letterSpacing: 0.3,
      color: tokens.colors.textMuted,
      textTransform: "uppercase",
    },
    devLine: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
  });
}
