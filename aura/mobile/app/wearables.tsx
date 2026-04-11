import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  bulkUpsertWearables,
  getWearablesDaily,
  getWearablesSummary,
  type WearableDailyDay,
  type WearableSource,
  type WearablesSummary,
} from "@/src/api/wearables";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { EmptyState } from "@/src/components/EmptyState";
import { DomainIcon } from "@/src/components/IconSet";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import {
  addPendingWearablesSync,
  getPendingWearablesSync,
  removePendingWearablesSyncBatch,
  type PendingWearablesSyncBatch,
} from "@/src/state/pendingWearablesSync";
import { useLastRefreshed } from "@/src/state/refresh";
import {
  getCachedWearables,
  setCachedWearables,
  type WearablesCache,
} from "@/src/state/wearablesCache";
import {
  getWearablesConnected,
  setWearablesConnected,
} from "@/src/state/wearablesConnection";
import { useTokens } from "@/src/theme/tokens";
import { addDaysISO, formatPatientSyncLabel, todayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  return variant === "error" ? "danger" : variant;
}

const SOURCE: WearableSource = "mock";

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
      message: "You’re offline. Saved mock sync locally.",
      kind: "offline",
      retryable: true,
    };
  }
  if (appError.kind === "network") {
    return {
      title,
      message: "Couldn’t reach the server. Please try again.",
      kind: "network",
      retryable: true,
    };
  }
  if (appError.kind === "server") {
    return {
      title,
      message: "Server error. Try syncing again shortly.",
      kind: "server",
      retryable: true,
    };
  }
  if (appError.kind === "validation") {
    return {
      title,
      message: appError.message || "Request was invalid.",
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

function numberOrDash(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return String(Math.round(value * 10) / 10);
}

function formatDayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimestamp(value: number | null): string {
  return formatPatientSyncLabel(value);
}

function formatWholeNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return Math.round(value).toLocaleString();
}

function rollingSeed(input: string): number {
  let seed = 0;
  for (let index = 0; index < input.length; index += 1) {
    seed = (seed * 31 + input.charCodeAt(index)) % 1000003;
  }
  return seed;
}

function generateMockDays(patientId: string, endDate: string, count = 7): WearableDailyDay[] {
  const days: WearableDailyDay[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = addDaysISO(endDate, -index);
    const seed = rollingSeed(`${patientId}:${date}`);
    const steps = Math.max(2500, Math.min(9000, 2500 + (count - index) * 700 + (seed % 1100)));
    const activeMinutes = Math.max(10, Math.min(60, 10 + (seed % 51)));
    const restingHr = Math.max(55, Math.min(85, 55 + (seed % 31)));
    days.push({
      date,
      steps,
      activeMinutes,
      restingHr,
    });
  }
  return days;
}

function summarizeDays(days: WearableDailyDay[], source: WearableSource): WearablesSummary {
  const sorted = [...days].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  const stepsValues = sorted
    .map((day) => day.steps)
    .filter((value): value is number => typeof value === "number");
  const activeValues = sorted
    .map((day) => day.activeMinutes)
    .filter((value): value is number => typeof value === "number");
  const hrValues = sorted
    .map((day) => day.restingHr)
    .filter((value): value is number => typeof value === "number");

  const avg = (values: number[]): number | null =>
    values.length > 0
      ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
      : null;

  return {
    source,
    from: sorted[0]?.date ?? todayISO(),
    to: sorted[sorted.length - 1]?.date ?? todayISO(),
    trackedDays: sorted.length,
    avgSteps: avg(stepsValues),
    avgActiveMinutes: avg(activeValues),
    avgRestingHr: avg(hrValues),
    totalSteps: Math.round(stepsValues.reduce((sum, value) => sum + value, 0)),
    totalActiveMinutes: Math.round(activeValues.reduce((sum, value) => sum + value, 0)),
  };
}

function mergePendingIntoDays(
  baseDays: WearableDailyDay[],
  pending: PendingWearablesSyncBatch[]
): WearableDailyDay[] {
  const byDate = new Map<string, WearableDailyDay>();
  for (const day of baseDays) {
    byDate.set(day.date, day);
  }

  const batches = [...pending].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
  );
  for (const batch of batches) {
    for (const day of batch.days) {
      byDate.set(day.date, day);
    }
  }

  return [...byDate.values()]
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date))
    .slice(-7);
}

