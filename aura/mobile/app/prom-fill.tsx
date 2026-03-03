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
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { DomainIcon } from "@/src/components/IconSet";
import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader } from "@/src/components/HeroHeader";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { getCachedPromInstance, setCachedPromInstance } from "@/src/state/promsCache";
import { clearPromDraft, getPromDraft, setPromDraft } from "@/src/state/promDrafts";
import { addPendingPromSubmission } from "@/src/state/pendingPromSubmissions";
import { useTokens } from "@/src/theme/tokens";
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

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  return variant === "error" ? "danger" : variant;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export default function PromFillScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ promId?: string | string[] }>();
  const promId = normalizedPromId(params.promId);
  const auth = useAuth();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
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
        Object.fromEntries(cachedInstance.answers.map((answer) => [answer.questionId, answer.value])),
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
        setAnswersMap(Object.fromEntries(live.answers.map((answer) => [answer.questionId, answer.value])));
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
    }, [auth.status, loadInstance]),
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

  const progressRatio = questions.length > 0 ? clamp01((safeIndex + 1) / questions.length) : 0;

  const canMoveNext = currentQuestion !== null && typeof currentValue === "number";

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
      (question) => question.required && typeof answersMap[question.id] !== "number",
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
      <Screen scroll={false}>
        <View style={styles.centeredFull}>
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
      <Screen
        scroll={false}
        header={
          <HeroHeader
            variant="compact"
            title="Questionnaire"
            subtitle="Questionnaire ID missing"
            left={<Avatar size={40} name="Aura" fallback="icon" iconKey="proms" ring="attention" />}
            rightActions={[
              {
                icon: "home",
                tone: "muted",
                accessibilityLabel: "Back to questionnaires",
                onPress: () => {
                  router.replace("/proms" as never);
                },
              },
            ]}
          />
        }
      >
        <View style={styles.staticBody}>
          <Banner
            variant="danger"
            title="Invalid questionnaire"
            message="Questionnaire ID is missing."
          />
          <SecondaryButton
            label="Back"
            onPress={() => {
              router.replace("/proms" as never);
            }}
          />
        </View>
      </Screen>
    );
  }

  const showWizardFooter =
    Boolean(instance) && instance?.status !== "completed" && Boolean(currentQuestion);

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title={instance?.title ?? "Questionnaire"}
          subtitle={`Progress · ${progressLabel}`}
          left={
            <Avatar
              size={40}
              name={auth.patient?.displayName ?? "Aura"}
              fallback="icon"
              iconKey="proms"
              ring={isOffline ? "attention" : "none"}
            />
          }
          rightActions={[
            {
              icon: "safety",
              tone: "warning",
              accessibilityLabel: "Open Safety support",
              onPress: () => {
                router.push("/safety" as never);
              },
            },
            {
              icon: "home",
              tone: "muted",
              accessibilityLabel: "Back to questionnaires",
              onPress: () => {
                router.replace("/proms" as never);
              },
            },
          ]}
        />
      }
    >
      <View style={styles.body}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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
          ) : !instance ? (
            <View style={styles.stack}>
              <Banner
                variant="warning"
                title="Questionnaire unavailable"
                message="Open this questionnaire while online first, then you can continue offline."
              />
              <SecondaryButton
                label="Back"
                onPress={() => {
                  router.replace("/proms" as never);
                }}
              />
            </View>
          ) : instance.status === "completed" ? (
            <Card variant="outlined" padding={tokens.spacing.lg}>
              <View style={styles.completedContainer}>
                <Text style={styles.completedTitle}>Already submitted</Text>
                <Text style={styles.completedMessage}>This questionnaire is already completed.</Text>
                <PrimaryButton
                  label="Back to questionnaires"
                  onPress={() => {
                    router.replace("/proms" as never);
                  }}
                />
              </View>
            </Card>
          ) : currentQuestion ? (
            <View style={styles.stack}>
              <View style={styles.progressCardWrap}>
                <TrackerTile
                  icon="proms"
                  tone="accent"
                  label="Progress"
                  value={`${safeIndex + 1}/${questions.length}`}
                  delta={instance.title}
                  micro={{ type: "ring", progress: progressRatio }}
                  variant="compact"
                />
              </View>

              <View style={styles.pillRow}>
                <StatusPill label={isOffline ? "Offline" : "Online"} variant={isOffline ? "warning" : "neutral"} />
                {currentQuestion.required ? <StatusPill label="Required" variant="warning" /> : null}
              </View>

              <Card variant="outlined" padding={tokens.spacing.md}>
                <View style={styles.questionCardContent}>
                  <Text style={styles.questionText}>{currentQuestion.text}</Text>

                  <View style={styles.optionsRow}>
                    {Array.from(
                      { length: currentQuestion.max - currentQuestion.min + 1 },
                      (_, index) => currentQuestion.min + index,
                    ).map((value) => {
                      const selected = currentValue === value;
                      return (
                        <Pressable
                          key={value}
                          accessibilityRole="button"
                          accessibilityLabel={`Answer ${value}`}
                          accessibilityState={{ selected }}
                          style={({ pressed }) => [
                            styles.optionButton,
                            selected ? styles.optionButtonSelected : null,
                            pressed ? styles.optionButtonPressed : null,
                          ]}
                          onPress={() => {
                            void setAnswer(currentQuestion.id, value);
                          }}
                        >
                          <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]}>
                            {value}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {currentQuestion.labels?.minLabel || currentQuestion.labels?.maxLabel ? (
                    <View style={styles.labelsRow}>
                      <View style={styles.labelSide}>
                        <DomainIcon icon="info" tone="muted" size={14} accessibilityLabel="Minimum label icon" />
                        <Text style={styles.labelText}>{currentQuestion.labels?.minLabel ?? ""}</Text>
                      </View>
                      <View style={[styles.labelSide, styles.labelSideEnd]}>
                        <Text style={styles.labelText}>{currentQuestion.labels?.maxLabel ?? ""}</Text>
                        <DomainIcon icon="info" tone="muted" size={14} accessibilityLabel="Maximum label icon" />
                      </View>
                    </View>
                  ) : null}
                </View>
              </Card>
            </View>
          ) : (
            <View style={styles.stack}>
              <Banner
                variant="danger"
                title="No questions available"
                message="This questionnaire has no questions configured."
              />
              <SecondaryButton
                label="Back"
                onPress={() => {
                  router.replace("/proms" as never);
                }}
              />
            </View>
          )}
        </ScrollView>

        {showWizardFooter ? (
          <GlassPanel
            style={styles.footerPanel}
            fallbackVariant="elevated"
            fallbackOpacity={0.78}
            accessibilityLabel="Questionnaire actions"
          >
            {isOffline ? (
              <Banner
                variant="warning"
                title="Offline"
                message="If you submit now, it will be saved and sent later."
              />
            ) : null}
            <View style={styles.footerButtons}>
              <SecondaryButton
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
          </GlassPanel>
        ) : null}
      </View>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    centeredFull: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    staticBody: {
      flex: 1,
      gap: tokens.spacing.md,
      justifyContent: "center",
    },
    body: {
      flex: 1,
      gap: tokens.spacing.sm,
    },
    scrollContent: {
      paddingBottom: tokens.spacing.lg,
      gap: tokens.spacing.md,
    },
    centered: {
      minHeight: 180,
      alignItems: "center",
      justifyContent: "center",
    },
    stack: {
      gap: tokens.spacing.md,
    },
    progressCardWrap: {
      minWidth: 0,
    },
    pillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    questionCardContent: {
      gap: tokens.spacing.md,
    },
    questionText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    optionsRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
      flexWrap: "wrap",
    },
    optionButton: {
      minWidth: 44,
      minHeight: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.md,
    },
    optionButtonSelected: {
      borderColor: tokens.colors.primary,
      backgroundColor: tokens.colors.primary,
    },
    optionButtonPressed: {
      opacity: 0.84,
    },
    optionText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    optionTextSelected: {
      color: tokens.colors.primaryTextOn,
    },
    labelsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    labelSide: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
    },
    labelSideEnd: {
      justifyContent: "flex-end",
    },
    labelText: {
      flexShrink: 1,
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    completedContainer: {
      gap: tokens.spacing.sm,
    },
    completedTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    completedMessage: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    footerPanel: {
      borderRadius: tokens.radius.lg,
    },
    footerButtons: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
  });
}
