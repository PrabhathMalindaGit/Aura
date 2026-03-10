import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  getDueProms,
  getPromHistory,
  submitProm,
  type PromDueCard,
  type PromHistoryRow,
} from "@/src/api/patient";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { DomainIcon } from "@/src/components/IconSet";
import { EmptyState } from "@/src/components/EmptyState";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard, type MediaCardChip } from "@/src/components/MediaCard";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { StatusPill } from "@/src/components/StatusPill";
import { useAuth } from "@/src/state/auth";
import { getCachedProms, setCachedProms } from "@/src/state/promsCache";
import {
  getPendingPromSubmissions,
  removePendingPromSubmission,
  type PendingPromSubmission,
} from "@/src/state/pendingPromSubmissions";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
import { normalizeUnknownError } from "@/src/utils/errors";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type SegmentValue = "due" | "completed" | "all";

type ListItem =
  | {
      type: "section";
      key: string;
      label: string;
      helper?: string;
      icon: "warning" | "success" | "info";
    }
  | { type: "due"; item: PromDueCard }
  | { type: "history"; item: PromHistoryRow }
  | { type: "empty"; key: string; title: string; description: string; illustration: "today" | "progress" | "offline" };

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "--";
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return "--";
  }

  return parsed.toLocaleString();
}

