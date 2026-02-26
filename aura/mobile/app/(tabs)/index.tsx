import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import type { CheckInItem } from "@/src/api/patient";
import { Card } from "@/src/components/Card";
import { EmptyState } from "@/src/components/EmptyState";
import { IconButton } from "@/src/components/IconButton";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { Section } from "@/src/components/Section";
import { SkeletonBlock } from "@/src/components/Skeleton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrustBanner } from "@/src/components/TrustBanner";
import { useAuth } from "@/src/state/auth";
import { getCachedAppointmentRequests } from "@/src/state/appointmentsCache";
import { getCachedCheckins } from "@/src/state/checkinsCache";
import { getCachedExercisePlan } from "@/src/state/exercisePlanCache";
import { getCachedInsights } from "@/src/state/insightsCache";
import { getPendingHydration } from "@/src/state/pendingHydration";
import { getPendingMedicationLogs } from "@/src/state/pendingMedicationLogs";
import { getPendingNutrition } from "@/src/state/pendingNutrition";
import { getPendingPhotoUploads } from "@/src/state/pendingPhotoUploads";
import { getPendingPromSubmissions } from "@/src/state/pendingPromSubmissions";
import { getPending } from "@/src/state/pendingSessions";
import { getPendingWearablesSync } from "@/src/state/pendingWearablesSync";
import { getCachedProms } from "@/src/state/promsCache";
import { getCachedRehabPhases } from "@/src/state/rehabPhasesCache";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTrustStatus } from "@/src/state/trustStatus";
import { getCachedWeeklyReport } from "@/src/state/weeklyReportCache";
import { useTokens } from "@/src/theme/tokens";
import { addDaysISO, formatISOToHuman, startOfWeekMondayISO, todayISO } from "@/src/utils/date";

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

type CheckinSummary = {
  status: "loading" | "ready";
  lastDateISO: string | null;
  completedToday: boolean;
};

type PlanSummary = {
  status: "loading" | "assigned" | "none";
  itemCount: number;
  previewItems: string[];
};

type RehabSummary = {
  status: "loading" | "set" | "none";
  currentTitle: string;
};

type PromSummary = {
  status: "loading" | "hasDue" | "none";
  dueCount: number;
};

type WeeklySummary = {
  status: "loading" | "available" | "none";
  headline: string;
  highlightsCount: number;
};

type InsightSummary = {
  status: "loading" | "available" | "none";
  itemCount: number;
  top: Array<{ id: string; title: string; message: string }>;
};

