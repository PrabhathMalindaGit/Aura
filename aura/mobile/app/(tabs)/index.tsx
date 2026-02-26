import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Card } from "@/src/components/Card";
import { EmptyState } from "@/src/components/EmptyState";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { Section } from "@/src/components/Section";
import { StatusPill } from "@/src/components/StatusPill";
import { TrustBanner } from "@/src/components/TrustBanner";
import { useAuth } from "@/src/state/auth";
import { getCachedAppointmentRequests } from "@/src/state/appointmentsCache";
import { getUsage } from "@/src/state/copingUsage";
import { getCachedExercisePlan } from "@/src/state/exercisePlanCache";
import { getCachedHydrationDay } from "@/src/state/hydrationCache";
import { getCachedInsights } from "@/src/state/insightsCache";
import { getCachedMedicationToday } from "@/src/state/medicationTodayCache";
import { getCachedNutritionDay } from "@/src/state/nutritionCache";
import { getCachedPhotosList } from "@/src/state/photosCache";
import { getCachedProms } from "@/src/state/promsCache";
import { getCachedRehabPhases } from "@/src/state/rehabPhasesCache";
import { getPendingWearablesSync } from "@/src/state/pendingWearablesSync";
import { getCachedWeeklyReport } from "@/src/state/weeklyReportCache";
import { getCachedWearables } from "@/src/state/wearablesCache";
import { getWearablesConnected } from "@/src/state/wearablesConnection";
import { getPendingNutrition } from "@/src/state/pendingNutrition";
import { getPendingHydration } from "@/src/state/pendingHydration";
import { getPendingMedicationLogs } from "@/src/state/pendingMedicationLogs";
import { getPendingPhotoUploads } from "@/src/state/pendingPhotoUploads";
import { getPendingPromSubmissions } from "@/src/state/pendingPromSubmissions";
import { getPending } from "@/src/state/pendingSessions";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTrustStatus } from "@/src/state/trustStatus";
import { useTokens } from "@/src/theme/tokens";
import { startOfWeekMondayISO, todayISO } from "@/src/utils/date";

// Layout: Single Screen wrapper; avoid nested ScrollView.
type StatusSummary = {
  pendingSessions: number;
  pendingProms: number;
  pendingHydration: number;
  pendingNutrition: number;
  pendingMedication: number;
  pendingPhotos: number;
  pendingWearables: number;
};

type CopingSummary = {
  breathingCount: number;
  groundingCount: number;
};

const EMPTY_PENDING: StatusSummary = {
  pendingSessions: 0,
  pendingProms: 0,
  pendingHydration: 0,
  pendingNutrition: 0,
  pendingMedication: 0,
  pendingPhotos: 0,
  pendingWearables: 0,
};

