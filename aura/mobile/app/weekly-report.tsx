import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import { getWeeklyReport, type WeeklyReport } from "@/src/api/patient";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { EmptyState } from "@/src/components/EmptyState";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard, type MediaCardProps } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { SegmentedControl } from "@/src/components/SegmentedControl";
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

export default function WeeklyReportScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const weeklyRefresh = useLastRefreshed("weeklyReport");
  const weeklyLoadError = useLastError("weeklyReportLoad");
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

  const activeWeekStart = selectedWeek === "this" ? thisWeekStart : lastWeekStart;

  const loadReport = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!auth.token || !patientId) {
        return;
      }

      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setNotice(null);

      if (isOffline) {
        const cached = await getCachedWeeklyReport(patientId, activeWeekStart);
        if (cached) {
          setReport(cached.report);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — showing saved weekly report.",
          });
        } else {
          setReport(null);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — no saved report is available for this week yet.",
          });
        }

        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const live = await getWeeklyReport(auth.token, {
          weekStart: activeWeekStart,
          tzOffsetMinutes,
        });

        setReport(live);
        await setCachedWeeklyReport(patientId, activeWeekStart, live);
        await weeklyRefresh.refreshLocal();
        await weeklyLoadError.clear();
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t load weekly report");
        await weeklyLoadError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const cached = await getCachedWeeklyReport(patientId, activeWeekStart);
        if (cached) {
          setReport(cached.report);
          setNotice({
            variant: "warning",
            title: friendly.title,
            message: "Showing saved report. Live refresh failed.",
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadReport("refresh");
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
                  void loadReport("refresh");
                }
              : undefined,
          });
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [
      activeWeekStart,
      auth.token,
      isOffline,
      patientId,
      tzOffsetMinutes,
      weeklyLoadError,
      weeklyRefresh,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadReport("initial");
      return undefined;
    }, [auth.status, loadReport])
  );

  useEffect(() => {
    if (auth.status !== "signedIn") {
      return;
    }
    void loadReport("initial");
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
            title="Weekly report"
            subtitle="Loading"
            left={<Avatar size={40} name={auth.patient?.displayName ?? "Patient"} fallback="icon" iconKey="weekly" />}
          />
        }
      >
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
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

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Weekly report"
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
        />
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
            {__DEV__ ? (
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

            <SegmentedControl
              value={selectedWeek}
              options={[
                { value: "this", label: "This week", icon: "weekly" },
                { value: "last", label: "Last week", icon: "weekly" },
              ]}
              onChange={(nextValue) => {
                setSelectedWeek(nextValue);
              }}
              accessibilityLabel="Weekly report range"
            />

            <View style={styles.actionRow}>
              <View style={styles.actionButtonWrap}>
                <PrimaryButton
                  label={isRefreshing ? "Refreshing..." : "Refresh report"}
                  loading={isRefreshing}
                  disabled={isRefreshing}
                  onPress={() => {
                    void loadReport("refresh");
                  }}
                />
              </View>
              <View style={styles.actionButtonWrap}>
                <SecondaryButton
                  label="Share report"
                  disabled={!report}
                  onPress={() => {
                    void shareReport();
                  }}
                />
              </View>
            </View>

            {isOffline ? (
              <Banner
                variant="warning"
                title="Offline"
                message="Offline — showing cached report when available."
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

            {isLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="small" />
              </View>
            ) : null}

            {!isLoading && !report ? (
              <EmptyState
                illustrationKey="weekly"
                title="No report available"
                description="Connect online and refresh to load this weekly report."
                ctaLabel="Retry"
                onCtaPress={() => {
                  void loadReport("refresh");
                }}
              />
            ) : null}

            {report ? (
              <>
                <MediaCard
                  variant="emphasis"
                  leading={{ type: "icon", icon: "weekly", tone: "accent" }}
                  title={report.summary.headline || "This week at a glance"}
                  subtitle={`${report.period.weekStart} to ${report.period.weekEnd}`}
                  chips={[
                    ...report.summary.highlights.slice(0, 2).map((item) => ({
                      text: item,
                      tone: "muted" as const,
                    })),
                    {
                      text: `${report.checkins.count} check-ins`,
                      tone: "info" as const,
                    },
                  ]}
                />

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
                    <Text style={styles.nextStepsTitle}>Next steps</Text>
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
    centered: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 120,
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
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
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
    bottomSpacer: {
      height: tokens.spacing.md,
    },
  });
}