function formatRelativeDate(value?: string | null): string {
  if (!value) {
    return "No due date";
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return "No due date";
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(parsed);
  startOfTarget.setHours(0, 0, 0, 0);

  const diffDays = Math.round(
    (startOfTarget.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Tomorrow";
  }
  if (diffDays === -1) {
    return "Yesterday";
  }
  if (diffDays > 1) {
    return `In ${diffDays} days`;
  }
  return `${Math.abs(diffDays)} days ago`;
}

function formatPromptDueSummary(dueAt: string): {
  statusText: string;
  statusTone: "warning" | "info" | "danger";
  subtitle: string;
} {
  const relative = formatRelativeDate(dueAt);
  if (relative === "Today") {
    return {
      statusText: "Due today",
      statusTone: "warning",
      subtitle: `Due today · ${formatDateTime(dueAt)}`,
    };
  }
  if (relative === "Tomorrow") {
    return {
      statusText: "Due soon",
      statusTone: "info",
      subtitle: `Due tomorrow · ${formatDateTime(dueAt)}`,
    };
  }
  if (relative.endsWith("ago") || relative === "Yesterday") {
    return {
      statusText: "Overdue",
      statusTone: "danger",
      subtitle: `Past due · ${formatDateTime(dueAt)}`,
    };
  }
  return {
    statusText: "Assigned",
    statusTone: "info",
    subtitle: `${relative} · ${formatDateTime(dueAt)}`,
  };
}

function toScoreChipTone(
  bandKey?: "green" | "amber" | "red",
): "success" | "warning" | "danger" | "muted" {
  if (bandKey === "green") {
    return "success";
  }
  if (bandKey === "amber") {
    return "warning";
  }
  if (bandKey === "red") {
    return "danger";
  }
  return "muted";
}

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
      message: appError.message || "Please review your input and try again.",
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

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  return variant === "error" ? "danger" : variant;
}

export default function PromsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const promsRefresh = useLastRefreshed("proms");
  const promsLoadError = useLastError("promsLoad");
  const promSubmitError = useLastError("promSubmit");

  const patientId = auth.patient?.id ?? "";
  const patientName = auth.patient?.displayName ?? auth.patient?.id ?? "Patient";
  const [due, setDue] = useState<PromDueCard[]>([]);
  const [history, setHistory] = useState<PromHistoryRow[]>([]);
  const [pending, setPending] = useState<PendingPromSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingPending, setIsSubmittingPending] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [segment, setSegment] = useState<SegmentValue>("due");
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const segmentLabel =
    segment === "due" ? "Do now" : segment === "completed" ? "Completed" : "All assessments";

  const loadPending = useCallback(async () => {
    if (!patientId) {
      setPending([]);
      return;
    }

    const entries = await getPendingPromSubmissions(patientId);
    setPending(entries);
  }, [patientId]);

  const loadProms = useCallback(
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
      await loadPending();

      if (isOffline) {
        const cached = await getCachedProms(patientId);
        if (cached) {
          setDue(cached.dueCards);
          setHistory(cached.historyRows);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — showing saved questionnaires.",
          });
        } else {
          setDue([]);
          setHistory([]);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — no saved questionnaires are available yet.",
          });
        }

        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const [liveDue, liveHistory] = await Promise.all([
          getDueProms(auth.token, 20),
          getPromHistory(auth.token, 20),
        ]);

        setDue(liveDue);
        setHistory(liveHistory);
        await setCachedProms(patientId, {
          dueCards: liveDue,
          historyRows: liveHistory,
        });
        await promsRefresh.refreshLocal();
        await promsLoadError.clear();
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t load questionnaires");
        await promsLoadError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const cached = await getCachedProms(patientId);
        if (cached) {
          setDue(cached.dueCards);
          setHistory(cached.historyRows);
          setNotice({
            variant: "warning",
            title: friendly.title,
            message: "Showing saved questionnaires. Live refresh failed.",
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadProms("refresh");
                }
              : undefined,
          });
        } else {
          setDue([]);
          setHistory([]);
          setNotice({
            variant: "error",
            title: friendly.title,
            message: friendly.message,
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadProms("refresh");
                }
              : undefined,
          });
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [auth.token, isOffline, loadPending, patientId, promsLoadError, promsRefresh],
  );

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadProms("initial");
      return undefined;
    }, [auth.status, loadProms]),
  );

  const submitPending = useCallback(async () => {
    if (!auth.token || !patientId) {
      router.replace("/(auth)/login");
      return;
    }

    if (pending.length === 0) {
      return;
    }

    if (isOffline) {
      setNotice({
        variant: "warning",
        title: "Offline",
        message: "You’re offline. Pending submissions cannot be sent yet.",
      });
      return;
    }

    setIsSubmittingPending(true);
    setNotice(null);

    let submitted = 0;
    for (const entry of pending) {
      try {
        await submitProm(auth.token, entry.promId, entry.answers);
        await removePendingPromSubmission(patientId, entry.localId);
        submitted += 1;
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t submit pending questionnaires");
        await promSubmitError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });
        setNotice({
          variant: "error",
          title: friendly.title,
          message:
            submitted > 0
              ? `Submitted ${submitted} item(s). ${friendly.message}`
              : friendly.message,
        });
        setIsSubmittingPending(false);
        await loadPending();
        return;
      }
    }

    await promSubmitError.clear();
    await promsRefresh.refreshLocal();
    await loadPending();
    await loadProms("refresh");
    setNotice({
      variant: "info",
      title: "Pending submitted",
      message: "All pending questionnaires were submitted.",
    });
    setIsSubmittingPending(false);
  }, [
    auth.token,
    isOffline,
    loadPending,
    loadProms,
    patientId,
    pending,
    promSubmitError,
    promsRefresh,
    router,
  ]);

  const listData = useMemo<ListItem[]>(() => {
    if (isLoading) {
      return [];
    }

    if (segment === "due") {
      if (due.length === 0) {
        return [
          {
            type: "empty",
            key: "empty-due",
            title: "Nothing is due right now",
            description: "You’re caught up for now. New assessments will appear here when your care team assigns them.",
            illustration: "today",
          },
        ];
      }
      return [
        {
          type: "section",
          key: "s-due",
          label: "Do next",
          helper: "Start with the next assigned assessment when you’re ready.",
          icon: "warning",
        },
        ...due.map((item) => ({ type: "due", item }) as const),
      ];
    }

    if (segment === "completed") {
      if (history.length === 0) {
        return [
          {
            type: "empty",
            key: "empty-completed",
            title: "No completed assessments yet",
            description: "Finished assessments will appear here after your first submission.",
            illustration: "progress",
          },
        ];
      }
      return [
        {
          type: "section",
          key: "s-completed",
          label: "Completed recently",
          helper: "Review your latest completed assessments and result bands here.",
          icon: "success",
        },
        ...history.map((item) => ({ type: "history", item }) as const),
      ];
    }

    if (due.length === 0 && history.length === 0) {
      return [
        {
          type: "empty",
          key: "empty-all",
          title: "No assessments available",
          description: "Check back later for new assignments from your care team.",
          illustration: isOffline ? "offline" : "today",
        },
      ];
    }

    const items: ListItem[] = [];
    items.push({
      type: "section",
      key: "s-all-due",
      label: "Do next",
      helper: "Assessments ready for you to complete now.",
      icon: "warning",
    });
    if (due.length > 0) {
      items.push(...due.map((item) => ({ type: "due" as const, item })));
    } else {
      items.push({
        type: "empty",
        key: "empty-all-due",
        title: "Nothing is due right now",
        description: "You’re caught up for now. New assessments will appear here when they’re assigned.",
        illustration: "today",
      });
    }

    items.push({
      type: "section",
      key: "s-all-completed",
      label: "Handled recently",
      helper: "Completed assessments stay here for later review.",
      icon: "success",
    });
    if (history.length > 0) {
      items.push(...history.map((item) => ({ type: "history" as const, item })));
    } else {
      items.push({
        type: "empty",
        key: "empty-all-completed",
        title: "No completed assessments yet",
        description: "Completed assessments will appear here after your first submission.",
        illustration: "progress",
      });
    }

    return items;
  }, [due, history, isLoading, isOffline, segment]);

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

  const latestCompleted = history[0];
  const assessmentStory =
    due.length > 0
      ? `You have ${due.length} assessment${due.length === 1 ? "" : "s"} ready to complete. Start with the next one when you feel ready.`
      : pending.length > 0
        ? "You’re caught up for now. Saved answers are waiting to sync when you’re back online."
        : latestCompleted
          ? `You’re caught up right now. Your latest completed assessment was ${formatRelativeDate(latestCompleted.completedAt).toLowerCase()}.`
          : "There are no assessments waiting right now. Check back later for new assignments from your care team.";

  const duePillLabel =
    due.length === 1 ? "1 due now" : `${due.length} due now`;
  const completedPillLabel =
    history.length === 1 ? "1 completed" : `${history.length} completed`;
  const pendingPillLabel =
    pending.length === 1 ? "1 saved" : `${pending.length} saved`;

  const listHeader = (
    <View style={styles.headerStack}>
      <Section
        title="Assessment flow"
        subtitle="Start with what’s due now, then review completed results when you want more context."
        right={<StatusPill label={segmentLabel} variant="info" accessible={false} />}
        card
        cardVariant="elevated"
      >
        <View style={styles.flowPills}>
          <StatusPill label={duePillLabel} variant={due.length > 0 ? "warning" : "neutral"} accessible={false} />
          <StatusPill label={completedPillLabel} variant={history.length > 0 ? "success" : "neutral"} accessible={false} />
          <StatusPill label={pendingPillLabel} variant={pending.length > 0 ? "info" : "neutral"} accessible={false} />
        </View>

        <Card variant="outlined" style={styles.storyCard} accessibilityLabel="Assessment overview">
          <Text style={styles.storyEyebrow}>Care check</Text>
          <Text style={styles.storyTitle}>What to do now</Text>
          <Text style={styles.storyText}>{assessmentStory}</Text>
        </Card>

        <SegmentedControl
          value={segment}
          onChange={setSegment}
          options={[
            { value: "due", label: "Do now", icon: "warning" },
            { value: "completed", label: "Completed", icon: "success" },
            { value: "all", label: "All", icon: "info" },
          ]}
          accessibilityLabel="Assessments filter"
        />
      </Section>

      {isOffline ? (
        <Banner
          variant="warning"
          title="Offline"
          message="Offline — showing saved questionnaires when available."
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

      <MediaCard
        variant="emphasis"
        leading={{ type: "icon", icon: "proms", tone: "accent" }}
        title={pending.length > 0 ? "Saved answers waiting to sync" : "Saved answers are up to date"}
        subtitle={
          pending.length > 0
            ? `${pending.length} saved ${pending.length === 1 ? "response is" : "responses are"} waiting to upload.`
            : "Everything you’ve submitted from this device is already synced."
        }
        chips={[
          ...(isOffline ? [{ text: "Offline", tone: "warning" as const }] : []),
          ...(pending.length > 0
            ? [{ text: "Needs sync", tone: "info" as const }]
            : [{ text: "All clear", tone: "success" as const }]),
        ].slice(0, 3)}
        actions={[
          {
            label: isSubmittingPending ? "Syncing…" : "Sync saved answers",
            kind: "primary",
            disabled: pending.length === 0 || isSubmittingPending || isOffline,
            onPress: () => {
              void submitPending();
            },
          },
          {
            label: "Refresh",
            kind: "secondary",
            disabled: isLoading,
            onPress: () => {
              void loadProms("refresh");
            },
          },
        ]}
        showChevron={false}
      />

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
              <LastRefreshed value={promsRefresh.label} compact />
              <LastFailedAttempt
                value={promsLoadError.label}
                title={promsLoadError.lastError?.title}
                message={promsLoadError.lastError?.message}
                onClear={promsLoadError.lastError ? promsLoadError.clear : undefined}
                compact
              />
              <LastFailedAttempt
                label="Last submit issue"
                value={promSubmitError.label}
                title={promSubmitError.lastError?.title}
                message={promSubmitError.lastError?.message}
                onClear={promSubmitError.lastError ? promSubmitError.clear : undefined}
                compact
              />
            </View>
          ) : null}
        </Card>
      ) : null}
    </View>
  );

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Assessments"
          subtitle="Short care checks to complete when they’re due"
          left={<Avatar size={40} name={patientName} fallback="icon" iconKey="proms" ring={isOffline ? "attention" : "none"} />}
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
              icon: "progress",
              tone: "muted",
              accessibilityLabel: "Open Progress",
              onPress: () => {
                router.push("/(tabs)/progress" as never);
              },
            },
          ]}
        >
          <View style={styles.headerPills}>
            <StatusPill label={duePillLabel} variant={due.length > 0 ? "warning" : "neutral"} accessible={false} />
            <StatusPill label={completedPillLabel} variant={history.length > 0 ? "success" : "neutral"} accessible={false} />
            {pending.length > 0 ? <StatusPill label={pendingPillLabel} variant="info" accessible={false} /> : null}
          </View>
        </HeroHeader>
      }
    >
      <FlatList
        data={listData}
        keyExtractor={(item) => {
          if (item.type === "section" || item.type === "empty") {
            return item.key;
          }
          return item.type === "due" ? `due:${item.item.id}` : `history:${item.item.id}`;
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadProms("refresh");
            }}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => {
          if (item.type === "section") {
            return (
              <View style={styles.sectionRow}>
                <DomainIcon icon={item.icon} tone={item.icon === "success" ? "success" : item.icon === "warning" ? "warning" : "muted"} accessibilityLabel={`${item.label} section`} />
                <View style={styles.sectionTextWrap}>
                  <Text style={styles.sectionText}>{item.label}</Text>
                  {item.helper ? <Text style={styles.sectionHelper}>{item.helper}</Text> : null}
                </View>
              </View>
            );
          }

          if (item.type === "empty") {
            return (
              <View style={styles.itemWrap}>
                <EmptyState
                  variant="compact"
                  illustrationKey={item.illustration}
                  title={item.title}
                  description={item.description}
                />
              </View>
            );
          }

          if (item.type === "due") {
            const dueSummary = formatPromptDueSummary(item.item.dueAt);
            return (
              <View style={styles.itemWrap}>
                <MediaCard
                  variant="emphasis"
                  leading={{ type: "icon", icon: "proms", tone: "accent" }}
                  title={item.item.title}
                  subtitle={dueSummary.subtitle}
                  statusPill={{ text: dueSummary.statusText, tone: dueSummary.statusTone }}
                  chips={[
                    { text: "Care team check", tone: "muted" },
                    { text: "Ready when you are", tone: "info" },
                  ]}
                  onPress={() => {
                    router.push({
                      pathname: "/prom-fill" as never,
                      params: { promId: item.item.id },
                    });
                  }}
                />
              </View>
            );
          }

          const historyChips: MediaCardChip[] = item.item.score
            ? [
                {
                  text: `${item.item.score.normalized} · ${item.item.score.bandLabel}`,
                  tone: toScoreChipTone(item.item.score.bandKey),
                },
                {
                  text: formatRelativeDate(item.item.completedAt),
                  tone: "muted",
                },
              ]
            : [{ text: "Saved result", tone: "muted" }];

          return (
            <View style={styles.itemWrap}>
              <MediaCard
                leading={{ type: "icon", icon: "success", tone: "success" }}
                title={item.item.title}
                subtitle={`Completed ${formatDateTime(item.item.completedAt)}`}
                statusPill={{ text: "Completed", tone: "success" }}
                chips={historyChips}
                showChevron={false}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : null
        }
      />
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
    centered: {
      minHeight: 140,
      alignItems: "center",
      justifyContent: "center",
    },
    listContent: {
      paddingBottom: tokens.spacing.xl,
      gap: tokens.spacing.sm,
    },
    headerStack: {
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.md,
    },
    headerPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    flowPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    storyCard: {
      gap: tokens.spacing.xs,
      backgroundColor: tokens.colors.surface,
    },
    storyEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.4,
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
    itemWrap: {
      marginBottom: tokens.spacing.sm,
    },
    sectionRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.sm,
      marginBottom: tokens.spacing.xs,
      marginTop: tokens.spacing.md,
    },
    sectionTextWrap: {
      flex: 1,
      gap: 2,
    },
    sectionText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    sectionHelper: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    diagToggle: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    diagTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    diagTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    diagContent: {
      marginTop: tokens.spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.colors.border,
      paddingTop: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    pressed: {
      opacity: 0.85,
    },
  });
}
