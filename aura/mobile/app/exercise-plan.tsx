import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  getTodayExercisePlan,
  type ExercisePlanItem,
  type TodayPlanResponse,
} from "@/src/api/patient";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { EmptyState } from "@/src/components/EmptyState";
import { DomainIcon } from "@/src/components/IconSet";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard } from "@/src/components/MediaCard";
import { ReadAloudButton, normalizeReadAloudText } from "@/src/components/ReadAloudButton";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import { getActiveExerciseSession } from "@/src/state/activeExerciseSession";
import {
  getCachedExercisePlan,
  setCachedExercisePlan,
} from "@/src/state/exercisePlanCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { getPending, type PendingExerciseSession } from "@/src/state/pendingSessions";
import { canPatientUsePlan, getCareModeNotice } from "@/src/state/recoverySupport";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
import { formatISOToHuman } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";
import { derivePlanUiState } from "@/src/utils/planState";

type LoadSource = "live" | "cache" | "none";

type PlanNotice = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toBannerVariant(variant: PlanNotice["variant"]): "info" | "warning" | "danger" {
  return variant === "error" ? "danger" : variant;
}

function toFriendlyError(error: unknown): {
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
      title: "Couldn’t load plan",
      message: "You’re offline. Nothing was loaded.",
      kind: "offline",
      retryable: true,
    };
  }

  if (appError.kind === "network") {
    return {
      title: "Couldn’t load plan",
      message: "Couldn’t reach the service. Please try again.",
      kind: "network",
      retryable: true,
    };
  }

  if (appError.kind === "server") {
    return {
      title: "Couldn’t load plan",
      message: "Service unavailable. Please try again shortly.",
      kind: "server",
      retryable: true,
    };
  }

  if (appError.kind === "validation") {
    return {
      title: "Couldn’t load plan",
      message: appError.message || "The request was invalid.",
      kind: "validation",
      retryable: false,
    };
  }

  return {
    title: "Couldn’t load plan",
    message: appError.message || "Please try again.",
    kind: "unknown",
    retryable: true,
  };
}

function formatDose(item: ExercisePlanItem): string {
  const parts: string[] = [];
  if (typeof item.sets === "number" && typeof item.reps === "number") {
    parts.push(`${item.sets} sets x ${item.reps} reps`);
  } else if (typeof item.reps === "number") {
    parts.push(`${item.reps} reps`);
  }

  if (typeof item.holdSeconds === "number" && item.holdSeconds > 0) {
    parts.push(`hold ${item.holdSeconds}s`);
  }
  if (typeof item.restSeconds === "number" && item.restSeconds > 0) {
    parts.push(`rest ${item.restSeconds}s`);
  }
  if (item.intensity) {
    parts.push(item.intensity);
  }

  return parts.join(" · ");
}

function estimateMinutes(items: ExercisePlanItem[]): number | null {
  if (items.length === 0) {
    return null;
  }

  const totalSeconds = items.reduce((sum, item) => {
    const sets = Math.max(1, item.sets ?? 1);
    const reps = Math.max(0, item.reps ?? 0);
    const hold = Math.max(0, item.holdSeconds ?? 0);
    const rest = Math.max(0, item.restSeconds ?? 0);
    const repWorkSeconds = reps * 3;
    return sum + sets * (repWorkSeconds + hold) + Math.max(0, sets - 1) * rest;
  }, 0);

  return Math.max(1, Math.round(totalSeconds / 60));
}

function summarizeIntensity(items: ExercisePlanItem[]): string {
  const counts = items.reduce(
    (acc, item) => {
      const value = item.intensity;
      if (value === "easy" || value === "moderate" || value === "hard") {
        acc[value] += 1;
      }
      return acc;
    },
    { easy: 0, moderate: 0, hard: 0 }
  );

  if (counts.hard > counts.moderate && counts.hard > counts.easy) {
    return "Hard";
  }
  if (counts.moderate > 0 || counts.easy > 0) {
    return counts.moderate >= counts.easy ? "Moderate" : "Easy";
  }
  return "—";
}

