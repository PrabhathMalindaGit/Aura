import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  getPromInstance,
  submitProm,
  type PromAnswer,
  type PromInstance,
} from "@/src/api/patient";
import { InlineNotice } from "@/src/components/InlineNotice";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { useAuth } from "@/src/state/auth";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import {
  getCachedPromInstance,
  setCachedPromInstance,
} from "@/src/state/promsCache";
import {
  clearPromDraft,
  getPromDraft,
  setPromDraft,
} from "@/src/state/promDrafts";
import { addPendingPromSubmission } from "@/src/state/pendingPromSubmissions";
import { normalizeUnknownError } from "@/src/utils/errors";

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
      message: "You’re offline. Nothing was sent.",
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
      message: appError.message || "Please review your answers and try again.",
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

function normalizedPromId(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0].trim() : "";
  }

  return "";
}

export default function PromFillScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ promId?: string | string[] }>();
  const promId = normalizedPromId(params.promId);
  const auth = useAuth();
  const isOffline = useIsOffline();
  const promsLoadError = useLastError("promsLoad");
  const promSubmitError = useLastError("promSubmit");

  const patientId = auth.patient?.id ?? "";
  const [instance, setInstance] = useState<PromInstance | null>(null);
  const [answersMap, setAnswersMap] = useState<Record<string, number>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const loadInstance = useCallback(async () => {
    if (!auth.token || !patientId || !promId) {
      return;
    }

    setIsLoading(true);
    setNotice(null);

    const [cachedInstance, savedDraft] = await Promise.all([
      getCachedPromInstance(patientId, promId),
      getPromDraft(patientId, promId),
    ]);

    if (cachedInstance) {
      setInstance(cachedInstance);
    }

    if (savedDraft) {
      setAnswersMap(savedDraft.answers);
    } else if (cachedInstance?.answers?.length) {
      setAnswersMap(
        Object.fromEntries(
          cachedInstance.answers.map((answer) => [answer.questionId, answer.value])
        )
      );
    }

    if (isOffline) {
      if (cachedInstance) {
        setNotice({
          variant: "warning",
          title: "Offline",
          message: "Offline — using saved questionnaire.",
        });
      } else {
        setNotice({
          variant: "warning",
          title: "Offline",
          message: "Offline — open this questionnaire once online before filling offline.",
        });
      }
      setIsLoading(false);
      return;
    }

    try {
      const live = await getPromInstance(auth.token, promId);
      setInstance(live);
      await setCachedPromInstance(patientId, live);
      if (!savedDraft && live.answers.length > 0) {
        setAnswersMap(
          Object.fromEntries(live.answers.map((answer) => [answer.questionId, answer.value]))
        );
      }
      await promsLoadError.clear();
    } catch (error) {
      const friendly = toFriendlyError(error, "Couldn’t load questionnaire");
      await promsLoadError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });

      if (cachedInstance) {
        setNotice({
          variant: "warning",
          title: friendly.title,
          message: "Using saved questionnaire while live load failed.",
          actionLabel: friendly.retryable ? "Retry" : undefined,
          onAction: friendly.retryable
            ? () => {
                void loadInstance();
              }
            : undefined,
        });
      } else {
        setNotice({
          variant: "error",
          title: friendly.title,
          message: friendly.message,
          actionLabel: friendly.retryable ? "Retry" : undefined,
          onAction: friendly.retryable
            ? () => {
                void loadInstance();
              }
            : undefined,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [auth.token, isOffline, patientId, promId, promsLoadError]);

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadInstance();
      return undefined;
    }, [auth.status, loadInstance])
  );

  const questions = instance?.questions ?? [];
  const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(questions.length - 1, 0));
  const currentQuestion = questions[safeIndex] ?? null;
  const currentValue = currentQuestion ? answersMap[currentQuestion.id] : undefined;

  const progressLabel = useMemo(() => {
    if (!currentQuestion || questions.length === 0) {
      return "0 of 0";
    }
    return `${safeIndex + 1} of ${questions.length}`;
  }, [currentQuestion, questions.length, safeIndex]);

  const canMoveNext =
    currentQuestion !== null && typeof currentValue === "number";

  const setAnswer = async (questionId: string, value: number): Promise<void> => {
    const nextMap = {
      ...answersMap,
      [questionId]: value,
    };
    setAnswersMap(nextMap);
    if (patientId && promId) {
      await setPromDraft(patientId, promId, nextMap);
    }
  };

  const submitNow = useCallback(async () => {
    if (!auth.token || !patientId || !promId || !instance) {
      return;
    }

    const missingRequired = instance.questions.some(
      (question) => question.required && typeof answersMap[question.id] !== "number"
    );
    if (missingRequired) {
      setNotice({
        variant: "warning",
        title: "Missing answers",
        message: "Please answer all required questions before submitting.",
      });
      return;
    }

    const answers: PromAnswer[] = instance.questions
      .map((question) => {
        const value = answersMap[question.id];
        if (typeof value !== "number") {
          return null;
        }
        return {
          questionId: question.id,
          value,
        };
      })
      .filter((entry): entry is PromAnswer => Boolean(entry));

    setIsSubmitting(true);
    setNotice(null);

    if (isOffline) {
      await addPendingPromSubmission(patientId, {
        promId,
        answers,
      });
      await clearPromDraft(patientId, promId);
      await promSubmitError.setLocalError({
        title: "Couldn’t submit",
        message: "You’re offline. Nothing was sent.",
        kind: "offline",
        retryable: true,
      });
      router.replace("/proms" as never);
      setIsSubmitting(false);
      return;
    }

    try {
      await submitProm(auth.token, promId, answers);
      await clearPromDraft(patientId, promId);
      await promSubmitError.clear();
      router.replace("/proms" as never);
    } catch (error) {
      const friendly = toFriendlyError(error, "Couldn’t submit questionnaire");
      await addPendingPromSubmission(patientId, {
        promId,
        answers,
      });
      await promSubmitError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });
      setNotice({
        variant: "error",
        title: friendly.title,
        message: `${friendly.message} Saved locally for later submission.`,
        actionLabel: friendly.retryable ? "Retry" : undefined,
        onAction: friendly.retryable
          ? () => {
              void submitNow();
            }
          : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    answersMap,
    auth.token,
    instance,
    isOffline,
    patientId,
    promId,
    promSubmitError,
    router,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen title="Questionnaire">
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  if (!promId) {
    return (
      <Screen title="Questionnaire">
        <InlineNotice
          variant="error"
          title="Invalid questionnaire"
          message="Questionnaire ID is missing."
          actionLabel="Back"
          onAction={() => router.replace("/proms" as never)}
        />
      </Screen>
    );
  }

  return (
    <Screen title="Questionnaire">
      <ScrollView contentContainerStyle={styles.container}>
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
        ) : !instance ? (
          <InlineNotice
            variant="warning"
            title="Questionnaire unavailable"
            message="Open this questionnaire while online first, then you can continue offline."
            actionLabel="Back"
            onAction={() => router.replace("/proms" as never)}
          />
        ) : instance.status === "completed" ? (
          <View style={styles.completedContainer}>
            <Text style={styles.completedTitle}>Already submitted</Text>
            <Text style={styles.completedMessage}>
              This questionnaire is already completed.
            </Text>
            <PrimaryButton
              label="Back to questionnaires"
              onPress={() => {
                router.replace("/proms" as never);
              }}
            />
          </View>
        ) : currentQuestion ? (
          <View style={styles.stack}>
            <Text style={styles.metaText}>{instance.title}</Text>
            <Text style={styles.metaText}>Progress: {progressLabel}</Text>

            <View style={styles.questionCard}>
              <Text style={styles.questionText}>{currentQuestion.text}</Text>
              <View style={styles.optionsRow}>
                {Array.from(
                  { length: currentQuestion.max - currentQuestion.min + 1 },
                  (_, index) => currentQuestion.min + index
                ).map((value) => {
                  const selected = currentValue === value;
                  return (
                    <Pressable
                      key={value}
                      style={({ pressed }) => [
                        styles.optionButton,
                        selected ? styles.optionButtonSelected : null,
                        pressed ? styles.optionButtonPressed : null,
                      ]}
                      onPress={() => {
                        void setAnswer(currentQuestion.id, value);
                      }}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          selected ? styles.optionTextSelected : null,
                        ]}
                      >
                        {value}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {(currentQuestion.labels?.minLabel || currentQuestion.labels?.maxLabel) ? (
                <View style={styles.labelsRow}>
                  <Text style={styles.labelText}>{currentQuestion.labels?.minLabel ?? ""}</Text>
                  <Text style={styles.labelText}>{currentQuestion.labels?.maxLabel ?? ""}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.actionsRow}>
              <PrimaryButton
                label="Back"
                disabled={safeIndex === 0 || isSubmitting}
                onPress={() => {
                  setCurrentIndex((prev) => Math.max(0, prev - 1));
                }}
              />
              {safeIndex < questions.length - 1 ? (
                <PrimaryButton
                  label="Next"
                  disabled={!canMoveNext || isSubmitting}
                  onPress={() => {
                    setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1));
                  }}
                />
              ) : (
                <PrimaryButton
                  label={isSubmitting ? "Submitting…" : "Submit"}
                  loading={isSubmitting}
                  disabled={!canMoveNext || isSubmitting}
                  onPress={() => {
                    void submitNow();
                  }}
                />
              )}
            </View>
          </View>
        ) : (
          <InlineNotice
            variant="error"
            title="No questions available"
            message="This questionnaire has no questions configured."
            actionLabel="Back"
            onAction={() => router.replace("/proms" as never)}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 24,
  },
  centered: {
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  stack: {
    gap: 12,
  },
  metaText: {
    fontSize: 13,
    color: "#4b5563",
  },
  questionCard: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 14,
    gap: 12,
  },
  questionText: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
    color: "#111827",
  },
  optionsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  optionButton: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
  },
  optionButtonSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#dbeafe",
  },
  optionButtonPressed: {
    opacity: 0.8,
  },
  optionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2937",
  },
  optionTextSelected: {
    color: "#1d4ed8",
  },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  labelText: {
    flex: 1,
    fontSize: 12,
    color: "#6b7280",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  completedContainer: {
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
  },
  completedTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  completedMessage: {
    fontSize: 13,
    color: "#4b5563",
  },
});
