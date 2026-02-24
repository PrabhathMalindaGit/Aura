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
import { getCachedHydrationDay } from "@/src/state/hydrationCache";
import { getCachedMedicationToday } from "@/src/state/medicationTodayCache";
import { getCachedNutritionDay } from "@/src/state/nutritionCache";
import { getCachedPhotosList } from "@/src/state/photosCache";
import { getCachedProms } from "@/src/state/promsCache";
import { getCachedRehabPhases } from "@/src/state/rehabPhasesCache";
import { getCachedWeeklyReport } from "@/src/state/weeklyReportCache";
import { useLastError } from "@/src/state/lastError";
import { formatNetworkReason, useNetwork } from "@/src/state/network";
import { getPendingNutrition } from "@/src/state/pendingNutrition";
import { getPendingHydration } from "@/src/state/pendingHydration";
import { getPendingMedicationLogs } from "@/src/state/pendingMedicationLogs";
import { getPendingPhotoUploads } from "@/src/state/pendingPhotoUploads";
import { getPendingPromSubmissions } from "@/src/state/pendingPromSubmissions";
import { getPending } from "@/src/state/pendingSessions";
import { useLastRefreshed } from "@/src/state/refresh";
import { startOfWeekMondayISO, todayISO } from "@/src/utils/date";
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
  const [pendingPromCount, setPendingPromCount] = useState(0);
  const [pendingHydrationCount, setPendingHydrationCount] = useState(0);
  const [hydrationTodayMl, setHydrationTodayMl] = useState<number | null>(null);
  const [pendingNutritionCount, setPendingNutritionCount] = useState(0);
  const [nutritionTodayLogged, setNutritionTodayLogged] = useState<boolean | null>(null);
  const [pendingMedicationCount, setPendingMedicationCount] = useState(0);
  const [pendingPhotoCount, setPendingPhotoCount] = useState(0);
  const [photoSummary, setPhotoSummary] = useState<{
    status: "loading" | "available" | "none";
    itemCount: number;
  }>({
    status: "loading",
    itemCount: 0,
  });
  const [medicationTodaySummary, setMedicationTodaySummary] = useState<{
    taken: number;
    total: number;
  } | null>(null);
  const [promSummary, setPromSummary] = useState<{
    status: "loading" | "hasDue" | "none";
    dueCount: number;
  }>({
    status: "loading",
    dueCount: 0,
  });
  const [rehabSummary, setRehabSummary] = useState<{
    status: "loading" | "set" | "none";
    currentTitle: string;
  }>({
    status: "loading",
    currentTitle: "",
  });
  const [weeklyReportAvailable, setWeeklyReportAvailable] = useState<
    "loading" | "available" | "none"
  >("loading");

  const checkinsRefresh = useLastRefreshed("checkins");
  const chatRefresh = useLastRefreshed("chat");
  const progressRefresh = useLastRefreshed("progress");
  const exercisePlanRefresh = useLastRefreshed("exercisePlan");
  const exerciseSessionsRefresh = useLastRefreshed("exerciseSessions");
  const rehabPhasesRefresh = useLastRefreshed("rehabPhases");
  const promsRefresh = useLastRefreshed("proms");
  const hydrationRefresh = useLastRefreshed("hydration");
  const nutritionRefresh = useLastRefreshed("nutrition");
  const medicationsRefresh = useLastRefreshed("medications");
  const photosRefresh = useLastRefreshed("photos");
  const weeklyReportRefresh = useLastRefreshed("weeklyReport");

  const authError = useLastError("auth");
  const checkinSubmitError = useLastError("checkinSubmit");
  const chatLoadError = useLastError("chatLoad");
  const chatSendError = useLastError("chatSend");
  const progressLoadError = useLastError("progressLoad");
  const exercisePlanLoadError = useLastError("exercisePlanLoad");
  const rehabPhasesLoadError = useLastError("rehabPhasesLoad");
  const exerciseSessionSaveError = useLastError("exerciseSessionSave");
  const exerciseSessionsLoadError = useLastError("exerciseSessionsLoad");
  const reminderPermissionError = useLastError("reminderPermission");
  const reminderScheduleError = useLastError("reminderSchedule");
  const promsLoadError = useLastError("promsLoad");
  const promSubmitError = useLastError("promSubmit");
  const hydrationLoadError = useLastError("hydrationLoad");
  const hydrationLogError = useLastError("hydrationLog");
  const nutritionLoadError = useLastError("nutritionLoad");
  const nutritionLogError = useLastError("nutritionLog");
  const medicationsLoadError = useLastError("medicationsLoad");
  const medicationLogError = useLastError("medicationLog");
  const photosLoadError = useLastError("photosLoad");
  const photoUploadError = useLastError("photoUpload");
  const weeklyReportLoadError = useLastError("weeklyReportLoad");

  const patientId = auth.patient?.id ?? "";
  const patientLabel = auth.patient?.displayName ?? auth.patient?.id ?? "Unknown";
  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const thisWeekStart = startOfWeekMondayISO(tzOffsetMinutes);
  const today = todayISO();

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
        label: "Rehab phases load",
        value: rehabPhasesLoadError.label,
        title: rehabPhasesLoadError.lastError?.title,
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
        label: "PROMs load",
        value: promsLoadError.label,
        title: promsLoadError.lastError?.title,
      },
      {
        label: "PROM submit",
        value: promSubmitError.label,
        title: promSubmitError.lastError?.title,
      },
      {
        label: "Hydration load",
        value: hydrationLoadError.label,
        title: hydrationLoadError.lastError?.title,
      },
      {
        label: "Hydration log",
        value: hydrationLogError.label,
        title: hydrationLogError.lastError?.title,
      },
      {
        label: "Nutrition load",
        value: nutritionLoadError.label,
        title: nutritionLoadError.lastError?.title,
      },
      {
        label: "Nutrition log",
        value: nutritionLogError.label,
        title: nutritionLogError.lastError?.title,
      },
      {
        label: "Medications load",
        value: medicationsLoadError.label,
        title: medicationsLoadError.lastError?.title,
      },
      {
        label: "Medication log",
        value: medicationLogError.label,
        title: medicationLogError.lastError?.title,
      },
      {
        label: "Photos load",
        value: photosLoadError.label,
        title: photosLoadError.lastError?.title,
      },
      {
        label: "Photo upload",
        value: photoUploadError.label,
        title: photoUploadError.lastError?.title,
      },
      {
        label: "Weekly report load",
        value: weeklyReportLoadError.label,
        title: weeklyReportLoadError.lastError?.title,
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
      rehabPhasesLoadError.label,
      rehabPhasesLoadError.lastError?.title,
      exerciseSessionSaveError.label,
      exerciseSessionSaveError.lastError?.title,
      exerciseSessionsLoadError.label,
      exerciseSessionsLoadError.lastError?.title,
      promsLoadError.label,
      promsLoadError.lastError?.title,
      promSubmitError.label,
      promSubmitError.lastError?.title,
      hydrationLoadError.label,
      hydrationLoadError.lastError?.title,
      hydrationLogError.label,
      hydrationLogError.lastError?.title,
      nutritionLoadError.label,
      nutritionLoadError.lastError?.title,
      nutritionLogError.label,
      nutritionLogError.lastError?.title,
      medicationsLoadError.label,
      medicationsLoadError.lastError?.title,
      medicationLogError.label,
      medicationLogError.lastError?.title,
      photosLoadError.label,
      photosLoadError.lastError?.title,
      photoUploadError.label,
      photoUploadError.lastError?.title,
      weeklyReportLoadError.label,
      weeklyReportLoadError.lastError?.title,
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
      rehabPhasesRefresh.reload(),
      promsRefresh.reload(),
      hydrationRefresh.reload(),
      nutritionRefresh.reload(),
      medicationsRefresh.reload(),
      photosRefresh.reload(),
      weeklyReportRefresh.reload(),
      authError.reload(),
      checkinSubmitError.reload(),
      chatLoadError.reload(),
      chatSendError.reload(),
      progressLoadError.reload(),
      exercisePlanLoadError.reload(),
      rehabPhasesLoadError.reload(),
      exerciseSessionSaveError.reload(),
      exerciseSessionsLoadError.reload(),
      promsLoadError.reload(),
      promSubmitError.reload(),
      hydrationLoadError.reload(),
      hydrationLogError.reload(),
      nutritionLoadError.reload(),
      nutritionLogError.reload(),
      medicationsLoadError.reload(),
      medicationLogError.reload(),
      photosLoadError.reload(),
      photoUploadError.reload(),
      weeklyReportLoadError.reload(),
      reminderPermissionError.reload(),
      reminderScheduleError.reload(),
    ]);
  };

  const reloadPendingCounts = async (): Promise<void> => {
    if (!patientId) {
      setPendingSessionCount(0);
      setPendingPromCount(0);
      setPendingHydrationCount(0);
      setPendingNutritionCount(0);
      setPendingMedicationCount(0);
      setPendingPhotoCount(0);
      return;
    }
    const pending = await getPending(patientId);
    setPendingSessionCount(pending.length);
    const pendingProms = await getPendingPromSubmissions(patientId);
    setPendingPromCount(pendingProms.length);
    const pendingHydration = await getPendingHydration(patientId);
    setPendingHydrationCount(pendingHydration.length);
    const pendingNutrition = await getPendingNutrition(patientId);
    setPendingNutritionCount(pendingNutrition.length);
    const pendingMedication = await getPendingMedicationLogs(patientId);
    setPendingMedicationCount(pendingMedication.length);
    const pendingPhotos = await getPendingPhotoUploads(patientId);
    setPendingPhotoCount(pendingPhotos.length);
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

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setRehabSummary({
        status: "none",
        currentTitle: "",
      });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedRehabPhases(patientId);
      if (!active) {
        return;
      }

      const rehab = cached?.rehab;
      if (!rehab || rehab.phases.length === 0) {
        setRehabSummary({
          status: "none",
          currentTitle: "",
        });
        return;
      }

      const current =
        rehab.phases.find((phase) => phase.key === rehab.currentKey) ??
        rehab.phases.find((phase) => phase.status === "current") ??
        null;
      setRehabSummary({
        status: "set",
        currentTitle: current?.title ?? "Not set",
      });
    })();

    return () => {
      active = false;
    };
  }, [patientId, rehabPhasesRefresh.lastRefreshedAt]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setPromSummary({
        status: "none",
        dueCount: 0,
      });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedProms(patientId);
      if (!active) {
        return;
      }

      const dueCount = cached?.dueCards.length ?? 0;
      setPromSummary({
        status: dueCount > 0 ? "hasDue" : "none",
        dueCount,
      });
    })();

    return () => {
      active = false;
    };
  }, [patientId, promsRefresh.lastRefreshedAt]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setWeeklyReportAvailable("none");
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedWeeklyReport(patientId, thisWeekStart);
      if (!active) {
        return;
      }

      setWeeklyReportAvailable(cached ? "available" : "none");
    })();

    return () => {
      active = false;
    };
  }, [patientId, thisWeekStart, weeklyReportRefresh.lastRefreshedAt]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setPhotoSummary({
        status: "none",
        itemCount: 0,
      });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedPhotosList(patientId);
      if (!active) {
        return;
      }
      if (!cached) {
        setPhotoSummary({
          status: "none",
          itemCount: 0,
        });
        return;
      }
      setPhotoSummary({
        status: cached.items.length > 0 ? "available" : "none",
        itemCount: cached.items.length,
      });
    })();

    return () => {
      active = false;
    };
  }, [patientId, photosRefresh.lastRefreshedAt]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setHydrationTodayMl(null);
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedHydrationDay(patientId, today);
      const pending = await getPendingHydration(patientId);
      if (!active) {
        return;
      }
      const pendingTotal = pending
        .filter((entry) => entry.date === today)
        .reduce((sum, entry) => sum + entry.amountMl, 0);
      setHydrationTodayMl((cached?.totalMl ?? 0) + pendingTotal);
    })();

    return () => {
      active = false;
    };
  }, [patientId, today, hydrationRefresh.lastRefreshedAt]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setNutritionTodayLogged(null);
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedNutritionDay(patientId, today);
      const pending = await getPendingNutrition(patientId);
      if (!active) {
        return;
      }
      const pendingToday = pending.some((entry) => entry.date === today);
      setNutritionTodayLogged(Boolean(cached?.entry) || pendingToday);
    })();

    return () => {
      active = false;
    };
  }, [patientId, today, nutritionRefresh.lastRefreshedAt]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setMedicationTodaySummary(null);
      return () => {
        active = false;
      };
    }

    void (async () => {
      const [cached, pending] = await Promise.all([
        getCachedMedicationToday(patientId, today),
        getPendingMedicationLogs(patientId),
      ]);
      if (!active) {
        return;
      }

      const baseItems = cached?.items ?? [];
      const pendingForToday = pending.filter((entry) => entry.date === today);
      const pendingMap = new Map<string, "taken" | "skipped">();
      for (const entry of pendingForToday) {
        pendingMap.set(`${entry.medicationId}:${entry.time}`, entry.status);
      }

      let total = 0;
      let taken = 0;
      for (const item of baseItems) {
        for (const dose of item.doses) {
          total += 1;
          const pendingStatus = pendingMap.get(`${item.medicationId}:${dose.time}`);
          const effectiveStatus = pendingStatus ?? dose.status;
          if (effectiveStatus === "taken") {
            taken += 1;
          }
        }
      }

      if (total === 0 && pendingForToday.length === 0) {
        setMedicationTodaySummary(null);
        return;
      }

      setMedicationTodaySummary({
        taken,
        total: total === 0 ? pendingForToday.length : total,
      });
    })();

    return () => {
      active = false;
    };
  }, [patientId, today, medicationsRefresh.lastRefreshedAt]);

  useFocusEffect(
    useCallback(() => {
      void reloadPendingCounts();
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
          "Cleared chat/progress/plan/hydration/nutrition/medications/photos/rehab/PROM/weekly-report caches, drafts, pending uploads, last refreshed stamps, last failed attempts, and reminder prefs.",
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
      "Clears cached chat, progress, hydration, nutrition, medications, photos, plan, rehab journey, questionnaires, weekly reports, drafts, pending uploads, last refreshed, last failed attempts, and reminder prefs.",
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
          <LastRefreshed
            label="Last refreshed (rehab journey)"
            value={rehabPhasesRefresh.label}
            compact
          />
          <LastRefreshed
            label="Last refreshed (questionnaires)"
            value={promsRefresh.label}
            compact
          />
          <LastRefreshed
            label="Last refreshed (hydration)"
            value={hydrationRefresh.label}
            compact
          />
          <LastRefreshed
            label="Last refreshed (nutrition)"
            value={nutritionRefresh.label}
            compact
          />
          <LastRefreshed
            label="Last refreshed (medications)"
            value={medicationsRefresh.label}
            compact
          />
          <LastRefreshed
            label="Last refreshed (photos)"
            value={photosRefresh.label}
            compact
          />
          <LastRefreshed
            label="Last refreshed (weekly report)"
            value={weeklyReportRefresh.label}
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
          <Text style={styles.statusDetail}>
            Pending PROM uploads: {pendingPromCount}
          </Text>
          <Text style={styles.statusDetail}>
            Pending hydration: {pendingHydrationCount}
          </Text>
          <Text style={styles.statusDetail}>
            Pending nutrition: {pendingNutritionCount}
          </Text>
          <Text style={styles.statusDetail}>
            Pending medication logs: {pendingMedicationCount}
          </Text>
          <Text style={styles.statusDetail}>
            Pending photos: {pendingPhotoCount}
          </Text>
          <Text style={styles.statusDetail}>
            Hydration today: {hydrationTodayMl !== null ? `${hydrationTodayMl} ml` : "Not cached"}
          </Text>
          <Text style={styles.statusDetail}>
            Nutrition today:{" "}
            {nutritionTodayLogged === null
              ? "Unknown"
              : nutritionTodayLogged
                ? "Logged"
                : "Not logged"}
          </Text>
          <Text style={styles.statusDetail}>
            Medications today:{" "}
            {medicationTodaySummary
              ? `${medicationTodaySummary.taken}/${medicationTodaySummary.total} taken`
              : "Not cached"}
          </Text>
          <Text style={styles.statusDetail}>
            Phase:{" "}
            {rehabSummary.status === "loading"
              ? "Loading cached status..."
              : rehabSummary.status === "set"
                ? rehabSummary.currentTitle
                : "Not set"}
          </Text>
          <Text style={styles.statusDetail}>
            Questionnaires due:{" "}
            {promSummary.status === "loading"
              ? "Loading cached count..."
              : promSummary.status === "hasDue"
                ? promSummary.dueCount
                : 0}
          </Text>
          <Text style={styles.statusDetail}>
            Weekly report:{" "}
            {weeklyReportAvailable === "loading"
              ? "Checking cache..."
              : weeklyReportAvailable === "available"
                ? "Available"
                : "Not cached"}
          </Text>
          <Text style={styles.statusDetail}>
            Symptom photos:{" "}
            {photoSummary.status === "loading"
              ? "Loading cached summary..."
              : photoSummary.status === "available"
                ? `Cached (${photoSummary.itemCount})`
                : "Not cached"}
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
          <PrimaryButton
            label="Hydration"
            onPress={() => router.push("/hydration" as never)}
          />
          <PrimaryButton
            label="Nutrition"
            onPress={() => router.push("/nutrition" as never)}
          />
          <PrimaryButton
            label="Medications"
            onPress={() => router.push("/medications" as never)}
          />
          <PrimaryButton
            label="Symptom photos"
            onPress={() => router.push("/symptom-photos" as never)}
          />
          <PrimaryButton
            label="Rehab journey"
            onPress={() => router.push("/rehab-journey" as never)}
          />
          <PrimaryButton
            label="PROMs"
            onPress={() => router.push("/proms" as never)}
          />
          <PrimaryButton
            label="Weekly report"
            onPress={() => router.push("/weekly-report" as never)}
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
            • Rehab journey: open timeline and confirm current phase.
          </Text>
          <Text style={styles.bullet}>
            • Session: start from Plan, complete 2 exercises, finish and open session detail.
          </Text>
          <Text style={styles.bullet}>
            • PROMs: open Questionnaires, complete due form, verify due moves to completed.
          </Text>
          <Text style={styles.bullet}>
            • Weekly report: open this week, then share report text.
          </Text>
          <Text style={styles.bullet}>
            • Hydration: tap +250ml/+500ml, go offline, add more, then sync pending when online.
          </Text>
          <Text style={styles.bullet}>
            • Nutrition: save today log, go offline and save again, then sync pending when online.
          </Text>
          <Text style={styles.bullet}>
            • Medications: mark dose Taken, go offline and mark another, then sync pending when online.
          </Text>
          <Text style={styles.bullet}>
            • Symptom photos: add online, then add offline and sync pending when back online.
          </Text>
          <Text style={styles.bullet}>
            • Offline session: finish while offline, then submit pending when online.
          </Text>
          <Text style={styles.bullet}>
            • Offline PROM: complete while offline, then submit pending when online.
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