export default function WearablesScreen() {
  const auth = useAuth();
  const router = useRouter();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const wearablesRefresh = useLastRefreshed("wearables");
  const wearablesLoadError = useLastError("wearablesLoad");
  const wearablesSyncError = useLastError("wearablesSync");

  const patientId = auth.patient?.id ?? "";
  const today = useMemo(() => todayISO(), []);
  const rangeFrom = useMemo(() => addDaysISO(today, -6), [today]);
  const rangeTo = today;

  const [connected, setConnected] = useState(false);
  const [summary, setSummary] = useState<WearablesSummary | null>(null);
  const [last7Days, setLast7Days] = useState<WearableDailyDay[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingWearablesSyncBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMockSyncing, setIsMockSyncing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const pendingCount = pending.length;
  const mergedDays = useMemo(() => mergePendingIntoDays(last7Days, pending), [last7Days, pending]);
  const displayedSummary = useMemo(
    () => (mergedDays.length > 0 ? summarizeDays(mergedDays, SOURCE) : summary),
    [mergedDays, summary]
  );
  const trackedDays = displayedSummary?.trackedDays ?? mergedDays.length;
  const pendingDates = useMemo(() => {
    const dates = new Set<string>();
    for (const batch of pending) {
      for (const day of batch.days) {
        dates.add(day.date);
      }
    }
    return dates;
  }, [pending]);
  const wearablesStatusLabel = connected
    ? pendingCount > 0
      ? "Sync pending"
      : trackedDays > 0
        ? "Signals ready"
        : "Ready to sync"
    : "Connect source";
  const wearablesStatusTone =
    !connected ? "warning" : pendingCount > 0 ? "warning" : trackedDays > 0 ? "success" : "info";
  const wearablesStoryTitle = !connected
    ? "Connect a wearable source when you’re ready"
    : pendingCount > 0
      ? "Saved wearable updates are waiting to sync"
      : trackedDays > 0
        ? "Recent wearable signals are ready to review"
        : "Run a sync to build your recent summary";
  const wearablesStoryNote = !connected
    ? "Aura can use connected wearable summaries to show movement, activity, and recovery signals in one place."
    : pendingCount > 0
      ? "Your latest wearable batches are saved on this device. Sync them when you’re online or ready to upload."
      : trackedDays > 0
        ? "Use the recent summary to understand how movement, activity, and resting heart rate have looked over the last week."
        : "Sync mock data to build a 7-day summary and see how recent wearable signals are trending.";

  const applyCache = useCallback((cached: WearablesCache | null) => {
    setSummary(cached?.summary ?? null);
    setLast7Days(cached?.last7Days ?? []);
    setLastSyncAt(cached?.lastSyncAt ?? null);
  }, []);

  const loadPending = useCallback(async () => {
    if (!patientId) {
      setPending([]);
      return;
    }
    const pendingBatches = await getPendingWearablesSync(patientId);
    setPending(pendingBatches);
  }, [patientId]);

  const fetchLive = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!auth.token || !patientId) {
        return;
      }

      if (!options?.silent) {
        setNotice(null);
      }

      try {
        const [liveSummary, liveDaily] = await Promise.all([
          getWearablesSummary(auth.token, {
            from: rangeFrom,
            to: rangeTo,
            source: SOURCE,
          }),
          getWearablesDaily(auth.token, {
            from: rangeFrom,
            to: rangeTo,
            source: SOURCE,
          }),
        ]);

        const syncAt = Date.now();
        setSummary(liveSummary);
        setLast7Days(liveDaily.days);
        setLastSyncAt(syncAt);
        await setCachedWearables(patientId, {
          summary: liveSummary,
          last7Days: liveDaily.days,
          lastSyncAt: syncAt,
        });
        await wearablesRefresh.refreshLocal();
        await wearablesLoadError.clear();
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t load wearables");
        await wearablesLoadError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const cached = await getCachedWearables(patientId);
        applyCache(cached);
        setNotice({
          variant: cached ? "warning" : "error",
          title: friendly.title,
          message: cached ? "Showing saved wearables data." : friendly.message,
        });
      }
    },
    [
      applyCache,
      auth.token,
      patientId,
      rangeFrom,
      rangeTo,
      wearablesLoadError,
      wearablesRefresh,
    ]
  );

  const loadScreen = useCallback(async () => {
    if (!patientId) {
      return;
    }

    setIsLoading(true);
    setNotice(null);

    const [connectedValue, cached, pendingBatches] = await Promise.all([
      getWearablesConnected(patientId),
      getCachedWearables(patientId),
      getPendingWearablesSync(patientId),
    ]);

    setConnected(connectedValue);
    applyCache(cached);
    setPending(pendingBatches);

    if (isOffline) {
      setNotice({
        variant: "warning",
        title: "Offline",
        message: "Offline — showing saved wearable data when available.",
      });
      setIsLoading(false);
      return;
    }

    if (!connectedValue) {
      setNotice({
        variant: "info",
        title: "Not connected",
        message: "Enable mock connector to sync wearables data.",
      });
      setIsLoading(false);
      return;
    }

    await fetchLive({ silent: true });
    setIsLoading(false);
  }, [applyCache, fetchLive, isOffline, patientId]);

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadScreen();
      return undefined;
    }, [auth.status, loadScreen])
  );

  const handleToggleConnected = useCallback(async () => {
    if (!patientId) {
      return;
    }

    const next = !connected;
    setConnected(next);
    await setWearablesConnected(patientId, next);

    if (!next) {
      setNotice({
        variant: "info",
        title: "Connector disabled",
        message: "Mock wearable disconnected. Cached data is still available.",
      });
      return;
    }

    if (isOffline) {
      setNotice({
        variant: "warning",
        title: "Offline",
        message: "Connected locally. Sync will run when you’re online.",
      });
      return;
    }

    setIsLoading(true);
    await fetchLive();
    setIsLoading(false);
  }, [connected, fetchLive, isOffline, patientId]);

  const handleMockSync = useCallback(async () => {
    if (!auth.token || !patientId || !connected) {
      return;
    }

    setIsMockSyncing(true);
    setNotice(null);
    const mockDays = generateMockDays(patientId, today, 7);

    if (isOffline) {
      try {
        await addPendingWearablesSync(patientId, SOURCE, mockDays);
        await loadPending();
        const snapshot = summarizeDays(mockDays, SOURCE);
        setSummary(snapshot);
        setLast7Days(mockDays);
        await setCachedWearables(patientId, {
          summary: snapshot,
          last7Days: mockDays,
          lastSyncAt,
        });
        await wearablesSyncError.setLocalError({
          title: "Sync pending",
          message: "You’re offline. Mock sync was saved locally.",
          kind: "offline",
          retryable: true,
        });
        setNotice({
          variant: "warning",
          title: "Saved locally",
          message: "Offline — mock sync queued. Tap Sync now when online.",
        });
      } finally {
        setIsMockSyncing(false);
      }
      return;
    }

    try {
      await bulkUpsertWearables(auth.token, {
        source: SOURCE,
        days: mockDays,
      });
      await fetchLive();
      await wearablesSyncError.clear();
      setNotice({
        variant: "info",
        title: "Mock sync complete",
        message: "Uploaded mock wearable data for the last 7 days.",
      });
    } catch (error) {
      const friendly = toFriendlyError(error, "Couldn’t sync wearables");
      await wearablesSyncError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });
      setNotice({
        variant: "error",
        title: friendly.title,
        message: friendly.message,
      });
    } finally {
      setIsMockSyncing(false);
    }
  }, [
    auth.token,
    connected,
    fetchLive,
    isOffline,
    lastSyncAt,
    loadPending,
    patientId,
    today,
    wearablesSyncError,
  ]);

  const handleSyncPending = useCallback(async () => {
    if (!auth.token || !patientId || !connected || isOffline) {
      return;
    }
    if (pending.length === 0) {
      setNotice({
        variant: "info",
        title: "No pending sync",
        message: "There are no pending wearable batches to upload.",
      });
      return;
    }

    setIsSyncing(true);
    setNotice(null);

    const pendingBatches = await getPendingWearablesSync(patientId);
    for (const batch of pendingBatches) {
      try {
        await bulkUpsertWearables(auth.token, {
          source: batch.source,
          days: batch.days,
        });
        await removePendingWearablesSyncBatch(patientId, batch.localId);
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t sync pending wearables");
        await wearablesSyncError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });
        setNotice({
          variant: "error",
          title: friendly.title,
          message: friendly.message,
        });
        setPending(await getPendingWearablesSync(patientId));
        setIsSyncing(false);
        return;
      }
    }

    await wearablesSyncError.clear();
    await loadPending();
    await fetchLive();
    setNotice({
      variant: "info",
      title: "Sync complete",
      message: "Pending wearable batches were uploaded.",
    });
    setIsSyncing(false);
  }, [
    auth.token,
    connected,
    fetchLive,
    isOffline,
    loadPending,
    patientId,
    pending.length,
    wearablesSyncError,
  ]);

  const listHeader = useMemo(() => {
    const showNotice = Boolean(notice && !(isOffline && notice.title === "Offline"));

    return (
      <View style={styles.listHeader}>
        {isOffline ? (
          <Banner
            variant="warning"
            title="Offline"
            message="Offline — showing saved wearable data."
          />
        ) : null}
        {showNotice && notice ? (
          <Banner
            variant={toBannerVariant(notice.variant)}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

        <Card variant="elevated" padding={tokens.spacing.lg} style={styles.storyCard}>
          <View style={styles.storyHeader}>
            <View style={styles.storyTitleWrap}>
              <Text style={styles.storyEyebrow}>Connected health</Text>
              <Text style={styles.storyTitle}>{wearablesStoryTitle}</Text>
            </View>
            <StatusPill label={wearablesStatusLabel} variant={wearablesStatusTone} accessible={false} />
          </View>
          <Text style={styles.storyBody}>{wearablesStoryNote}</Text>
          <View style={styles.storyMetricRow}>
            <View style={styles.storyMetric}>
              <Text style={styles.storyMetricValue}>{trackedDays}</Text>
              <Text style={styles.storyMetricLabel}>Days tracked</Text>
            </View>
            <View style={styles.storyMetric}>
              <Text style={styles.storyMetricValue}>
                {displayedSummary ? formatWholeNumber(displayedSummary.avgSteps) : "—"}
              </Text>
              <Text style={styles.storyMetricLabel}>Avg steps</Text>
            </View>
            <View style={styles.storyMetric}>
              <Text style={styles.storyMetricValue}>
                {displayedSummary ? numberOrDash(displayedSummary.avgRestingHr) : "—"}
              </Text>
              <Text style={styles.storyMetricLabel}>Resting HR</Text>
            </View>
          </View>
        </Card>

        <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntro}>
          <Text style={styles.sectionEyebrow}>Connection and sync</Text>
          <Text style={styles.sectionTitle}>Keep your wearable summary current</Text>
          <Text style={styles.sectionBody}>
            Connect the source, run a sync when you want fresh mock data, and use the recent
            rollups below to understand the last week at a glance.
          </Text>
        </Card>

        <MediaCard
          leading={{
            type: "icon",
            icon: "wearables",
            tone: connected ? (pendingCount > 0 ? "warning" : "accent") : "muted",
          }}
          title={connected ? "Connected source ready" : "Connect wearable source"}
          subtitle={
            connected
              ? pendingCount > 0
                ? `${pendingCount} saved batch${pendingCount === 1 ? "" : "es"} waiting to sync · Last sync ${formatTimestamp(lastSyncAt)}`
                : `Last sync ${formatTimestamp(lastSyncAt)} · Daily rollups update here when new data arrives.`
              : "Turn on the mock connector when you’re ready to start seeing connected daily rollups."
          }
          chips={[
            { text: connected ? "Connected" : "Disconnected", tone: connected ? "success" : "muted" },
            { text: "Mock source", tone: "muted" },
            ...(isOffline ? [{ text: "Offline", tone: "warning" as const }] : []),
          ]}
          statusPill={
            connected
              ? pendingCount > 0
                ? { text: "Needs sync", tone: "warning" }
                : { text: "Ready", tone: "info" }
              : { text: "Not connected", tone: "neutral" }
          }
          actions={[
            {
              label: connected ? "Disconnect source" : "Connect source",
              kind: "secondary",
              onPress: () => {
                void handleToggleConnected();
              },
            },
            {
              label: isMockSyncing ? "Syncing..." : "Sync mock data",
              kind: "primary",
              disabled: !connected || isMockSyncing || isSyncing,
              onPress: () => {
                void handleMockSync();
              },
            },
          ]}
        />

        <View style={styles.connectorActions}>
          {connected && pendingCount > 0 && !isOffline ? (
            <PrimaryButton
              label={isSyncing ? "Syncing pending..." : "Sync now"}
              loading={isSyncing}
              disabled={isSyncing || isMockSyncing}
              onPress={() => {
                void handleSyncPending();
              }}
            />
          ) : null}
          <PrimaryButton
            label={isLoading ? "Refreshing..." : "Refresh summary"}
            loading={isLoading}
            disabled={!connected || isLoading || isMockSyncing || isSyncing || isOffline}
            onPress={() => {
              void fetchLive();
            }}
          />
        </View>

        <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntro}>
          <Text style={styles.sectionEyebrow}>Recent signals</Text>
          <Text style={styles.sectionTitle}>This week at a glance</Text>
          <Text style={styles.sectionBody}>
            These summaries help you spot how movement, active minutes, and resting heart rate
            have looked over the last few days.
          </Text>
        </Card>

        <View style={styles.trackerGrid}>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="weekly"
              label="Tracked days"
              value={`${trackedDays}`}
              delta="Last 7 days"
              tone="accent"
              micro={{
                type: "ring",
                progress: trackedDays > 0 ? Math.max(0, Math.min(1, trackedDays / 7)) : 0,
              }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="wearables"
              label="Avg steps"
              value={numberOrDash(displayedSummary?.avgSteps ?? null)}
              delta="Daily average"
              tone="primary"
              micro={{ type: "bars", values: mergedDays.map((day) => day.steps ?? 0).slice(-7) }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="exercise"
              label="Avg active"
              value={numberOrDash(displayedSummary?.avgActiveMinutes ?? null)}
              delta="Minutes/day"
              tone="success"
              micro={{ type: "bars", values: mergedDays.map((day) => day.activeMinutes ?? 0).slice(-7) }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="info"
              label="Avg resting HR"
              value={numberOrDash(displayedSummary?.avgRestingHr ?? null)}
              delta="Beats/min"
              tone="muted"
              micro={{
                type: "dots",
                values: mergedDays.map((day) => day.restingHr ?? 0).slice(-7),
              }}
            />
          </View>
        </View>

        <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntro}>
          <Text style={styles.sectionEyebrow}>Daily rollups</Text>
          <Text style={styles.sectionTitle}>Recent wearable history</Text>
          <Text style={styles.sectionBody}>
            Review each saved day below for a calmer day-by-day view of your recent connected
            activity.
          </Text>
        </Card>

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
                <LastRefreshed value={wearablesRefresh.label} compact />
                <LastFailedAttempt
                  label="Last load failure"
                  value={wearablesLoadError.label}
                  title={wearablesLoadError.lastError?.title}
                  message={wearablesLoadError.lastError?.message}
                  onClear={wearablesLoadError.lastError ? wearablesLoadError.clear : undefined}
                  compact
                />
                <LastFailedAttempt
                  label="Last sync failure"
                  value={wearablesSyncError.label}
                  title={wearablesSyncError.lastError?.title}
                  message={wearablesSyncError.lastError?.message}
                  onClear={wearablesSyncError.lastError ? wearablesSyncError.clear : undefined}
                  compact
                />
              </View>
            ) : null}
          </Card>
        ) : null}
      </View>
    );
  }, [
    connected,
    displayedSummary,
    fetchLive,
    handleMockSync,
    handleSyncPending,
    handleToggleConnected,
    isLoading,
    isMockSyncing,
    isOffline,
    isSyncing,
    lastSyncAt,
    mergedDays,
    notice,
    pendingCount,
    setShowDiagnostics,
    showDiagnostics,
    styles.connectorActions,
    styles.diagContent,
    styles.diagTitle,
    styles.diagTitleRow,
    styles.diagToggle,
    styles.listHeader,
    styles.pressed,
    styles.sectionBody,
    styles.sectionEyebrow,
    styles.sectionIntro,
    styles.sectionTitle,
    styles.storyBody,
    styles.storyCard,
    styles.storyEyebrow,
    styles.storyHeader,
    styles.storyMetric,
    styles.storyMetricLabel,
    styles.storyMetricRow,
    styles.storyMetricValue,
    styles.storyTitle,
    styles.storyTitleWrap,
    styles.trackerGrid,
    styles.trackerTileWrap,
    trackedDays,
    tokens.spacing.lg,
    tokens.spacing.md,
    wearablesLoadError.clear,
    wearablesLoadError.label,
    wearablesLoadError.lastError?.message,
    wearablesLoadError.lastError?.title,
    wearablesRefresh.label,
    wearablesStatusLabel,
    wearablesStatusTone,
    wearablesStoryNote,
    wearablesStoryTitle,
    wearablesSyncError.clear,
    wearablesSyncError.label,
    wearablesSyncError.lastError?.message,
    wearablesSyncError.lastError?.title,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={
          <HeroHeader variant="compact" title="Wearables" subtitle="Connected health support" />
        }
      >
        <EmptyState
          variant="compact"
          title="Loading wearable summary"
          description="Preparing your connected-device summary."
          illustration={<ActivityIndicator size="small" color={tokens.colors.primary} />}
        />
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Wearables"
          subtitle={connected ? "Connected health support" : "Wearable summary support"}
          left={<Avatar size={40} name="Wearables" fallback="icon" iconKey="wearables" />}
          rightActions={[
            {
              icon: "progress",
              tone: "accent",
              accessibilityLabel: "Open Progress",
              onPress: () => {
                router.push("/(tabs)/progress");
              },
            },
            {
              icon: "settings",
              tone: "muted",
              accessibilityLabel: "Open Settings",
              onPress: () => {
                router.push("/(tabs)/settings");
              },
            },
          ]}
        >
          <View style={styles.headerPills}>
            <StatusPill
              label={connected ? "Connected" : "Not connected"}
              variant={connected ? "success" : "warning"}
              accessible={false}
            />
            <StatusPill
              label={`${trackedDays} day${trackedDays === 1 ? "" : "s"} tracked`}
              variant={trackedDays > 0 ? "info" : "neutral"}
              accessible={false}
            />
            <StatusPill
              label={
                isOffline ? "Offline" : pendingCount > 0 ? `${pendingCount} pending` : "Up to date"
              }
              variant={isOffline ? "warning" : pendingCount > 0 ? "warning" : "neutral"}
              accessible={false}
            />
          </View>
        </HeroHeader>
      }
    >
      <FlatList
        data={[...mergedDays].reverse()}
        keyExtractor={(day) => day.date}
        contentContainerStyle={styles.container}
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <Card variant="outlined" padding={tokens.spacing.lg} style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {connected ? "No wearable summaries yet" : "No connected wearable data yet"}
              </Text>
              <Text style={styles.emptyBody}>
                {connected
                  ? "Run a sync when you’re ready and your recent daily rollups will appear here."
                  : "Connect the wearable source first, then sync mock data to build a recent summary."}
              </Text>
            </Card>
          )
        }
        renderItem={({ item }) => {
          const itemPending = pendingDates.has(item.date);

          return (
          <MediaCard
            leading={{
              type: "icon",
              icon: "wearables",
              tone: itemPending ? "warning" : "accent",
            }}
            title={formatDayLabel(item.date)}
            subtitle={
              itemPending
                ? "Daily wearable rollup saved locally and waiting to sync."
                : "Daily wearable rollup included in your recent summary."
            }
            chips={[
              { text: `${formatWholeNumber(item.steps ?? 0)} steps`, tone: "info" },
              { text: `${formatWholeNumber(item.activeMinutes ?? 0)} active min`, tone: "success" },
              ...(typeof item.restingHr === "number"
                ? [{ text: `Resting HR ${formatWholeNumber(item.restingHr)}`, tone: "muted" as const }]
                : []),
            ]}
            statusPill={
              itemPending ? { text: "Pending", tone: "warning" } : { text: "Saved", tone: "info" }
            }
          />
        );
        }}
      />
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      paddingBottom: tokens.spacing.xxxl,
    },
    listHeader: {
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.md,
    },
    listSeparator: {
      height: tokens.spacing.md,
    },
    headerPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    centered: {
      minHeight: 72,
      alignItems: "center",
      justifyContent: "center",
    },
    subtle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    connectorActions: {
      gap: tokens.spacing.sm,
    },
    storyCard: {
      gap: tokens.spacing.md,
    },
    storyHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    storyTitleWrap: {
      flex: 1,
      gap: tokens.spacing.xs,
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
    storyBody: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    storyMetricRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    storyMetric: {
      flex: 1,
      minWidth: 0,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    storyMetricValue: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    storyMetricLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    sectionIntro: {
      gap: tokens.spacing.xs,
    },
    sectionEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    sectionTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    sectionBody: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
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
    emptyCard: {
      gap: tokens.spacing.xs,
    },
    emptyTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    emptyBody: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    pressed: {
      opacity: 0.84,
    },
  });
}
