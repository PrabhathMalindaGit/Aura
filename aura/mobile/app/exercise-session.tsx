import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  createExerciseSession,
  getTodayExercisePlan,
  type ExerciseSessionCreatePayload,
  type ExerciseSessionDifficulty,
  type ExerciseSessionExercisePayload,
  type TodayPlanResponse,
} from "@/src/api/patient";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { DomainIcon } from "@/src/components/IconSet";
import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import {
  getCachedExercisePlan,
  setCachedExercisePlan,
} from "@/src/state/exercisePlanCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { addPending } from "@/src/state/pendingSessions";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
import { normalizeUnknownError } from "@/src/utils/errors";

type RunnerExercise = {
  itemKey: string;
  nameSnapshot: string;
  order: number;
  instructions: string;
  planned?: {
    sets?: number;
    reps?: number;
    holdSeconds?: number;
    restSeconds?: number;
  };
  completed: boolean;
  difficulty?: ExerciseSessionDifficulty;
  painDuring?: number;
  note?: string;
  completedAt?: string;
};

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type FeedbackState = {
  index: number;
  difficulty?: ExerciseSessionDifficulty;
  painDuring: number;
  note: string;
};

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  return variant === "error" ? "danger" : variant;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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
      title: "Couldn’t save session",
      message: "You’re offline. Nothing was sent.",
      kind: "offline",
      retryable: true,
    };
  }

  if (appError.kind === "network") {
    return {
      title: "Couldn’t save session",
      message: "Couldn’t reach the service. Saved locally instead.",
      kind: "network",
      retryable: true,
    };
  }

  if (appError.kind === "server") {
    return {
      title: "Couldn’t save session",
      message: "Service unavailable. Saved locally instead.",
      kind: "server",
      retryable: true,
    };
  }

  if (appError.kind === "validation") {
    return {
      title: "Couldn’t save session",
      message: appError.message || "Session data was invalid.",
      kind: "validation",
      retryable: false,
    };
  }

  return {
    title: "Couldn’t save session",
    message: appError.message || "Saved locally. You can submit pending later.",
    kind: "unknown",
    retryable: true,
  };
}

function trimNote(note?: string): string | undefined {
  if (typeof note !== "string") {
    return undefined;
  }
  const trimmed = note.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > 280 ? trimmed.slice(0, 280) : trimmed;
}

function formatPlanDose(item: RunnerExercise): string {
  const parts: string[] = [];
  if (typeof item.planned?.sets === "number" && typeof item.planned.reps === "number") {
    parts.push(`${item.planned.sets} sets x ${item.planned.reps} reps`);
  } else if (typeof item.planned?.reps === "number") {
    parts.push(`${item.planned.reps} reps`);
  }
  if (typeof item.planned?.holdSeconds === "number" && item.planned.holdSeconds > 0) {
    parts.push(`hold ${item.planned.holdSeconds}s`);
  }
  if (typeof item.planned?.restSeconds === "number" && item.planned.restSeconds > 0) {
    parts.push(`rest ${item.planned.restSeconds}s`);
  }
  return parts.join(" · ");
}

function toRunnerExercises(response: TodayPlanResponse): RunnerExercise[] {
  const items = response.plan?.items ?? [];
  return items
    .map((item) => ({
      itemKey: item.key,
      nameSnapshot: item.name,
      order: item.order,
      instructions: item.instructions,
      planned: {
        sets: item.sets,
        reps: item.reps,
        holdSeconds: item.holdSeconds,
        restSeconds: item.restSeconds,
      },
      completed: false,
    }))
    .sort((left, right) => left.order - right.order);
}

