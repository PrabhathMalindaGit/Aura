import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";

import { Banner } from "@/src/components/Banner";
import { Avatar } from "@/src/components/Avatar";
import { DomainIcon } from "@/src/components/IconSet";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { FadeSlideIn } from "@/src/components/Motion";
import { HeroHeader } from "@/src/components/HeroHeader";
import { MediaCard } from "@/src/components/MediaCard";
import { Row } from "@/src/components/Row";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { Section } from "@/src/components/Section";
import { StatusPill } from "@/src/components/StatusPill";
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
import { useReducedMotion } from "@/src/state/useReducedMotion";
import { runLayoutAnimationIfAllowed } from "@/src/theme/motion";
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

function toBannerVariant(
  value: "info" | "warning" | "error"
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
    return "Rehab phase not set";
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

  return "Rehab phase not set";
}

function getCaregiverLabel(patient: unknown): { value: string; subtitle: string } {
  if (!patient || typeof patient !== "object") {
    return {
      value: "Off",
      subtitle: "Invite a caregiver to view summaries",
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
      subtitle: "Linked caregiver access",
    };
  }

  if (caregiverEnabled === true) {
    return {
      value: "On",
      subtitle: "Linked caregiver access",
    };
  }

  return {
    value: "Off",
    subtitle: "Invite a caregiver to view summaries",
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
  const reduceMotion = useReducedMotion();

  const patientName = auth.patient?.displayName ?? auth.patient?.id ?? "Patient";
  const patientId = auth.patient?.id ?? "";
  const patientPhotoUri = useMemo(() => extractPatientPhotoUri(auth.patient), [auth.patient]);
  const rehabPhaseLabel = useMemo(() => getRehabPhaseLabel(auth.patient), [auth.patient]);
  const caregiverInfo = useMemo(() => getCaregiverLabel(auth.patient), [auth.patient]);

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

  const toggleDeveloperMode = () => {
    // Keep disclosure motion native-only and disabled when reduced motion is on.
    runLayoutAnimationIfAllowed(reduceMotion);
    setIsDeveloperExpanded((current) => !current);
  };

  return (
    <Screen
      scroll
      contentContainerStyle={styles.container}
      header={
        <HeroHeader
          variant="compact"
          title="Settings"
          subtitle={patientName ? `Hi, ${patientName}` : "Account & preferences"}
          left={
            <Avatar
              size={44}
              name={patientName ?? "Patient"}
              photoUrl={patientPhotoUri ?? undefined}
              ring={network.isOffline ? "attention" : "none"}
            />
          }
          rightActions={[
            {
              icon: "safety",
              tone: "warning",
              accessibilityLabel: "Open Safety support",
              onPress: () => {
                router.push("/safety" as never);
              },
            },
          ]}
        />
      }
    >
      <View style={styles.heroSpacing}>
        <Section
          title="Account / Profile"
          card
          left={<DomainIcon icon="login" tone="muted" accessibilityLabel="Account section icon" />}
        >
          <MediaCard
            leading={{
              type: "avatar",
              name: patientName,
              photoUrl: patientPhotoUri,
              ring: network.isOffline ? "attention" : "none",
            }}
            title={patientName}
            subtitle={rehabPhaseLabel ?? `Patient ID: ${patientId || "Unavailable"}`}
            chips={[
              {
                text: auth.status === "signedIn" ? "Signed in" : auth.status,
                tone: "muted",
              },
              {
                text: reminderEnabled ? "Reminders on" : "Reminders off",
                tone: "muted",
              },
              {
                text: caregiverInfo.value === "Off" ? "Caregiver off" : "Caregiver on",
                tone: "muted",
              },
            ]}
            actions={[
              {
                label: isSigningOut ? "Signing out…" : "Log out",
                kind: "secondary",
                onPress: confirmSignOut,
                disabled: isSigningOut,
              },
              {
                label: "Open Safety",
                kind: "primary",
                onPress: () => {
                  router.push("/safety" as never);
                },
              },
            ]}
          />

          <View style={styles.stack}>
            <Row
              title="Care team"
              subtitle="Message your care team"
              leftIcon={<DomainIcon icon="chat" tone="accent" accessibilityLabel="Care team icon" />}
              onPress={() => router.push("/(tabs)/chat")}
            />
            <Row
              title="Profile details"
              subtitle={`Patient ID: ${patientId || "Unavailable"}`}
              leftIcon={<DomainIcon icon="info" tone="muted" accessibilityLabel="Profile details icon" />}
              accessory="none"
            />
          </View>

          {logoutError ? (
            <Banner variant="warning" title="Logout failed" message={logoutError} />
          ) : null}
        </Section>

      <Section
        title="Reminders"
        card
        left={<DomainIcon icon="weekly" tone="muted" accessibilityLabel="Reminders section icon" />}
        right={
          <StatusPill
            label={reminderEnabled ? "On" : "Off"}
            variant={reminderEnabled ? "success" : "neutral"}
          />
        }
      >
        <View style={styles.stack}>
          <Row
            title="Daily reminders"
            subtitle={reminderEnabled ? "Enabled" : "Disabled"}
            leftIcon={<DomainIcon icon="weekly" tone="accent" accessibilityLabel="Daily reminders icon" />}
            right={
              <Switch
                value={reminderEnabled}
                onValueChange={handleReminderToggle}
                disabled={!patientId || isReminderBusy}
              />
            }
            accessory="none"
          />

          <Row
            title="Reminder time"
            subtitle={reminderEnabled ? "Update your daily reminder time" : "Turn reminders on first"}
            leftIcon={<DomainIcon icon="info" tone="muted" accessibilityLabel="Reminder time icon" />}
            right={<Text style={styles.rowValue}>{reminderEnabled ? timePreview : "Off"}</Text>}
            accessory="none"
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
          <Banner variant="warning" title="Invalid time" message={timeValidationError} />
        ) : null}

        {reminderEnabled && !timeValidationError ? (
          <Banner
            variant="info"
            title="Reminder active"
            message={`Daily reminder set for ${timePreview}.`}
          />
        ) : null}

        {reminderPermissionError.lastError ? (
          <Banner
            variant="warning"
            title="Notifications need permission"
            message="Enable notifications in device settings to use reminders."
            actionLabel="Open Settings"
            onAction={() => {
              void openSystemSettings();
            }}
          />
        ) : null}

        {reminderPermissionError.lastError || reminderScheduleError.lastError ? (
          <View style={styles.diagnosticsCard}>
            <Text style={styles.diagnosticsTitle}>Reminder diagnostics</Text>
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
          </View>
        ) : null}

        {reminderNotice ? (
          <Banner
            variant={toBannerVariant(reminderNotice.variant)}
            title={reminderNotice.title}
            message={reminderNotice.message}
            actionLabel={reminderNotice.actionLabel}
            onAction={reminderNotice.onAction}
          />
        ) : null}
      </Section>

      <Section
        title="Caregiver"
        card
        left={<DomainIcon icon="caregiver" tone="accent" accessibilityLabel="Caregiver section icon" />}
      >
        <MediaCard
          variant="compact"
          leading={{ type: "icon", icon: "caregiver", tone: "accent" }}
          title="Caregiver access"
          subtitle="Share weekly report and progress"
          chips={[{ text: caregiverInfo.value === "Off" ? "Off" : "On", tone: "muted" }]}
          onPress={() => {
            router.push("/caregiver-invite" as Href);
          }}
        />
        <Row
          title="Caregiver access"
          subtitle={caregiverInfo.subtitle}
          leftIcon={<DomainIcon icon="caregiver" tone="accent" accessibilityLabel="Caregiver access icon" />}
          right={<Text style={styles.rowValue}>{caregiverInfo.value}</Text>}
          onPress={() => {
            router.push("/caregiver-invite" as Href);
          }}
        />
      </Section>

      <Section
        title="Support & Safety plan"
        card
        left={<DomainIcon icon="safety" tone="warning" accessibilityLabel="Support and safety section icon" />}
      >
        <MediaCard
          variant="compact"
          leading={{ type: "icon", icon: "safety", tone: "warning" }}
          title="Safety support"
          subtitle="Breathing and grounding tools"
          actions={[
            {
              label: "Open Safety",
              kind: "primary",
              onPress: () => {
                router.push("/safety" as never);
              },
            },
          ]}
        />
        <View style={styles.stack}>
          <Row
            title="Safety plan"
            subtitle="Open guided support steps"
            leftIcon={<DomainIcon icon="safety" tone="warning" accessibilityLabel="Safety plan icon" />}
            onPress={() => {
              router.push("/safety" as never);
            }}
          />
          <Row
            title="Contact clinic"
            subtitle="Send a message to your care team"
            leftIcon={<DomainIcon icon="chat" tone="accent" accessibilityLabel="Contact clinic icon" />}
            onPress={() => {
              router.push("/(tabs)/chat");
            }}
          />
          <Row
            title="Emergency help"
            subtitle="If urgent, contact local emergency services"
            leftIcon={<DomainIcon icon="warning" tone="warning" accessibilityLabel="Emergency help icon" />}
            accessory="none"
          />
        </View>
        <Text style={styles.supportNote}>
          If you feel unsafe or overwhelmed, open your Safety plan for guided steps.
        </Text>
      </Section>

      <Section
        title="App info"
        card
        left={<DomainIcon icon="info" tone="muted" accessibilityLabel="App info section icon" />}
      >
        <View style={styles.stack}>
          <Row
            title="About Aura"
            subtitle="Recovery tracking and support"
            leftIcon={<DomainIcon icon="info" tone="muted" accessibilityLabel="About Aura icon" />}
            accessory="none"
          />
          <Row
            title="Version"
            leftIcon={<DomainIcon icon="settings" tone="muted" accessibilityLabel="Version icon" />}
            right={<Text style={styles.rowValue}>Mobile preview</Text>}
            accessory="none"
          />
        </View>
      </Section>

      {/* IMPORTANT: Developer Mode renders once (not inside lists). */}
      {isDeveloperModeVisible ? (
        <Section
          title="Developer Mode"
          subtitle="Dev builds only"
          card
          cardVariant="outlined"
          left={<DomainIcon icon="settings" tone="muted" accessibilityLabel="Developer mode section icon" />}
          right={<StatusPill label={isDeveloperExpanded ? "Open" : "Collapsed"} />}
        >
          <Row
            title="Developer Mode"
            subtitle="Dev builds only"
            leftIcon={<DomainIcon icon="settings" tone="muted" accessibilityLabel="Developer mode icon" />}
            onPress={toggleDeveloperMode}
            right={<Text style={styles.rowValue}>{isDeveloperExpanded ? "Hide" : "Show"}</Text>}
          />

          <FadeSlideIn visible={isDeveloperExpanded} reduceMotion={reduceMotion}>
            <View style={styles.devPanel}>
              <Text style={styles.devGroupTitle}>Demo data</Text>
              <SecondaryButton
                label="UI Gallery"
                onPress={() => {
                  router.push("/dev-ui-gallery" as Href);
                }}
              />
              <SecondaryButton
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
              <SecondaryButton
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
              <SecondaryButton
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

              <Text style={styles.devGroupTitle}>Cache & sync</Text>
              <SecondaryButton
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
              <SecondaryButton
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
              <SecondaryButton
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
              <SecondaryButton
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

              <Text style={styles.devGroupTitle}>Safety/testing</Text>
              <SecondaryButton
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
              <Text style={styles.devLine}>API: {API_BASE}</Text>

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
          </FadeSlideIn>

          {!isDeveloperExpanded ? (
            <Text style={styles.devHint}>Hidden by default. Expand for local demo and debug actions.</Text>
          ) : null}
        </Section>
      ) : null}
      </View>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.xs,
      paddingBottom: tokens.spacing.xl,
    },
    heroSpacing: {
      gap: 0,
    },
    stack: {
      gap: tokens.spacing.sm,
    },
    rowValue: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
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
      minHeight: 44,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.sm,
      paddingHorizontal: tokens.spacing.md - 2,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.text,
      backgroundColor: tokens.colors.surface,
    },
    diagnosticsCard: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    diagnosticsTitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.2,
    },
    supportNote: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      marginTop: tokens.spacing.xs,
    },
    devHint: {
      marginTop: tokens.spacing.sm,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    devPanel: {
      marginTop: tokens.spacing.sm,
      gap: tokens.spacing.sm,
    },
    devGroupTitle: {
      marginTop: tokens.spacing.sm,
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