export default function ExercisePlanScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const exercisePlanRefresh = useLastRefreshed("exercisePlan");
  const exercisePlanError = useLastError("exercisePlanLoad");
  const planAvailable = canPatientUsePlan(auth.patient);
  const careModeNotice = useMemo(() => getCareModeNotice(auth.patient), [auth.patient]);

  const patientId = auth.patient?.id ?? "";
  const [response, setResponse] = useState<TodayPlanResponse | null>(null);
  const [pendingSessions, setPendingSessions] = useState<PendingExerciseSession[]>([]);
  const [activeSession, setActiveSession] = useState<Awaited<
    ReturnType<typeof getActiveExerciseSession>
  > | null>(null);
  const [source, setSource] = useState<LoadSource>("none");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<PlanNotice | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const loadLocalPlanState = useCallback(async () => {
    if (!patientId) {
      setPendingSessions([]);
      setActiveSession(null);
      return;
    }

    const [pending, active] = await Promise.all([
      getPending(patientId),
      getActiveExerciseSession(patientId),
    ]);
    setPendingSessions(pending);
    setActiveSession(active);
  }, [patientId]);

  const loadPlan = useCallback(
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
        const cached = await getCachedExercisePlan(patientId);
        if (cached) {
          setResponse(cached.response);
          setSource("cache");
          await loadLocalPlanState();
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — showing saved plan.",
          });
        } else {
          setResponse(null);
          setSource("none");
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — no saved plan is available yet.",
          });
        }

        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const livePlan = await getTodayExercisePlan(auth.token, {
          tzOffsetMinutes: -new Date().getTimezoneOffset(),
        });
        setResponse(livePlan);
        setSource("live");
        await setCachedExercisePlan(patientId, livePlan);
        await loadLocalPlanState();
        await exercisePlanRefresh.refreshLocal();
        await exercisePlanError.clear();
      } catch (error) {
        const friendly = toFriendlyError(error);
        await exercisePlanError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const cached = await getCachedExercisePlan(patientId);
        await loadLocalPlanState();
        if (cached) {
          setResponse(cached.response);
          setSource("cache");
          setNotice({
            variant: "warning",
            title: friendly.title,
            message: "Showing saved plan. Live refresh failed.",
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadPlan("refresh");
                }
              : undefined,
          });
        } else {
          setResponse(null);
          setSource("none");
          setNotice({
            variant: "error",
            title: friendly.title,
            message: friendly.message,
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadPlan("refresh");
                }
              : undefined,
          });
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [auth.token, exercisePlanError, exercisePlanRefresh, isOffline, loadLocalPlanState, patientId]
  );

  useEffect(() => {
    if (auth.status !== "signedIn") {
      return;
    }
    void loadPlan("initial");
  }, [auth.status, loadPlan]);

  const openVideo = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }

    const canOpen = await Linking.canOpenURL(trimmed);
    if (!canOpen) {
      setNotice({
        variant: "warning",
        title: "Video unavailable",
        message: "Could not open the video link on this device.",
      });
      return;
    }

    await Linking.openURL(trimmed);
  };

  const plan = response?.plan ?? null;
  const items = plan?.items ?? [];
  const planUiState = useMemo(
    () =>
      derivePlanUiState({
        response,
        activeSession,
        pendingSessions,
      }),
    [activeSession, pendingSessions, response],
  );
  const dayLabel =
    response && response.dayOfWeek >= 0 && response.dayOfWeek <= 6
      ? DAY_LABELS[response.dayOfWeek]
      : null;

  const estimatedMinutes = useMemo(() => estimateMinutes(items), [items]);
  const intensityLabel = useMemo(() => summarizeIntensity(items), [items]);
  const firstExercise = items[0] ?? null;

  const listHeader = useMemo(() => {
    const showNotice = Boolean(notice && !(isOffline && notice.title === "Offline"));
    return (
      <View style={styles.listHeader}>
        {false ? (
          <Card variant="outlined" padding={tokens.spacing.md}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Toggle diagnostics"
              onPress={() => {
                setShowDiagnostics((current) => !current);
              }}
              style={({ pressed }) => [styles.diagToggle, pressed ? styles.pressed : null]}
            >
              <View style={styles.diagTitleRow}>
                <View accessible={false} importantForAccessibility="no">
                  <DomainIcon icon="info" tone="muted" accessibilityLabel="Diagnostics icon" />
                </View>
                <Text style={styles.diagTitle}>Diagnostics (dev)</Text>
              </View>
              <StatusPill label={showDiagnostics ? "Open" : "Closed"} variant="neutral" accessible={false} />
            </Pressable>
            {showDiagnostics ? (
              <View style={styles.diagContent}>
                <LastRefreshed value={exercisePlanRefresh.label} compact />
                <LastFailedAttempt
                  value={exercisePlanError.label}
                  title={exercisePlanError.lastError?.title}
                  message={exercisePlanError.lastError?.message}
                  onClear={exercisePlanError.lastError ? exercisePlanError.clear : undefined}
                  compact
                />
              </View>
            ) : null}
          </Card>
        ) : null}

        {isOffline ? (
          <Banner
            variant="warning"
            title="Offline"
            message="Offline — showing saved plan."
          />
        ) : null}

        {source === "cache" && !isOffline ? (
          <Banner
            variant="info"
            title="Saved data"
            message="Showing saved plan while live refresh is unavailable."
          />
        ) : null}

        {showNotice && notice ? (
          <Banner
            variant={toBannerVariant(notice.variant)}
            title={notice.title}
            message={notice.message}
            actionLabel={notice.actionLabel}
            onAction={notice.onAction}
          />
        ) : null}

        {careModeNotice ? (
          <Banner
            variant="info"
            title={careModeNotice.title}
            message={careModeNotice.message}
          />
        ) : null}

        <Card variant="outlined" padding={tokens.spacing.md} style={styles.storyCard}>
          <Text style={styles.storyEyebrow}>Rehab plan</Text>
          <Text style={styles.storyTitle}>{planUiState.title}</Text>
          <Text style={styles.storyText}>{planUiState.description}</Text>
        </Card>

        <MediaCard
          leading={{ type: "icon", icon: "exercise", tone: "accent" }}
          title={
            planUiState.kind === "no_plan_yet"
              ? "No plan has been assigned yet"
              : planUiState.restDay
                ? "Nothing is scheduled for today"
                : planUiState.kind === "in_progress"
                  ? "Continue today’s session"
                  : planUiState.kind === "complete"
                    ? "Today’s session is already logged"
                    : firstExercise
                      ? `Start with ${firstExercise.name}`
                      : "Open today’s plan"
          }
          subtitle={
            planUiState.kind === "no_plan_yet"
              ? "You can still review previous sessions while your clinician prepares your next plan."
              : planUiState.description
          }
          chips={[
            {
              text: planUiState.statusLabel,
              tone:
                planUiState.kind === "complete"
                  ? "success"
                  : planUiState.kind === "in_progress"
                    ? "info"
                    : planUiState.kind === "assigned"
                      ? "muted"
                      : "warning",
            },
            ...(planUiState.kind === "assigned" && planUiState.restDay
              ? [{ text: "Nothing scheduled today", tone: "muted" as const }]
              : items.length > 0
                ? [{ text: `${items.length} exercises`, tone: "muted" as const }]
                : []),
          ]}
          variant={
            planUiState.kind === "assigned" || planUiState.kind === "in_progress"
              ? "emphasis"
              : "default"
          }
          actions={[
            {
              label:
                !planAvailable
                  ? "View plan"
                  : planUiState.kind === "no_plan_yet"
                  ? "View sessions"
                  : planUiState.kind === "complete"
                    ? "View sessions"
                    : planUiState.kind === "assigned" && planUiState.restDay
                      ? "Open plan"
                      : planUiState.primaryActionLabel,
              kind:
                planAvailable && planUiState.kind === "assigned" && !planUiState.restDay
                  ? "primary"
                  : planAvailable && planUiState.kind === "in_progress"
                    ? "primary"
                    : "secondary",
              onPress: () => {
                if (!planAvailable) {
                  router.push("/exercise-sessions");
                  return;
                }

                if (planUiState.kind === "assigned" && !planUiState.restDay) {
                  router.push("/exercise-session");
                  return;
                }

                if (planUiState.kind === "in_progress") {
                  router.push("/exercise-session");
                  return;
                }

                if (planUiState.kind === "assigned" && planUiState.restDay) {
                  router.push("/exercise-plan");
                  return;
                }

                router.push("/exercise-sessions");
              },
            },
            {
              label: "View sessions",
              kind: "secondary",
              onPress: () => {
                router.push("/exercise-sessions");
              },
            },
          ]}
        />

        <View style={styles.metricsStack}>
          <View style={styles.metricRow}>
            <View style={styles.metricCell}>
              <TrackerTile
                variant="compact"
                icon="exercise"
                label="Exercises"
                value={`${items.length}`}
                delta={planUiState.restDay ? "Rest day" : "Today"}
                tone="accent"
                micro={{ type: "dots", values: [items.length, 0, 0, 0, 0, 0, 0] }}
              />
            </View>
            <View style={styles.metricCell}>
              <TrackerTile
                variant="compact"
                icon="weekly"
                label="Estimated time"
                value={estimatedMinutes !== null ? `${estimatedMinutes} min` : "—"}
                delta="Approx"
                tone="primary"
                micro={{ type: "dots", values: [estimatedMinutes ?? 0, 1, 2, 3, 4, 5, 6] }}
              />
            </View>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metricCell}>
              <TrackerTile
                variant="compact"
                icon="insights"
                label="Difficulty"
                value={intensityLabel}
                delta="Plan intensity"
                tone="warning"
                micro={{ type: "dots", values: [intensityLabel === "Hard" ? 3 : intensityLabel === "Moderate" ? 2 : intensityLabel === "Easy" ? 1 : 0, 0, 0, 0, 0, 0, 0] }}
              />
            </View>
            <View style={styles.metricCell}>
              <TrackerTile
                variant="compact"
                icon="progress"
                label="Plan state"
                value={planUiState.statusLabel}
                delta={source === "live" ? "Live" : source === "cache" ? "Saved" : "Ready"}
                tone={
                  planUiState.kind === "complete"
                    ? "success"
                    : planUiState.kind === "in_progress"
                      ? "primary"
                      : source === "cache"
                        ? "warning"
                        : "muted"
                }
                micro={{
                  type: "dots",
                  values: [
                    planUiState.kind === "complete"
                      ? 3
                      : planUiState.kind === "in_progress"
                        ? 2
                        : planUiState.kind === "assigned"
                          ? 1
                          : 0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                  ],
                }}
              />
            </View>
          </View>
        </View>

        {plan ? (
          <Text style={styles.metaText}>
            {dayLabel ? `${dayLabel} · ` : ""}
            {response?.date ? formatISOToHuman(response.date) : "--"}
            {" · "}
            Version {plan.version} · Updated {formatISOToHuman(plan.updatedAt)}
          </Text>
        ) : null}
      </View>
    );
  }, [
    careModeNotice,
    dayLabel,
    estimatedMinutes,
    exercisePlanError.clear,
    exercisePlanError.label,
    exercisePlanError.lastError?.message,
    exercisePlanError.lastError?.title,
    exercisePlanRefresh.label,
    intensityLabel,
    isOffline,
    firstExercise,
    items.length,
    notice,
    planUiState,
    planAvailable,
    plan,
    response?.date,
    router,
    showDiagnostics,
    source,
    styles.diagContent,
    styles.diagTitle,
    styles.diagTitleRow,
    styles.diagToggle,
    styles.listHeader,
    styles.metaText,
    styles.pressed,
    styles.storyCard,
    styles.storyEyebrow,
    styles.storyText,
    styles.storyTitle,
    styles.metricsStack,
    styles.metricRow,
    styles.metricCell,
    tokens.spacing.md,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Today’s plan" subtitle="Plan overview" />}
      >
        <EmptyState
          variant="compact"
          title="Loading today’s plan"
          description="Preparing your rehab plan for this device."
          illustration={<ActivityIndicator size="small" color={tokens.colors.primary} />}
        />
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Today’s plan"
          subtitle={source === "live" ? "Guided rehab plan" : source === "cache" ? "Saved rehab plan" : "Plan overview"}
          left={
            <Avatar
              size={40}
              name={auth.patient?.displayName ?? auth.patient?.id ?? "Patient"}
              fallback="icon"
              iconKey="exercise"
              ring={isOffline ? "attention" : "none"}
            />
          }
          rightActions={[
            {
              icon: "progress",
              tone: "muted",
              accessibilityLabel: "Open Progress",
              onPress: () => {
                router.push("/(tabs)/progress");
              },
            },
            {
              icon: "safety",
              tone: "warning",
              accessibilityLabel: "Open Safety support",
              onPress: () => {
                router.push("/safety");
              },
            },
          ]}
        >
          <View style={styles.headerPills}>
            <StatusPill
              label={
                planUiState.restDay ? "Nothing scheduled today" : `${items.length} exercises`
              }
              variant={planUiState.restDay ? "neutral" : "info"}
            />
            {estimatedMinutes !== null ? <StatusPill label={`${estimatedMinutes} min`} variant="neutral" /> : null}
            <StatusPill
              label={planUiState.statusLabel}
              variant={
                planUiState.kind === "complete"
                  ? "success"
                  : planUiState.kind === "in_progress"
                    ? "info"
                    : isOffline
                      ? "warning"
                      : "neutral"
              }
            />
          </View>
        </HeroHeader>
      }
    >
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.container}
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : plan && items.length === 0 ? (
            <Card variant="outlined" padding={tokens.spacing.md} style={styles.restDayCard}>
              <Text style={styles.emptyTitle}>Nothing scheduled for today</Text>
              <Text style={styles.emptyText}>
                Your plan is still assigned. Use this screen to review the full program and return when exercises are scheduled again.
              </Text>
            </Card>
          ) : (
            <Card variant="outlined" padding={tokens.spacing.md}>
              <Text style={styles.emptyTitle}>No plan assigned yet</Text>
              <Text style={styles.emptyText}>
                No plan is assigned yet. Your clinician will add your exercises here when they are ready.
              </Text>
            </Card>
          )
        }
        renderItem={({ item }) => {
          const doseLabel = formatDose(item);
          const readAloudText = normalizeReadAloudText([
            item.name,
            doseLabel,
            item.instructions,
          ]);
          const chips = [
            ...(item.intensity
              ? [
                  {
                    text: `${item.intensity.charAt(0).toUpperCase()}${item.intensity.slice(1)}`,
                    tone: "info" as const,
                  },
                ]
              : []),
            ...(item.contraindications?.length
              ? [{ text: `Caution ${item.contraindications.length}`, tone: "warning" as const }]
              : []),
            ...(item.videoUrl ? [{ text: "Video guide", tone: "muted" as const }] : []),
          ].slice(0, 3);
          const subtitleParts = [
            doseLabel,
            item.instructions,
            item.contraindications?.length
              ? `${item.contraindications.length} caution${item.contraindications.length === 1 ? "" : "s"} noted`
              : null,
          ].filter((value): value is string => Boolean(value));

          return (
            <MediaCard
              variant="compact"
              leading={{ type: "icon", icon: "exercise", tone: "accent" }}
              title={item.name}
              subtitle={subtitleParts.join(" · ")}
              chips={chips}
              maxChips={3}
              statusPill={
                item.order === 1 ? { text: "Start here", tone: "info" } : { text: `Step ${item.order}`, tone: "neutral" }
              }
              rightAccessory={
                <ReadAloudButton
                  text={readAloudText}
                  label="Read instructions"
                  sourceId={`exercise-plan-${item.key}`}
                  testID={`exercise-plan-read-${item.key}`}
                />
              }
              actions={[
                ...(item.videoUrl
                  ? [
                      {
                        label: "Watch guide",
                        kind: "secondary" as const,
                        onPress: () => {
                          void openVideo(item.videoUrl ?? "");
                        },
                      },
                    ]
                  : []),
              ]}
            />
          );
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadPlan("refresh");
            }}
          />
        }
        ListFooterComponent={
          <Text style={styles.footerNote}>
            If pain increases sharply, pause the session and contact your clinician or open Safety support.
          </Text>
        }
      />
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      paddingBottom: tokens.spacing.xxxl,
    },
    listHeader: {
      gap: tokens.spacing.sm,
      marginBottom: tokens.spacing.sm,
    },
    headerPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    listSeparator: {
      height: tokens.spacing.md,
    },
    centered: {
      minHeight: 120,
      justifyContent: "center",
      alignItems: "center",
    },
    emptyText: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.textMuted,
    },
    emptyTitle: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.text,
      fontWeight: tokens.typography.weights.semibold,
      marginBottom: tokens.spacing.xs,
    },
    restDayCard: {
      backgroundColor: tokens.colors.surfaceSubtle,
    },
    metaText: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    storyCard: {
      gap: tokens.spacing.xs,
    },
    storyEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.5,
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
    footerNote: {
      marginTop: tokens.spacing.md,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    metricsStack: {
      gap: tokens.spacing.sm,
    },
    metricRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    metricCell: {
      flex: 1,
      minWidth: 0,
    },
    diagToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    diagTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
    },
    diagTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    diagContent: {
      marginTop: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    pressed: {
      opacity: 0.84,
    },
  });
}
