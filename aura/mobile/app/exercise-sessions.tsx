import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  createExerciseSession,
  listExerciseSessions,
  type ExerciseSessionListItem,
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
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { getPending, removePending, type PendingExerciseSession } from "@/src/state/pendingSessions";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
import { formatISOToHuman } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  return variant === "error" ? "danger" : variant;
}

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
      message: appError.message || "Please review input and try again.",
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

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

export default function ExerciseSessionsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const sessionsRefresh = useLastRefreshed("exerciseSessions");
  const sessionsLoadError = useLastError("exerciseSessionsLoad");
  const saveSessionError = useLastError("exerciseSessionSave");

  const patientId = auth.patient?.id ?? "";
  const [sessions, setSessions] = useState<ExerciseSessionListItem[]>([]);
  const [pending, setPending] = useState<PendingExerciseSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingPending, setIsSubmittingPending] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const pendingCount = pending.length;

  const loadPending = useCallback(async () => {
    if (!patientId) {
      setPending([]);
      return;
    }
    const next = await getPending(patientId);
    setPending(next);
  }, [patientId]);

  const loadSessions = useCallback(
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
      await loadPending();

      if (isOffline) {
        setNotice({
          variant: "warning",
          title: "Offline",
          message: "Offline — pending uploads are shown. Connect to load recent sessions.",
        });
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const response = await listExerciseSessions(auth.token, 30);
        setSessions(response);
        await sessionsRefresh.refreshLocal();
        await sessionsLoadError.clear();
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t load sessions");
        await sessionsLoadError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });
        setNotice({
          variant: "error",
          title: friendly.title,
          message: friendly.message,
          actionLabel: friendly.retryable ? "Retry" : undefined,
          onAction: friendly.retryable
            ? () => {
                void loadSessions("refresh");
              }
            : undefined,
        });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [
      auth.token,
      isOffline,
      loadPending,
      patientId,
      sessionsLoadError,
      sessionsRefresh,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadSessions("initial");
    }, [auth.status, loadSessions])
  );

  const submitPending = useCallback(async () => {
    if (!auth.token || !patientId) {
      router.replace("/(auth)/login");
      return;
    }

    if (pending.length === 0) {
      return;
    }

    if (isOffline) {
      setNotice({
        variant: "warning",
        title: "Offline",
        message: "You’re offline. Pending sessions cannot be submitted yet.",
      });
      return;
    }

    setIsSubmittingPending(true);
    setNotice(null);

    let submitted = 0;
    for (const entry of pending) {
      try {
        await createExerciseSession(auth.token, entry.payload);
        await removePending(patientId, entry.localId);
        submitted += 1;
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t submit pending sessions");
        await saveSessionError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });
        setNotice({
          variant: "error",
          title: friendly.title,
          message:
            submitted > 0
              ? `Submitted ${submitted} session(s). ${friendly.message}`
              : friendly.message,
        });
        setIsSubmittingPending(false);
        await loadPending();
        return;
      }
    }

    await saveSessionError.clear();
    await sessionsRefresh.refreshLocal();
    await loadPending();
    await loadSessions("refresh");
    setNotice({
      variant: "info",
      title: "Pending submitted",
      message: "All pending sessions were submitted successfully.",
    });
    setIsSubmittingPending(false);
  }, [
    auth.token,
    isOffline,
    loadPending,
    loadSessions,
    patientId,
    pending,
    router,
    saveSessionError,
    sessionsRefresh,
  ]);

  const pendingSummary = useMemo(() => {
    if (pendingCount === 0) {
      return "No pending uploads.";
    }
    return `${pendingCount} pending upload${pendingCount === 1 ? "" : "s"}.`;
  }, [pendingCount]);

  const avgDurationSeconds = useMemo(() => {
    if (sessions.length === 0) {
      return null;
    }
    return Math.round(
      sessions.reduce((sum, item) => sum + item.durationSeconds, 0) / sessions.length
    );
  }, [sessions]);

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
                <View accessible={false} importantForAccessibility="no">
                  <DomainIcon icon="info" tone="muted" accessibilityLabel="Diagnostics icon" />
                </View>
                <Text style={styles.diagTitle}>Diagnostics (dev)</Text>
              </View>
              <StatusPill label={showDiagnostics ? "Open" : "Closed"} variant="neutral" accessible={false} />
            </Pressable>
            {showDiagnostics ? (
              <View style={styles.diagContent}>
                <LastRefreshed value={sessionsRefresh.label} compact />
                <LastFailedAttempt
                  label="Last load issue"
                  value={sessionsLoadError.label}
                  title={sessionsLoadError.lastError?.title}
                  message={sessionsLoadError.lastError?.message}
                  onClear={sessionsLoadError.lastError ? sessionsLoadError.clear : undefined}
                  compact
                />
                <LastFailedAttempt
                  label="Last session save issue"
                  value={saveSessionError.label}
                  title={saveSessionError.lastError?.title}
                  message={saveSessionError.lastError?.message}
                  onClear={saveSessionError.lastError ? saveSessionError.clear : undefined}
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
            message="Offline — pending sessions are safe locally. Connect to load or submit."
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

        <View style={styles.summaryRow}>
          <View style={styles.summaryCardWrap}>
            <MediaCard
              variant="compact"
              leading={{ type: "icon", icon: "exercise", tone: "accent" }}
              title="Start a session"
              subtitle="Log exercise completion"
              chips={[{ text: `${sessions.length} recent`, tone: "muted" }]}
              onPress={() => {
                router.push("/exercise-session");
              }}
            />
          </View>
          <View style={styles.summaryCardWrap}>
            <MediaCard
              variant="compact"
              leading={{ type: "icon", icon: "warning", tone: "warning" }}
              title={`Pending ${pendingCount}`}
              subtitle={pendingSummary}
              chips={[{ text: isOffline ? "Offline" : "Ready", tone: isOffline ? "warning" : "success" }]}
              actions={[
                {
                  label: isSubmittingPending ? "Submitting…" : "Submit pending",
                  kind: "primary",
                  disabled: pendingCount === 0 || isSubmittingPending || isOffline,
                  onPress: () => {
                    void submitPending();
                  },
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.trackerGrid}>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="weekly"
              label="Recent"
              value={`${sessions.length}`}
              delta="Sessions"
              tone="accent"
              micro={{ type: "dots", values: [sessions.length, 0, 0, 0, 0, 0, 0] }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="warning"
              label="Pending"
              value={`${pendingCount}`}
              delta="Uploads"
              tone="warning"
              micro={{ type: "dots", values: [pendingCount, 0, 0, 0, 0, 0, 0] }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="exercise"
              label="Avg duration"
              value={avgDurationSeconds !== null ? formatDuration(avgDurationSeconds) : "—"}
              delta="Recent sessions"
              tone="primary"
              micro={{
                type: "bars",
                values: sessions.slice(0, 7).map((item) => item.durationSeconds),
              }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="progress"
              label="Sync state"
              value={isOffline ? "Offline" : "Online"}
              delta="Connection"
              tone={isOffline ? "warning" : "success"}
              micro={{ type: "dots", values: [isOffline ? 0 : 1, 0, 0, 0, 0, 0, 0] }}
            />
          </View>
        </View>
      </View>
    );
  }, [
    avgDurationSeconds,
    isOffline,
    isSubmittingPending,
    notice,
    pendingCount,
    pendingSummary,
    router,
    saveSessionError.clear,
    saveSessionError.label,
    saveSessionError.lastError?.message,
    saveSessionError.lastError?.title,
    sessions,
    sessionsLoadError.clear,
    sessionsLoadError.label,
    sessionsLoadError.lastError?.message,
    sessionsLoadError.lastError?.title,
    sessionsRefresh.label,
    showDiagnostics,
    styles.diagContent,
    styles.diagTitle,
    styles.diagTitleRow,
    styles.diagToggle,
    styles.listHeader,
    styles.pressed,
    styles.summaryCardWrap,
    styles.summaryRow,
    styles.trackerGrid,
    styles.trackerTileWrap,
    submitPending,
    tokens.spacing.md,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Exercise sessions" subtitle="Recent sessions" />}
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
          title="Exercise sessions"
          subtitle={pendingCount ? `Pending ${pendingCount} · Recent ${sessions.length}` : `Recent ${sessions.length}`}
          left={
            <Avatar
              size={40}
              name={auth.patient?.displayName ?? auth.patient?.id ?? "Patient"}
              fallback="icon"
              iconKey="exercise"
            />
          }
          rightActions={[
            {
              icon: "exercise",
              tone: "accent",
              accessibilityLabel: "Start exercise session",
              onPress: () => {
                router.push("/exercise-session");
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
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <Card variant="outlined" padding={tokens.spacing.md}>
              <Text style={styles.emptyText}>Start a session from Today’s plan to see it here.</Text>
            </Card>
          )
        }
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        renderItem={({ item }) => (
          <MediaCard
            leading={{ type: "icon", icon: "exercise", tone: "accent" }}
            title={formatISOToHuman(item.startedAt)}
            subtitle={`${formatDuration(item.durationSeconds)} · ${item.completedCount}/${item.exerciseCount} done`}
            chips={[
              ...(typeof item.avgPainDuring === "number"
                ? [{ text: `Pain ${item.avgPainDuring}/5`, tone: "warning" as const }]
                : [{ text: "Pain —", tone: "muted" as const }]),
            ]}
            statusPill={{ text: "Saved", tone: "info" }}
            onPress={() => {
              router.push({
                pathname: "/exercise-session-detail",
                params: { id: item.id },
              });
            }}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadSessions("refresh");
            }}
          />
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
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.md,
    },
    listSeparator: {
      height: tokens.spacing.md,
    },
    centered: {
      minHeight: 120,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.textMuted,
    },
    summaryRow: {
      flexDirection: "row",
      gap: tokens.spacing.md,
    },
    summaryCardWrap: {
      flex: 1,
      minWidth: 0,
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
