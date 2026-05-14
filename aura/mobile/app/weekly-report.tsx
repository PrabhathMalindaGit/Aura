import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { isApiError, type ApiError } from "@/src/api/client";
import { getWeeklyReport, type WeeklyReport } from "@/src/api/patient";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { EmptyState } from "@/src/components/EmptyState";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard, type MediaCardProps } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { Section } from "@/src/components/Section";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import {
  getCachedWeeklyReport,
  setCachedWeeklyReport,
} from "@/src/state/weeklyReportCache";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
import { addDaysISO, startOfWeekMondayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type WeekPreset = "this" | "last";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

function toFriendlyError(error: unknown, title: string): {
  title: string;
  message: string;
  kind: "offline" | "network" | "server" | "validation" | "unknown";
  retryable: boolean;
} {
  let appError: ApiError;
  if (isApiError(error)) {
    appError = error;
  } else {
    const fallback = normalizeUnknownError(error);
    appError = {
      title: fallback.title,
      message: fallback.message,
      kind: fallback.kind,
      retryable: fallback.retryable,
      detail: fallback.detail,
    };
  }

  if (appError.kind === "offline") {
    return {
      title,
      message: "You’re offline. Nothing was loaded.",
      kind: "offline",
      retryable: true,
    };
  }

  if (appError.kind === "network") {
    return {
      title,
      message: "Couldn’t reach the service. Please try again.",
      kind: "network",
      retryable: true,
    };
  }

  if (appError.kind === "server") {
    return {
      title,
      message: "Service unavailable. Please try again shortly.",
      kind: "server",
      retryable: true,
    };
  }

  if (appError.kind === "validation") {
    return {
      title,
      message: appError.message || "Please review your request and try again.",
      kind: "validation",
      retryable: false,
    };
  }

  return {
    title,
    message: appError.message || "Something went wrong. Please try again.",
    kind: "unknown",
    retryable: true,
  };
}

function numberOrDash(value: number | null): string {
  return value === null ? "—" : String(value);
}

function pctOrDash(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  if (variant === "error") {
    return "danger";
  }
  return variant;
}

function buildShareText(report: WeeklyReport): string {
  const lines: string[] = [
    `Aura Weekly Report (${report.period.weekStart} to ${report.period.weekEnd})`,
    "",
    report.summary.headline,
    "",
    "Highlights:",
    ...report.summary.highlights.map((item) => `- ${item}`),
    "",
    `Check-ins: ${report.checkins.count}, avg pain ${numberOrDash(report.checkins.avgPain)}, avg mood ${numberOrDash(report.checkins.avgMood)}, exercises ${pctOrDash(report.checkins.avgExercisesPct)}`,
    `Top pain areas: ${
      report.bodyMap.topRegions.length > 0
        ? report.bodyMap.topRegions
            .map((entry) => `${entry.label} (${entry.count})`)
            .join(", ")
        : "—"
    }`,
    `Sleep: tracked nights ${report.sleep.trackedNights}, avg hours ${numberOrDash(report.sleep.avgHours)}, avg quality ${numberOrDash(report.sleep.avgQuality)}`,
    `Symptom photos: ${report.photos.uploadedThisWeek} uploaded (swelling ${report.photos.kinds.swelling}, wound ${report.photos.kinds.wound}, rash ${report.photos.kinds.rash}, other ${report.photos.kinds.other})`,
    `Hydration: tracked days ${report.hydration.trackedDays}, avg daily ${numberOrDash(report.hydration.avgDailyMl)} ml, total ${report.hydration.totalMl} ml, goal days ${report.hydration.daysMeetingTarget}/${report.hydration.trackedDays}`,
    `Nutrition: tracked days ${report.nutrition.trackedDays}, avg fruit/veg ${numberOrDash(report.nutrition.avgFruitVegServings)}, protein OK/high days ${report.nutrition.proteinOkHighDays}, anti-inflammatory days ${report.nutrition.antiInflammatoryDays}, regular meals days ${report.nutrition.regularMealsDays}`,
    `Wearables: tracked days ${report.wearables?.trackedDays ?? 0}, avg steps ${numberOrDash(report.wearables?.avgSteps ?? null)}, avg active minutes ${numberOrDash(report.wearables?.avgActiveMinutes ?? null)} (source ${report.wearables?.source ?? "mock"})`,
    `Medications: scheduled ${report.medications.scheduledDoses}, taken ${report.medications.takenDoses}, skipped ${report.medications.skippedDoses}, adherence ${pctOrDash(report.medications.adherencePct)}`,
    `Exercise sessions: ${report.exercises.sessionCount}, duration ${report.exercises.totalDurationMinutes} min, completion ${report.exercises.completedExercises}/${report.exercises.totalExercises}`,
    `PROMs: due now ${report.proms.dueNowCount}, completed this week ${report.proms.completedThisWeekCount}`,
    `Safety: alerts ${report.safety.alertsCreatedThisWeek}, high-risk ${report.safety.highRiskAlertsThisWeek}`,
    "",
    "Next steps:",
    ...report.summary.nextSteps.map((item) => `- ${item}`),
  ];

  return lines.join("\n");
}

function WeeklyReportLoadingState({
  title,
  styles,
  tokens,
}: {
  title: string;
  styles: ReturnType<typeof createStyles>;
  tokens: ReturnType<typeof useTokens>;
}) {
  return (
    <Section
      title={title}
      subtitle="Preparing the latest weekly signals without shifting the review controls."
      right={<StatusPill label="Loading" variant="neutral" accessible={false} />}
      card
      cardVariant="elevated"
    >
      <View
        style={styles.loadingPanel}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading weekly summary"
      >
        <View style={styles.loadingRow}>
          <ActivityIndicator
            size="small"
            color={tokens.colors.primary}
            accessibilityLabel="Loading weekly summary"
          />
          <Text style={styles.loadingText}>Preparing weekly summary</Text>
        </View>
        <View style={styles.loadingSkeleton}>
          <View style={[styles.skeletonLine, styles.skeletonLineStrong]} />
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
        </View>
      </View>
    </Section>
  );
}

export default function WeeklyReportScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const weeklyRefresh = useLastRefreshed("weeklyReport");
  const weeklyLoadError = useLastError("weeklyReportLoad");
  const refreshWeeklyReportLocal = weeklyRefresh.refreshLocal;
  const clearWeeklyReportLoadError = weeklyLoadError.clear;
  const setWeeklyReportLoadError = weeklyLoadError.setLocalError;
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const patientId = auth.patient?.id ?? "";
  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const thisWeekStart = useMemo(
    () => startOfWeekMondayISO(tzOffsetMinutes),
    [tzOffsetMinutes]
  );
  const lastWeekStart = useMemo(
    () => addDaysISO(thisWeekStart, -7),
    [thisWeekStart]
  );

  const [selectedWeek, setSelectedWeek] = useState<WeekPreset>("this");
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDevDiagnostics, setShowDevDiagnostics] = useState(false);
  const latestLoadRequestRef = useRef(0);

  const activeWeekStart = selectedWeek === "this" ? thisWeekStart : lastWeekStart;

  const loadReport = useCallback(
    async (
      mode: "initial" | "refresh" = "initial",
      weekStart: string = activeWeekStart
    ) => {
      if (!auth.token || !patientId) {
        return;
      }

      const requestId = latestLoadRequestRef.current + 1;
      latestLoadRequestRef.current = requestId;
      const isLatestRequest = () => latestLoadRequestRef.current === requestId;

      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
        setReport((current) =>
          current?.period.weekStart === weekStart ? current : null
        );
      }

      setNotice(null);

      if (isOffline) {
        const cached = await getCachedWeeklyReport(patientId, weekStart);
        if (!isLatestRequest()) {
          return;
        }
        if (cached) {
          setReport(cached.report);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — showing a saved weekly summary.",
          });
        } else {
          setReport(null);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — no saved weekly summary is available for this week yet.",
          });
        }

        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const live = await getWeeklyReport(auth.token, {
          weekStart,
          tzOffsetMinutes,
        });

        await setCachedWeeklyReport(patientId, weekStart, live);
        if (!isLatestRequest()) {
          return;
        }
        setReport(live);
        await refreshWeeklyReportLocal();
        await clearWeeklyReportLoadError();
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t load weekly summary");
        await setWeeklyReportLoadError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const cached = await getCachedWeeklyReport(patientId, weekStart);
        if (!isLatestRequest()) {
          return;
        }
        if (cached) {
          setReport(cached.report);
          setNotice({
            variant: "warning",
            title: friendly.title,
            message: "Showing a saved summary. Live refresh failed.",
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadReport("refresh", weekStart);
                }
              : undefined,
          });
        } else {
          setReport(null);
          setNotice({
            variant: "error",
            title: friendly.title,
            message: friendly.message,
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadReport("refresh", weekStart);
                }
              : undefined,
          });
        }
      } finally {
        if (isLatestRequest()) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [
      activeWeekStart,
      auth.token,
      clearWeeklyReportLoadError,
      isOffline,
      patientId,
      refreshWeeklyReportLocal,
      setWeeklyReportLoadError,
      tzOffsetMinutes,
    ]
  );

  useEffect(() => {
    if (auth.status !== "signedIn") {
      return;
    }
    void loadReport("initial", activeWeekStart);
  }, [activeWeekStart, auth.status, loadReport]);

  const shareReport = useCallback(async () => {
    if (!report) {
      return;
    }

    try {
      await Share.share({
        message: buildShareText(report),
      });
    } catch {
      setNotice({
        variant: "error",
        title: "Share failed",
        message: "Could not open share sheet. Please try again.",
      });
    }
  }, [report]);

  const cards = useMemo<Array<MediaCardProps & { key: string }>>(() => {
    if (!report) {
      return [];
    }

    return [
      {
        key: "checkins",
        leading: { type: "icon", icon: "checkin", tone: "accent" },
        title: "Check-ins",
        subtitle: `${report.checkins.count} entries this week · notes ${report.checkins.notesCount}`,
        chips: [
          { text: `Pain ${numberOrDash(report.checkins.avgPain)}` },
          { text: `Mood ${numberOrDash(report.checkins.avgMood)}` },
          { text: `Exercise ${pctOrDash(report.checkins.avgExercisesPct)}` },
        ],
      },
      {
        key: "pain-areas",
        leading: { type: "icon", icon: "checkin", tone: "warning" },
        title: "Top pain areas",
        subtitle:
          report.bodyMap.topRegions.length > 0
            ? report.bodyMap.topRegions
                .slice(0, 2)
                .map((entry) => `${entry.label} (${entry.count})`)
                .join(" · ")
            : "No localized pain areas logged.",
        chips:
          report.bodyMap.topRegions.length > 0
            ? report.bodyMap.topRegions.slice(0, 3).map((entry) => ({
                text: `${entry.label} ${entry.avgIntensity ?? "—"}/10`,
                tone: "muted" as const,
              }))
            : undefined,
      },
      {
        key: "sleep",
        leading: { type: "icon", icon: "sleep", tone: "muted" },
        title: "Sleep",
        subtitle: `Tracked nights ${report.sleep.trackedNights}`,
        chips: [
          { text: `Avg hours ${numberOrDash(report.sleep.avgHours)}` },
          { text: `Quality ${numberOrDash(report.sleep.avgQuality)}` },
        ],
      },
      {
        key: "photos",
        leading: { type: "icon", icon: "photos", tone: "accent" },
        title: "Symptom photos",
        subtitle: `${report.photos.uploadedThisWeek} uploaded this week`,
        chips: [
          { text: `Swelling ${report.photos.kinds.swelling}` },
          { text: `Wound ${report.photos.kinds.wound}` },
          { text: `Rash ${report.photos.kinds.rash}` },
        ],
      },
      {
        key: "hydration",
        leading: { type: "icon", icon: "hydration", tone: "accent" },
        title: "Hydration",
        subtitle: `${report.hydration.totalMl} ml this week · target ${report.hydration.targetMl} ml/day`,
        chips: [
          { text: `Tracked ${report.hydration.trackedDays}` },
          { text: `Avg ${numberOrDash(report.hydration.avgDailyMl)} ml` },
          {
            text: `Goal days ${report.hydration.daysMeetingTarget}/${report.hydration.trackedDays}`,
          },
        ],
      },
      {
        key: "nutrition",
        leading: { type: "icon", icon: "nutrition", tone: "muted" },
        title: "Nutrition",
        subtitle: `Tracked ${report.nutrition.trackedDays} days`,
        chips: [
          { text: `Fruit/veg ${numberOrDash(report.nutrition.avgFruitVegServings)}` },
          { text: `Protein OK/high ${report.nutrition.proteinOkHighDays}` },
          { text: `Anti-inflammatory ${report.nutrition.antiInflammatoryDays}` },
        ],
      },
      {
        key: "wearables",
        leading: { type: "icon", icon: "wearables", tone: "muted" },
        title: "Wearables",
        subtitle: `Source ${report.wearables?.source ?? "mock"} · tracked ${report.wearables?.trackedDays ?? 0} days`,
        chips: [
          { text: `Steps ${numberOrDash(report.wearables?.avgSteps ?? null)}` },
          {
            text: `Active ${numberOrDash(report.wearables?.avgActiveMinutes ?? null)} min`,
          },
        ],
      },
      {
        key: "medications",
        leading: { type: "icon", icon: "meds", tone: "accent" },
        title: "Medications",
        subtitle: `${report.medications.takenDoses}/${report.medications.scheduledDoses} taken`,
        chips: [
          { text: `Taken ${report.medications.takenDoses}`, tone: "success" },
          { text: `Skipped ${report.medications.skippedDoses}`, tone: "warning" },
          { text: `Adherence ${pctOrDash(report.medications.adherencePct)}` },
        ],
      },
      {
        key: "exercises",
        leading: { type: "icon", icon: "exercise", tone: "accent" },
        title: "Exercise sessions",
        subtitle: `${report.exercises.sessionCount} sessions · ${report.exercises.totalDurationMinutes} min total`,
        chips: [
          {
            text: `Completed ${report.exercises.completedExercises}/${report.exercises.totalExercises}`,
          },
          { text: `Pain ${numberOrDash(report.exercises.avgPainDuring)}` },
          {
            text: `Hard ${report.exercises.difficulty.hard}`,
            tone: report.exercises.difficulty.hard > 0 ? "warning" : "muted",
          },
        ],
      },
      {
        key: "proms",
        leading: { type: "icon", icon: "proms", tone: "muted" },
        title: "Questionnaires",
        subtitle: `${report.proms.completedThisWeekCount} completed this week`,
        chips: [
          { text: `Due now ${report.proms.dueNowCount}` },
          {
            text: report.proms.latestCompleted
              ? `${report.proms.latestCompleted.normalized} (${report.proms.latestCompleted.bandLabel})`
              : "Latest —",
          },
        ],
      },
      {
        key: "safety",
        leading: { type: "icon", icon: "safety", tone: "warning" },
        title: "Safety",
        subtitle: `${report.safety.alertsCreatedThisWeek} alerts this week`,
        chips: [
          { text: `High-risk ${report.safety.highRiskAlertsThisWeek}` },
          { text: `${report.period.weekStart} → ${report.period.weekEnd}` },
        ],
        statusPill:
          report.safety.highRiskAlertsThisWeek > 0
            ? { text: "Needs review", tone: "warning" }
            : { text: "Stable", tone: "success" },
      },
    ];
  }, [report]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={
          <HeroHeader
            variant="compact"
            title="Weekly summary"
            subtitle="Loading"
            left={<Avatar size={40} name={auth.patient?.displayName ?? "Patient"} fallback="icon" iconKey="weekly" />}
          />
        }
      >
        <EmptyState
          variant="compact"
          title="Loading weekly summary"
          description="Preparing your latest weekly review."
          illustration={<ActivityIndicator size="small" color={tokens.colors.primary} />}
        />
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  const selectedWeekLabel = selectedWeek === "this" ? "This week" : "Last week";
  const headerSubtitle = report
    ? `${report.period.weekStart} to ${report.period.weekEnd}`
    : selectedWeekLabel;
  const safetySummaryLabel = report
    ? report.safety.highRiskAlertsThisWeek > 0
      ? "Needs attention"
      : "Stable week"
    : "Summary pending";
  const reportIsBuilding = report
    ? report.checkins.count === 0 && report.summary.highlights.length === 0
    : false;
  const weeklyTakeawayTitle =
    selectedWeek === "this" ? "This week at a glance" : "Last week at a glance";

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Weekly summary"
          subtitle={headerSubtitle}
          left={
            <Avatar
              size={40}
              name={auth.patient?.displayName ?? "Patient"}
              fallback="icon"
              iconKey="weekly"
              ring={isOffline ? "attention" : "none"}
            />
          }
          rightActions={[
            {
              icon: "home",
              tone: "muted",
              accessibilityLabel: "Back to Home",
              onPress: () => router.push("/(tabs)" as never),
            },
            {
              icon: "progress",
              tone: "muted",
              accessibilityLabel: "Open Progress",
              onPress: () => router.push("/(tabs)/progress" as never),
            },
            {
              icon: "safety",
              tone: "warning",
              accessibilityLabel: "Open Safety support",
              onPress: () => router.push("/safety" as never),
            },
          ]}
        >
          <View style={styles.headerPills}>
            <StatusPill label={selectedWeekLabel} variant="info" accessible={false} />
            {report ? (
              <StatusPill
                label={`${report.checkins.count} check-ins`}
                variant={report.checkins.count > 0 ? "success" : "neutral"}
                accessible={false}
              />
            ) : null}
            <StatusPill
              label={safetySummaryLabel}
              variant={
                report
                  ? report.safety.highRiskAlertsThisWeek > 0
                    ? "warning"
                    : "success"
                  : "neutral"
              }
              accessible={false}
            />
          </View>
        </HeroHeader>
      }
    >
      <FlatList
        data={cards}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <MediaCard
            leading={item.leading}
            title={item.title}
            subtitle={item.subtitle}
            chips={item.chips}
            statusPill={item.statusPill}
          />
        )}
        ListHeaderComponent={
          <View style={styles.stack}>
        {false ? (
          <View style={styles.devBlock}>
                <SecondaryButton
                  label={showDevDiagnostics ? "Hide diagnostics" : "Diagnostics (dev)"}
                  onPress={() => {
                    setShowDevDiagnostics((current) => !current);
                  }}
                />
                {showDevDiagnostics ? (
                  <View style={styles.devMetaWrap}>
                    <LastRefreshed value={weeklyRefresh.label} compact />
                    <LastFailedAttempt
                      value={weeklyLoadError.label}
                      title={weeklyLoadError.lastError?.title}
                      message={weeklyLoadError.lastError?.message}
                      onClear={weeklyLoadError.lastError ? weeklyLoadError.clear : undefined}
                      compact
                    />
                  </View>
                ) : null}
          </View>
        ) : null}

        {isOffline ? (
          <Banner
            variant="warning"
            title="Offline"
            message="Offline — showing a saved weekly summary when available."
          />
        ) : null}

        {notice ? (
          <Banner
            variant={toBannerVariant(notice.variant)}
            title={notice.title}
                message={notice.message}
                actionLabel={notice.actionLabel}
            onAction={notice.onAction}
          />
        ) : null}

        <Section
          title="Review window"
          subtitle="Switch weeks, refresh the summary, or share it when you’re ready."
          right={<StatusPill label={selectedWeekLabel} variant="info" accessible={false} />}
          card
        >
          <SegmentedControl
            value={selectedWeek}
            options={[
              { value: "this", label: "This week", icon: "weekly" },
              { value: "last", label: "Last week", icon: "weekly" },
            ]}
            onChange={(nextValue) => {
              setSelectedWeek(nextValue);
            }}
            accessibilityLabel="Weekly summary range"
          />

          <View style={styles.actionRow}>
            <View style={styles.actionButtonWrap}>
              <PrimaryButton
                label={isRefreshing ? "Refreshing..." : "Refresh summary"}
                loading={isRefreshing}
                disabled={isRefreshing}
                onPress={() => {
                  void loadReport("refresh");
                }}
              />
            </View>
            <View style={styles.actionButtonWrap}>
              <SecondaryButton
                label="Share summary"
                disabled={!report}
                onPress={() => {
                  void shareReport();
                }}
              />
            </View>
          </View>
        </Section>

            {isLoading && !report ? (
              <WeeklyReportLoadingState
                title={weeklyTakeawayTitle}
                styles={styles}
                tokens={tokens}
              />
            ) : null}

            {!isLoading && !report ? (
              <EmptyState
                illustrationKey="weekly"
                title={
                  selectedWeek === "this"
                    ? "This week’s report is still building"
                    : "No weekly summary available"
                }
                description={
                  selectedWeek === "this"
                    ? "Complete a few check-ins and refresh when you’re ready. This summary will fill in as weekly data becomes available."
                    : "Connect online and refresh when you’re ready. Your weekly summary will appear here once it’s available."
                }
                ctaLabel="Retry"
                onCtaPress={() => {
                  void loadReport("refresh");
                }}
              />
            ) : null}

            {report ? (
              <>
                <Section
                  title={weeklyTakeawayTitle}
                  subtitle="Start with the headline summary, then scan the detailed breakdown below for supporting context."
                  right={
                    <StatusPill
                      label={report.safety.highRiskAlertsThisWeek > 0 ? "Needs attention" : "Stable"}
                      variant={report.safety.highRiskAlertsThisWeek > 0 ? "warning" : "success"}
                      accessible={false}
                    />
                  }
                  card
                  cardVariant="elevated"
                >
                  <Card variant="outlined" style={styles.storyCard}>
                    <Text style={styles.storyEyebrow}>Weekly takeaway</Text>
                    <Text style={styles.storyTitle}>
                      {report.summary.headline || "This week at a glance"}
                    </Text>
                    <Text style={styles.storyText}>
                      {reportIsBuilding
                        ? "Your weekly summary is starting to build from your recent check-ins and recovery activity."
                        : report.summary.highlights.length > 0
                        ? report.summary.highlights.slice(0, 2).join(" ")
                        : "This summary brings together your recent check-ins, recovery habits, and follow-through signals."}
                    </Text>
                  </Card>

                  <View style={styles.summaryPills}>
                    <StatusPill
                      label={`${report.checkins.count} check-ins`}
                      variant={report.checkins.count > 0 ? "success" : "neutral"}
                      accessible={false}
                    />
                    <StatusPill
                      label={`${report.exercises.sessionCount} sessions`}
                      variant={report.exercises.sessionCount > 0 ? "info" : "neutral"}
                      accessible={false}
                    />
                    <StatusPill
                      label={`${report.proms.completedThisWeekCount} assessments`}
                      variant={report.proms.completedThisWeekCount > 0 ? "info" : "neutral"}
                      accessible={false}
                    />
                  </View>

                  <View style={styles.metricGrid}>
                    <View style={styles.metricTileWrap}>
                      <TrackerTile
                        icon="checkin"
                        label="Pain avg"
                        value={
                          report.checkins.avgPain !== null
                            ? `${report.checkins.avgPain.toFixed(1)}/10`
                            : "—"
                        }
                        delta="Weekly"
                        tone="warning"
                        micro={{ type: "dots", values: [0.4, 0.6, 0.5, 0.7, 0.55, 0.52, 0.6] }}
                      />
                    </View>
                    <View style={styles.metricTileWrap}>
                      <TrackerTile
                        icon="checkin"
                        label="Mood avg"
                        value={
                          report.checkins.avgMood !== null
                            ? `${report.checkins.avgMood.toFixed(1)}/5`
                            : "—"
                        }
                        delta="Weekly"
                        tone="success"
                        micro={{ type: "dots", values: [0.45, 0.5, 0.55, 0.52, 0.6, 0.65, 0.62] }}
                      />
                    </View>
                    <View style={styles.metricTileWrap}>
                      <TrackerTile
                        icon="exercise"
                        label="Exercise"
                        value={pctOrDash(report.checkins.avgExercisesPct)}
                        delta="Adherence"
                        tone="accent"
                        micro={{
                          type: "ring",
                          progress: clamp01((report.checkins.avgExercisesPct ?? 0) / 100),
                        }}
                      />
                    </View>
                    <View style={styles.metricTileWrap}>
                      <TrackerTile
                        icon="meds"
                        label="Medication"
                        value={pctOrDash(report.medications.adherencePct)}
                        delta="Taken"
                        tone="primary"
                        micro={{
                          type: "ring",
                          progress: clamp01((report.medications.adherencePct ?? 0) / 100),
                        }}
                      />
                    </View>
                  </View>

                  {report.summary.nextSteps.length > 0 ? (
                    <View style={styles.nextStepsWrap}>
                      <Text style={styles.nextStepsTitle}>What to focus on next</Text>
                      <View style={styles.nextStepsRow}>
                        {report.summary.nextSteps.slice(0, 3).map((step, index) => (
                          <View key={`${step}-${index}`} style={styles.nextStepChip}>
                            <Text numberOfLines={1} style={styles.nextStepText}>
                              {step}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </Section>

                <View style={styles.detailIntro}>
                  <Text style={styles.detailIntroTitle}>Detailed breakdown</Text>
                  <Text style={styles.detailIntroText}>
                    Use the sections below for deeper weekly context behind the summary above.
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        }
        ListFooterComponent={<View style={styles.bottomSpacer} />}
      />
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xxxl,
    },
    stack: {
      gap: tokens.spacing.md,
    },
    headerPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    loadingPanel: {
      gap: tokens.spacing.md,
      minHeight: 180,
      justifyContent: "center",
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    loadingText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    loadingSkeleton: {
      gap: tokens.spacing.sm,
    },
    skeletonLine: {
      height: 14,
      width: "82%",
      borderRadius: 999,
      backgroundColor: tokens.colors.border,
      opacity: 0.65,
    },
    skeletonLineStrong: {
      height: 18,
      width: "62%",
      opacity: 0.9,
    },
    skeletonLineShort: {
      width: "44%",
    },
    devBlock: {
      gap: tokens.spacing.sm,
      padding: tokens.spacing.sm,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.surfaceElevated,
    },
    devMetaWrap: {
      gap: tokens.spacing.xs,
    },
    storyCard: {
      gap: tokens.spacing.xs,
      backgroundColor: tokens.colors.surface,
    },
    storyEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    storyTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    storyText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    summaryPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    actionRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    actionButtonWrap: {
      flex: 1,
      minWidth: 0,
    },
    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    metricTileWrap: {
      width: "48%",
      minWidth: 0,
    },
    nextStepsWrap: {
      gap: tokens.spacing.xs,
    },
    nextStepsTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    nextStepsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    nextStepChip: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: 999,
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 6,
      maxWidth: "100%",
    },
    nextStepText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    detailIntro: {
      gap: tokens.spacing.xs,
      marginTop: tokens.spacing.xs,
    },
    detailIntroTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    detailIntroText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    bottomSpacer: {
      height: tokens.spacing.md,
    },
  });
}
