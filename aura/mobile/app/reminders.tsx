import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { listMyRequests, type AppointmentRequestItem } from "@/src/api/appointments";
import { completePatientTask, listPatientTasks } from "@/src/api/tasks";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { DomainIcon } from "@/src/components/IconSet";
import { EmptyState } from "@/src/components/EmptyState";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { Section } from "@/src/components/Section";
import { SkeletonBlock } from "@/src/components/Skeleton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrustBanner } from "@/src/components/TrustBanner";
import { ReminderCard } from "@/src/components/reminders/ReminderCard";
import { UnreadBadge } from "@/src/components/reminders/UnreadBadge";
import { useAuth } from "@/src/state/auth";
import {
  getCachedAppointmentRequests,
  setCachedAppointmentRequests,
} from "@/src/state/appointmentsCache";
import {
  getReminderReadState,
  markAllRemindersRead,
  markReminderRead,
  syncReminderReadState,
} from "@/src/state/inAppReminders";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { getCachedTasks, setCachedTasks } from "@/src/state/tasksCache";
import { useTrustStatus } from "@/src/state/trustStatus";
import { useTokens } from "@/src/theme/tokens";
import type { ReminderItem, ReminderReadState } from "@/src/types/reminder";
import type { PatientTaskItem } from "@/src/types/task";
import { normalizeUnknownError } from "@/src/utils/errors";
import {
  buildReminderItems,
  countUnreadReminders,
  splitReminderGroups,
} from "@/src/utils/reminders";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

function emptyReadState(): ReminderReadState {
  return {
    readById: {},
    updatedAt: 0,
  };
}

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
  const fallback = normalizeUnknownError(error);
  return {
    title: fallbackTitle,
    message: fallback.message,
    kind: fallback.kind,
    retryable: fallback.retryable,
  };
}

