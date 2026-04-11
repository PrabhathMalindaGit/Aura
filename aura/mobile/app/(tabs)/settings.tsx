import React, { useEffect, useMemo, useState } from "react";
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

import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { DomainIcon } from "@/src/components/IconSet";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { FadeSlideIn, getPressFeedbackStyle } from "@/src/components/Motion";
import { HeroHeader } from "@/src/components/HeroHeader";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { StatusPill } from "@/src/components/StatusPill";
import { SettingsGroup } from "@/src/components/settings/SettingsGroup";
import { SettingsItem } from "@/src/components/settings/SettingsItem";
import { API_BASE } from "@/src/config/env";
import { isPatientDebugUIEnabled, useDevRenderAudit } from "@/src/dev/renderAudit";
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
import { resetAllUsage } from "@/src/state/copingUsage";
import { clearAllLastErrors, useLastError } from "@/src/state/lastError";
import { useNetwork } from "@/src/state/network";
import { clearPending } from "@/src/state/pendingSessions";
import { getReminderPrefs, setReminderPrefs } from "@/src/state/reminderPrefs";
import { clearAllLastRefreshed } from "@/src/state/refresh";
import { useReducedMotion } from "@/src/state/useReducedMotion";
import { runLayoutAnimationIfAllowed } from "@/src/theme/motion";
import { useTokens } from "@/src/theme/tokens";
import { resetDemoState } from "@/src/utils/demoReset";

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

function toBannerVariant(
  value: "info" | "warning" | "error",
): "info" | "warning" | "danger" {
  return value === "error" ? "danger" : value;
}

