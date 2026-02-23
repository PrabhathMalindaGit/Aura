import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { InlineNotice } from "@/src/components/InlineNotice";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { API_BASE } from "@/src/config/env";
import { useAuth } from "@/src/state/auth";
import { getCachedExercisePlan } from "@/src/state/exercisePlanCache";
import { useLastError } from "@/src/state/lastError";
import { formatNetworkReason, useNetwork } from "@/src/state/network";
import { getPending } from "@/src/state/pendingSessions";
import { useLastRefreshed } from "@/src/state/refresh";
import { resetDemoState } from "@/src/utils/demoReset";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

export default function HomeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const network = useNetwork();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [planSummary, setPlanSummary] = useState<{
    status: "loading" | "assigned" | "none";
    itemCount: number;
  }>({
    status: "loading",
    itemCount: 0,
  });
  const [pendingSessionCount, setPendingSessionCount] = useState(0);

  const checkinsRefresh = useLastRefreshed("checkins");
  const chatRefresh = useLastRefreshed("chat");
  const progressRefresh = useLastRefreshed("progress");
  const exercisePlanRefresh = useLastRefreshed("exercisePlan");
  const exerciseSessionsRefresh = useLastRefreshed("exerciseSessions");

  const authError = useLastError("auth");
  const checkinSubmitError = useLastError("checkinSubmit");
  const chatLoadError = useLastError("chatLoad");
  const chatSendError = useLastError("chatSend");
  const progressLoadError = useLastError("progressLoad");
  const exercisePlanLoadError = useLastError("exercisePlanLoad");
  const exerciseSessionSaveError = useLastError("exerciseSessionSave");
  const exerciseSessionsLoadError = useLastError("exerciseSessionsLoad");
  const reminderPermissionError = useLastError("reminderPermission");
  const reminderScheduleError = useLastError("reminderSchedule");

  const patientId = auth.patient?.id ?? "";
  const patientLabel = auth.patient?.displayName ?? auth.patient?.id ?? "Unknown";

  const failedAttemptLines = useMemo(
    () => [
      {
        label: "Auth",
        value: authError.label,
        title: authError.lastError?.title,
      },
      {
        label: "Check-in submit",
        value: checkinSubmitError.label,
        title: checkinSubmitError.lastError?.title,
      },
      {
        label: "Chat load",
        value: chatLoadError.label,
        title: chatLoadError.lastError?.title,
      },
      {
        label: "Chat send",
        value: chatSendError.label,
        title: chatSendError.lastError?.title,
      },
      {
        label: "Progress load",
        value: progressLoadError.label,
        title: progressLoadError.lastError?.title,
      },
      {
        label: "Exercise plan load",
        value: exercisePlanLoadError.label,
        title: exercisePlanLoadError.lastError?.title,
      },
      {
        label: "Exercise session save",
        value: exerciseSessionSaveError.label,
        title: exerciseSessionSaveError.lastError?.title,
      },
      {
        label: "Exercise sessions load",
        value: exerciseSessionsLoadError.label,
        title: exerciseSessionsLoadError.lastError?.title,
      },
      {
        label: "Reminder permission",
        value: reminderPermissionError.label,
        title: reminderPermissionError.lastError?.title,
      },
      {
        label: "Reminder schedule",
        value: reminderScheduleError.label,
        title: reminderScheduleError.lastError?.title,
      },
    ],
    [
      authError.label,
      authError.lastError?.title,
      checkinSubmitError.label,
      checkinSubmitError.lastError?.title,
      chatLoadError.label,
      chatLoadError.lastError?.title,
      chatSendError.label,
      chatSendError.lastError?.title,
      progressLoadError.label,
      progressLoadError.lastError?.title,
      exercisePlanLoadError.label,
      exercisePlanLoadError.lastError?.title,
      exerciseSessionSaveError.label,
      exerciseSessionSaveError.lastError?.title,
      exerciseSessionsLoadError.label,
      exerciseSessionsLoadError.lastError?.title,
      reminderPermissionError.label,
      reminderPermissionError.lastError?.title,
      reminderScheduleError.label,
      reminderScheduleError.lastError?.title,
    ]
  );

  const reloadDiagnostics = async () => {
    await Promise.all([
      checkinsRefresh.reload(),
      chatRefresh.reload(),
      progressRefresh.reload(),
      exercisePlanRefresh.reload(),
      exerciseSessionsRefresh.reload(),
      authError.reload(),
      checkinSubmitError.reload(),
      chatLoadError.reload(),
      chatSendError.reload(),
      progressLoadError.reload(),
      exercisePlanLoadError.reload(),
      exerciseSessionSaveError.reload(),
      exerciseSessionsLoadError.reload(),
      reminderPermissionError.reload(),
      reminderScheduleError.reload(),
    ]);
  };

  const reloadPendingCount = async (): Promise<void> => {
    if (!patientId) {
      setPendingSessionCount(0);
      return;
    }
    const pending = await getPending(patientId);
    setPendingSessionCount(pending.length);
  };

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setPlanSummary({
        status: "none",
        itemCount: 0,
      });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedExercisePlan(patientId);
      if (!active) {
        return;
      }

      const itemCount = cached?.response.plan?.items?.length ?? 0;
      setPlanSummary({
        status: cached?.response.plan ? "assigned" : "none",
        itemCount,
      });
    })();

    return () => {
      active = false;
    };
  }, [patientId, exercisePlanRefresh.lastRefreshedAt]);

  useFocusEffect(
    useCallback(() => {
      void reloadPendingCount();
      return undefined;
    }, [patientId])
  );

  const runReset = async (includeSignOut = false) => {
    setIsResetting(true);
    setNotice(null);
    try {
      await resetDemoState({
        patientId,
        includeSignOut,
      });
      await reloadDiagnostics();

      if (includeSignOut) {
        await auth.signOut();
        return;
      }

      setNotice({
        variant: "info",
        title: "Demo state reset",
        message:
          "Cleared chat/progress/plan caches, pending sessions, last refreshed stamps, last failed attempts, and reminder prefs.",
      });
    } catch {
      setNotice({
        variant: "error",
        title: "Reset failed",
        message: "Could not fully reset demo state. Please try again.",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const confirmReset = () => {
    Alert.alert(
      "Reset demo state?",
      "Clears cached chat, cached progress, cached plan, pending sessions, last refreshed, last failed attempts, and reminder prefs.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            void runReset(false);
          },
        },
      ]
    );
  };

  const confirmResetAndSignOut = () => {
    Alert.alert(
      "Reset and sign out?",
      "This clears demo state and signs you out.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset + sign out",
          style: "destructive",
          onPress: () => {
            void runReset(true);
          },
        },
      ]
    );
  };

  return (
    <Screen title="Demo Hub">
      <ScrollView contentContainerStyle={styles.container}>
        <Section title="System status">
          <Text style={styles.statusLine}>API base: {API_BASE}</Text>
          <Text style={styles.statusLine}>
            Network: {network.isOffline ? "Offline" : "Online"}
          </Text>
          <Text style={styles.statusDetail}>
            Reachability: {formatNetworkReason(network.reason)}
          </Text>
          <Text style={styles.statusLine}>Auth: {auth.status}</Text>
          <Text style={styles.statusLine}>Patient: {patientLabel}</Text>

          <LastRefreshed
            label="Last refreshed (check-ins)"
            value={checkinsRefresh.label}
            compact
          />
          <LastRefreshed label="Last refreshed (chat)" value={chatRefresh.label} compact />
          <LastRefreshed
            label="Last refreshed (progress)"
            value={progressRefresh.label}
            compact
          />
          <LastRefreshed
            label="Last refreshed (exercise plan)"
            value={exercisePlanRefresh.label}
            compact
          />
          <LastRefreshed
            label="Last refreshed (exercise sessions)"
            value={exerciseSessionsRefresh.label}
            compact
          />

          <View style={styles.divider} />
          {failedAttemptLines.map((line) => (
            <Text key={line.label} style={styles.statusDetail}>
              {line.label}: {line.value}
              {line.value !== "Never" && line.title ? ` — ${line.title}` : ""}
            </Text>
          ))}
        </Section>

        <Section title="Quick actions">
          <Text style={styles.statusDetail}>
            Today&apos;s plan:{" "}
            {planSummary.status === "loading"
              ? "Loading cached summary..."
              : planSummary.status === "assigned"
                ? `Assigned (${planSummary.itemCount} item${
                    planSummary.itemCount === 1 ? "" : "s"
                  })`
                : "None"}
          </Text>
          <Text style={styles.statusDetail}>
            Pending sessions: {pendingSessionCount}
          </Text>
          <PrimaryButton
            label="Go to Check-in"
            onPress={() => router.push("/(tabs)/checkin")}
          />
          <PrimaryButton label="Go to Chat" onPress={() => router.push("/(tabs)/chat")} />
          <PrimaryButton
            label="Go to Progress"
            onPress={() => router.push("/(tabs)/progress")}
          />
          <PrimaryButton
            label="Go to Settings"
            onPress={() => router.push("/(tabs)/settings")}
          />
          <PrimaryButton
            label="Go to Plan"
            onPress={() => router.push("/exercise-plan")}
          />
          <PrimaryButton
            label="Go to Sessions"
            onPress={() => router.push("/exercise-sessions")}
          />
        </Section>

        <Section title="Demo script (2–3 minutes)">
          <Text style={styles.bullet}>• Sign in: `P1-DEMO`.</Text>
          <Text style={styles.bullet}>
            • Check-in low risk: pain 2, mood 4, exercises 80%, meds on → Saved.
          </Text>
          <Text style={styles.bullet}>
            • Check-in high risk: pain 9, mood 2, exercises 20%, meds off → Safety screen.
          </Text>
          <Text style={styles.bullet}>
            • Chat low risk: “I completed my exercises and feel okay.” → Assistant reply.
          </Text>
          <Text style={styles.bullet}>
            • Chat high risk: “I have chest pain right now.” → Safety screen.
          </Text>
          <Text style={styles.bullet}>
            • Progress: switch 14/30 and open one detail row.
          </Text>
          <Text style={styles.bullet}>
            • Plan: open Today&apos;s Plan and confirm assigned exercises.
          </Text>
          <Text style={styles.bullet}>
            • Session: start from Plan, complete 2 exercises, finish and open session detail.
          </Text>
          <Text style={styles.bullet}>
            • Offline session: finish while offline, then submit pending when online.
          </Text>
          <Text style={styles.bullet}>
            • Settings: toggle daily reminder, then log out.
          </Text>
          <Text style={styles.note}>
            If offline, you should see “Nothing was sent” and updated last failed attempt times.
          </Text>
        </Section>

        {__DEV__ ? (
          <Section title="Demo tools">
            <PrimaryButton
              label={isResetting ? "Resetting…" : "Reset demo state"}
              loading={isResetting}
              disabled={isResetting}
              onPress={confirmReset}
            />
            <PrimaryButton
              label={isResetting ? "Resetting…" : "Reset + sign out"}
              loading={isResetting}
              disabled={isResetting}
              onPress={confirmResetAndSignOut}
            />
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
          </Section>
        ) : null}

        {notice ? (
          <InlineNotice
            variant={notice.variant}
            title={notice.title}
            message={notice.message}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingBottom: 16,
  },
  statusLine: {
    fontSize: 14,
    color: "#374151",
  },
  statusDetail: {
    fontSize: 12,
    color: "#6b7280",
  },
  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 2,
  },
  bullet: {
    fontSize: 13,
    lineHeight: 19,
    color: "#374151",
    marginBottom: 2,
  },
  note: {
    marginTop: 4,
    fontSize: 12,
    color: "#6b7280",
  },
});
