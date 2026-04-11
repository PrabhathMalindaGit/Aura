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
import { useIsOffline } from "@/src/state/network";
import { useTokens } from "@/src/theme/tokens";
import { formatISOToHuman, formatPatientSyncLabel } from "@/src/utils/date";
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
  return formatPatientSyncLabel(value);
}

function sessionStatusLabel(status: string): string {
  if (status === "completed") {
    return "Completed";
  }
  if (status === "in_progress") {
    return "In progress";
  }
  if (status === "abandoned") {
    return "Stopped";
  }
  return status;
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
        <EmptyState
          variant="compact"
          title="Loading session detail"
          description="Preparing the latest information for this session."
          illustration={<ActivityIndicator size="small" color={tokens.colors.primary} />}
        />
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
  const statusLabel = session ? sessionStatusLabel(session.status) : "Session";

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Session detail"
          subtitle={session ? `Session review · ${formatISOToHuman(session.startedAt)}` : "Session"}
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
        >
          {session ? (
            <View style={styles.headerPills}>
              <StatusPill label={statusLabel} variant={session.status === "completed" ? "success" : "info"} />
              <StatusPill label={`${session.completedCount}/${session.exerciseCount} done`} variant="neutral" />
              <StatusPill label={formatDuration(session.durationSeconds)} variant="neutral" />
            </View>
          ) : null}
        </HeroHeader>
      }
    >
      <ScrollView contentContainerStyle={styles.container}>
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
          <EmptyState
            variant="compact"
            title="Loading session detail"
            description="Checking the latest progress for this session."
            illustration={<ActivityIndicator size="small" color={tokens.colors.primary} />}
          />
        ) : errorMessage ? (
          <Banner
            variant="danger"
            title="Couldn’t load session"
            message={errorMessage}
            actionLabel="Retry"
            onAction={() => {
              void loadDetail();
            }}
          />
        ) : !session ? (
          <Banner
            variant="info"
            title="Session not found"
            message="The session may have been removed."
          />
        ) : (
          <>
            <Card variant="outlined" padding={tokens.spacing.md} style={styles.storyCard}>
              <Text style={styles.storyEyebrow}>Session review</Text>
              <Text style={styles.storyTitle}>
                {session.status === "completed"
                  ? "You completed this rehab session"
                  : "Review this rehab session"}
              </Text>
              <Text style={styles.storyText}>
                {session.status === "completed"
                  ? "Use this summary to see what you completed, how long it took, and how the session felt."
                  : "Use this summary to review what was recorded during the session and what still needs attention."}
              </Text>
            </Card>

            <MediaCard
              leading={{ type: "icon", icon: "exercise", tone: "accent" }}
              title={session.status === "completed" ? "Completed session" : "Session summary"}
              subtitle={`${session.exerciseCount} exercises · ${formatDuration(session.durationSeconds)}`}
              chips={[
                ...(typeof session.avgPainDuring === "number"
                  ? [{ text: `Pain ${session.avgPainDuring}/5`, tone: "warning" as const }]
                  : [{ text: "Pain —", tone: "muted" as const }]),
                ...(isOffline ? [{ text: "Offline", tone: "warning" as const }] : []),
              ]}
              variant="emphasis"
              statusPill={{ text: statusLabel, tone: session.status === "completed" ? "success" : "info" }}
            />

            <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntroCard}>
              <Text style={styles.sectionEyebrow}>Session summary</Text>
              <Text style={styles.sectionTitle}>See what you completed and how the session went</Text>
              <Text style={styles.sectionText}>
                Start with the overall session summary, then review the exercise-by-exercise breakdown below.
              </Text>
            </Card>

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
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Started</Text>
                  <Text style={styles.summaryValue}>{formatISOToHuman(session.startedAt)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Ended</Text>
                  <Text style={styles.summaryValue}>{formatISOToHuman(session.endedAt)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Status</Text>
                  <Text style={styles.summaryValue}>{statusLabel}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Completed</Text>
                  <Text style={styles.summaryValue}>
                    {session.completedCount}/{session.exerciseCount}
                  </Text>
                </View>
              </View>
            </Card>

            <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntroCard}>
              <Text style={styles.sectionEyebrow}>Exercise breakdown</Text>
              <Text style={styles.sectionTitle}>Review each exercise from this session</Text>
              <Text style={styles.sectionText}>
                Use the breakdown below to see what was finished, how difficult it felt, and where pain was reported.
              </Text>
            </Card>

            <View style={styles.exerciseList}>
              {session.exercises.map((exercise) => (
                <MediaCard
                  key={`${exercise.itemKey}-${exercise.order}`}
                  variant={exercise.completed ? "default" : "compact"}
                  leading={{ type: "icon", icon: "exercise", tone: "accent" }}
                  title={exercise.nameSnapshot}
                  subtitle={
                    exercise.note ??
                    (exercise.completed
                      ? "Completed during this session."
                      : "Not completed during this session.")
                  }
                  chips={[
                    { text: `Exercise ${exercise.order}`, tone: "muted" as const },
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
    headerPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    centered: {
      minHeight: 120,
      alignItems: "center",
      justifyContent: "center",
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
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.colors.border,
      paddingBottom: tokens.spacing.sm,
    },
    summaryLabel: {
      flex: 1,
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    summaryValue: {
      flexShrink: 1,
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
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
