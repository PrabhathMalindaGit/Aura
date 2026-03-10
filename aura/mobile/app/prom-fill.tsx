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
import { formatISOToHuman } from "@/src/utils/date";
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
  const answeredCount = questions.reduce(
    (count, question) => count + (typeof answersMap[question.id] === "number" ? 1 : 0),
    0,
  );
  const remainingCount = Math.max(questions.length - answeredCount, 0);
  const isLastQuestion = questions.length > 0 && safeIndex === questions.length - 1;
  const dueLabel = instance ? `Due ${formatISOToHuman(instance.dueAt)}` : undefined;
  const hasLocalDraft = answeredCount > 0 && instance?.status !== "completed";

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
          subtitle={instance ? "Guided care check" : "Questionnaire"}
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
        >
          {instance && instance.status !== "completed" ? (
            <>
              <View style={styles.headerPills}>
                <StatusPill label={progressLabel} variant="info" />
                {dueLabel ? <StatusPill label={dueLabel} variant="neutral" /> : null}
                <StatusPill
                  label={isOffline ? "Offline" : hasLocalDraft ? "Saved on this device" : "Ready to answer"}
                  variant={isOffline ? "warning" : hasLocalDraft ? "success" : "neutral"}
                />
              </View>

              <Card variant="outlined" padding={tokens.spacing.md} style={styles.headerStoryCard}>
                <Text style={styles.storyEyebrow}>Assessment flow</Text>
                <Text style={styles.storyTitle}>
                  {remainingCount <= 1 ? "You are close to finishing this care check" : "Take one question at a time"}
                </Text>
                <Text style={styles.storyText}>
                  {remainingCount <= 1
                    ? "Answer the current question, then review and submit your responses when you are ready."
                    : `You’ve answered ${answeredCount} of ${questions.length}. Keep moving at a steady pace — ${remainingCount} questions are left in this check.`}
                </Text>
              </Card>
            </>
          ) : null}
        </HeroHeader>
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
                title="Assessment unavailable"
                message="Open this care check while online first, then you can continue it later from this device."
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
                <View style={styles.completedPills}>
                  <StatusPill label="Submitted" variant="success" />
                  {instance.completedAt ? (
                    <StatusPill label={`Completed ${formatISOToHuman(instance.completedAt)}`} variant="neutral" />
                  ) : null}
                </View>
                <Text style={styles.completedTitle}>This care check is already complete</Text>
                <Text style={styles.completedMessage}>
                  Your answers have already been submitted. Return to Assessments to review what is due next.
                </Text>
                <PrimaryButton
                  label="Back to assessments"
                  onPress={() => {
                    router.replace("/proms" as never);
                  }}
                />
              </View>
            </Card>
          ) : currentQuestion ? (
            <View style={styles.stack}>
              <Card variant="outlined" padding={tokens.spacing.md}>
                <View style={styles.flowCardContent}>
                  <View style={styles.flowHeader}>
                    <View style={styles.flowCopy}>
                      <Text style={styles.flowEyebrow}>Current step</Text>
                      <Text style={styles.flowTitle}>
                        {isLastQuestion ? "Final question" : `Question ${safeIndex + 1}`}
                      </Text>
                      <Text style={styles.flowText}>
                        {isLastQuestion
                          ? "Answer this final question, then submit when you are ready."
                          : `${Math.max(questions.length - (safeIndex + 1), 0)} questions will remain after this one.`}
                      </Text>
                    </View>

                    <View style={styles.progressCardWrap}>
                      <TrackerTile
                        icon="proms"
                        tone="accent"
                        label="Progress"
                        value={`${safeIndex + 1}/${questions.length}`}
                        delta={remainingCount > 0 ? `${remainingCount} left` : "Ready to submit"}
                        micro={{ type: "ring", progress: progressRatio }}
                        variant="compact"
                      />
                    </View>
                  </View>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.max(8, Math.round(progressRatio * 100))}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </Card>

              <View style={styles.pillRow}>
                <StatusPill label={isOffline ? "Offline" : "Online"} variant={isOffline ? "warning" : "neutral"} />
                {currentQuestion.required ? <StatusPill label="Required" variant="warning" /> : null}
                {typeof currentValue === "number" ? <StatusPill label={`Selected ${currentValue}`} variant="success" /> : null}
              </View>

              <Card variant="outlined" padding={tokens.spacing.md}>
                <View style={styles.questionCardContent}>
                  <View style={styles.questionIntro}>
                    <Text style={styles.questionEyebrow}>Answer this question</Text>
                    <Text style={styles.questionSupport}>
                      Choose the response that best fits how things feel right now. You can move through one question at a time.
                    </Text>
                  </View>
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
                message="This care check does not have any questions available right now."
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
            <Text style={styles.footerTitle}>
              {isLastQuestion ? "Review and submit" : "Continue when you’re ready"}
            </Text>
            <Text style={styles.footerText}>
              {isLastQuestion
                ? "Your answers are saved on this device as you go. Submit when this final response looks right."
                : "You can go back to adjust the previous answer or continue to the next question."}
            </Text>
            {isOffline ? (
              <Banner
                variant="warning"
                title="Offline"
                message="If you submit now, your answers will stay saved here and send later."
              />
            ) : null}
            <View style={styles.footerButtons}>
              <SecondaryButton
                label="Previous"
                disabled={safeIndex === 0 || isSubmitting}
                onPress={() => {
                  setCurrentIndex((prev) => Math.max(0, prev - 1));
                }}
              />
              {safeIndex < questions.length - 1 ? (
                <PrimaryButton
                  label="Continue"
                  disabled={!canMoveNext || isSubmitting}
                  onPress={() => {
                    setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1));
                  }}
                />
              ) : (
                <PrimaryButton
                  label={isSubmitting ? "Submitting…" : "Submit answers"}
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
    headerPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    headerStoryCard: {
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
    flowCardContent: {
      gap: tokens.spacing.md,
    },
    flowHeader: {
      flexDirection: "row",
      gap: tokens.spacing.md,
      alignItems: "flex-start",
      justifyContent: "space-between",
    },
    flowCopy: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    flowEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    flowTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    flowText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    progressTrack: {
      height: 8,
      borderRadius: tokens.radius.xl,
      backgroundColor: tokens.colors.surfaceElevated,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    progressFill: {
      height: "100%",
      borderRadius: tokens.radius.xl,
      backgroundColor: tokens.colors.primary,
    },
    pillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    questionCardContent: {
      gap: tokens.spacing.md,
    },
    questionIntro: {
      gap: tokens.spacing.xs,
    },
    questionEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    questionText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    questionSupport: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
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
    completedPills: {
      flexDirection: "row",
      flexWrap: "wrap",
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
    footerTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      marginBottom: tokens.spacing.xs,
    },
    footerText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      marginBottom: tokens.spacing.sm,
    },
    footerButtons: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
  });
}
