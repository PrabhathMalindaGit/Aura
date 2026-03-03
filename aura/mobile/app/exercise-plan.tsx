import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { DomainIcon } from "@/src/components/IconSet";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard } from "@/src/components/MediaCard";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import {
  getCachedExercisePlan,
  setCachedExercisePlan,
} from "@/src/state/exercisePlanCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
import { formatISOToHuman } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

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

  const patientId = auth.patient?.id ?? "";
  const [response, setResponse] = useState<TodayPlanResponse | null>(null);
  const [source, setSource] = useState<LoadSource>("none");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<PlanNotice | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

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
    [auth.token, exercisePlanError, exercisePlanRefresh, isOffline, patientId]
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
  const dayLabel =
    response && response.dayOfWeek >= 0 && response.dayOfWeek <= 6
      ? DAY_LABELS[response.dayOfWeek]
      : null;

  const estimatedMinutes = useMemo(() => estimateMinutes(items), [items]);
  const intensityLabel = useMemo(() => summarizeIntensity(items), [items]);

  const listHeader = useMemo(() => {
    const showNotice = Boolean(notice && !(isOffline && notice.title === "Offline"));
    return (
      <View style={styles.listHeader}>
        {__DEV__ ? (
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
                <DomainIcon icon="info" tone="muted" accessibilityLabel="Diagnostics icon" />
                <Text style={styles.diagTitle}>Diagnostics (dev)</Text>
              </View>
              <StatusPill label={showDiagnostics ? "Open" : "Closed"} variant="neutral" />
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

        <View style={styles.trackerGrid}>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="exercise"
              label="Exercises"
              value={`${items.length}`}
              delta="Today"
              tone="accent"
              micro={{ type: "dots", values: [items.length, 0, 0, 0, 0, 0, 0] }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="weekly"
              label="Estimated time"
              value={estimatedMinutes !== null ? `${estimatedMinutes} min` : "—"}
              delta="Approx"
              tone="primary"
              micro={{ type: "dots", values: [estimatedMinutes ?? 0, 1, 2, 3, 4, 5, 6] }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="insights"
              label="Difficulty"
              value={intensityLabel}
              delta="Plan intensity"
              tone="warning"
              micro={{ type: "dots", values: [intensityLabel === "Hard" ? 3 : intensityLabel === "Moderate" ? 2 : intensityLabel === "Easy" ? 1 : 0, 0, 0, 0, 0, 0, 0] }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="progress"
              label="Status"
              value={source === "live" ? "Live" : source === "cache" ? "Saved" : "None"}
              delta="Data source"
              tone={source === "live" ? "success" : source === "cache" ? "warning" : "muted"}
              micro={{ type: "dots", values: [source === "live" ? 2 : source === "cache" ? 1 : 0, 0, 0, 0, 0, 0, 0] }}
            />
          </View>
        </View>

        <MediaCard
          leading={{ type: "icon", icon: "exercise", tone: "accent" }}
          title="Start today’s session"
          subtitle="Log completion and how it felt"
          chips={[
            { text: isOffline ? "Offline mode" : "Ready", tone: isOffline ? "warning" : "success" },
            { text: `${items.length} exercises`, tone: "muted" },
          ]}
          actions={[
            {
              label: "Start session",
              kind: "primary",
              onPress: () => {
                router.push("/exercise-session");
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
    dayLabel,
    estimatedMinutes,
    exercisePlanError.clear,
    exercisePlanError.label,
    exercisePlanError.lastError?.message,
    exercisePlanError.lastError?.title,
    exercisePlanRefresh.label,
    intensityLabel,
    isOffline,
    items.length,
    notice,
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
    styles.trackerGrid,
    styles.trackerTileWrap,
    tokens.spacing.md,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Today’s plan" subtitle="Plan overview" />}
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

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Today’s plan"
          subtitle={source === "live" ? "Up to date" : source === "cache" ? "Saved plan" : "Plan overview"}
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
        />
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
          ) : (
            <Card variant="outlined" padding={tokens.spacing.md}>
              <Text style={styles.emptyText}>
                No plan assigned yet. Your clinician will add one soon.
              </Text>
            </Card>
          )
        }
        renderItem={({ item }) => {
          const chips = [
            ...(formatDose(item) ? [{ text: formatDose(item), tone: "muted" as const }] : []),
            ...(item.intensity ? [{ text: item.intensity, tone: "info" as const }] : []),
            ...(item.contraindications?.length
              ? [{ text: `Caution ${item.contraindications.length}`, tone: "warning" as const }]
              : []),
          ].slice(0, 3);

          return (
            <MediaCard
              leading={{ type: "icon", icon: "exercise", tone: "accent" }}
              title={item.name}
              subtitle={item.instructions}
              chips={chips}
              actions={[
                {
                  label: "Start",
                  kind: "primary",
                  onPress: () => {
                    router.push("/exercise-session");
                  },
                },
                ...(item.videoUrl
                  ? [
                      {
                        label: "Open video",
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
        ListFooterComponent={<Text style={styles.footerNote}>If pain increases sharply, stop and contact your clinician.</Text>}
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
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.md,
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
    metaText: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    footerNote: {
      marginTop: tokens.spacing.md,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    trackerGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    trackerTileWrap: {
      width: "48%",
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