function extractPatientPhotoUri(patient: unknown): string | null {
  if (!patient || typeof patient !== "object") {
    return null;
  }

  const record = patient as Record<string, unknown>;
  const candidates = [
    record.photoUrl,
    record.avatarUrl,
    record.profilePhotoUrl,
    record.imageUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function getRehabPhaseLabel(patient: unknown): string {
  if (!patient || typeof patient !== "object") {
    return "Rehab program not set";
  }

  const record = patient as Record<string, unknown>;
  const candidates = [
    record.currentPhaseTitle,
    record.rehabPhaseTitle,
    record.phaseTitle,
    record.rehabProgram,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return "Rehab program not set";
}

function getCaregiverLabel(patient: unknown): { value: string; subtitle: string } {
  if (!patient || typeof patient !== "object") {
    return {
      value: "Off",
      subtitle: "Invite a caregiver to view progress summaries.",
    };
  }

  const record = patient as Record<string, unknown>;
  const caregiverName =
    typeof record.caregiverName === "string" && record.caregiverName.trim().length > 0
      ? record.caregiverName.trim()
      : null;
  const caregiverEnabled =
    typeof record.caregiverEnabled === "boolean" ? record.caregiverEnabled : null;

  if (caregiverName) {
    return {
      value: caregiverName,
      subtitle: `Linked with ${caregiverName}.`,
    };
  }

  if (caregiverEnabled === true) {
    return {
      value: "On",
      subtitle: "A caregiver is linked to your progress summaries.",
    };
  }

  return {
    value: "Off",
    subtitle: "Invite a caregiver to view progress summaries.",
  };
}

export default function SettingsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const network = useNetwork();
  const reduceMotion = useReducedMotion();

  useDevRenderAudit("SettingsScreen");

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

  const isDeveloperModeVisible = isPatientDebugUIEnabled();
  const patientName = auth.patient?.displayName ?? auth.patient?.id ?? "Patient";
  const patientId = auth.patient?.id ?? "";
  const patientPhotoUri = useMemo(() => extractPatientPhotoUri(auth.patient), [auth.patient]);
  const rehabPhaseLabel = useMemo(() => getRehabPhaseLabel(auth.patient), [auth.patient]);
  const caregiverInfo = useMemo(() => getCaregiverLabel(auth.patient), [auth.patient]);
  const connectionLabel = network.isOffline ? "Offline" : "Connected";

  const timePreview = useMemo(() => {
    const normalized = normalizeInputs(hourInput, minuteInput);
    if (!normalized.isValid) {
      return "--:--";
    }
    return `${twoDigit(normalized.hour)}:${twoDigit(normalized.minute)}`;
  }, [hourInput, minuteInput]);

  const reminderBanner = useMemo(() => {
    if (timeValidationError) {
      return {
        variant: "warning" as const,
        title: "Check the reminder time",
        message: timeValidationError,
      };
    }

    if (reminderNotice) {
      return {
        variant: toBannerVariant(reminderNotice.variant),
        title: reminderNotice.title,
        message: reminderNotice.message,
        actionLabel: reminderNotice.actionLabel,
        onAction: reminderNotice.onAction,
      };
    }

    if (reminderPermissionError.lastError) {
      return {
        variant: "warning" as const,
        title: "Notifications are off for Aura",
        message: "Enable them in your device settings to use reminders.",
        actionLabel: "Open Settings",
        onAction: () => {
          void openSystemSettings();
        },
      };
    }

    if (reminderScheduleError.lastError) {
      return {
        variant: "warning" as const,
        title: reminderScheduleError.lastError.title,
        message: reminderScheduleError.lastError.message,
      };
    }

    return null;
  }, [
    reminderNotice,
    reminderPermissionError.lastError,
    reminderScheduleError.lastError,
    timeValidationError,
  ]);

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
    nextNotificationId: string | null,
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
          message: "Enable them in your device settings.",
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
        title: "Reminder updated",
        message: `Daily reminder set for ${twoDigit(normalized.hour)}:${twoDigit(
          normalized.minute,
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
        title: "Reminder turned off",
        message: "Daily reminders are disabled on this device.",
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
      parseNumericInput(minuteInput) ?? DEFAULT_MINUTE,
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
      parsed ?? DEFAULT_MINUTE,
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
    setDevNotice("Cleared last refreshed timestamps.");
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

      setDevNotice("Reset local preview state and cleared device caches and queues.");
    } catch {
      setDevNotice("Could not complete the local reset.");
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

  const toggleDeveloperMode = () => {
    runLayoutAnimationIfAllowed(reduceMotion);
    setIsDeveloperExpanded((current) => !current);
  };

  return (
    <Screen
      scroll
      auditLabel="SettingsScreen"
      contentContainerStyle={styles.container}
      header={
        <HeroHeader
          variant="compact"
          title="Settings"
          subtitle="Manage this device’s account, reminders, care access, and support."
          left={
            <Avatar
              size={44}
              name={patientName}
              photoUrl={patientPhotoUri ?? undefined}
              ring={network.isOffline ? "attention" : "none"}
            />
          }
        >
          <Card variant="outlined" style={styles.headerCard}>
            <Text style={styles.headerEyebrow}>On this device</Text>
            <Text style={styles.headerTitle}>A calm place to manage your Aura basics</Text>
            <Text style={styles.headerText}>
              Most choices here apply only to this device. Safety and care-team options stay
              available whenever you need them.
            </Text>
          </Card>
        </HeroHeader>
      }
    >
      <View testID="settings-shell" style={styles.shell}>
        <Section title="Account" subtitle="Who is using Aura on this device.">
          <SettingsGroup testID="settings-group-account">
            <SettingsItem
              title={patientName}
              subtitle="Current profile on this device"
              leading={
                <Avatar
                  size={28}
                  name={patientName}
                  photoUrl={patientPhotoUri ?? undefined}
                  ring={network.isOffline ? "attention" : "none"}
                />
              }
              statusLabel={auth.status === "signedIn" ? "Signed in" : auth.status}
              statusVariant={auth.status === "signedIn" ? "success" : "neutral"}
              accessory="none"
            />
            <SettingsItem
              title="Patient ID"
              subtitle={patientId || "Unavailable"}
              leading={<DomainIcon icon="info" tone="muted" accessibilityLabel="Patient ID icon" />}
              accessory="none"
            />
          </SettingsGroup>
        </Section>

        <Section title="Preferences" subtitle="Reminder settings for this device.">
          <SettingsGroup testID="settings-group-preferences">
            <SettingsItem
              title="Daily reminders"
              subtitle={
                reminderEnabled
                  ? `On every day at ${timePreview}`
                  : "Receive a daily reminder to check in on this device."
              }
              leading={
                <DomainIcon
                  icon="weekly"
                  tone="accent"
                  accessibilityLabel="Daily reminder icon"
                />
              }
              right={
                <Switch
                  value={reminderEnabled}
                  onValueChange={handleReminderToggle}
                  disabled={!patientId || isReminderBusy}
                />
              }
              accessory="none"
            />
            <SettingsItem
              title="Reminder time"
              subtitle={
                reminderEnabled
                  ? "Adjust the time used for your daily reminder."
                  : "Choose a time now and turn reminders on when you are ready."
              }
              leading={
                <DomainIcon
                  icon="settings"
                  tone="muted"
                  accessibilityLabel="Reminder time icon"
                />
              }
              statusLabel={reminderEnabled ? timePreview : "Off"}
              statusVariant={reminderEnabled ? "info" : "neutral"}
              accessory="none"
            />
            <SettingsItem
              title="Notification settings"
              subtitle="Open your device settings if reminders are blocked."
              leading={
                <DomainIcon
                  icon="info"
                  tone="muted"
                  accessibilityLabel="Notification settings icon"
                />
              }
              onPress={() => {
                void openSystemSettings();
              }}
            />
          </SettingsGroup>

          <Card variant="outlined" style={styles.timeCard}>
            <View style={styles.timeCardHeader}>
              <View style={styles.timeCardCopy}>
                <Text style={styles.timeCardTitle}>Daily reminder time</Text>
                <Text style={styles.timeCardSubtitle}>
                  {reminderEnabled
                    ? "Changes update when you leave each field."
                    : "Pick a time now. It will be used when reminders are turned on."}
                </Text>
              </View>
              <StatusPill
                label={timePreview === "--:--" ? "Check time" : timePreview}
                variant={timePreview === "--:--" ? "warning" : "info"}
              />
            </View>

            <View style={styles.timeRow}>
              <View style={styles.timeInputWrap}>
                <Text style={styles.timeLabel}>Hour</Text>
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
                <Text style={styles.timeLabel}>Minute</Text>
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
          </Card>

          {reminderBanner ? (
            <Banner
              variant={reminderBanner.variant}
              title={reminderBanner.title}
              message={reminderBanner.message}
              actionLabel={reminderBanner.actionLabel}
              onAction={reminderBanner.onAction}
            />
          ) : null}
        </Section>

        <Section title="Care" subtitle="People and program details connected to your recovery.">
          <SettingsGroup testID="settings-group-care">
            <SettingsItem
              title="Caregiver access"
              subtitle={caregiverInfo.subtitle}
              leading={
                <DomainIcon
                  icon="caregiver"
                  tone="accent"
                  accessibilityLabel="Caregiver access icon"
                />
              }
              onPress={() => {
                router.push("/caregiver-invite" as Href);
              }}
              statusLabel={caregiverInfo.value === "Off" ? "Off" : "Linked"}
              statusVariant={caregiverInfo.value === "Off" ? "neutral" : "info"}
              testID="settings-caregiver-row"
            />
            <SettingsItem
              title="Recovery program"
              subtitle={rehabPhaseLabel}
              leading={
                <DomainIcon
                  icon="progress"
                  tone="muted"
                  accessibilityLabel="Recovery program icon"
                />
              }
              accessory="none"
            />
          </SettingsGroup>
        </Section>

        <Section
          title="Support & Safety"
          subtitle="Fast access to support options and safety guidance."
        >
          <SettingsGroup testID="settings-group-support">
            <SettingsItem
              title="Safety plan"
              subtitle="Open guided support steps."
              leading={
                <DomainIcon
                  icon="safety"
                  tone="warning"
                  accessibilityLabel="Safety plan icon"
                />
              }
              onPress={() => {
                router.push("/safety" as never);
              }}
              testID="settings-safety-row"
            />
            <SettingsItem
              title="Messages with your care team"
              subtitle="Open Messages to contact your care team."
              leading={
                <DomainIcon
                  icon="chat"
                  tone="accent"
                  accessibilityLabel="Care team messages icon"
                />
              }
              onPress={() => {
                router.push("/(tabs)/chat");
              }}
            />
            <SettingsItem
              title="Emergency help"
              subtitle="If you need urgent help, contact local emergency services."
              leading={
                <DomainIcon
                  icon="warning"
                  tone="warning"
                  accessibilityLabel="Emergency help icon"
                />
              }
              accessory="none"
            />
          </SettingsGroup>
        </Section>

        <Section title="App / About" subtitle="Helpful app information for this device.">
          <SettingsGroup testID="settings-group-app">
            <SettingsItem
              title="Connection"
              subtitle={
                network.isOffline
                  ? "You’re offline. Saved items stay on this device until you reconnect."
                  : "Aura is connected."
              }
              leading={
                <DomainIcon
                  icon="settings"
                  tone={network.isOffline ? "warning" : "success"}
                  accessibilityLabel="Connection icon"
                />
              }
              statusLabel={connectionLabel}
              statusVariant={network.isOffline ? "warning" : "success"}
              accessory="none"
            />
            <SettingsItem
              title="About Aura"
              subtitle="Recovery tracking and support."
              leading={
                <DomainIcon
                  icon="info"
                  tone="muted"
                  accessibilityLabel="About Aura icon"
                />
              }
              accessory="none"
            />
            <SettingsItem
              title="Version"
              subtitle="Mobile preview"
              leading={
                <DomainIcon
                  icon="settings"
                  tone="muted"
                  accessibilityLabel="Version icon"
                />
              }
              accessory="none"
            />
          </SettingsGroup>
        </Section>

        <Section title="Account actions" subtitle="Session control for this device.">
          <Card variant="outlined" style={styles.logoutCard}>
            <View style={styles.logoutCopy}>
              <Text style={styles.logoutTitle}>Log out of this device</Text>
              <Text style={styles.logoutText}>
                You’ll need your access code to sign in again.
              </Text>
            </View>

            {logoutError ? (
              <Banner variant="warning" title="Logout failed" message={logoutError} />
            ) : null}

            <Pressable
              testID="settings-logout-button"
              accessibilityRole="button"
              accessibilityLabel={isSigningOut ? "Logging out" : "Log out"}
              accessibilityState={{ disabled: isSigningOut, busy: isSigningOut || undefined }}
              disabled={isSigningOut}
              onPress={confirmSignOut}
              style={({ pressed }) => [
                styles.logoutButton,
                isSigningOut ? styles.logoutButtonDisabled : null,
                pressed && !isSigningOut ? getPressFeedbackStyle(reduceMotion, 0.92) : null,
              ]}
            >
              <Text style={styles.logoutButtonLabel}>
                {isSigningOut ? "Signing out…" : "Log out"}
              </Text>
            </Pressable>
          </Card>
        </Section>

        {isDeveloperModeVisible ? (
          <Section
            title="Developer"
            subtitle="Development build only. Hidden by default."
          >
            <SettingsGroup testID="settings-group-developer" tone="subtle">
              <SettingsItem
                title="Show developer tools"
                subtitle="Local development actions."
                leading={
                  <DomainIcon
                    icon="settings"
                    tone="muted"
                    accessibilityLabel="Developer tools icon"
                  />
                }
                onPress={toggleDeveloperMode}
                statusLabel={isDeveloperExpanded ? "Open" : "Collapsed"}
                statusVariant="neutral"
                testID="settings-developer-toggle"
              />
            </SettingsGroup>

            <FadeSlideIn visible={isDeveloperExpanded} reduceMotion={reduceMotion}>
              <Card variant="outlined" style={styles.devPanelCard}>
                <View testID="settings-developer-panel" style={styles.devPanel}>
                  <Text style={styles.devGroupTitle}>Preview data</Text>
                  <SecondaryButton
                    label="UI Gallery"
                    onPress={() => {
                      router.push("/dev-ui-gallery" as Href);
                    }}
                  />
                  <SecondaryButton
                    label={isResettingDemo ? "Resetting…" : "Reset local state"}
                    loading={isResettingDemo}
                    disabled={!patientId || isResettingDemo}
                    onPress={() =>
                      confirmAction(
                        "Reset local state?",
                        "This clears local caches, drafts, and pending queues for this patient.",
                        () => {
                          void runReset(false);
                        },
                      )
                    }
                  />
                  <SecondaryButton
                    label={isResettingDemo ? "Resetting…" : "Reset + sign out"}
                    loading={isResettingDemo}
                    disabled={!patientId || isResettingDemo}
                    onPress={() =>
                      confirmAction(
                        "Reset and sign out?",
                        "This clears local state for this patient and signs out.",
                        () => {
                          void runReset(true);
                        },
                      )
                    }
                  />
                  <SecondaryButton
                    label="Reset coping usage"
                    disabled={!patientId}
                    onPress={() =>
                      confirmAction(
                        "Reset coping usage?",
                        "This clears local breathing and grounding usage counters.",
                        () => {
                          void handleResetCopingUsage();
                        },
                      )
                    }
                  />

                  <Text style={styles.devGroupTitle}>Cache & sync</Text>
                  <SecondaryButton
                    label="Clear last refreshed stamps"
                    onPress={() =>
                      confirmAction(
                        "Clear refresh stamps?",
                        "This removes local last-refreshed timestamps.",
                        () => {
                          void handleClearRefreshStamps();
                        },
                      )
                    }
                  />
                  <SecondaryButton
                    label="Clear last failed attempts"
                    onPress={() =>
                      confirmAction(
                        "Clear last failed attempts?",
                        "This removes locally stored error history.",
                        () => {
                          void handleClearLastErrors();
                        },
                      )
                    }
                  />
                  <SecondaryButton
                    label="Clear saved progress cache"
                    disabled={!patientId}
                    onPress={() =>
                      confirmAction(
                        "Clear saved progress?",
                        "This removes cached check-ins for this patient on this device.",
                        () => {
                          void handleClearSavedProgress();
                        },
                      )
                    }
                  />
                  <SecondaryButton
                    label="Clear pending sessions"
                    disabled={!patientId}
                    onPress={() =>
                      confirmAction(
                        "Clear pending sessions?",
                        "This removes locally queued exercise session uploads.",
                        () => {
                          void handleClearPendingSessions();
                        },
                      )
                    }
                  />

                  <Text style={styles.devGroupTitle}>Safety/testing</Text>
                  <SecondaryButton
                    label="Open Safety screen (test)"
                    onPress={() =>
                      router.push({
                        pathname: "/safety",
                        params: {
                          alertId: "preview-alert",
                          reasonCodes: "PAIN_GE_THRESHOLD",
                        },
                      })
                    }
                  />
                  <SecondaryButton
                    label="Send test notification now"
                    onPress={() => {
                      void handleSendTestReminder();
                    }}
                    disabled={isReminderBusy}
                  />
                  <SecondaryButton
                    label="List scheduled notifications"
                    onPress={() => {
                      void handleListScheduled();
                    }}
                    disabled={isReminderBusy}
                  />

                  <Text style={styles.devGroupTitle}>Diagnostics</Text>
                  <Text style={styles.devLine}>Auth: {auth.status}</Text>
                  <Text style={styles.devLine}>Patient ID: {patientId || "none"}</Text>
                  <Text style={styles.devLine}>
                    Network: {network.isOffline ? "Offline" : "Online"}
                  </Text>
                  <Text style={styles.devLine}>Server: {API_BASE}</Text>

                  {reminderPermissionError.lastError || reminderScheduleError.lastError ? (
                    <Card variant="outlined" style={styles.devDiagnosticsCard}>
                      <Text style={styles.devGroupTitle}>Reminder diagnostics</Text>
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
                    </Card>
                  ) : null}

                  {devNotice ? (
                    <Banner
                      variant="info"
                      title="Developer"
                      message={devNotice}
                      actionLabel="Dismiss"
                      onAction={() => setDevNotice(null)}
                    />
                  ) : null}
                </View>
              </Card>
            </FadeSlideIn>
          </Section>
        ) : null}
      </View>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xl,
    },
    shell: {
      gap: tokens.spacing.sm,
    },
    headerCard: {
      gap: tokens.spacing.xs,
      backgroundColor: tokens.colors.surface,
    },
    headerEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    headerTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    headerText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    timeCard: {
      gap: tokens.spacing.md,
      marginTop: tokens.spacing.sm,
    },
    timeCardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
    },
    timeCardCopy: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    timeCardTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    timeCardSubtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    timeRow: {
      flexDirection: "row",
      gap: tokens.spacing.md,
    },
    timeInputWrap: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    timeLabel: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
      fontWeight: tokens.typography.weights.medium,
    },
    timeInput: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.text,
      backgroundColor: tokens.colors.surface,
    },
    logoutCard: {
      gap: tokens.spacing.md,
      backgroundColor: tokens.colors.dangerTextOn,
      borderColor: tokens.colors.danger,
    },
    logoutCopy: {
      gap: tokens.spacing.xs,
    },
    logoutTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    logoutText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    logoutButton: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.danger,
      backgroundColor: tokens.colors.surface,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.lg,
    },
    logoutButtonDisabled: {
      opacity: 0.55,
    },
    logoutButtonLabel: {
      color: tokens.colors.danger,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    devPanelCard: {
      marginTop: tokens.spacing.sm,
      backgroundColor: tokens.colors.surfaceSubtle,
    },
    devPanel: {
      gap: tokens.spacing.sm,
    },
    devGroupTitle: {
      marginTop: tokens.spacing.sm,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      letterSpacing: 0.3,
      color: tokens.colors.textMuted,
      textTransform: "uppercase",
    },
    devLine: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    devDiagnosticsCard: {
      gap: tokens.spacing.sm,
      backgroundColor: tokens.colors.surface,
    },
  });
}
