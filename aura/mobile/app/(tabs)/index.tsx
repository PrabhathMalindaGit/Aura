import React from "react";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { listMyRequests, type AppointmentRequestItem } from "@/src/api/appointments";
import { listPatientTasks } from "@/src/api/tasks";
import { getDueProms, type CheckInItem, type PromDueCard } from "@/src/api/patient";
import { Avatar } from "@/src/components/Avatar";
import { Card } from "@/src/components/Card";
import { EmptyState } from "@/src/components/EmptyState";
import { HeroHeader } from "@/src/components/HeroHeader";
import { DomainIcon } from "@/src/components/IconSet";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { UnreadBadge } from "@/src/components/reminders/UnreadBadge";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { Section } from "@/src/components/Section";
import { SkeletonBlock } from "@/src/components/Skeleton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { TipCard } from "@/src/components/TipCard";
import { TrustBanner } from "@/src/components/TrustBanner";
import { TrustCues } from "@/src/components/TrustCues";
import { useAuth } from "@/src/state/auth";
import {
  getCachedAppointmentRequests,
  setCachedAppointmentRequests,
} from "@/src/state/appointmentsCache";
import { getCachedCheckins } from "@/src/state/checkinsCache";
import { getCachedExercisePlan } from "@/src/state/exercisePlanCache";
import { getCachedInsights } from "@/src/state/insightsCache";
import { getCachedProms, setCachedPromDueCards } from "@/src/state/promsCache";
import { getCachedRehabPhases } from "@/src/state/rehabPhasesCache";
import { getReminderReadState, markReminderRead, syncReminderReadState } from "@/src/state/inAppReminders";
import { useLastRefreshed } from "@/src/state/refresh";
import { getCachedTasks, setCachedTasks } from "@/src/state/tasksCache";
import { useIsOffline } from "@/src/state/network";
import { useTrustStatus } from "@/src/state/trustStatus";
import { getCachedWeeklyReport } from "@/src/state/weeklyReportCache";
import { useDevRenderAudit } from "@/src/dev/renderAudit";
import { useTokens } from "@/src/theme/tokens";
import type { ReminderItem, ReminderReadState } from "@/src/types/reminder";
import type { PatientTaskItem } from "@/src/types/task";
import { addDaysISO, formatISOToHuman, startOfWeekMondayISO, todayISO } from "@/src/utils/date";
import { buildReminderItems, buildReminderPreview, countUnreadReminders } from "@/src/utils/reminders";
import { isTaskActive } from "@/src/utils/tasks";

// Layout: Single Screen wrapper; avoid nested ScrollView.
type CheckinSummary = {
  status: "loading" | "ready";
  lastDateISO: string | null;
  completedToday: boolean;
};

type PlanSummary = {
  status: "loading" | "assigned" | "none";
  itemCount: number;
  previewItems: string[];
};

type RehabSummary = {
  status: "loading" | "set" | "none";
  currentTitle: string;
};

type PromSummary = {
  status: "loading" | "hasDue" | "none";
  dueCount: number;
};

type WeeklySummary = {
  status: "loading" | "available" | "none";
  headline: string;
  highlightsCount: number;
};

type InsightSummary = {
  status: "loading" | "available" | "none";
  itemCount: number;
  top: Array<{ id: string; title: string; message: string }>;
};

type AppointmentSummary = {
  status: "loading" | "ready";
  pendingCount: number;
  nextApprovedLabel: string;
  hasUpcoming: boolean;
};

