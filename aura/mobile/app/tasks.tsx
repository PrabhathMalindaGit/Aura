import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import { completePatientTask, listPatientTasks } from "@/src/api/tasks";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { DomainIcon } from "@/src/components/IconSet";
import { EmptyState } from "@/src/components/EmptyState";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { SkeletonBlock } from "@/src/components/Skeleton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrustBanner } from "@/src/components/TrustBanner";
import { TaskCard } from "@/src/components/tasks/TaskCard";
import { useAuth } from "@/src/state/auth";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { getCachedTasks, setCachedTasks } from "@/src/state/tasksCache";
import { useTrustStatus } from "@/src/state/trustStatus";
import { useTokens } from "@/src/theme/tokens";
import type { PatientTaskItem } from "@/src/types/task";
import {
  compareActiveTasks,
  compareCompletedTasks,
  derivePatientTaskAction,
  formatTaskDueLabel,
  formatTaskTitle,
  isCommunicationTask,
  isTaskActive,
} from "@/src/utils/tasks";
import { normalizeUnknownError } from "@/src/utils/errors";

type FilterMode = "active" | "completed";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

function extractPatientPhotoUri(patient: unknown): string | null {
  if (!patient || typeof patient !== "object") {
    return null;
  }

  const record = patient as Record<string, unknown>;
  const candidates = [
    record.photoUrl,
    record.avatarUrl,
    record.profilePhotoUrl,
    record.imageUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function toFriendlyError(error: unknown, fallbackTitle: string): {
  title: string;
  message: string;
  kind: "offline" | "network" | "server" | "validation" | "unknown";
  retryable: boolean;
} {
  let apiError: ApiError;
  if (isApiError(error)) {
    apiError = error;
  } else {
    const fallback = normalizeUnknownError(error);
    apiError = {
      title: fallback.title,
      message: fallback.message,
      kind: fallback.kind,
      retryable: fallback.retryable,
      detail: fallback.detail,
    };
  }

  if (apiError.kind === "offline") {
    return {
      title: fallbackTitle,
      message: "You’re offline. Showing saved tasks if available.",
      kind: "offline",
      retryable: true,
    };
  }
  if (apiError.kind === "network") {
    return {
      title: fallbackTitle,
      message: "Couldn’t reach the service. Please try again.",
      kind: "network",
      retryable: true,
    };
  }
  if (apiError.kind === "server") {
    return {
      title: fallbackTitle,
      message: "Service unavailable. Please try again shortly.",
      kind: "server",
      retryable: true,
    };
  }
  if (apiError.kind === "validation") {
    return {
      title: fallbackTitle,
      message: apiError.message || "Please review and try again.",
      kind: "validation",
      retryable: false,
    };
  }
  return {
    title: fallbackTitle,
    message: apiError.message || "Something went wrong. Please try again.",
    kind: "unknown",
    retryable: true,
  };
}

export default function TasksScreen() {
  const auth = useAuth();
  const router = useRouter();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const {
    label: tasksRefreshLabel,
    refreshLocal: refreshTasksStamp,
  } = useLastRefreshed("tasks");
  const {
    label: tasksLoadErrorLabel,
    lastError: tasksLoadLastError,
    setLocalError: setTasksLoadError,
    clear: clearTasksLoadError,
  } = useLastError("tasksLoad");
  const {
    label: taskActionErrorLabel,
    lastError: taskActionLastError,
    setLocalError: setTaskActionError,
    clear: clearTaskActionError,
  } = useLastError("taskAction");

  const patientId = auth.patient?.id ?? "";
  const patientLabel = auth.patient?.displayName ?? auth.patient?.id ?? "Patient";
  const patientPhotoUri = useMemo(() => extractPatientPhotoUri(auth.patient), [auth.patient]);

  const trustStatus = useTrustStatus({ patientId, includePendingSync: false });

  const [tasks, setTasks] = useState<PatientTaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showingOfflineCache, setShowingOfflineCache] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [mode, setMode] = useState<FilterMode>("active");
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  const applyTasks = useCallback(
    async (items: PatientTaskItem[], source: "live" | "cache") => {
      const sorted = [...items].sort((left, right) => {
        if (isTaskActive(left) && isTaskActive(right)) {
          return compareActiveTasks(left, right);
        }
        if (!isTaskActive(left) && !isTaskActive(right)) {
          return compareCompletedTasks(left, right);
        }
        return isTaskActive(left) ? -1 : 1;
      });
      setTasks(sorted);
      setShowingOfflineCache(source === "cache");
      if (source === "live" && patientId) {
        await setCachedTasks(patientId, sorted);
      }
    },
    [patientId],
  );

  const loadTasks = useCallback(async () => {
    if (!auth.token || !patientId) {
      return;
    }

    setIsLoading(true);
    setNotice(null);

    try {
      if (isOffline) {
        const cached = await getCachedTasks(patientId);
        await applyTasks(cached?.items ?? [], "cache");
        if (!cached?.items?.length) {
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Connect to refresh your care tasks.",
          });
        }
        return;
      }

      const items = await listPatientTasks(auth.token, {
        status: ["open", "in_progress", "completed", "cancelled"],
        limit: 100,
      });
      await applyTasks(items, "live");
      await Promise.all([refreshTasksStamp(), clearTasksLoadError()]);
    } catch (error) {
      const friendly = toFriendlyError(error, "Couldn’t load tasks");
      const cached = await getCachedTasks(patientId);
      await applyTasks(cached?.items ?? [], cached?.items?.length ? "cache" : "cache");
      await setTasksLoadError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });
      setNotice({
        variant: friendly.retryable ? "warning" : "error",
        title: friendly.title,
        message: friendly.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    applyTasks,
    auth.token,
    clearTasksLoadError,
    isOffline,
    patientId,
    refreshTasksStamp,
    setTasksLoadError,
  ]);

  useFocusEffect(
    useCallback(() => {
      void loadTasks();
      return undefined;
    }, [loadTasks]),
  );

  const activeTasks = useMemo(
    () => tasks.filter((task) => isTaskActive(task)).sort(compareActiveTasks),
    [tasks],
  );
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === "completed").sort(compareCompletedTasks),
    [tasks],
  );
  const nextTask = activeTasks[0] ?? null;
  const dueTodayCount = useMemo(
    () =>
      activeTasks.filter((task) => {
        const dueLabel = formatTaskDueLabel(task);
        return dueLabel === "Due today" || dueLabel === "Overdue";
      }).length,
    [activeTasks],
  );
  const communicationCount = useMemo(
    () => activeTasks.filter((task) => isCommunicationTask(task)).length,
    [activeTasks],
  );
  const workflowStory = useMemo(() => {
    if (!nextTask) {
      return {
        title: "Your follow-through queue is clear right now.",
        body: "New care steps will appear here when your clinician wants you to review, reply, or complete something next.",
      };
    }

    if (dueTodayCount > 0) {
      return {
        title: "Start with what needs attention today.",
        body: "Use the primary action on the first task below to move the next care step forward without losing your place.",
      };
    }

    if (communicationCount > 0) {
      return {
        title: "There is a follow-up reply waiting from your care team.",
        body: "Open the first communication task to continue the conversation and keep your plan moving.",
      };
    }

    return {
      title: "Your next care steps are lined up clearly.",
      body: "Review active tasks first, then use the completed view for a quick record of what you have already handled.",
    };
  }, [communicationCount, dueTodayCount, nextTask]);

  const visibleTasks = mode === "active" ? activeTasks : completedTasks;
  const listTasks = useMemo(
    () =>
      mode === "active" && nextTask
        ? activeTasks.filter((task) => task.id !== nextTask.id)
        : visibleTasks,
    [activeTasks, mode, nextTask, visibleTasks],
  );

  const handleTaskAction = useCallback(
    (task: PatientTaskItem) => {
      const action = derivePatientTaskAction(task);
      router.push(action.href as never);
    },
    [router],
  );

  const handleCompleteTask = useCallback(
    async (task: PatientTaskItem) => {
      if (!auth.token) {
        return;
      }
      if (isOffline) {
        setNotice({
          variant: "warning",
          title: "Offline",
          message: "Reconnect to mark this task as done.",
        });
        return;
      }

      setCompletingTaskId(task.id);
      setNotice(null);

      try {
        const completed = await completePatientTask(auth.token, task.id);
        const nextTasks = tasks.map((item) => (item.id === completed.id ? completed : item));
        await applyTasks(nextTasks, "live");
        await Promise.all([refreshTasksStamp(), clearTaskActionError()]);
        setNotice({
          variant: "info",
          title: "Task updated",
          message: `${formatTaskTitle(completed)} is marked done.`,
        });
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t update task");
        await setTaskActionError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });
        setNotice({
          variant: friendly.retryable ? "warning" : "error",
          title: friendly.title,
          message: friendly.message,
        });
      } finally {
        setCompletingTaskId(null);
      }
    },
    [
      applyTasks,
      auth.token,
      clearTaskActionError,
      isOffline,
      refreshTasksStamp,
      setTaskActionError,
      tasks,
    ],
  );

  if (auth.status === "loading") {
    return (
      <Screen title="Tasks" scroll={false}>
        <View style={styles.loadingState}>
          <SkeletonBlock width="56%" height={18} />
          <SkeletonBlock width="100%" height={104} radius={16} />
          <SkeletonBlock width="100%" height={104} radius={16} />
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Screen
      scroll
      contentContainerStyle={styles.container}
      banner={<TrustBanner status={trustStatus} offlineMode="onlineOnly" />}
      header={
        <HeroHeader
          variant="compact"
          title="Tasks"
          subtitle="Keep care follow-through moving one step at a time."
          left={
            <Avatar
              size={40}
              name={patientLabel}
              photoUrl={patientPhotoUri ?? undefined}
              ring={trustStatus.kind === "ok" ? "ok" : "attention"}
            />
          }
          rightActions={[
            {
              icon: "chat",
              onPress: () => {
                router.push({ pathname: "/(tabs)/chat", params: { focusComposer: "1" } } as never);
              },
              accessibilityLabel: "Open chat",
              tone: "accent",
            },
            {
              icon: "appointments",
              onPress: () => {
                router.push("/appointments" as never);
              },
              accessibilityLabel: "Open appointments",
              tone: "muted",
            },
          ]}
        >
          <View style={styles.headerMeta}>
            <StatusPill label={`${activeTasks.length} active`} variant={activeTasks.length > 0 ? "info" : "neutral"} />
            <StatusPill label={`${dueTodayCount} due now`} variant={dueTodayCount > 0 ? "warning" : "neutral"} />
            <StatusPill label={`${communicationCount} reply request${communicationCount === 1 ? "" : "s"}`} variant={communicationCount > 0 ? "info" : "neutral"} />
          </View>
        </HeroHeader>
      }
    >
      <View style={styles.metaArea}>
        <LastRefreshed value={tasksRefreshLabel} compact />
        {showingOfflineCache ? (
          <Banner
            variant="info"
            title="Showing saved tasks"
            message="Connect to refresh the latest care follow-up."
          />
        ) : null}
        {notice ? (
          <Banner variant={notice.variant === "error" ? "danger" : notice.variant} title={notice.title} message={notice.message} />
        ) : null}
        {tasksLoadLastError ? (
          <LastFailedAttempt
            label="Last task load failure"
            value={tasksLoadErrorLabel}
            title={tasksLoadLastError.title}
            message={tasksLoadLastError.message}
            onClear={clearTasksLoadError}
            compact
          />
        ) : null}
        {taskActionLastError ? (
          <LastFailedAttempt
            label="Last task action failure"
            value={taskActionErrorLabel}
            title={taskActionLastError.title}
            message={taskActionLastError.message}
            onClear={clearTaskActionError}
            compact
          />
        ) : null}
      </View>

      <Card variant="outlined" style={styles.storyCard}>
        <View style={styles.storyCopy}>
          <Text style={styles.storyEyebrow}>Today’s follow-through</Text>
          <Text style={styles.storyTitle}>{workflowStory.title}</Text>
          <Text style={styles.storyText}>{workflowStory.body}</Text>
        </View>
      </Card>

      {nextTask ? (
        <TaskCard
          testID="tasks-hero-card"
          task={nextTask}
          onPressAction={() => {
            handleTaskAction(nextTask);
          }}
          onPressComplete={
            nextTask.patientCompletable
              ? () => {
                  void handleCompleteTask(nextTask);
                }
              : undefined
          }
          completing={completingTaskId === nextTask.id}
        />
      ) : (
        <Card variant="outlined" style={styles.heroEmptyCard}>
          <Text style={styles.storyEyebrow}>Next task</Text>
          <Text style={styles.heroEmptyTitle}>Nothing is waiting right now</Text>
          <Text style={styles.heroEmptyText}>
            New follow-up steps will appear here when your care team asks you to review, reply, or complete something next.
          </Text>
        </Card>
      )}

      <Section
        title="Task list"
        subtitle="Switch between active and done items without losing the same list rhythm."
        left={<DomainIcon icon="checkin" tone="muted" accessibilityLabel="Tasks icon" />}
      >
        <SegmentedControl
          value={mode}
          onChange={setMode}
          tone="accent"
          options={[
            { value: "active", label: `Active (${activeTasks.length})`, icon: "warning" },
            { value: "completed", label: `Done (${completedTasks.length})`, icon: "success" },
          ]}
        />

        <Card variant="outlined" style={styles.listSurface}>
          {isLoading ? (
            <View style={styles.loadingState}>
              <SkeletonBlock width="100%" height={104} radius={16} />
              <SkeletonBlock width="100%" height={104} radius={16} />
            </View>
          ) : listTasks.length === 0 ? (
            <EmptyState
              variant="compact"
              illustrationKey={mode === "active" ? "today" : "progress"}
              title={
                mode === "active"
                  ? nextTask
                    ? "That is the only active task right now"
                    : "Nothing needs your attention right now"
                  : "No completed steps yet"
              }
              description={
                mode === "active"
                  ? nextTask
                    ? "Use the hero task above to handle the next step. Additional active items will appear below when there is more to do."
                    : "New follow-up steps will appear here when your care team asks you to do something next."
                  : "Completed steps will collect here so you can see what has already been handled."
              }
              ctaLabel={mode === "active" && !nextTask ? "Open chat" : undefined}
              onCtaPress={
                mode === "active" && !nextTask
                  ? () => {
                      router.push({ pathname: "/(tabs)/chat", params: { focusComposer: "1" } } as never);
                    }
                  : undefined
              }
            />
          ) : (
            <View style={styles.listStack}>
              {listTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  compact
                  completing={completingTaskId === task.id}
                  onPressAction={() => {
                    handleTaskAction(task);
                  }}
                  onPressComplete={
                    task.patientCompletable
                      ? () => {
                          void handleCompleteTask(task);
                        }
                      : undefined
                  }
                />
              ))}
            </View>
          )}
        </Card>
      </Section>

      <Section
        title="Stay on track"
        subtitle="Use chat for questions and appointments for planning so every next step stays connected."
        left={<DomainIcon icon="info" tone="muted" accessibilityLabel="Support icon" />}
        card
        cardVariant="outlined"
      >
        <View style={styles.supportRow}>
          <Text style={styles.supportText}>
            Tasks are reminders and care prompts. Use the task action to complete the next step in the app.
          </Text>
        </View>
      </Section>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xxxl,
    },
    headerMeta: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    storyCard: {
      gap: tokens.spacing.sm,
    },
    storyCopy: {
      gap: tokens.spacing.xs,
    },
    storyEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      fontWeight: tokens.typography.weights.medium,
    },
    storyTitle: {
      color: tokens.colors.text,
      fontSize: 19,
      lineHeight: 26,
      fontWeight: tokens.typography.weights.semibold,
    },
    storyText: {
      color: tokens.colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
    },
    heroEmptyCard: {
      gap: tokens.spacing.xs,
    },
    heroEmptyTitle: {
      color: tokens.colors.text,
      fontSize: 19,
      lineHeight: 26,
      fontWeight: tokens.typography.weights.semibold,
    },
    heroEmptyText: {
      color: tokens.colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
    },
    metaArea: {
      gap: tokens.spacing.sm,
    },
    listSurface: {
      gap: tokens.spacing.sm,
    },
    loadingState: {
      gap: tokens.spacing.sm,
    },
    listStack: {
      gap: tokens.spacing.sm,
    },
    supportRow: {
      gap: tokens.spacing.sm,
    },
    supportText: {
      color: tokens.colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
    },
  });
}
