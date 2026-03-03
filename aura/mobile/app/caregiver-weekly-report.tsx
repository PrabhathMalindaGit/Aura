import { Redirect, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import { getCaregiverWeeklyReport } from "@/src/api/caregiver";
import type { WeeklyReport } from "@/src/api/patient";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useCaregiverSession } from "@/src/state/caregiverSession";
import {
  getCachedCaregiverData,
  getCachedCaregiverWeeklyReport,
  setCachedCaregiverWeeklyReport,
} from "@/src/state/caregiverCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
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
      message: appError.message || "Please review and try again.",
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

function mapNoticeVariant(
  variant: NoticeState["variant"],
): "info" | "warning" | "danger" {
  if (variant === "error") {
    return "danger";
  }
  return variant;
}

export default function CaregiverWeeklyReportScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const caregiverSession = useCaregiverSession();
  const isOffline = useIsOffline();
  const caregiverRefresh = useLastRefreshed("caregiver");
  const caregiverLoadError = useLastError("caregiverLoad");

  const [selectedWeek, setSelectedWeek] = useState<WeekPreset>("this");
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDevDiagnostics, setShowDevDiagnostics] = useState(false);

  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const thisWeekStart = useMemo(
    () => startOfWeekMondayISO(tzOffsetMinutes),
    [tzOffsetMinutes]
  );
  const lastWeekStart = useMemo(
    () => addDaysISO(thisWeekStart, -7),
    [thisWeekStart]
  );
  const activeWeekStart = selectedWeek === "this" ? thisWeekStart : lastWeekStart;
  const patientId = caregiverSession.patient?.id ?? report?.patientId ?? "";

  const loadReport = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!caregiverSession.token) {
        setIsLoading(false);
        return;
      }

      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setNotice(null);

      if (isOffline) {
        const cached = patientId ? await getCachedCaregiverData(patientId) : null;
        const cachedReport = getCachedCaregiverWeeklyReport(cached, selectedWeek);
        if (cachedReport) {
          setReport(cachedReport);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — showing saved info.",
          });
        } else {
          setReport(null);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — no saved report is available for this week.",
          });
        }
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const live = await getCaregiverWeeklyReport(caregiverSession.token, {
          weekStart: activeWeekStart,
          tzOffsetMinutes,
        });

        setReport(live);
        const cachePatientId = patientId || live.patientId;
        await Promise.all([
          setCachedCaregiverWeeklyReport(cachePatientId, selectedWeek, live),
          caregiverRefresh.refreshLocal(),
          caregiverLoadError.clear(),
        ]);
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t load weekly report");
        await caregiverLoadError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const cached = patientId ? await getCachedCaregiverData(patientId) : null;
        const cachedReport = getCachedCaregiverWeeklyReport(cached, selectedWeek);
        if (cachedReport) {
          setReport(cachedReport);
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
      caregiverLoadError,
      caregiverRefresh,
      caregiverSession.token,
      isOffline,
      patientId,
      selectedWeek,
      tzOffsetMinutes,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      if (caregiverSession.status !== "signedIn") {
        return;
      }
      void loadReport("initial");
      return undefined;
    }, [caregiverSession.status, loadReport])
  );

  useEffect(() => {
    if (caregiverSession.status !== "signedIn") {
      return;
    }
    void loadReport("initial");
  }, [caregiverSession.status, loadReport, selectedWeek]);

  const header = (
    <HeroHeader
      variant="compact"
      title="Weekly report"
      subtitle={selectedWeek === "this" ? "This week" : "Last week"}
      left={<Avatar size={40} name="Weekly report" fallback="icon" iconKey="weekly" />}
      rightActions={[
        {
          icon: "home",
          tone: "muted",
          accessibilityLabel: "Back to caregiver home",
          onPress: () => router.replace("/caregiver-home" as Href),
        },
        {
          icon: "safety",
          tone: "warning",
          accessibilityLabel: "Open Safety support",
          onPress: () => router.push("/safety" as Href),
        },
      ]}
    />
  );

  if (caregiverSession.status === "loading") {
    return (
      <Screen scroll={false} header={header}>
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (caregiverSession.status === "signedOut") {
    return <Redirect href={"/caregiver-login" as Href} />;
  }

  const exerciseProgress =
    report && report.exercises.totalExercises > 0
      ? clamp01(report.exercises.completedExercises / report.exercises.totalExercises)
      : 0;
  const medicationProgress = clamp01((report?.medications.adherencePct ?? 0) / 100);

  return (
    <Screen scroll={false} header={header}>
      <FlatList
        data={[]}
        renderItem={() => null}
        keyExtractor={(_, index) => String(index)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.content}>
            {__DEV__ ? (
              <View style={styles.devCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Toggle diagnostics"
                  onPress={() => setShowDevDiagnostics((value) => !value)}
                  style={({ pressed }) => [
                    styles.devRow,
                    pressed ? styles.devRowPressed : null,
                  ]}
                >
                  <Text style={styles.devTitle}>Diagnostics (dev)</Text>
                  <StatusPill
                    label={showDevDiagnostics ? "Open" : "Closed"}
                    variant="neutral"
                    accessible={false}
                  />
                </Pressable>
                {showDevDiagnostics ? (
                  <View style={styles.devDetails}>
                    <LastRefreshed value={caregiverRefresh.label} />
                    <LastFailedAttempt
                      value={caregiverLoadError.label}
                      title={caregiverLoadError.lastError?.title}
                      message={caregiverLoadError.lastError?.message}
                      onClear={caregiverLoadError.lastError ? caregiverLoadError.clear : undefined}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            <SegmentedControl
              value={selectedWeek}
              onChange={setSelectedWeek}
              options={[
                { value: "this", label: "This week", icon: "weekly" },
                { value: "last", label: "Last week", icon: "weekly" },
              ]}
              accessibilityLabel="Weekly report selector"
              tone="accent"
            />

            {notice ? (
              <Banner
                variant={mapNoticeVariant(notice.variant)}
                title={notice.title}
                message={notice.message}
                actionLabel={notice.actionLabel}
                onAction={notice.onAction}
              />
            ) : null}

            {isLoading ? (
              <View style={styles.centeredBlock}>
                <ActivityIndicator size="small" />
              </View>
            ) : report ? (
              <>
                <MediaCard
                  variant="emphasis"
                  leading={{ type: "icon", icon: "weekly", tone: "accent" }}
                  title={report.summary.headline}
                  subtitle={report.summary.highlights[0] ?? "No highlights yet."}
                  chips={report.summary.highlights.slice(0, 2).map((item) => ({
                    text: item,
                    tone: "muted" as const,
                  }))}
                />

                <View style={styles.trackerGrid}>
                  <View style={styles.trackerTileWrap}>
                    <TrackerTile
                      icon="checkin"
                      label="Pain avg"
                      value={numberOrDash(report.checkins.avgPain)}
                      delta="This week"
                      tone="warning"
                      micro={{ type: "dots", values: [0.6, 0.7, 0.5, 0.55, 0.6, 0.58, 0.62] }}
                    />
                  </View>
                  <View style={styles.trackerTileWrap}>
                    <TrackerTile
                      icon="insights"
                      label="Mood avg"
                      value={numberOrDash(report.checkins.avgMood)}
                      delta="This week"
                      tone="success"
                      micro={{ type: "dots", values: [0.6, 0.62, 0.64, 0.68, 0.66, 0.7, 0.72] }}
                    />
                  </View>
                  <View style={styles.trackerTileWrap}>
                    <TrackerTile
                      icon="exercise"
                      label="Exercise"
                      value={`${report.exercises.completedExercises}/${report.exercises.totalExercises}`}
                      delta="Completed"
                      tone="accent"
                      micro={{ type: "ring", progress: exerciseProgress }}
                    />
                  </View>
                  <View style={styles.trackerTileWrap}>
                    <TrackerTile
                      icon="meds"
                      label="Meds"
                      value={pctOrDash(report.medications.adherencePct)}
                      delta="Adherence"
                      tone="primary"
                      micro={{ type: "ring", progress: medicationProgress }}
                    />
                  </View>
                </View>

                <MediaCard
                  leading={{ type: "icon", icon: "checkin", tone: "muted" }}
                  title="Check-ins"
                  subtitle={`Count: ${report.checkins.count} · Avg pain: ${numberOrDash(report.checkins.avgPain)} · Avg mood: ${numberOrDash(report.checkins.avgMood)}`}
                  chips={[
                    { text: `${report.checkins.count} logs`, tone: "muted" },
                    {
                      text: `Adherence ${pctOrDash(report.checkins.avgExercisesPct)}`,
                      tone: "muted",
                    },
                  ]}
                />

                <MediaCard
                  leading={{ type: "icon", icon: "safety", tone: "warning" }}
                  title="Safety"
                  subtitle={`Opened alerts: ${report.safety.alertsCreatedThisWeek} · High-risk: ${report.safety.highRiskAlertsThisWeek}`}
                  chips={[{ text: "Weekly alert view", tone: "muted" }]}
                />

                <MediaCard
                  leading={{ type: "icon", icon: "proms", tone: "accent" }}
                  title="Questionnaires"
                  subtitle={`Due now: ${report.proms.dueNowCount} · Completed: ${report.proms.completedThisWeekCount}`}
                  chips={
                    report.proms.latestCompleted
                      ? [
                          {
                            text: `${report.proms.latestCompleted.normalized}/100 ${report.proms.latestCompleted.bandLabel}`,
                            tone: "muted",
                          },
                        ]
                      : [{ text: "No score yet", tone: "muted" }]
                  }
                />

                <MediaCard
                  leading={{ type: "icon", icon: "exercise", tone: "accent" }}
                  title="Exercises"
                  subtitle={`Sessions: ${report.exercises.sessionCount} · Avg pain during: ${numberOrDash(report.exercises.avgPainDuring)}`}
                  chips={[
                    {
                      text: `${report.exercises.completedExercises}/${report.exercises.totalExercises} completed`,
                      tone: "muted",
                    },
                    {
                      text: `${report.exercises.totalDurationMinutes} min total`,
                      tone: "muted",
                    },
                  ]}
                />

                <MediaCard
                  leading={{ type: "icon", icon: "hydration", tone: "primary" }}
                  title="Habits"
                  subtitle={`Hydration avg: ${numberOrDash(report.hydration.avgDailyMl)} ml · Fruit/veg avg: ${numberOrDash(report.nutrition.avgFruitVegServings)}`}
                  chips={[
                    {
                      text: `Medication ${pctOrDash(report.medications.adherencePct)}`,
                      tone: "muted",
                    },
                    {
                      text: `Hydration target ${report.hydration.targetMl} ml`,
                      tone: "muted",
                    },
                  ]}
                />
              </>
            ) : (
              <Banner
                variant="info"
                title="No report"
                message="No weekly report is available for this week yet."
              />
            )}
          </View>
        }
      />

      <GlassPanel style={styles.footerPanel}>
        <PrimaryButton
          label={isRefreshing ? "Refreshing…" : "Refresh"}
          disabled={isRefreshing || isOffline}
          onPress={() => {
            void loadReport("refresh");
          }}
        />
      </GlassPanel>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    listContent: {
      paddingBottom: tokens.spacing.xxxl,
    },
    content: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.md,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    centeredBlock: {
      minHeight: 120,
      alignItems: "center",
      justifyContent: "center",
    },
    trackerGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    trackerTileWrap: {
      width: "48%",
      flexGrow: 1,
      minWidth: 150,
    },
    footerPanel: {
      marginTop: tokens.spacing.sm,
    },
    devCard: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    devRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
      borderRadius: tokens.radius.md,
    },
    devRowPressed: {
      opacity: 0.86,
    },
    devTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    devDetails: {
      gap: tokens.spacing.sm,
    },
  });
}