const EMPTY_READ_STATE: ReminderReadState = {
  readById: {},
  updatedAt: 0,
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

function resolveCheckInDateISO(item: CheckInItem): string | null {
  if (typeof item.date === "string" && item.date.trim()) {
    return item.date.slice(0, 10);
  }

  if (typeof item.createdAt === "string" && item.createdAt.trim()) {
    return item.createdAt.slice(0, 10);
  }

  return null;
}

function parseCheckInTimestamp(item: CheckInItem): number {
  if (typeof item.createdAt === "string" && item.createdAt.trim()) {
    const parsed = Date.parse(item.createdAt);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const dateISO = resolveCheckInDateISO(item);
  if (!dateISO) {
    return 0;
  }

  const parsed = Date.parse(`${dateISO}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, current) => sum + current, 0) / values.length;
}

function reminderToneToTipTone(
  tone: ReminderItem["tone"],
): "info" | "success" | "warning" | "neutral" {
  if (tone === "warning") {
    return "warning";
  }
  if (tone === "success") {
    return "success";
  }
  if (tone === "neutral") {
    return "neutral";
  }
  return "info";
}

function buildAttentionChips(reminder: ReminderItem | null, additionalCount: number): string[] {
  if (!reminder) {
    return [];
  }

  const next = [...reminder.chips];

  if (reminder.timingLabel) {
    next.unshift(reminder.timingLabel);
  } else if (reminder.statusLabel) {
    next.unshift(reminder.statusLabel);
  }

  if (additionalCount > 0) {
    next.push(`${additionalCount} more item${additionalCount === 1 ? "" : "s"}`);
  }

  return Array.from(new Set(next.filter((item) => item.trim().length > 0))).slice(0, 3);
}

export default function HomeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  useDevRenderAudit("TodayScreen");

  const patientId = auth.patient?.id ?? "";
  const patientLabel = auth.patient?.displayName ?? auth.patient?.id ?? "Unknown";
  const patientPhotoUri = useMemo(() => extractPatientPhotoUri(auth.patient), [auth.patient]);

  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const thisWeekStart = startOfWeekMondayISO(tzOffsetMinutes);
  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  const friendlyDate = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }).format(new Date()),
    []
  );

  const [checkinSummary, setCheckinSummary] = useState<CheckinSummary>({
    status: "loading",
    lastDateISO: null,
    completedToday: false,
  });
  const [recentCheckins, setRecentCheckins] = useState<CheckInItem[]>([]);
  const [planSummary, setPlanSummary] = useState<PlanSummary>({
    status: "loading",
    itemCount: 0,
    previewItems: [],
  });
  const [rehabSummary, setRehabSummary] = useState<RehabSummary>({
    status: "loading",
    currentTitle: "",
  });
  const [promSummary, setPromSummary] = useState<PromSummary>({
    status: "loading",
    dueCount: 0,
  });
  const [promDueCards, setPromDueCards] = useState<PromDueCard[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary>({
    status: "loading",
    headline: "",
    highlightsCount: 0,
  });
  const [insightSummary, setInsightSummary] = useState<InsightSummary>({
    status: "loading",
    itemCount: 0,
    top: [],
  });
  const [taskItems, setTaskItems] = useState<PatientTaskItem[]>([]);
  const [reminderReadState, setReminderReadState] = useState<ReminderReadState>(EMPTY_READ_STATE);
  const [appointmentSummary, setAppointmentSummary] = useState<AppointmentSummary>({
    status: "loading",
    pendingCount: 0,
    nextApprovedLabel: "No upcoming appointments",
    hasUpcoming: false,
  });
  const [appointmentRequests, setAppointmentRequests] = useState<AppointmentRequestItem[]>([]);

  const checkinsRefresh = useLastRefreshed("checkins");
  const exercisePlanRefresh = useLastRefreshed("exercisePlan");
  const rehabPhasesRefresh = useLastRefreshed("rehabPhases");
  const promsRefresh = useLastRefreshed("proms");
  const weeklyReportRefresh = useLastRefreshed("weeklyReport");
  const insightsRefresh = useLastRefreshed("insights");
  const appointmentsRefresh = useLastRefreshed("appointments");
  const tasksRefresh = useLastRefreshed("tasks");
  const remindersRefresh = useLastRefreshed("reminders");

  const trustStatus = useTrustStatus({ patientId });

  const lastCheckinLabel = useMemo(() => {
    if (checkinSummary.status === "loading") {
      return "…";
    }

    if (!checkinSummary.lastDateISO) {
      return "—";
    }

    if (checkinSummary.lastDateISO === today) {
      return "Today";
    }

    if (checkinSummary.lastDateISO === yesterday) {
      return "Yesterday";
    }

    return formatISOToHuman(checkinSummary.lastDateISO);
  }, [checkinSummary.lastDateISO, checkinSummary.status, today, yesterday]);

  const isDashboardLoading =
    checkinSummary.status === "loading" ||
    planSummary.status === "loading" ||
    weeklySummary.status === "loading" ||
    insightSummary.status === "loading" ||
    appointmentSummary.status === "loading";

  const { painSeries, moodSeries, adherenceSeries, medsBoolSeries } = useMemo(() => {
    const window = recentCheckins.slice(0, 7).reverse();

    const pain = window
      .map((item) => (typeof item.pain === "number" && Number.isFinite(item.pain) ? item.pain : null))
      .filter((value): value is number => value !== null);
    const mood = window
      .map((item) => (typeof item.mood === "number" && Number.isFinite(item.mood) ? item.mood : null))
      .filter((value): value is number => value !== null);
    const adherence = window
      .map((item) =>
        typeof item.adherence?.exercises === "number" && Number.isFinite(item.adherence.exercises)
          ? item.adherence.exercises * 100
          : null
      )
      .filter((value): value is number => value !== null);
    const meds = window
      .map((item) =>
        typeof item.adherence?.medication === "boolean" ? (item.adherence.medication ? 1 : 0) : null
      )
      .filter((value): value is 0 | 1 => value !== null);

    return {
      painSeries: pain,
      moodSeries: mood,
      adherenceSeries: adherence,
      medsBoolSeries: meds,
    };
  }, [recentCheckins]);

  const painAvg = useMemo(() => average(painSeries), [painSeries]);
  const moodAvg = useMemo(() => average(moodSeries), [moodSeries]);
  const adherenceAvg = useMemo(() => average(adherenceSeries), [adherenceSeries]);
  const medsPct = useMemo(() => {
    const medsAverage = average(medsBoolSeries);
    return medsAverage === null ? null : medsAverage * 100;
  }, [medsBoolSeries]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setCheckinSummary({
        status: "ready",
        lastDateISO: null,
        completedToday: false,
      });
      setRecentCheckins([]);
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedCheckins(patientId);
      if (!active) {
        return;
      }

      if (!cached || cached.length === 0) {
        setRecentCheckins([]);
        setCheckinSummary({
          status: "ready",
          lastDateISO: null,
          completedToday: false,
        });
        return;
      }

      const withDates = cached
        .map((item) => ({
          item,
          dateISO: resolveCheckInDateISO(item),
          timestamp: parseCheckInTimestamp(item),
        }))
        .filter((entry): entry is { item: CheckInItem; dateISO: string; timestamp: number } => {
          return Boolean(entry.dateISO);
        });

      if (withDates.length === 0) {
        setRecentCheckins([]);
        setCheckinSummary({
          status: "ready",
          lastDateISO: null,
          completedToday: false,
        });
        return;
      }

      const seenKeys = new Set<string>();
      const dedupedSortedItems = [...withDates]
        .sort((left, right) => right.timestamp - left.timestamp)
        .map((entry) => entry.item)
        .filter((item, index) => {
          const dateKey = resolveCheckInDateISO(item) ?? "unknown";
          const key =
            item.id && item.id.trim()
              ? `id:${item.id}`
              : `fallback:${dateKey}:${item.createdAt ?? "na"}:${index}`;
          if (seenKeys.has(key)) {
            return false;
          }
          seenKeys.add(key);
          return true;
        });
      setRecentCheckins(dedupedSortedItems);

      const sorted = [...withDates].sort((left, right) => right.timestamp - left.timestamp);
      const completedToday = withDates.some((entry) => entry.dateISO === today);
      setCheckinSummary({
        status: "ready",
        lastDateISO: sorted[0]?.dateISO ?? null,
        completedToday,
      });
    })();

    return () => {
      active = false;
    };
  }, [checkinsRefresh.lastRefreshedAt, patientId, today]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setPlanSummary({ status: "none", itemCount: 0, previewItems: [] });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedExercisePlan(patientId);
      if (!active) {
        return;
      }

      const items = cached?.response.plan?.items ?? [];
      if (items.length === 0) {
        setPlanSummary({ status: "none", itemCount: 0, previewItems: [] });
        return;
      }

      setPlanSummary({
        status: "assigned",
        itemCount: items.length,
        previewItems: items.slice(0, 3).map((item) => item.name),
      });
    })();

    return () => {
      active = false;
    };
  }, [exercisePlanRefresh.lastRefreshedAt, patientId]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setRehabSummary({ status: "none", currentTitle: "" });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedRehabPhases(patientId);
      if (!active) {
        return;
      }

      const rehab = cached?.rehab;
      if (!rehab || rehab.phases.length === 0) {
        setRehabSummary({ status: "none", currentTitle: "" });
        return;
      }

      const current =
        rehab.phases.find((phase) => phase.key === rehab.currentKey) ??
        rehab.phases.find((phase) => phase.status === "current") ??
        null;

      setRehabSummary({
        status: "set",
        currentTitle: current?.title ?? "Not set",
      });
    })();

    return () => {
      active = false;
    };
  }, [patientId, rehabPhasesRefresh.lastRefreshedAt]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setPromSummary({ status: "none", dueCount: 0 });
      setPromDueCards([]);
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedProms(patientId);
      if (!active) {
        return;
      }

      const dueCount = cached?.dueCards.length ?? 0;
      setPromDueCards(cached?.dueCards ?? []);
      setPromSummary({
        status: dueCount > 0 ? "hasDue" : "none",
        dueCount,
      });
    })();

    return () => {
      active = false;
    };
  }, [patientId, promsRefresh.lastRefreshedAt]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setWeeklySummary({ status: "none", headline: "", highlightsCount: 0 });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedWeeklyReport(patientId, thisWeekStart);
      if (!active) {
        return;
      }

      if (!cached?.report) {
        setWeeklySummary({ status: "none", headline: "", highlightsCount: 0 });
        return;
      }

      setWeeklySummary({
        status: "available",
        headline: cached.report.summary.headline,
        highlightsCount: cached.report.summary.highlights.length,
      });
    })();

    return () => {
      active = false;
    };
  }, [patientId, thisWeekStart, weeklyReportRefresh.lastRefreshedAt]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setInsightSummary({ status: "none", itemCount: 0, top: [] });
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedInsights(patientId);
      if (!active) {
        return;
      }

      if (!cached || cached.items.length === 0) {
        setInsightSummary({ status: "none", itemCount: 0, top: [] });
        return;
      }

      setInsightSummary({
        status: "available",
        itemCount: cached.items.length,
        top: cached.items.slice(0, 1).map((item) => ({
          id: item.id,
          title: item.title,
          message: item.message,
        })),
      });
    })();

    return () => {
      active = false;
    };
  }, [insightsRefresh.lastRefreshedAt, patientId]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setTaskItems([]);
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedTasks(patientId);
      if (!active) {
        return;
      }

      setTaskItems(cached?.items ?? []);
    })();

    return () => {
      active = false;
    };
  }, [patientId, tasksRefresh.lastRefreshedAt]);

  useEffect(() => {
    let active = true;

    if (!patientId) {
      setAppointmentSummary({
        status: "ready",
        pendingCount: 0,
        nextApprovedLabel: "No upcoming appointments",
        hasUpcoming: false,
      });
      setAppointmentRequests([]);
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cached = await getCachedAppointmentRequests(patientId);
      if (!active) {
        return;
      }

      const requests = cached?.requests ?? [];
      setAppointmentRequests(requests);
      const pendingCount = requests.filter((item) => item.status === "pending").length;
      const approved = requests
        .filter((item) => item.status === "approved")
        .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
      const nextApproved = approved.find((item) => Date.parse(item.startsAt) > Date.now()) ?? null;

      setAppointmentSummary({
        status: "ready",
        pendingCount,
        nextApprovedLabel: nextApproved
          ? new Date(nextApproved.startsAt).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "No upcoming appointments",
        hasUpcoming: Boolean(nextApproved),
      });
    })();

    return () => {
      active = false;
    };
  }, [appointmentsRefresh.lastRefreshedAt, patientId]);

  useFocusEffect(
    useCallback(() => {
      const token = auth.token;
      if (!token || !patientId || isOffline) {
        return undefined;
      }

      let active = true;
      void (async () => {
        const [tasksResult, appointmentsResult, promsResult] = await Promise.allSettled([
          listPatientTasks(token, {
            status: ["open", "in_progress", "completed", "cancelled"],
            limit: 100,
          }),
          listMyRequests(token),
          getDueProms(token, 100),
        ]);

        if (!active) {
          return;
        }

        if (tasksResult.status === "fulfilled") {
          setTaskItems(tasksResult.value);
          await Promise.all([
            setCachedTasks(patientId, tasksResult.value),
            tasksRefresh.refreshLocal(),
          ]);
        }

        if (appointmentsResult.status === "fulfilled") {
          setAppointmentRequests(appointmentsResult.value);
          const pendingCount = appointmentsResult.value.filter((item) => item.status === "pending").length;
          const approved = appointmentsResult.value
            .filter((item) => item.status === "approved")
            .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
          const nextApproved =
            approved.find((item) => Date.parse(item.startsAt) > Date.now()) ?? null;

          setAppointmentSummary({
            status: "ready",
            pendingCount,
            nextApprovedLabel: nextApproved
              ? new Date(nextApproved.startsAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "No upcoming appointments",
            hasUpcoming: Boolean(nextApproved),
          });
          await Promise.all([
            setCachedAppointmentRequests(patientId, appointmentsResult.value),
            appointmentsRefresh.refreshLocal(),
          ]);
        }

        if (promsResult.status === "fulfilled") {
          setPromDueCards(promsResult.value);
          setPromSummary({
            status: promsResult.value.length > 0 ? "hasDue" : "none",
            dueCount: promsResult.value.length,
          });
          await Promise.all([
            setCachedPromDueCards(patientId, promsResult.value),
            promsRefresh.refreshLocal(),
          ]);
        }
      })();

      return () => {
        active = false;
      };
    }, [appointmentsRefresh, auth.token, isOffline, patientId, promsRefresh, tasksRefresh]),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      if (!patientId) {
        setReminderReadState(EMPTY_READ_STATE);
        return () => {
          active = false;
        };
      }

      void (async () => {
        const currentReadState = await getReminderReadState(patientId);
        if (!active) {
          return;
        }

        const synced = await syncReminderReadState(
          patientId,
          buildReminderItems(taskItems, appointmentRequests, promDueCards, currentReadState).map((item) => item.id),
        );
        if (!active) {
          return;
        }
        setReminderReadState(synced);
      })();

      return () => {
        active = false;
      };
    }, [appointmentRequests, patientId, promDueCards, taskItems]),
  );

  const activeTaskCount = useMemo(
    () => taskItems.filter((task) => isTaskActive(task)).length,
    [taskItems],
  );
  const reminders = useMemo(
    () => buildReminderItems(taskItems, appointmentRequests, promDueCards, reminderReadState),
    [appointmentRequests, promDueCards, reminderReadState, taskItems],
  );
  const previewReminders = useMemo(
    () => buildReminderPreview(reminders, 3),
    [reminders],
  );
  const unreadReminderCount = useMemo(
    () => countUnreadReminders(reminders),
    [reminders],
  );
  const primaryReminder = previewReminders[0] ?? null;
  const additionalReminderCount = useMemo(
    () => Math.max(0, reminders.length - (primaryReminder ? 1 : 0)),
    [primaryReminder, reminders.length],
  );
  const attentionChips = useMemo(
    () => buildAttentionChips(primaryReminder, additionalReminderCount),
    [additionalReminderCount, primaryReminder],
  );
  const headerSupportText = useMemo(() => {
    if (checkinSummary.completedToday) {
      return "Today’s update is complete. You can review the rest of your plan below.";
    }

    return "A short update keeps your recovery plan clear and helps your care team follow along.";
  }, [checkinSummary.completedToday]);

  const handleOpenReminder = useCallback(
    async (reminder: ReminderItem) => {
      if (patientId) {
        const nextReadState = await markReminderRead(patientId, reminder.id);
        setReminderReadState(nextReadState);
        await remindersRefresh.refreshLocal();
      }

      router.push(reminder.linkedRoute as never);
    },
    [patientId, remindersRefresh, router],
  );

  return (
    <Screen
      scroll
      auditLabel="TodayScreen"
      contentContainerStyle={styles.container}
      banner={<TrustBanner status={trustStatus} />}
    >
      {/* Header area */}
      <HeroHeader
        title="Today"
        subtitle={friendlyDate}
        left={
          <Avatar
            size={44}
            name={patientLabel}
            photoUrl={patientPhotoUri ?? undefined}
            ring={trustStatus.kind === "ok" ? "ok" : "attention"}
          />
        }
        rightActions={[
          {
            icon: "safety",
            onPress: () => {
              router.push("/safety" as never);
            },
            accessibilityLabel: "Open Safety support",
            tone: "success",
          },
          {
            icon: "bell",
            onPress: () => {
              router.push("/reminders" as never);
            },
            accessibilityLabel: "Open reminders",
            tone: unreadReminderCount > 0 ? "accent" : "muted",
          },
          {
            icon: "tasks",
            onPress: () => {
              router.push("/tasks" as never);
            },
            accessibilityLabel: "Open Tasks",
            tone: activeTaskCount > 0 ? "accent" : "muted",
          },
        ]}
      >
        <Text style={styles.heroSupportText}>{headerSupportText}</Text>
      </HeroHeader>

      {/* Status strip */}
      <TrustCues
        status={trustStatus}
        showLastUpdated={false}
        showPending
        showSavedLocalHint
        extraPills={[
          {
            label: `Last check-in: ${lastCheckinLabel}`,
            variant: checkinSummary.completedToday
              ? "success"
              : checkinSummary.lastDateISO
                ? "info"
                : "neutral",
          },
        ]}
        style={styles.statusStrip}
      />

      {primaryReminder ? (
        <Section
          title="Needs your attention"
          subtitle={`${reminders.length} update${reminders.length === 1 ? "" : "s"} ready to review.`}
          left={
            <View accessible={false} importantForAccessibility="no-hide-descendants">
              <DomainIcon icon="tasks" size={18} tone="muted" accessibilityLabel="Tasks icon" />
            </View>
          }
          right={<UnreadBadge count={unreadReminderCount} compactLabel />}
        >
          <TipCard
            tone={reminderToneToTipTone(primaryReminder.tone)}
            leading={{
              type: "icon",
              icon: primaryReminder.primaryActionIcon,
              tone: primaryReminder.tone === "warning" ? "warning" : "primary",
            }}
            title={primaryReminder.title}
            text={primaryReminder.message}
            chips={attentionChips}
            actions={[
              {
                label: primaryReminder.primaryActionLabel,
                onPress: () => {
                  void handleOpenReminder(primaryReminder);
                },
              },
              {
                label:
                  unreadReminderCount > 0
                    ? "Open reminders"
                    : activeTaskCount > 0
                      ? "View tasks"
                      : "Open details",
                kind: "secondary",
                onPress: () => {
                  if (activeTaskCount > 0 && unreadReminderCount === 0) {
                    router.push("/tasks" as never);
                    return;
                  }
                  router.push("/reminders" as never);
                },
              },
            ]}
          />
        </Section>
      ) : null}

      <Section
        title="Recovery signals"
        subtitle="A quick view of recent check-ins."
        left={
          <View accessible={false} importantForAccessibility="no-hide-descendants">
            <DomainIcon
              icon="insights"
              size={18}
              tone="muted"
              accessibilityLabel="Recovery signals icon"
            />
          </View>
        }
      >
        <View style={styles.trackerGrid}>
          <View style={styles.trackerCell}>
            <TrackerTile
              icon="checkin"
              label="Pain"
              value={painAvg !== null ? `${painAvg.toFixed(1)}/10` : "—"}
              delta="Last 7 check-ins"
              tone="warning"
              micro={
                painSeries.length >= 2
                  ? { type: "sparkline", values: painSeries, tone: "warning" }
                  : { type: "dots", values: [0, 0, 0] }
              }
              onPress={() => {
                router.push("/(tabs)/progress" as never);
              }}
            />
          </View>
          <View style={styles.trackerCell}>
            <TrackerTile
              icon="checkin"
              label="Mood"
              value={moodAvg !== null ? `${moodAvg.toFixed(1)}/5` : "—"}
              delta="Last 7 check-ins"
              tone="success"
              micro={
                moodSeries.length >= 2
                  ? { type: "sparkline", values: moodSeries, tone: "success" }
                  : { type: "dots", values: [0, 0, 0] }
              }
              onPress={() => {
                router.push("/(tabs)/progress" as never);
              }}
            />
          </View>
          <View style={styles.trackerCell}>
            <TrackerTile
              icon="exercise"
              label="Adherence"
              value={adherenceAvg !== null ? `${Math.round(adherenceAvg)}%` : "—"}
              delta="Exercises"
              tone="accent"
              micro={
                adherenceSeries.length >= 2
                  ? { type: "bars", values: adherenceSeries }
                  : { type: "dots", values: [0, 0, 0] }
              }
              onPress={() => {
                router.push("/(tabs)/progress" as never);
              }}
            />
          </View>
          <View style={styles.trackerCell}>
            <TrackerTile
              icon="meds"
              label="Medication"
              value={medsPct !== null ? `${Math.round(medsPct)}%` : "—"}
              delta="Taken"
              tone="primary"
              micro={
                medsPct !== null
                  ? { type: "ring", progress: Math.max(0, Math.min(1, medsPct / 100)) }
                  : { type: "dots", values: [0, 0, 0] }
              }
              onPress={() => {
                router.push("/(tabs)/progress" as never);
              }}
            />
          </View>
        </View>
      </Section>

      <Card
        padding={tokens.spacing.xl}
        style={styles.checkinCard}
        accessibilityLabel="Today’s check-in"
      >
        <View style={styles.checkinHeaderRow}>
          <View style={styles.checkinCopy}>
            <Text style={styles.checkinEyebrow}>Today’s check-in</Text>
            <Text style={styles.checkinTitle}>
              {checkinSummary.completedToday ? "You’re up to date for today." : "Start today’s check-in."}
            </Text>
            <Text style={styles.bodyText}>
              {checkinSummary.completedToday
                ? "Your latest update is saved. You can review progress or move on with today’s plan."
                : "A short check-in keeps your recovery timeline current and helps your care team stay aligned."}
            </Text>
          </View>
          <StatusPill
            label={checkinSummary.completedToday ? "Done today" : "Ready today"}
            variant={checkinSummary.completedToday ? "success" : "info"}
          />
        </View>

        {checkinSummary.status === "loading" ? (
          <View style={styles.skeletonStack}>
            <SkeletonBlock height={14} width="70%" />
            <SkeletonBlock height={56} width="100%" radius={14} />
          </View>
        ) : (
          <View style={styles.actionStack}>
            <View style={styles.checkinMetaRow}>
              <Text style={styles.checkinMetaLabel}>Last update</Text>
              <Text style={styles.checkinMetaValue}>{lastCheckinLabel}</Text>
            </View>
            {checkinSummary.completedToday ? (
              <SecondaryButton
                label="View progress"
                onPress={() => {
                  router.push("/(tabs)/progress");
                }}
              />
            ) : (
              <PrimaryButton
                label="Start check-in"
                onPress={() => {
                  router.push("/(tabs)/checkin");
                }}
              />
            )}
          </View>
        )}
      </Card>

      {/* Secondary card: Today plan */}
      <Section
        title="Today’s plan"
        subtitle="Your current recovery focus."
        left={
          <View accessible={false} importantForAccessibility="no-hide-descendants">
            <DomainIcon
              icon="exercise"
              size={18}
              tone="muted"
              accessibilityLabel="Exercise icon"
            />
          </View>
        }
        card
      >
        {planSummary.status === "loading" ? (
          <View style={styles.skeletonStack}>
            <SkeletonBlock height={14} width="58%" />
            <SkeletonBlock height={72} width="100%" radius={14} />
          </View>
        ) : planSummary.status === "none" ? (
          <EmptyState
            variant="compact"
            illustrationKey="today"
            title="No plan assigned for today"
            description="Open your plan screen to review upcoming exercises."
            ctaLabel="Open plan"
            onCtaPress={() => {
              router.push("/exercise-plan");
            }}
          />
        ) : (
          <MediaCard
            variant="emphasis"
            leading={{ type: "icon", icon: "exercise", tone: "primary" }}
            title={`${planSummary.itemCount} exercise item${planSummary.itemCount === 1 ? "" : "s"} planned`}
            subtitle={
              rehabSummary.status === "set"
                ? `Current phase: ${rehabSummary.currentTitle}`
                : "Your current plan is ready to review."
            }
            chips={[
              ...planSummary.previewItems.slice(0, 2).map((itemName) => ({
                text: itemName,
                tone: "muted" as const,
              })),
              ...(promSummary.status === "hasDue"
                ? [
                    {
                      text: `${promSummary.dueCount} questionnaire${
                        promSummary.dueCount === 1 ? "" : "s"
                      } due`,
                      tone: "warning" as const,
                    },
                  ]
                : []),
            ]}
            actions={[
              {
                label: "Open plan",
                kind: "secondary",
                onPress: () => {
                  router.push("/exercise-plan");
                },
              },
            ]}
          />
        )}
      </Section>

      {/* Secondary card: Insights */}
      <Section
        title="Insights"
        subtitle="Reviewed patterns from your recent progress."
        left={
          <View accessible={false} importantForAccessibility="no-hide-descendants">
            <DomainIcon
              icon="insights"
              size={18}
              tone="muted"
              accessibilityLabel="Insights icon"
            />
          </View>
        }
        card
      >
        {insightSummary.status === "loading" ? (
          <View style={styles.skeletonStack}>
            <SkeletonBlock height={14} width="50%" />
            <SkeletonBlock height={72} width="100%" radius={14} />
          </View>
        ) : insightSummary.status === "none" ? (
          <EmptyState
            variant="compact"
            illustrationKey="today"
            title="No reviewed insights yet"
            description="Insights will appear after clinician review."
          />
        ) : (
          insightSummary.top.map((item) => (
            <MediaCard
              key={item.id}
              leading={{ type: "icon", icon: "insights", tone: "success" }}
              title={item.title}
              subtitle={item.message}
              chips={[
                {
                  text: `${insightSummary.itemCount} reviewed insight${
                    insightSummary.itemCount === 1 ? "" : "s"
                  }`,
                  tone: "muted",
                },
              ]}
              actions={[
                {
                  label: "View insights",
                  kind: "secondary",
                  onPress: () => {
                    router.push("/insights" as never);
                  },
                },
              ]}
            />
          ))
        )}
      </Section>

      {/* Two-column row */}
      <View style={styles.twoColumnRow}>
        <View style={styles.twoColumnCell}>
          <MediaCard
            variant="compact"
            leading={{ type: "icon", icon: "weekly", tone: "primary" }}
            title="Weekly report"
            subtitle={
              weeklySummary.status === "available"
                ? weeklySummary.headline
                : weeklySummary.status === "loading"
                  ? "Loading…"
                  : "No report yet"
            }
            chips={
              weeklySummary.status === "available"
                ? [
                    {
                      text: `${weeklySummary.highlightsCount} highlight${
                        weeklySummary.highlightsCount === 1 ? "" : "s"
                      }`,
                      tone: "muted",
                    },
                  ]
                : weeklySummary.status === "none"
                  ? [{ text: "Tap to view", tone: "muted" }]
                  : undefined
            }
            onPress={() => {
              router.push("/weekly-report" as never);
            }}
          />
        </View>

        <View style={styles.twoColumnCell}>
          <MediaCard
            variant="compact"
            leading={{ type: "icon", icon: "appointments", tone: "primary" }}
            title="Next appointment"
            subtitle={
              appointmentSummary.status === "loading"
                ? "Loading…"
                : appointmentSummary.nextApprovedLabel
            }
            chips={[
              { text: `Pending ${appointmentSummary.pendingCount}`, tone: "muted" },
              ...(appointmentSummary.hasUpcoming
                ? []
                : [{ text: "None upcoming", tone: "muted" as const }]),
            ]}
            onPress={() => {
              router.push("/appointments" as never);
            }}
          />
        </View>
      </View>

      <TipCard
        tone="safety"
        leading={{ type: "icon", icon: "safety", tone: "success" }}
        title="Safety Plan"
        text="If symptoms change quickly or you feel unsafe, your safety plan is ready at any time."
        chips={["Always available"]}
        actions={[
          {
            label: "Open Safety Plan",
            kind: "secondary",
            onPress: () => {
              router.push("/safety" as never);
            },
          },
        ]}
      />

      {isDashboardLoading ? (
        <Text style={styles.loadingFootnote}>Loading latest dashboard data…</Text>
      ) : null}
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.xl,
      paddingBottom: tokens.spacing.xxl,
    },
    statusStrip: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    heroSupportText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      maxWidth: 320,
    },
    trackerGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    trackerCell: {
      width: "48%",
      minWidth: 0,
    },
    checkinCard: {
      backgroundColor: tokens.colors.primarySoft,
      borderColor: tokens.colors.border,
    },
    checkinHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.lg,
    },
    checkinCopy: {
      flex: 1,
      gap: tokens.spacing.sm,
    },
    checkinEyebrow: {
      color: tokens.colors.primary,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    checkinTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.title.fontSize,
      lineHeight: tokens.typography.title.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    checkinMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
    },
    checkinMetaLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    checkinMetaValue: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    actionStack: {
      gap: tokens.spacing.md,
    },
    bodyText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    supportText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    twoColumnRow: {
      flexDirection: "row",
      gap: tokens.spacing.md,
      alignItems: "stretch",
    },
    twoColumnCell: {
      flex: 1,
      minWidth: 0,
    },
    skeletonStack: {
      gap: tokens.spacing.sm,
    },
    loadingFootnote: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textAlign: "center",
    },
  });
}