export default function ExerciseSessionScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const exerciseSessionsRefresh = useLastRefreshed("exerciseSessions");
  const saveSessionError = useLastError("exerciseSessionSave");

  const patientId = auth.patient?.id ?? "";
  const [planResponse, setPlanResponse] = useState<TodayPlanResponse | null>(null);
  const [sessionExercises, setSessionExercises] = useState<RunnerExercise[]>([]);
  const [sessionStartedAtMs, setSessionStartedAtMs] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queuedLocalId, setQueuedLocalId] = useState<string | null>(null);
  const [feedbackState, setFeedbackState] = useState<FeedbackState | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const completedCount = useMemo(
    () => sessionExercises.filter((item) => item.completed).length,
    [sessionExercises]
  );

  const averagePain = useMemo(() => {
    const values = sessionExercises
      .map((item) => item.painDuring)
      .filter((value): value is number => typeof value === "number");
    if (values.length === 0) {
      return null;
    }
    return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  }, [sessionExercises]);

  useEffect(() => {
    if (sessionStartedAtMs === null) {
      return;
    }

    const timer = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - sessionStartedAtMs) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionStartedAtMs]);

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
        if (!cached?.response.plan) {
          setPlanResponse(cached?.response ?? null);
          setSessionExercises([]);
          setIsLoading(false);
          setIsRefreshing(false);
          return;
        }

        setPlanResponse(cached.response);
        setSessionExercises(toRunnerExercises(cached.response));
        setSessionStartedAtMs(Date.now());
        setElapsedSeconds(0);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const response = await getTodayExercisePlan(auth.token, {
          tzOffsetMinutes: -new Date().getTimezoneOffset(),
        });
        setPlanResponse(response);
        setSessionExercises(toRunnerExercises(response));
        setSessionStartedAtMs(Date.now());
        setElapsedSeconds(0);
        await setCachedExercisePlan(patientId, response);
      } catch (error) {
        const friendly = toFriendlyError(error);
        setNotice({
          variant: "error",
          title: friendly.title,
          message: friendly.message,
        });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [auth.token, isOffline, patientId]
  );

  useEffect(() => {
    if (auth.status !== "signedIn") {
      return;
    }
    void loadPlan("initial");
  }, [auth.status, loadPlan]);

  function openFeedback(index: number): void {
    const target = sessionExercises[index];
    if (!target) {
      return;
    }
    setFeedbackState({
      index,
      difficulty: target.difficulty,
      painDuring: typeof target.painDuring === "number" ? target.painDuring : 0,
      note: target.note ?? "",
    });
  }

  function undoCompletion(index: number): void {
    setSessionExercises((previous) =>
      previous.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }
        return {
          ...item,
          completed: false,
          difficulty: undefined,
          painDuring: undefined,
          note: undefined,
          completedAt: undefined,
        };
      })
    );
  }

  function applyFeedback(mode: "save" | "skip"): void {
    if (!feedbackState) {
      return;
    }

    const nowIso = new Date().toISOString();
    setSessionExercises((previous) =>
      previous.map((item, index) => {
        if (index !== feedbackState.index) {
          return item;
        }

        if (mode === "skip") {
          return {
            ...item,
            completed: true,
            difficulty: undefined,
            painDuring: undefined,
            note: undefined,
            completedAt: item.completedAt ?? nowIso,
          };
        }

        return {
          ...item,
          completed: true,
          difficulty: feedbackState.difficulty,
          painDuring: feedbackState.painDuring,
          note: trimNote(feedbackState.note),
          completedAt: item.completedAt ?? nowIso,
        };
      })
    );
    setFeedbackState(null);
  }

  function buildPayload(endedAtIso: string): ExerciseSessionCreatePayload | null {
    if (sessionStartedAtMs === null || !planResponse?.plan) {
      return null;
    }

    const exercises: ExerciseSessionExercisePayload[] = sessionExercises.map((item) => ({
      itemKey: item.itemKey,
      nameSnapshot: item.nameSnapshot,
      order: item.order,
      planned: item.planned,
      completed: item.completed,
      setsDone: item.completed ? item.planned?.sets : undefined,
      repsDone: item.completed ? item.planned?.reps : undefined,
      difficulty: item.difficulty,
      painDuring: item.painDuring,
      note: trimNote(item.note),
      completedAt: item.completedAt,
    }));

    return {
      startedAt: new Date(sessionStartedAtMs).toISOString(),
      endedAt: endedAtIso,
      planVersion: planResponse.plan.version,
      planTitle: planResponse.plan.title,
      planDayOfWeek: planResponse.dayOfWeek,
      status: "completed",
      exercises,
    };
  }

  async function queuePending(payload: ExerciseSessionCreatePayload): Promise<void> {
    if (!patientId || queuedLocalId) {
      return;
    }
    const pending = await addPending(patientId, payload);
    setQueuedLocalId(pending.localId);
  }

  const finishSession = useCallback(async () => {
    if (!auth.token || !patientId) {
      router.replace("/(auth)/login");
      return;
    }
    if (completedCount < 1 || isSubmitting) {
      return;
    }

    const endedAtIso = new Date().toISOString();
    const payload = buildPayload(endedAtIso);
    if (!payload) {
      setNotice({
        variant: "error",
        title: "Session unavailable",
        message: "Could not build session payload. Reload and try again.",
      });
      return;
    }

    setIsSubmitting(true);
    setNotice(null);

    if (isOffline) {
      await queuePending(payload);
      await saveSessionError.setLocalError({
        title: "Couldn’t save session",
        message: "You’re offline. Saved locally — not sent.",
        kind: "offline",
        retryable: true,
      });
      setNotice({
        variant: "warning",
        title: "Saved locally",
        message: "Saved locally — will submit when you choose Submit pending.",
        actionLabel: "View sessions",
        onAction: () => {
          router.replace("/exercise-sessions");
        },
      });
      setIsSubmitting(false);
      return;
    }

    try {
      const created = await createExerciseSession(auth.token, payload);
      await exerciseSessionsRefresh.refreshLocal();
      await saveSessionError.clear();

      if (created.sessionId) {
        router.replace({
          pathname: "/exercise-session-detail",
          params: { id: created.sessionId },
        });
        return;
      }

      router.replace("/exercise-sessions");
    } catch (error) {
      const friendly = toFriendlyError(error);
      await queuePending(payload);
      await saveSessionError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });
      setNotice({
        variant: "error",
        title: friendly.title,
        message: `${friendly.message} Saved locally as pending.`,
        actionLabel: "View sessions",
        onAction: () => {
          router.replace("/exercise-sessions");
        },
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    auth.token,
    completedCount,
    exerciseSessionsRefresh,
    isOffline,
    isSubmitting,
    patientId,
    queuedLocalId,
    router,
    saveSessionError,
    sessionExercises,
    sessionStartedAtMs,
    planResponse,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Exercise session" subtitle="Runner" />}
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

  const plan = planResponse?.plan ?? null;

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Exercise session"
          subtitle={`${completedCount}/${sessionExercises.length} completed · ${formatDuration(elapsedSeconds)}`}
          left={<Avatar size={40} name="Exercise" fallback="icon" iconKey="exercise" />}
          rightActions={[
            {
              icon: "exercise",
              tone: "accent",
              accessibilityLabel: "Open plan",
              onPress: () => {
                router.push("/exercise-plan");
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
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadPlan("refresh");
            }}
          />
        }
      >
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
                <LastRefreshed label="Last session save" value={exerciseSessionsRefresh.label} compact />
                <LastFailedAttempt
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
            message="If you finish now, this session will be saved locally and queued."
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
        ) : !plan ? (
          <Card variant="outlined" padding={tokens.spacing.md}>
            <Text style={styles.emptyText}>
              No plan assigned yet. Ask your clinician to assign one before starting a session.
            </Text>
            <SecondaryButton
              label="Back to plan"
              onPress={() => {
                router.replace("/exercise-plan");
              }}
            />
          </Card>
        ) : (
          <>
            <View style={styles.trackerGrid}>
              <View style={styles.trackerTileWrap}>
                <TrackerTile
                  icon="weekly"
                  label="Elapsed"
                  value={formatDuration(elapsedSeconds)}
                  delta="Timer"
                  tone="accent"
                  micro={{ type: "dots", values: [elapsedSeconds, 0, 0, 0, 0, 0, 0] }}
                />
              </View>
              <View style={styles.trackerTileWrap}>
                <TrackerTile
                  icon="success"
                  label="Completed"
                  value={`${completedCount}/${sessionExercises.length}`}
                  delta="Exercises"
                  tone="success"
                  micro={{
                    type: "ring",
                    progress:
                      sessionExercises.length > 0
                        ? Math.max(0, Math.min(1, completedCount / sessionExercises.length))
                        : 0,
                  }}
                />
              </View>
              <View style={styles.trackerTileWrap}>
                <TrackerTile
                  icon="insights"
                  label="Difficulty"
                  value={
                    sessionExercises.find((item) => item.completed && item.difficulty)?.difficulty ?? "—"
                  }
                  delta="Latest"
                  tone="primary"
                  micro={{
                    type: "dots",
                    values: sessionExercises
                      .slice(0, 7)
                      .map((item) =>
                        item.difficulty === "hard" ? 3 : item.difficulty === "ok" ? 2 : item.difficulty === "easy" ? 1 : 0
                      ),
                  }}
                />
              </View>
              <View style={styles.trackerTileWrap}>
                <TrackerTile
                  icon="warning"
                  label="Pain"
                  value={averagePain !== null ? `${averagePain}/5` : "—"}
                  delta="Average"
                  tone="warning"
                  micro={{
                    type: "sparkline",
                    values: sessionExercises
                      .slice(0, 7)
                      .map((item) => item.painDuring ?? 0),
                    tone: "warning",
                  }}
                />
              </View>
            </View>

            <Text style={styles.planTitle}>{plan.title}</Text>
            <View style={styles.exerciseList}>
              {sessionExercises.map((item, index) => (
                <MediaCard
                  key={`${item.itemKey}-${index}`}
                  leading={{ type: "icon", icon: "exercise", tone: item.completed ? "success" : "accent" }}
                  title={item.nameSnapshot}
                  subtitle={item.instructions}
                  chips={[
                    ...(formatPlanDose(item) ? [{ text: formatPlanDose(item), tone: "muted" as const }] : []),
                    ...(item.completed
                      ? [{ text: "Done", tone: "success" as const }]
                      : [{ text: "In progress", tone: "info" as const }]),
                    ...(item.completed && !item.difficulty && typeof item.painDuring !== "number"
                      ? [{ text: "Needs feedback", tone: "warning" as const }]
                      : []),
                  ].slice(0, 3)}
                  statusPill={{
                    text: item.completed ? "Done" : "In progress",
                    tone: item.completed ? "success" : "info",
                  }}
                  actions={
                    item.completed
                      ? [
                          {
                            label: "Edit feedback",
                            kind: "primary",
                            onPress: () => openFeedback(index),
                          },
                          {
                            label: "Undo",
                            kind: "secondary",
                            onPress: () => undoCompletion(index),
                          },
                        ]
                      : [
                          {
                            label: "Mark done",
                            kind: "primary",
                            onPress: () => openFeedback(index),
                          },
                        ]
                  }
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <GlassPanel style={styles.footerPanel}>
        {isOffline ? (
          <Banner
            variant="warning"
            title="Offline"
            message="If you finish now, it will be saved locally and submitted later."
          />
        ) : null}
        <View style={styles.footerButtons}>
          <View style={styles.footerButtonWrap}>
            <SecondaryButton
              label="View sessions"
              onPress={() => {
                router.replace("/exercise-sessions");
              }}
            />
          </View>
          <View style={styles.footerButtonWrap}>
            <PrimaryButton
              label={
                queuedLocalId
                  ? "Session queued as pending"
                  : isSubmitting
                    ? "Submitting…"
                    : "Finish session"
              }
              loading={isSubmitting}
              disabled={completedCount < 1 || isSubmitting || Boolean(queuedLocalId)}
              onPress={() => {
                void finishSession();
              }}
            />
          </View>
        </View>
      </GlassPanel>

      <Modal
        visible={Boolean(feedbackState)}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackState(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>How did it feel?</Text>
            <Text style={styles.modalLabel}>Difficulty</Text>
            <View style={styles.choiceRow}>
              {(["easy", "ok", "hard"] as const).map((difficulty) => (
                <Pressable
                  key={difficulty}
                  accessibilityRole="button"
                  accessibilityLabel={`Set difficulty ${difficulty}`}
                  onPress={() =>
                    setFeedbackState((current) =>
                      current
                        ? {
                            ...current,
                            difficulty,
                          }
                        : current
                    )
                  }
                  style={({ pressed }) => [
                    styles.choiceChip,
                    feedbackState?.difficulty === difficulty ? styles.choiceChipActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceChipText,
                      feedbackState?.difficulty === difficulty ? styles.choiceChipTextActive : null,
                    ]}
                  >
                    {difficulty.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.modalLabel}>Pain during (0-5)</Text>
            <View style={styles.painRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decrease pain value"
                onPress={() =>
                  setFeedbackState((current) =>
                    current
                      ? { ...current, painDuring: Math.max(0, current.painDuring - 1) }
                      : current
                  )
                }
                style={({ pressed }) => [styles.painStepper, pressed ? styles.pressed : null]}
              >
                <Text style={styles.painStepperText}>−</Text>
              </Pressable>
              <Text style={styles.painValue}>{feedbackState?.painDuring ?? 0}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Increase pain value"
                onPress={() =>
                  setFeedbackState((current) =>
                    current
                      ? { ...current, painDuring: Math.min(5, current.painDuring + 1) }
                      : current
                  )
                }
                style={({ pressed }) => [styles.painStepper, pressed ? styles.pressed : null]}
              >
                <Text style={styles.painStepperText}>+</Text>
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Note (optional)</Text>
            <TextInput
              value={feedbackState?.note ?? ""}
              onChangeText={(value) =>
                setFeedbackState((current) =>
                  current
                    ? {
                        ...current,
                        note: value.slice(0, 280),
                      }
                    : current
                )
              }
              placeholder="Short note (optional)"
              placeholderTextColor={tokens.colors.textMuted}
              multiline
              numberOfLines={3}
              maxLength={280}
              style={styles.noteInput}
            />

            <View style={styles.modalActions}>
              <SecondaryButton label="Cancel" onPress={() => setFeedbackState(null)} />
              <SecondaryButton label="Skip" onPress={() => applyFeedback("skip")} />
              <PrimaryButton label="Save" onPress={() => applyFeedback("save")} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xxxxl,
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
      marginBottom: tokens.spacing.sm,
    },
    planTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
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
    exerciseList: {
      gap: tokens.spacing.md,
    },
    footerPanel: {
      marginTop: tokens.spacing.sm,
    },
    footerButtons: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.sm,
    },
    footerButtonWrap: {
      flex: 1,
      minWidth: 0,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: tokens.colors.overlay,
      justifyContent: "center",
      alignItems: "center",
      padding: tokens.spacing.lg,
    },
    modalCard: {
      width: "100%",
      maxWidth: 420,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.sm,
    },
    modalTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    modalLabel: {
      color: tokens.colors.text,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    choiceRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    choiceChip: {
      minHeight: 44,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      paddingHorizontal: tokens.spacing.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.surfaceElevated,
    },
    choiceChipActive: {
      borderColor: tokens.colors.primary,
      backgroundColor: tokens.colors.primary,
    },
    choiceChipText: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.text,
    },
    choiceChipTextActive: {
      color: tokens.colors.primaryTextOn,
    },
    painRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    painStepper: {
      width: 44,
      height: 44,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.surfaceElevated,
    },
    painStepperText: {
      fontSize: 20,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.text,
    },
    painValue: {
      minWidth: 28,
      textAlign: "center",
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.text,
    },
    noteInput: {
      minHeight: 88,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.sm,
      paddingHorizontal: tokens.spacing.sm + 2,
      paddingVertical: tokens.spacing.sm,
      textAlignVertical: "top",
      color: tokens.colors.text,
      backgroundColor: tokens.colors.surface,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    modalActions: {
      gap: tokens.spacing.sm,
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