type AppointmentSummary = {
  status: "loading" | "ready";
  pendingCount: number;
  nextApprovedLabel: string;
  hasUpcoming: boolean;
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

function toInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "AU";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function resolveCheckInDateISO(item: CheckInItem): string | null {
  if (typeof item.date === "string" && item.date.trim()) {
    return item.date.slice(0, 10);
  }

  if (typeof item.createdAt === "string" && item.createdAt.trim()) {
    return item.createdAt.slice(0, 10);
  }

  return null;
}

function parseCheckInTimestamp(item: CheckInItem): number {
  if (typeof item.createdAt === "string" && item.createdAt.trim()) {
    const parsed = Date.parse(item.createdAt);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const dateISO = resolveCheckInDateISO(item);
  if (!dateISO) {
    return 0;
  }

  const parsed = Date.parse(`${dateISO}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function HomeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const patientId = auth.patient?.id ?? "";
  const patientLabel = auth.patient?.displayName ?? auth.patient?.id ?? "Unknown";
  const patientPhotoUri = useMemo(() => extractPatientPhotoUri(auth.patient), [auth.patient]);
  const patientInitials = useMemo(() => toInitials(patientLabel), [patientLabel]);

  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const thisWeekStart = startOfWeekMondayISO(tzOffsetMinutes);
  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  const friendlyDate = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }).format(new Date()),
    []
  );

  const [pendingSummary, setPendingSummary] = useState<StatusSummary>(EMPTY_PENDING);
  const [checkinSummary, setCheckinSummary] = useState<CheckinSummary>({
    status: "loading",
    lastDateISO: null,
    completedToday: false,
  });
  const [planSummary, setPlanSummary] = useState<PlanSummary>({
    status: "loading",
    itemCount: 0,
    previewItems: [],
  });
  const [rehabSummary, setRehabSummary] = useState<RehabSummary>({
    status: "loading",
    currentTitle: "",
  });
  const [promSummary, setPromSummary] = useState<PromSummary>({
    status: "loading",
    dueCount: 0,
  });
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary>({
    status: "loading",
    headline: "",
    highlightsCount: 0,
  });
  const [insightSummary, setInsightSummary] = useState<InsightSummary>({
    status: "loading",
    itemCount: 0,
    top: [],
  });
  const [appointmentSummary, setAppointmentSummary] = useState<AppointmentSummary>({
    status: "loading",
    pendingCount: 0,
    nextApprovedLabel: "No upcoming appointments",
    hasUpcoming: false,
  });

  const checkinsRefresh = useLastRefreshed("checkins");
  const exercisePlanRefresh = useLastRefreshed("exercisePlan");
  const rehabPhasesRefresh = useLastRefreshed("rehabPhases");
  const promsRefresh = useLastRefreshed("proms");
  const weeklyReportRefresh = useLastRefreshed("weeklyReport");
  const insightsRefresh = useLastRefreshed("insights");
  const appointmentsRefresh = useLastRefreshed("appointments");

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

  const syncPill = useMemo(() => {
    if (trustStatus.kind === "offline") {
      return { label: "Offline", variant: "warning" as const };
    }

    if (trustStatus.kind === "serverDown") {
      return { label: "Service unavailable", variant: "warning" as const };
    }

    if (trustStatus.kind === "syncing") {
      const count = Math.max(0, trustStatus.pendingCount ?? totalPendingUploads);
      return {
        label: count > 0 ? `Pending ${count}` : "Syncing",
        variant: "info" as const,
      };
    }

    return { label: "Synced", variant: "success" as const };
  }, [totalPendingUploads, trustStatus]);

  const lastCheckinLabel = useMemo(() => {
    if (checkinSummary.status === "loading") {
      return "…";
    }

    if (!checkinSummary.lastDateISO) {
      return "—";
    }

    if (checkinSummary.lastDateISO === today) {
      return "Today";
    }

    if (checkinSummary.lastDateISO === yesterday) {
      return "Yesterday";
    }

    return formatISOToHuman(checkinSummary.lastDateISO);
  }, [checkinSummary.lastDateISO, checkinSummary.status, today, yesterday]);

  const isDashboardLoading =
    checkinSummary.status === "loading" ||
    planSummary.status === "loading" ||
    weeklySummary.status === "loading" ||
    insightSummary.status === "loading" ||
    appointmentSummary.status === "loading";

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

  useFocusEffect(
    useCallback(() => {
      void reloadPendingCounts();
      return undefined;
    }, [reloadPendingCounts])
  );

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setCheckinSummary({
        status: "ready",
        lastDateISO: null,
        completedToday: false,
      });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedCheckins(patientId);
      if (!active) {
        return;
      }

      if (!cached || cached.length === 0) {
        setCheckinSummary({
          status: "ready",
          lastDateISO: null,
          completedToday: false,
        });
        return;
      }

      const withDates = cached
        .map((item) => ({
          item,
          dateISO: resolveCheckInDateISO(item),
          timestamp: parseCheckInTimestamp(item),
        }))
        .filter((entry): entry is { item: CheckInItem; dateISO: string; timestamp: number } => {
          return Boolean(entry.dateISO);
        });

      if (withDates.length === 0) {
        setCheckinSummary({
          status: "ready",
          lastDateISO: null,
          completedToday: false,
        });
        return;
      }

      const sorted = [...withDates].sort((left, right) => right.timestamp - left.timestamp);
      const completedToday = withDates.some((entry) => entry.dateISO === today);
      setCheckinSummary({
        status: "ready",
        lastDateISO: sorted[0]?.dateISO ?? null,
        completedToday,
      });
    })();

    return () => {
      active = false;
    };
  }, [checkinsRefresh.lastRefreshedAt, patientId, today]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setPlanSummary({ status: "none", itemCount: 0, previewItems: [] });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedExercisePlan(patientId);
      if (!active) {
        return;
      }

      const items = cached?.response.plan?.items ?? [];
      if (items.length === 0) {
        setPlanSummary({ status: "none", itemCount: 0, previewItems: [] });
        return;
      }

      setPlanSummary({
        status: "assigned",
        itemCount: items.length,
        previewItems: items.slice(0, 3).map((item) => item.name),
      });
    })();

    return () => {
      active = false;
    };
  }, [exercisePlanRefresh.lastRefreshedAt, patientId]);

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
      setWeeklySummary({ status: "none", headline: "", highlightsCount: 0 });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedWeeklyReport(patientId, thisWeekStart);
      if (!active) {
        return;
      }

      if (!cached?.report) {
        setWeeklySummary({ status: "none", headline: "", highlightsCount: 0 });
        return;
      }

      setWeeklySummary({
        status: "available",
        headline: cached.report.summary.headline,
        highlightsCount: cached.report.summary.highlights.length,
      });
    })();

    return () => {
      active = false;
    };
  }, [patientId, thisWeekStart, weeklyReportRefresh.lastRefreshedAt]);

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
  }, [insightsRefresh.lastRefreshedAt, patientId]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setAppointmentSummary({
        status: "ready",
        pendingCount: 0,
        nextApprovedLabel: "No upcoming appointments",
        hasUpcoming: false,
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
      const nextApproved = approved.find((item) => Date.parse(item.startsAt) > Date.now()) ?? null;

      setAppointmentSummary({
        status: "ready",
        pendingCount,
        nextApprovedLabel: nextApproved
          ? new Date(nextApproved.startsAt).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "No upcoming appointments",
        hasUpcoming: Boolean(nextApproved),
      });
    })();

    return () => {
      active = false;
    };
  }, [appointmentsRefresh.lastRefreshedAt, patientId]);

  return (
    <Screen
      scroll
      contentContainerStyle={styles.container}
      banner={<TrustBanner status={trustStatus} />}
    >
      {/* Header area */}
      <View style={styles.headerRow}>
        <View style={styles.headerIdentity}>
          {patientPhotoUri ? (
            <Image source={{ uri: patientPhotoUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{patientInitials}</Text>
            </View>
          )}
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Today</Text>
            <Text style={styles.headerSubtitle}>{friendlyDate}</Text>
          </View>
        </View>
        <IconButton
          accessibilityLabel="Open Safety"
          label="!"
          onPress={() => {
            router.push("/safety" as never);
          }}
        />
      </View>

      {/* Status strip */}
      <View style={styles.statusStrip}>
        <StatusPill
          label={`Last check-in: ${lastCheckinLabel}`}
          variant={
            checkinSummary.completedToday
              ? "success"
              : checkinSummary.lastDateISO
                ? "info"
                : "neutral"
          }
        />
        <StatusPill label={syncPill.label} variant={syncPill.variant} />
      </View>

      {/* Primary card */}
      <Section
        title="Today’s check-in"
        subtitle="One check-in keeps your recovery timeline clear."
        card
        right={
          <StatusPill
            label={checkinSummary.completedToday ? "Completed" : "Not done"}
            variant={checkinSummary.completedToday ? "success" : "warning"}
          />
        }
      >
        {checkinSummary.status === "loading" ? (
          <View style={styles.skeletonStack}>
            <SkeletonBlock height={14} width="72%" />
            <SkeletonBlock height={48} width="100%" radius={12} />
          </View>
        ) : checkinSummary.completedToday ? (
          <View style={styles.actionStack}>
            <Text style={styles.bodyText}>You’ve already completed today’s check-in.</Text>
            <SecondaryButton
              label="View details"
              onPress={() => {
                router.push("/(tabs)/progress");
              }}
            />
          </View>
        ) : (
          <View style={styles.actionStack}>
            <Text style={styles.bodyText}>Your care team relies on today’s update.</Text>
            <PrimaryButton
              label="Start check-in"
              onPress={() => {
                router.push("/(tabs)/checkin");
              }}
            />
          </View>
        )}
      </Section>

      {/* Secondary card: Today plan */}
      <Section title="Today’s plan" subtitle="Preview your current exercise focus." card>
        {planSummary.status === "loading" ? (
          <View style={styles.skeletonStack}>
            <SkeletonBlock height={14} width="58%" />
            <SkeletonBlock height={14} width="64%" />
            <SkeletonBlock height={14} width="42%" />
            <SkeletonBlock height={48} width="100%" radius={12} />
          </View>
        ) : planSummary.status === "none" ? (
          <EmptyState
            variant="compact"
            illustrationKey="today"
            title="No plan assigned for today"
            description="Open your plan screen to review upcoming exercises."
            ctaLabel="Open plan"
            onCtaPress={() => {
              router.push("/exercise-plan");
            }}
          />
        ) : (
          <View style={styles.actionStack}>
            <Text style={styles.bodyText}>
              {planSummary.itemCount} exercise item{planSummary.itemCount === 1 ? "" : "s"} planned.
            </Text>
            <View style={styles.previewList}>
              {planSummary.previewItems.map((itemName, index) => (
                <Text key={`${itemName}-${index}`} style={styles.previewItem}>
                  {index + 1}. {itemName}
                </Text>
              ))}
            </View>
            <Text style={styles.supportText}>
              Rehab phase: {rehabSummary.status === "set" ? rehabSummary.currentTitle : "Not set"}
            </Text>
            <Text style={styles.supportText}>
              Questionnaires due: {promSummary.status === "hasDue" ? promSummary.dueCount : 0}
            </Text>
            <SecondaryButton
              label="Open plan"
              onPress={() => {
                router.push("/exercise-plan");
              }}
            />
          </View>
        )}
      </Section>

      {/* Secondary card: Insights */}
      <Section title="Insights" subtitle="Clinician-reviewed highlights from recent trends." card>
        {insightSummary.status === "loading" ? (
          <View style={styles.skeletonStack}>
            <SkeletonBlock height={14} width="50%" />
            <SkeletonBlock height={64} width="100%" radius={12} />
          </View>
        ) : insightSummary.status === "none" ? (
          <EmptyState
            variant="compact"
            illustrationKey="today"
            title="No reviewed insights yet"
            description="Insights will appear after clinician review."
          />
        ) : (
          <View style={styles.actionStack}>
            {insightSummary.top.map((item) => (
              <Card key={item.id} variant="outlined" padding={tokens.spacing.md}>
                <Text style={styles.insightTitle}>{item.title}</Text>
                <Text style={styles.insightMessage}>{item.message}</Text>
              </Card>
            ))}
            <Text style={styles.supportText}>
              {insightSummary.itemCount} approved insight
              {insightSummary.itemCount === 1 ? "" : "s"} available.
            </Text>
          </View>
        )}
        <SecondaryButton
          label="View all"
          onPress={() => {
            router.push("/insights" as never);
          }}
        />
      </Section>

      {/* Two-column row */}
      <View style={styles.twoColumnRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open weekly report"
          onPress={() => {
            router.push("/weekly-report" as never);
          }}
          style={({ pressed }) => [styles.compactPressable, pressed ? styles.compactPressed : null]}
        >
          <Card variant="outlined" padding={tokens.spacing.md} style={styles.compactCard}>
            <Text style={styles.compactTitle}>Weekly report</Text>
            {weeklySummary.status === "loading" ? (
              <View style={styles.skeletonStack}>
                <SkeletonBlock height={12} width="85%" />
                <SkeletonBlock height={12} width="55%" />
              </View>
            ) : weeklySummary.status === "none" ? (
              <EmptyState
                variant="compact"
                illustrationKey="weekly"
                title="No report yet"
                description="Open the report screen to refresh this week’s summary."
              />
            ) : (
              <View style={styles.compactBody}>
                <Text style={styles.compactDescription}>{weeklySummary.headline}</Text>
                <Text style={styles.compactMeta}>
                  {weeklySummary.highlightsCount} highlight
                  {weeklySummary.highlightsCount === 1 ? "" : "s"}
                </Text>
              </View>
            )}
          </Card>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open appointments"
          onPress={() => {
            router.push("/appointments" as never);
          }}
          style={({ pressed }) => [styles.compactPressable, pressed ? styles.compactPressed : null]}
        >
          <Card variant="outlined" padding={tokens.spacing.md} style={styles.compactCard}>
            <Text style={styles.compactTitle}>Next appointment</Text>
            {appointmentSummary.status === "loading" ? (
              <View style={styles.skeletonStack}>
                <SkeletonBlock height={12} width="72%" />
                <SkeletonBlock height={12} width="48%" />
              </View>
            ) : (
              <View style={styles.compactBody}>
                <Text style={styles.compactDescription}>{appointmentSummary.nextApprovedLabel}</Text>
                <Text style={styles.compactMeta}>
                  Pending requests: {appointmentSummary.pendingCount}
                </Text>
                {!appointmentSummary.hasUpcoming ? (
                  <Text style={styles.compactMeta}>No upcoming appointments</Text>
                ) : null}
              </View>
            )}
          </Card>
        </Pressable>
      </View>

      {/* Safety shortcut card */}
      <Section
        title="Need support now?"
        subtitle="Open your safety plan anytime."
        card
        cardVariant="outlined"
        right={<StatusPill label="Safety" variant="warning" />}
      >
        <Text style={styles.bodyText}>
          If symptoms escalate or you feel unsafe, open your Safety Plan now.
        </Text>
        <SecondaryButton
          label="Open Safety"
          onPress={() => {
            router.push("/safety" as never);
          }}
        />
      </Section>

      {isDashboardLoading ? (
        <Text style={styles.loadingFootnote}>Loading latest dashboard data…</Text>
      ) : null}
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xl,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
    },
    headerIdentity: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
    },
    avatarImage: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
    },
    avatarFallback: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitials: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    headerCopy: {
      flex: 1,
      gap: 2,
    },
    headerTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.title.fontSize,
      lineHeight: tokens.typography.title.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    headerSubtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    statusStrip: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    actionStack: {
      gap: tokens.spacing.sm,
    },
    bodyText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    supportText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    previewList: {
      gap: tokens.spacing.xs,
    },
    previewItem: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    insightTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      marginBottom: tokens.spacing.xs,
    },
    insightMessage: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    twoColumnRow: {
      flexDirection: "row",
      gap: tokens.spacing.md,
      alignItems: "stretch",
    },
    compactPressable: {
      flex: 1,
      minWidth: 0,
    },
    compactPressed: {
      opacity: 0.85,
    },
    compactCard: {
      height: "100%",
      gap: tokens.spacing.sm,
    },
    compactTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    compactBody: {
      gap: tokens.spacing.xs,
    },
    compactDescription: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    compactMeta: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    skeletonStack: {
      gap: tokens.spacing.sm,
    },
    loadingFootnote: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textAlign: "center",
    },
  });
}
