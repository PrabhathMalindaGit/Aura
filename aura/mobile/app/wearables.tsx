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
import { addDaysISO, todayISO } from "@/src/utils/date";
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
  if (!value || !Number.isFinite(value)) {
    return "Never";
  }
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

        <MediaCard
          leading={{ type: "icon", icon: "wearables", tone: connected ? "accent" : "muted" }}
          title={connected ? "Mock wearable connected" : "Not connected"}
          subtitle={`Pending sync: ${pendingCount} · Last sync: ${formatTimestamp(lastSyncAt)}`}
          chips={[
            { text: connected ? "Connected" : "Disconnected", tone: connected ? "success" : "muted" },
            ...(isOffline ? [{ text: "Offline", tone: "warning" as const }] : []),
          ]}
          actions={[
            {
              label: connected ? "Disconnect" : "Connect",
              kind: "secondary",
              onPress: () => {
                void handleToggleConnected();
              },
            },
            {
              label: isMockSyncing ? "Syncing..." : "Mock sync",
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

        <View style={styles.trackerGrid}>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="weekly"
              label="Tracked days"
              value={`${displayedSummary?.trackedDays ?? 0}`}
              delta="Last 7 days"
              tone="accent"
              micro={{
                type: "ring",
                progress:
                  displayedSummary && displayedSummary.trackedDays > 0
                    ? Math.max(0, Math.min(1, displayedSummary.trackedDays / 7))
                    : 0,
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
    styles.trackerGrid,
    styles.trackerTileWrap,
    tokens.spacing.md,
    wearablesLoadError.clear,
    wearablesLoadError.label,
    wearablesLoadError.lastError?.message,
    wearablesLoadError.lastError?.title,
    wearablesRefresh.label,
    wearablesSyncError.clear,
    wearablesSyncError.label,
    wearablesSyncError.lastError?.message,
    wearablesSyncError.lastError?.title,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Wearables" subtitle="Daily rollups" />}
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

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Wearables"
          subtitle={connected ? "Connected · Daily rollups" : "Not connected"}
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
        />
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
            <Card variant="outlined" padding={tokens.spacing.md}>
              <Text style={styles.subtle}>No tracked days yet.</Text>
            </Card>
          )
        }
        renderItem={({ item }) => (
          <MediaCard
            leading={{ type: "icon", icon: "wearables", tone: "accent" }}
            title={formatDayLabel(item.date)}
            subtitle={`${item.steps ?? 0} steps · ${item.activeMinutes ?? 0} min${typeof item.restingHr === "number" ? ` · HR ${item.restingHr}` : ""}`}
            chips={[
              { text: "Daily rollup", tone: "muted" },
              ...(pendingCount > 0 ? [{ text: "Pending sync", tone: "warning" as const }] : []),
            ]}
            statusPill={pendingCount > 0 ? { text: "Pending", tone: "warning" } : { text: "Saved", tone: "info" }}
          />
        )}
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
    pressed: {
      opacity: 0.84,
    },
  });
}
