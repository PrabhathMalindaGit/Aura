import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  getExerciseSession,
  type ExerciseSessionDetail,
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
import { useIsOffline } from "@/src/state/network";
import { useTokens } from "@/src/theme/tokens";
import { formatISOToHuman } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type DetailParams = {
  id?: string | string[];
};

function toFriendlyError(error: unknown): string {
  let apiError: ApiError;
  if (isApiError(error)) {
    apiError = error;
  } else {
    const normalized = normalizeUnknownError(error);
    apiError = {
      title: normalized.title,
      message: normalized.message,
      kind: normalized.kind,
      retryable: normalized.retryable,
      detail: normalized.detail,
    };
  }

  if (apiError.kind === "offline") {
    return "You’re offline. Connect to load session details.";
  }
  if (apiError.kind === "network") {
    return "Couldn’t reach the service. Please try again.";
  }
  if (apiError.kind === "server") {
    return "Service unavailable. Please try again shortly.";
  }
  return apiError.message || "Unable to load session details.";
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

function formatTimestamp(value: number | null): string {
  if (!value || !Number.isFinite(value)) {
    return "Never";
  }
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ExerciseSessionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<DetailParams>();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const sessionId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [session, setSession] = useState<ExerciseSessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [lastFailedAt, setLastFailedAt] = useState<number | null>(null);

  const loadDetail = useCallback(async () => {
    if (!auth.token || !sessionId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const detail = await getExerciseSession(auth.token, sessionId);
      setSession(detail);
      setLastLoadedAt(Date.now());
    } catch (error) {
      setErrorMessage(toFriendlyError(error));
      setLastFailedAt(Date.now());
    } finally {
      setIsLoading(false);
    }
  }, [auth.token, sessionId]);

  useEffect(() => {
    if (auth.status !== "signedIn") {
      return;
    }
    void loadDetail();
  }, [auth.status, loadDetail]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Session detail" subtitle="Session" />}
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

  if (!sessionId) {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Session detail" subtitle="Session" />}
      >
        <Banner
          variant="danger"
          title="Missing session ID"
          message="Open a session from the Sessions list."
        />
      </Screen>
    );
  }

  const progressRatio =
    session && session.exerciseCount > 0 ? Math.max(0, Math.min(1, session.completedCount / session.exerciseCount)) : 0;

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Session detail"
          subtitle={session ? formatISOToHuman(session.startedAt) : "Session"}
          left={<Avatar size={40} name="Exercise" fallback="icon" iconKey="exercise" />}
          rightActions={[
            {
              icon: "home",
              tone: "muted",
              accessibilityLabel: "Back to sessions",
              onPress: () => {
                router.replace("/exercise-sessions");
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
      <ScrollView contentContainerStyle={styles.container}>
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
                <LastRefreshed value={formatTimestamp(lastLoadedAt)} compact />
                <LastFailedAttempt
                  value={formatTimestamp(lastFailedAt)}
                  title="Session detail fetch"
                  message={errorMessage ?? undefined}
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
            message="Offline — detail refresh may fail."
          />
        ) : null}

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" />
          </View>
        ) : errorMessage ? (
          <Banner variant="danger" title="Couldn’t load session" message={errorMessage} />
        ) : !session ? (
          <Banner
            variant="info"
            title="Session not found"
            message="The session may have been removed."
          />
        ) : (
          <>
            <MediaCard
              leading={{ type: "icon", icon: "exercise", tone: "accent" }}
              title="Completed session"
              subtitle={`${session.exerciseCount} exercises · ${formatDuration(session.durationSeconds)}`}
              chips={[
                ...(typeof session.avgPainDuring === "number"
                  ? [{ text: `Pain ${session.avgPainDuring}/5`, tone: "warning" as const }]
                  : [{ text: "Pain —", tone: "muted" as const }]),
                ...(isOffline ? [{ text: "Offline", tone: "warning" as const }] : []),
              ]}
            />

            <View style={styles.trackerGrid}>
              <View style={styles.trackerTileWrap}>
                <TrackerTile
                  icon="exercise"
                  label="Exercises"
                  value={`${session.exerciseCount}`}
                  delta="Session total"
                  tone="accent"
                  micro={{ type: "dots", values: [session.exerciseCount, 0, 0, 0, 0, 0, 0] }}
                />
              </View>
              <View style={styles.trackerTileWrap}>
                <TrackerTile
                  icon="weekly"
                  label="Duration"
                  value={formatDuration(session.durationSeconds)}
                  delta="Elapsed"
                  tone="primary"
                  micro={{ type: "dots", values: [session.durationSeconds, 1, 2, 3, 4, 5, 6] }}
                />
              </View>
              <View style={styles.trackerTileWrap}>
                <TrackerTile
                  icon="insights"
                  label="Status"
                  value={session.status}
                  delta={`${session.completedCount}/${session.exerciseCount} done`}
                  tone="success"
                  micro={{ type: "ring", progress: progressRatio }}
                />
              </View>
              <View style={styles.trackerTileWrap}>
                <TrackerTile
                  icon="warning"
                  label="Pain"
                  value={typeof session.avgPainDuring === "number" ? `${session.avgPainDuring}/5` : "—"}
                  delta="Average"
                  tone="warning"
                  micro={{
                    type: "dots",
                    values: session.exercises
                      .slice(0, 7)
                      .map((exercise) => exercise.painDuring ?? 0),
                  }}
                />
              </View>
            </View>

            <Card variant="outlined" padding={tokens.spacing.md}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLine}>Started: {formatISOToHuman(session.startedAt)}</Text>
                <Text style={styles.summaryLine}>Ended: {formatISOToHuman(session.endedAt)}</Text>
                <Text style={styles.summaryLine}>Status: {session.status}</Text>
                <Text style={styles.summaryLine}>
                  Completed: {session.completedCount}/{session.exerciseCount}
                </Text>
              </View>
            </Card>

            <View style={styles.exerciseList}>
              {session.exercises.map((exercise) => (
                <MediaCard
                  key={`${exercise.itemKey}-${exercise.order}`}
                  leading={{ type: "icon", icon: "exercise", tone: "accent" }}
                  title={exercise.nameSnapshot}
                  subtitle={exercise.note ?? "No note"}
                  chips={[
                    { text: exercise.completed ? "Completed" : "Not completed", tone: exercise.completed ? "success" : "muted" },
                    ...(exercise.difficulty
                      ? [{ text: `Difficulty ${exercise.difficulty}`, tone: "info" as const }]
                      : []),
                    ...(typeof exercise.painDuring === "number"
                      ? [{ text: `Pain ${exercise.painDuring}/5`, tone: "warning" as const }]
                      : []),
                  ]}
                  statusPill={{ text: exercise.completed ? "Done" : "Pending", tone: exercise.completed ? "success" : "warning" }}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xxxl,
    },
    centered: {
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
      minWidth: 0,
    },
    summaryCard: {
      gap: tokens.spacing.xs,
    },
    summaryLine: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.textMuted,
    },
    exerciseList: {
      gap: tokens.spacing.md,
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
