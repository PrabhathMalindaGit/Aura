import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
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
import { EmptyState } from "@/src/components/EmptyState";
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
  const {
    label: sessionsRefreshLabel,
    refreshLocal: refreshSessionsLocal,
  } = useLastRefreshed("exerciseSessions");
  const {
    lastError: sessionsLoadLastError,
    label: sessionsLoadLabel,
    setLocalError: setSessionsLoadError,
    clear: clearSessionsLoadError,
  } = useLastError("exerciseSessionsLoad");
  const {
    lastError: saveSessionLastError,
    label: saveSessionLabel,
    setLocalError: setSaveSessionError,
    clear: clearSaveSessionError,
  } = useLastError("exerciseSessionSave");

  const patientId = auth.patient?.id ?? "";
  const [sessions, setSessions] = useState<ExerciseSessionListItem[]>([]);
  const [pending, setPending] = useState<PendingExerciseSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingPending, setIsSubmittingPending] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const loadInFlightRef = useRef(false);

  const pendingCount = pending.length;
  const latestSession = sessions[0] ?? null;

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
      if (loadInFlightRef.current) {
        return;
      }
      loadInFlightRef.current = true;

      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        setNotice(null);
        await loadPending();

        if (isOffline) {
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — pending uploads are shown. Connect to load recent sessions.",
          });
          return;
        }

        const response = await listExerciseSessions(auth.token, 30);
        setSessions(response);
        await refreshSessionsLocal();
        await clearSessionsLoadError();
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t load sessions");
        await setSessionsLoadError({
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
        loadInFlightRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [
      auth.token,
      clearSessionsLoadError,
      isOffline,
      loadPending,
      patientId,
      refreshSessionsLocal,
      setSessionsLoadError,
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
        await setSaveSessionError({
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

    await clearSaveSessionError();
    await refreshSessionsLocal();
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
    clearSaveSessionError,
    isOffline,
    loadPending,
    loadSessions,
    patientId,
    pending,
    refreshSessionsLocal,
    router,
    setSaveSessionError,
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
                <LastRefreshed value={sessionsRefreshLabel} compact />
                <LastFailedAttempt
                  label="Last load issue"
                  value={sessionsLoadLabel}
                  title={sessionsLoadLastError?.title}
                  message={sessionsLoadLastError?.message}
                  onClear={sessionsLoadLastError ? clearSessionsLoadError : undefined}
                  compact
                />
                <LastFailedAttempt
                  label="Last session save issue"
                  value={saveSessionLabel}
                  title={saveSessionLastError?.title}
                  message={saveSessionLastError?.message}
                  onClear={saveSessionLastError ? clearSaveSessionError : undefined}
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

        <Card variant="outlined" padding={tokens.spacing.md} style={styles.storyCard}>
          <Text style={styles.storyEyebrow}>Rehab sessions</Text>
          <Text style={styles.storyTitle}>
            {latestSession
              ? "Your recent sessions show how the plan is going"
              : pendingCount > 0
                ? "Your next rehab step is ready to sync"
                : "Your completed rehab sessions will appear here"}
          </Text>
          <Text style={styles.storyText}>
            {latestSession
              ? "Review what you completed, sync anything saved offline, and keep your rehab work moving forward."
              : pendingCount > 0
                ? "Saved sessions are ready to send when you reconnect."
                : "Start a session from your plan to build your exercise history here."}
          </Text>
        </Card>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCardWrap}>
            <MediaCard
              variant="compact"
              leading={{ type: "icon", icon: "exercise", tone: "accent" }}
              title="Start today’s session"
              subtitle="Log what you complete and how it feels"
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
              title={`Sync saved sessions (${pendingCount})`}
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

        <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntroCard}>
          <Text style={styles.sectionEyebrow}>Recent activity</Text>
          <Text style={styles.sectionTitle}>Review your latest completed rehab work</Text>
          <Text style={styles.sectionText}>
            Recent sessions help you see what was completed, how long it took, and how it felt.
          </Text>
        </Card>

        <View style={styles.trackerGrid}>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="weekly"
              label="Completed"
              value={`${sessions.length}`}
              delta="Sessions"
              tone="accent"
              micro={{ type: "dots", values: [sessions.length, 0, 0, 0, 0, 0, 0] }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="warning"
              label="Saved"
              value={`${pendingCount}`}
              delta="Uploads"
              tone="warning"
              micro={{ type: "dots", values: [pendingCount, 0, 0, 0, 0, 0, 0] }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="exercise"
              label="Typical session"
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
              label="Connection"
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
    latestSession,
    pendingCount,
    pendingSummary,
    router,
    clearSaveSessionError,
    clearSessionsLoadError,
    saveSessionLabel,
    saveSessionLastError?.message,
    saveSessionLastError?.title,
    sessions,
    sessionsLoadLabel,
    sessionsLoadLastError?.message,
    sessionsLoadLastError?.title,
    sessionsRefreshLabel,
    showDiagnostics,
    styles.diagContent,
    styles.diagTitle,
    styles.diagTitleRow,
    styles.diagToggle,
    styles.listHeader,
    styles.pressed,
    styles.sectionEyebrow,
    styles.sectionIntroCard,
    styles.sectionText,
    styles.sectionTitle,
    styles.storyCard,
    styles.storyEyebrow,
    styles.storyText,
    styles.storyTitle,
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
        <EmptyState
          variant="compact"
          title="Loading sessions"
          description="Preparing your exercise session history."
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
          title="Exercise sessions"
          subtitle={pendingCount ? `Saved ${pendingCount} · Completed ${sessions.length}` : `Completed ${sessions.length}`}
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
        >
          <View style={styles.headerPills}>
            <StatusPill label={`${sessions.length} completed`} variant="success" />
            {pendingCount ? <StatusPill label={`${pendingCount} saved`} variant="warning" /> : null}
            <StatusPill label={isOffline ? "Offline" : "Up to date"} variant={isOffline ? "warning" : "neutral"} />
          </View>
        </HeroHeader>
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
              <Text style={styles.emptyText}>
                Start a rehab session from Today’s plan and your completed work will appear here.
              </Text>
            </Card>
          )
        }
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        renderItem={({ item }) => (
          <MediaCard
            variant={item.id === latestSession?.id ? "emphasis" : "default"}
            leading={{ type: "icon", icon: "exercise", tone: "accent" }}
            title={formatISOToHuman(item.startedAt)}
            subtitle={`Completed session · ${formatDuration(item.durationSeconds)} · ${item.completedCount}/${item.exerciseCount} done`}
            chips={[
              ...(item.id === latestSession?.id ? [{ text: "Most recent", tone: "info" as const }] : []),
              ...(typeof item.avgPainDuring === "number"
                ? [{ text: `Pain ${item.avgPainDuring}/5`, tone: "warning" as const }]
                : [{ text: "Pain —", tone: "muted" as const }]),
            ]}
            statusPill={{ text: "Completed", tone: "success" }}
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
    sectionIntroCard: {
      gap: tokens.spacing.xs,
    },
    sectionEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    sectionTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    sectionText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
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