export default function RemindersScreen() {
  const auth = useAuth();
  const router = useRouter();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const remindersRefresh = useLastRefreshed("reminders");
  const tasksRefresh = useLastRefreshed("tasks");
  const appointmentsRefresh = useLastRefreshed("appointments");
  const remindersLoadError = useLastError("remindersLoad");
  const remindersActionError = useLastError("remindersAction");

  const patientId = auth.patient?.id ?? "";
  const patientLabel = auth.patient?.displayName ?? auth.patient?.id ?? "Patient";
  const patientPhotoUri = useMemo(() => extractPatientPhotoUri(auth.patient), [auth.patient]);
  const trustStatus = useTrustStatus({ patientId });

  const [tasks, setTasks] = useState<PatientTaskItem[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRequestItem[]>([]);
  const [readState, setReadState] = useState<ReminderReadState>(emptyReadState());
  const [isLoading, setIsLoading] = useState(true);
  const [showingOfflineCache, setShowingOfflineCache] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  const reminders = useMemo(
    () => buildReminderItems(tasks, appointments, readState),
    [appointments, readState, tasks],
  );
  const unreadCount = useMemo(() => countUnreadReminders(reminders), [reminders]);
  const grouped = useMemo(() => splitReminderGroups(reminders), [reminders]);

  const syncReadStateForItems = useCallback(
    async (
      nextTasks: PatientTaskItem[],
      nextAppointments: AppointmentRequestItem[],
      currentReadState: ReminderReadState,
    ) => {
      const nextReminderIds = buildReminderItems(
        nextTasks,
        nextAppointments,
        currentReadState,
      ).map((item) => item.id);
      const synced = await syncReminderReadState(patientId, nextReminderIds);
      setReadState(synced);
      return synced;
    },
    [patientId],
  );

  const loadReminders = useCallback(async () => {
    if (!auth.token || !patientId) {
      return;
    }

    setIsLoading(true);
    setNotice(null);
    const currentReadState = await getReminderReadState(patientId);

    try {
      if (isOffline) {
        const [cachedTasks, cachedAppointments] = await Promise.all([
          getCachedTasks(patientId),
          getCachedAppointmentRequests(patientId),
        ]);
        const nextTasks = cachedTasks?.items ?? [];
        const nextAppointments = cachedAppointments?.requests ?? [];
        setTasks(nextTasks);
        setAppointments(nextAppointments);
        setShowingOfflineCache(true);
        await syncReadStateForItems(nextTasks, nextAppointments, currentReadState);
        if (nextTasks.length === 0 && nextAppointments.length === 0) {
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Connect to refresh your latest reminders.",
          });
        }
        return;
      }

      const [tasksResult, appointmentsResult] = await Promise.allSettled([
        listPatientTasks(auth.token, {
          status: ["open", "in_progress", "completed", "cancelled"],
          limit: 100,
        }),
        listMyRequests(auth.token),
      ]);

      let nextTasks: PatientTaskItem[] = [];
      let nextAppointments: AppointmentRequestItem[] = [];
      let usedCache = false;
      let hadFailure = false;

      if (tasksResult.status === "fulfilled") {
        nextTasks = tasksResult.value;
        await Promise.all([setCachedTasks(patientId, nextTasks), tasksRefresh.refreshLocal()]);
      } else {
        hadFailure = true;
        const cachedTasks = await getCachedTasks(patientId);
        nextTasks = cachedTasks?.items ?? [];
        usedCache = usedCache || nextTasks.length > 0;
      }

      if (appointmentsResult.status === "fulfilled") {
        nextAppointments = appointmentsResult.value;
        await Promise.all([
          setCachedAppointmentRequests(patientId, nextAppointments),
          appointmentsRefresh.refreshLocal(),
        ]);
      } else {
        hadFailure = true;
        const cachedAppointments = await getCachedAppointmentRequests(patientId);
        nextAppointments = cachedAppointments?.requests ?? [];
        usedCache = usedCache || nextAppointments.length > 0;
      }

      setTasks(nextTasks);
      setAppointments(nextAppointments);
      setShowingOfflineCache(usedCache && hadFailure);
      await syncReadStateForItems(nextTasks, nextAppointments, currentReadState);

      if (hadFailure) {
        await remindersLoadError.setLocalError({
          title: "Some reminders are showing saved data",
          message: "A live refresh was only partially available.",
          kind: "network",
          retryable: true,
        });
        setNotice({
          variant: usedCache ? "warning" : "error",
          title: usedCache ? "Showing saved reminders" : "Couldn’t refresh reminders",
          message: usedCache
            ? "Some reminder details are from saved data."
            : "Please try again shortly.",
        });
      } else {
        await Promise.all([remindersRefresh.refreshLocal(), remindersLoadError.clear()]);
      }
    } catch (error) {
      const friendly = toFriendlyError(error, "Couldn’t load reminders");
      await remindersLoadError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });

      const [cachedTasks, cachedAppointments] = await Promise.all([
        getCachedTasks(patientId),
        getCachedAppointmentRequests(patientId),
      ]);
      const nextTasks = cachedTasks?.items ?? [];
      const nextAppointments = cachedAppointments?.requests ?? [];
      setTasks(nextTasks);
      setAppointments(nextAppointments);
      setShowingOfflineCache(nextTasks.length > 0 || nextAppointments.length > 0);
      await syncReadStateForItems(nextTasks, nextAppointments, currentReadState);
      setNotice({
        variant: nextTasks.length > 0 || nextAppointments.length > 0 ? "warning" : "error",
        title: friendly.title,
        message:
          nextTasks.length > 0 || nextAppointments.length > 0
            ? "Showing saved reminders."
            : friendly.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    appointmentsRefresh,
    auth.token,
    isOffline,
    patientId,
    remindersLoadError,
    remindersRefresh,
    syncReadStateForItems,
    tasksRefresh,
  ]);

  useFocusEffect(
    useCallback(() => {
      void loadReminders();
      return undefined;
    }, [loadReminders]),
  );

  const openReminder = useCallback(
    async (reminder: ReminderItem) => {
      const nextReadState = await markReminderRead(patientId, reminder.id);
      setReadState(nextReadState);
      router.push(reminder.linkedRoute as never);
    },
    [patientId, router],
  );

  const handleCompleteFromReminder = useCallback(
    async (reminder: ReminderItem) => {
      if (!auth.token || !reminder.completableTaskId) {
        return;
      }

      if (isOffline) {
        setNotice({
          variant: "warning",
          title: "Offline",
          message: "Reconnect to update this reminder.",
        });
        return;
      }

      setCompletingTaskId(reminder.completableTaskId);
      setNotice(null);

      try {
        const completed = await completePatientTask(auth.token, reminder.completableTaskId);
        const nextTasks = tasks.map((task) => (task.id === completed.id ? completed : task));
        setTasks(nextTasks);
        await setCachedTasks(patientId, nextTasks);
        const provisionalReadState = await markReminderRead(patientId, reminder.id);
        const relatedReminderIds = buildReminderItems(
          nextTasks,
          appointments,
          provisionalReadState,
        )
          .filter((item) => item.linkedEntityId === completed.id)
          .map((item) => item.id);
        const finalReadState = await markAllRemindersRead(patientId, relatedReminderIds);
        setReadState(finalReadState);
        await Promise.all([
          tasksRefresh.refreshLocal(),
          remindersRefresh.refreshLocal(),
          remindersActionError.clear(),
        ]);
        setNotice({
          variant: "info",
          title: "Reminder updated",
          message: `${completed.title} is marked done.`,
        });
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t update reminder");
        await remindersActionError.setLocalError({
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
      appointments,
      auth.token,
      isOffline,
      patientId,
      remindersActionError,
      remindersRefresh,
      tasks,
      tasksRefresh,
    ],
  );

  const handleMarkAllRead = useCallback(async () => {
    const unreadIds = reminders.filter((item) => item.unread).map((item) => item.id);
    if (unreadIds.length === 0) {
      return;
    }
    const nextReadState = await markAllRemindersRead(patientId, unreadIds);
    setReadState(nextReadState);
    await remindersRefresh.refreshLocal();
    setNotice({
      variant: "info",
      title: "All caught up",
      message: "Your current reminders are marked as read.",
    });
  }, [patientId, reminders, remindersRefresh]);

  if (auth.status === "loading") {
    return (
      <Screen title="Reminders" scroll={false}>
        <View style={styles.loadingState}>
          <SkeletonBlock width="60%" height={18} />
          <SkeletonBlock width="100%" height={110} radius={18} />
          <SkeletonBlock width="100%" height={110} radius={18} />
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
      banner={<TrustBanner status={trustStatus} />}
      header={
        <HeroHeader
          variant="compact"
          title="Reminders"
          subtitle="See what changed and what needs attention next."
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
              icon: "tasks",
              onPress: () => {
                router.push("/tasks" as never);
              },
              accessibilityLabel: "Open tasks",
              tone: "muted",
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
            <UnreadBadge count={unreadCount} compactLabel />
            <StatusPill
              label={`${grouped.attention.length} attention`}
              variant={grouped.attention.length > 0 ? "warning" : "neutral"}
            />
            <StatusPill
              label={`${grouped.soon.length} upcoming`}
              variant={grouped.soon.length > 0 ? "info" : "neutral"}
            />
          </View>
        </HeroHeader>
      }
    >
      <View style={styles.metaArea}>
        <LastRefreshed value={remindersRefresh.label} compact />
        {showingOfflineCache ? (
          <Banner
            variant="info"
            title="Showing saved reminders"
            message="Connect to refresh the latest workflow changes."
          />
        ) : null}
        {notice ? (
          <Banner
            variant={notice.variant === "error" ? "danger" : notice.variant}
            title={notice.title}
            message={notice.message}
          />
        ) : null}
        {remindersLoadError.lastError ? (
          <LastFailedAttempt
            label="Last reminder load failure"
            value={remindersLoadError.label}
            title={remindersLoadError.lastError.title}
            message={remindersLoadError.lastError.message}
            onClear={remindersLoadError.clear}
            compact
          />
        ) : null}
        {remindersActionError.lastError ? (
          <LastFailedAttempt
            label="Last reminder action failure"
            value={remindersActionError.label}
            title={remindersActionError.lastError.title}
            message={remindersActionError.lastError.message}
            onClear={remindersActionError.clear}
            compact
          />
        ) : null}
      </View>

      <Section
        title="Reminder center"
        subtitle="Open a reminder to jump back into the right part of your care plan."
        left={<DomainIcon icon="info" tone="muted" accessibilityLabel="Reminders icon" />}
        right={
          unreadCount > 0 ? (
            <SecondaryButton label="Mark all as read" onPress={() => void handleMarkAllRead()} />
          ) : (
            <UnreadBadge count={0} compactLabel />
          )
        }
        card
      >
        {isLoading ? (
          <View style={styles.loadingState}>
            <SkeletonBlock width="100%" height={104} radius={16} />
            <SkeletonBlock width="100%" height={104} radius={16} />
          </View>
        ) : reminders.length === 0 ? (
          <EmptyState
            variant="compact"
            illustrationKey="today"
            title="No reminders right now"
            description="You’re all caught up. New follow-up steps will appear here when something changes."
            ctaLabel="Open check-in"
            onCtaPress={() => {
              router.push("/(tabs)/checkin" as never);
            }}
          />
        ) : (
          <View style={styles.groupStack}>
            {grouped.attention.length > 0 ? (
              <Section
                title="Needs attention now"
                subtitle="Start with overdue or care-team follow-up items."
                left={<DomainIcon icon="warning" tone="warning" accessibilityLabel="Attention reminders" />}
              >
                <View style={styles.listStack}>
                  {grouped.attention.map((reminder) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      onPressPrimary={() => {
                        void openReminder(reminder);
                      }}
                      secondaryLabel={reminder.completableTaskId ? "Mark done" : undefined}
                      secondaryBusy={completingTaskId === reminder.completableTaskId}
                      onPressSecondary={
                        reminder.completableTaskId
                          ? () => {
                              void handleCompleteFromReminder(reminder);
                            }
                          : undefined
                      }
                    />
                  ))}
                </View>
              </Section>
            ) : null}

            {grouped.soon.length > 0 ? (
              <Section
                title="Coming up soon"
                subtitle="Upcoming appointments and follow-up steps to keep on track."
                left={<DomainIcon icon="weekly" tone="accent" accessibilityLabel="Upcoming reminders" />}
              >
                <View style={styles.listStack}>
                  {grouped.soon.map((reminder) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      onPressPrimary={() => {
                        void openReminder(reminder);
                      }}
                    />
                  ))}
                </View>
              </Section>
            ) : null}

            {grouped.recent.length > 0 ? (
              <Section
                title="Recent updates"
                subtitle="Quiet updates from recently handled tasks and appointment changes."
                left={<DomainIcon icon="success" tone="success" accessibilityLabel="Recent reminder updates" />}
              >
                <View style={styles.listStack}>
                  {grouped.recent.map((reminder) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      compact
                      onPressPrimary={() => {
                        void openReminder(reminder);
                      }}
                    />
                  ))}
                </View>
              </Section>
            ) : null}
          </View>
        )}
      </Section>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xl,
    },
    headerMeta: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    metaArea: {
      gap: tokens.spacing.sm,
    },
    loadingState: {
      gap: tokens.spacing.sm,
    },
    groupStack: {
      gap: tokens.spacing.md,
    },
    listStack: {
      gap: tokens.spacing.sm,
    },
  });
}
