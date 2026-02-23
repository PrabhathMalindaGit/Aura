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
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { useAuth } from "@/src/state/auth";
import {
  getCachedExercisePlan,
  setCachedExercisePlan,
} from "@/src/state/exercisePlanCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { addPending } from "@/src/state/pendingSessions";
import { useLastRefreshed } from "@/src/state/refresh";
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

  const completedCount = useMemo(
    () => sessionExercises.filter((item) => item.completed).length,
    [sessionExercises]
  );

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
      <Screen title="Exercise session">
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
    <Screen title="Exercise session">
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
        <LastRefreshed label="Last session save" value={exerciseSessionsRefresh.label} />
        <LastFailedAttempt
          value={saveSessionError.label}
          title={saveSessionError.lastError?.title}
          message={saveSessionError.lastError?.message}
          onClear={saveSessionError.lastError ? saveSessionError.clear : undefined}
        />

        {notice ? (
          <InlineNotice
            variant={notice.variant}
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
          <Section title="Today’s plan">
            <Text style={styles.emptyText}>
              No plan assigned yet. Ask your clinician to assign one before starting a session.
            </Text>
            <PrimaryButton
              label="Back to plan"
              onPress={() => {
                router.replace("/exercise-plan");
              }}
            />
          </Section>
        ) : (
          <>
            <Section title="Session timer">
              <Text style={styles.timerValue}>{formatDuration(elapsedSeconds)}</Text>
              <Text style={styles.timerSubtext}>
                Completed exercises: {completedCount}/{sessionExercises.length}
              </Text>
            </Section>

            <Section title={plan.title}>
              <View style={styles.exerciseList}>
                {sessionExercises.map((item, index) => (
                  <View
                    key={`${item.itemKey}-${index}`}
                    style={[
                      styles.exerciseCard,
                      item.completed ? styles.exerciseCardDone : null,
                    ]}
                  >
                    <Text style={styles.exerciseName}>{item.nameSnapshot}</Text>
                    <Text style={styles.exerciseDose}>{formatPlanDose(item)}</Text>
                    <Text style={styles.exerciseInstructions}>{item.instructions}</Text>
                    {item.completed ? (
                      <Text style={styles.feedbackSummary}>
                        {item.difficulty ? `Difficulty: ${item.difficulty} · ` : ""}
                        {typeof item.painDuring === "number" ? `Pain: ${item.painDuring}/5` : "No feedback"}
                      </Text>
                    ) : null}
                    <PrimaryButton
                      label={item.completed ? "Edit feedback" : "Mark done"}
                      onPress={() => openFeedback(index)}
                    />
                  </View>
                ))}
              </View>
            </Section>

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
          </>
        )}
      </ScrollView>

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
                    pressed ? styles.choiceChipPressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceChipText,
                      feedbackState?.difficulty === difficulty
                        ? styles.choiceChipTextActive
                        : null,
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
                onPress={() =>
                  setFeedbackState((current) =>
                    current
                      ? { ...current, painDuring: Math.max(0, current.painDuring - 1) }
                      : current
                  )
                }
                style={styles.painStepper}
              >
                <Text style={styles.painStepperText}>−</Text>
              </Pressable>
              <Text style={styles.painValue}>{feedbackState?.painDuring ?? 0}</Text>
              <Pressable
                onPress={() =>
                  setFeedbackState((current) =>
                    current
                      ? { ...current, painDuring: Math.min(5, current.painDuring + 1) }
                      : current
                  )
                }
                style={styles.painStepper}
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
              multiline
              numberOfLines={3}
              maxLength={280}
              style={styles.noteInput}
            />

            <View style={styles.modalActions}>
              <PrimaryButton
                label="Cancel"
                onPress={() => setFeedbackState(null)}
              />
              <PrimaryButton
                label="Skip"
                onPress={() => applyFeedback("skip")}
              />
              <PrimaryButton
                label="Save"
                onPress={() => applyFeedback("save")}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingBottom: 24,
  },
  centered: {
    minHeight: 120,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
    marginBottom: 8,
  },
  timerValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
  },
  timerSubtext: {
    fontSize: 14,
    color: "#4b5563",
  },
  exerciseList: {
    gap: 10,
  },
  exerciseCard: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 6,
  },
  exerciseCardDone: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4",
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  exerciseDose: {
    fontSize: 13,
    color: "#4b5563",
  },
  exerciseInstructions: {
    fontSize: 14,
    color: "#1f2937",
    lineHeight: 20,
  },
  feedbackSummary: {
    fontSize: 13,
    color: "#065f46",
    fontWeight: "500",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.32)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 14,
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  choiceRow: {
    flexDirection: "row",
    gap: 8,
  },
  choiceChip: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  choiceChipActive: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  choiceChipPressed: {
    opacity: 0.8,
  },
  choiceChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  choiceChipTextActive: {
    color: "#ffffff",
  },
  painRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  painStepper: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  painStepperText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  painValue: {
    minWidth: 28,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  noteInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: "top",
    color: "#111827",
    backgroundColor: "#ffffff",
    fontSize: 14,
  },
  modalActions: {
    gap: 8,
  },
});