export default function HomeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const patientId = auth.patient?.id ?? "";
  const patientLabel = auth.patient?.displayName ?? auth.patient?.id ?? "Unknown";
  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const thisWeekStart = startOfWeekMondayISO(tzOffsetMinutes);
  const today = todayISO();

  const [planSummary, setPlanSummary] = useState<{
    status: "loading" | "assigned" | "none";
    itemCount: number;
  }>({ status: "loading", itemCount: 0 });
  const [rehabSummary, setRehabSummary] = useState<{
    status: "loading" | "set" | "none";
    currentTitle: string;
  }>({ status: "loading", currentTitle: "" });
  const [promSummary, setPromSummary] = useState<{
    status: "loading" | "hasDue" | "none";
    dueCount: number;
  }>({ status: "loading", dueCount: 0 });
  const [weeklyReportAvailable, setWeeklyReportAvailable] = useState<
    "loading" | "available" | "none"
  >("loading");
  const [insightSummary, setInsightSummary] = useState<{
    status: "loading" | "available" | "none";
    itemCount: number;
    top: Array<{ id: string; title: string; message: string }>;
  }>({ status: "loading", itemCount: 0, top: [] });
  const [hydrationTodayMl, setHydrationTodayMl] = useState<number | null>(null);
  const [nutritionTodayLogged, setNutritionTodayLogged] = useState<boolean | null>(null);
  const [medicationTodaySummary, setMedicationTodaySummary] = useState<{
    taken: number;
    total: number;
  } | null>(null);
  const [wearablesSummary, setWearablesSummary] = useState<{
    connected: boolean;
    avgSteps: number | null;
    trackedDays: number;
  }>({ connected: false, avgSteps: null, trackedDays: 0 });
  const [appointmentSummary, setAppointmentSummary] = useState<{
    pendingCount: number;
    nextApprovedLabel: string;
  }>({ pendingCount: 0, nextApprovedLabel: "None" });
  const [pendingSummary, setPendingSummary] = useState<StatusSummary>(EMPTY_PENDING);
  const [photoSummary, setPhotoSummary] = useState<{
    status: "loading" | "available" | "none";
    itemCount: number;
  }>({ status: "loading", itemCount: 0 });
  const [copingSummary, setCopingSummary] = useState<CopingSummary>({
    breathingCount: 0,
    groundingCount: 0,
  });

  const exercisePlanRefresh = useLastRefreshed("exercisePlan");
  const rehabPhasesRefresh = useLastRefreshed("rehabPhases");
  const promsRefresh = useLastRefreshed("proms");
  const weeklyReportRefresh = useLastRefreshed("weeklyReport");
  const insightsRefresh = useLastRefreshed("insights");
  const hydrationRefresh = useLastRefreshed("hydration");
  const nutritionRefresh = useLastRefreshed("nutrition");
  const medicationsRefresh = useLastRefreshed("medications");
  const wearablesRefresh = useLastRefreshed("wearables");
  const appointmentsRefresh = useLastRefreshed("appointments");
  const photosRefresh = useLastRefreshed("photos");

  const totalPendingUploads = useMemo(
    () =>
      pendingSummary.pendingSessions +
      pendingSummary.pendingProms +
      pendingSummary.pendingHydration +
      pendingSummary.pendingNutrition +
      pendingSummary.pendingMedication +
      pendingSummary.pendingPhotos +
      pendingSummary.pendingWearables,
    [pendingSummary]
  );
  const trustStatus = useTrustStatus({
    patientId,
    pendingCountOverride: totalPendingUploads,
  });
  const showCarePlanEmpty = useMemo(
    () =>
      planSummary.status === "none" &&
      rehabSummary.status === "none" &&
      promSummary.status === "none" &&
      weeklyReportAvailable === "none",
    [planSummary.status, promSummary.status, rehabSummary.status, weeklyReportAvailable]
  );

  const reloadPendingCounts = useCallback(async (): Promise<void> => {
    if (!patientId) {
      setPendingSummary(EMPTY_PENDING);
      return;
    }

    const [
      pendingSessions,
      pendingProms,
      pendingHydration,
      pendingNutrition,
      pendingMedication,
      pendingPhotos,
      pendingWearables,
    ] = await Promise.all([
      getPending(patientId),
      getPendingPromSubmissions(patientId),
      getPendingHydration(patientId),
      getPendingNutrition(patientId),
      getPendingMedicationLogs(patientId),
      getPendingPhotoUploads(patientId),
      getPendingWearablesSync(patientId),
    ]);

    setPendingSummary({
      pendingSessions: pendingSessions.length,
      pendingProms: pendingProms.length,
      pendingHydration: pendingHydration.length,
      pendingNutrition: pendingNutrition.length,
      pendingMedication: pendingMedication.length,
      pendingPhotos: pendingPhotos.length,
      pendingWearables: pendingWearables.length,
    });
  }, [patientId]);

  const loadCopingUsage = useCallback(async (): Promise<void> => {
    const [breathing, grounding] = await Promise.all([
      getUsage("breathing"),
      getUsage("grounding"),
    ]);
    setCopingSummary({
      breathingCount: breathing.count,
      groundingCount: grounding.count,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reloadPendingCounts();
      void loadCopingUsage();
      return undefined;
    }, [reloadPendingCounts, loadCopingUsage])
  );

  useEffect(() => {
    let active = true;
    if (!patientId) {
      setPlanSummary({ status: "none", itemCount: 0 });
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
      setRehabSummary({ status: "none", currentTitle: "" });
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
        setRehabSummary({ status: "none", currentTitle: "" });
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
      setPromSummary({ status: "none", dueCount: 0 });
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
      setPhotoSummary({ status: "none", itemCount: 0 });
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
        setPhotoSummary({ status: "none", itemCount: 0 });
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
      setInsightSummary({ status: "none", itemCount: 0, top: [] });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedInsights(patientId);
      if (!active) {
        return;
      }

      if (!cached || cached.items.length === 0) {
        setInsightSummary({ status: "none", itemCount: 0, top: [] });
        return;
      }

      setInsightSummary({
        status: "available",
        itemCount: cached.items.length,
        top: cached.items.slice(0, 1).map((item) => ({
          id: item.id,
          title: item.title,
          message: item.message,
        })),
      });
    })();

    return () => {
      active = false;
    };
  }, [patientId, insightsRefresh.lastRefreshedAt]);

  useEffect(() => {
    let active = true;
    if (!patientId) {
      setHydrationTodayMl(null);
      return () => {
        active = false;
      };
    }

    void (async () => {
      const [cached, pending] = await Promise.all([
        getCachedHydrationDay(patientId, today),
        getPendingHydration(patientId),
      ]);
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
      const [cached, pending] = await Promise.all([
        getCachedNutritionDay(patientId, today),
        getPendingNutrition(patientId),
      ]);
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

  useEffect(() => {
    let active = true;
    if (!patientId) {
      setWearablesSummary({
        connected: false,
        avgSteps: null,
        trackedDays: 0,
      });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const [cached, connected] = await Promise.all([
        getCachedWearables(patientId),
        getWearablesConnected(patientId),
      ]);
      if (!active) {
        return;
      }
      setWearablesSummary({
        connected,
        avgSteps: cached?.summary?.avgSteps ?? null,
        trackedDays:
          cached?.summary?.trackedDays ??
          (Array.isArray(cached?.last7Days) ? cached.last7Days.length : 0),
      });
    })();

    return () => {
      active = false;
    };
  }, [patientId, wearablesRefresh.lastRefreshedAt]);

  useEffect(() => {
    let active = true;
    if (!patientId) {
      setAppointmentSummary({
        pendingCount: 0,
        nextApprovedLabel: "None",
      });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedAppointmentRequests(patientId);
      if (!active) {
        return;
      }

      const requests = cached?.requests ?? [];
      const pendingCount = requests.filter((item) => item.status === "pending").length;
      const approved = requests
        .filter((item) => item.status === "approved")
        .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
      const nextApproved =
        approved.find((item) => Date.parse(item.startsAt) > Date.now()) ?? approved[0];

      setAppointmentSummary({
        pendingCount,
        nextApprovedLabel: nextApproved
          ? new Date(nextApproved.startsAt).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "None",
      });
    })();

    return () => {
      active = false;
    };
  }, [patientId, appointmentsRefresh.lastRefreshedAt]);

  return (
    <Screen
      title="Home"
      scroll
      contentContainerStyle={styles.container}
      banner={<TrustBanner status={trustStatus} />}
    >
      <Section
        title="Today"
        card
        right={
          <StatusPill
            label={totalPendingUploads > 0 ? "Pending sync" : "Up to date"}
            variant={totalPendingUploads > 0 ? "warning" : "success"}
          />
        }
      >
          <Text style={styles.titleLine}>Welcome back, {patientLabel}.</Text>
          <Text style={styles.detailLine}>
            Pending sync items: {totalPendingUploads}
          </Text>
          <View style={styles.buttonStack}>
            <PrimaryButton
              label="Start check-in"
              onPress={() => router.push("/(tabs)/checkin")}
            />
            <SecondaryButton
              label="Open chat"
              onPress={() => router.push("/(tabs)/chat")}
            />
            <SecondaryButton
              label="Open progress"
              onPress={() => router.push("/(tabs)/progress")}
            />
            <SecondaryButton
              label="Safety"
              onPress={() => router.push("/safety" as never)}
            />
          </View>
      </Section>

      <Section
        title="Care plan"
        card
        right={
          <StatusPill
            label={
              weeklyReportAvailable === "available"
                ? "Report ready"
                : weeklyReportAvailable === "loading"
                  ? "Checking"
                  : "No report"
            }
            variant={weeklyReportAvailable === "available" ? "info" : "neutral"}
          />
        }
      >
          {showCarePlanEmpty ? (
            <EmptyState
              variant="compact"
              illustrationKey="weekly"
              title="Care plan summary will appear here"
              description="Once your plan and weekly report are available, this card will show key updates."
            />
          ) : null}
          <Text style={styles.detailLine}>
            Today&apos;s plan:{" "}
            {planSummary.status === "loading"
              ? "Checking..."
              : planSummary.status === "assigned"
                ? `${planSummary.itemCount} exercise item${
                    planSummary.itemCount === 1 ? "" : "s"
                  }`
                : "No plan assigned"}
          </Text>
          <Text style={styles.detailLine}>
            Rehab phase:{" "}
            {rehabSummary.status === "loading"
              ? "Checking..."
              : rehabSummary.status === "set"
                ? rehabSummary.currentTitle
                : "Not set"}
          </Text>
          <Text style={styles.detailLine}>
            Questionnaires due:{" "}
            {promSummary.status === "loading"
              ? "Checking..."
              : promSummary.status === "hasDue"
                ? promSummary.dueCount
                : 0}
          </Text>
          <Text style={styles.detailLine}>
            Weekly report:{" "}
            {weeklyReportAvailable === "loading"
              ? "Checking..."
              : weeklyReportAvailable === "available"
                ? "Available"
                : "Not cached yet"}
          </Text>
          <View style={styles.buttonStack}>
            <SecondaryButton
              label="Today’s plan"
              onPress={() => router.push("/exercise-plan")}
            />
            <SecondaryButton
              label="Questionnaires"
              onPress={() => router.push("/proms" as never)}
            />
            <SecondaryButton
              label="Weekly report"
              onPress={() => router.push("/weekly-report" as never)}
            />
          </View>
      </Section>

      <Section
        title="Insights"
        card
        right={
          <StatusPill
            label={insightSummary.status === "available" ? "Reviewed" : "Pending"}
            variant={insightSummary.status === "available" ? "success" : "neutral"}
          />
        }
      >
          {insightSummary.status === "loading" ? (
            <Text style={styles.detailLine}>Loading reviewed insights…</Text>
          ) : insightSummary.status === "none" ? (
            <EmptyState
              variant="compact"
              illustrationKey="today"
              title="No reviewed insights yet"
              description="Insights will appear after your care team reviews recent trends."
            />
          ) : (
            <View style={styles.cardList}>
              {insightSummary.top.map((item) => (
                <Card key={item.id} variant="outlined" padding={tokens.spacing.md}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardMessage}>{item.message}</Text>
                </Card>
              ))}
              <Text style={styles.detailLine}>
                {insightSummary.itemCount} approved insight
                {insightSummary.itemCount === 1 ? "" : "s"}.
              </Text>
            </View>
          )}
          <SecondaryButton
            label="View all insights"
            onPress={() => router.push("/insights" as never)}
          />
      </Section>

      <Section title="Daily signals" card cardVariant="outlined">
          <Text style={styles.detailLine}>
            Hydration today: {hydrationTodayMl !== null ? `${hydrationTodayMl} ml` : "Not logged"}
          </Text>
          <Text style={styles.detailLine}>
            Nutrition today:{" "}
            {nutritionTodayLogged === null
              ? "Unknown"
              : nutritionTodayLogged
                ? "Logged"
                : "Not logged"}
          </Text>
          <Text style={styles.detailLine}>
            Medications today:{" "}
            {medicationTodaySummary
              ? `${medicationTodaySummary.taken}/${medicationTodaySummary.total} taken`
              : "Not logged"}
          </Text>
          <Text style={styles.detailLine}>
            Wearables:{" "}
            {wearablesSummary.connected
              ? wearablesSummary.trackedDays > 0
                ? `Avg ${wearablesSummary.avgSteps ?? "—"} steps (${wearablesSummary.trackedDays}d)`
                : "Connected (no sync yet)"
              : "Not connected"}
          </Text>
          <Text style={styles.detailLine}>
            Symptom photos:{" "}
            {photoSummary.status === "loading"
              ? "Checking..."
              : photoSummary.status === "available"
                ? `${photoSummary.itemCount} saved`
              : "None"}
          </Text>
          <View style={styles.buttonStack}>
            <SecondaryButton
              label="Hydration"
              onPress={() => router.push("/hydration" as never)}
            />
            <SecondaryButton
              label="Nutrition"
              onPress={() => router.push("/nutrition" as never)}
            />
            <SecondaryButton
              label="Medications"
              onPress={() => router.push("/medications" as never)}
            />
            <SecondaryButton
              label="Wearables"
              onPress={() => router.push("/wearables" as never)}
            />
            <SecondaryButton
              label="Symptom photos"
              onPress={() => router.push("/symptom-photos" as never)}
            />
          </View>
      </Section>

      <Section
        title="Appointments and support"
        card
        right={
          <StatusPill
            label={appointmentSummary.pendingCount > 0 ? "Needs review" : "Stable"}
            variant={appointmentSummary.pendingCount > 0 ? "warning" : "neutral"}
          />
        }
      >
          <Text style={styles.detailLine}>
            Requests pending: {appointmentSummary.pendingCount}
          </Text>
          <Text style={styles.detailLine}>
            Next approved: {appointmentSummary.nextApprovedLabel}
          </Text>
          <Text style={styles.detailLine}>
            Coping tools used: breathing {copingSummary.breathingCount}, grounding{" "}
            {copingSummary.groundingCount}
          </Text>
          <View style={styles.buttonStack}>
            <SecondaryButton
              label="Appointments"
              onPress={() => router.push("/appointments" as never)}
            />
            <SecondaryButton
              label="Coping tools"
              onPress={() => router.push("/coping-tools" as never)}
            />
            <SecondaryButton
              label="Settings"
              onPress={() => router.push("/(tabs)/settings")}
            />
          </View>
      </Section>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.lg,
    },
    titleLine: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.text,
      fontWeight: tokens.typography.weights.semibold,
    },
    detailLine: {
      fontSize: 13,
      lineHeight: 18,
      color: tokens.colors.textMuted,
    },
    cardList: {
      gap: tokens.spacing.sm,
    },
    buttonStack: {
      gap: tokens.spacing.sm,
    },
    cardTitle: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.text,
    },
    cardMessage: {
      fontSize: 13,
      lineHeight: 18,
      color: tokens.colors.textMuted,
    },
  });
}
