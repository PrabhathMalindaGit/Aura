import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import {
  deleteHydrationEntry,
  getHydrationToday,
  logHydration,
  type HydrationEntry,
} from "@/src/api/patient";
import { isApiError, type ApiError } from "@/src/api/client";
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
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import {
  getCachedHydrationDay,
  setCachedHydrationDay,
  setCachedHydrationToday,
} from "@/src/state/hydrationCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import {
  addPendingHydration,
  getPendingHydration,
  removePendingHydration,
  type PendingHydrationEntry,
} from "@/src/state/pendingHydration";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
import { todayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

type TodayState = {
  date: string;
  totalMl: number;
  targetMl: number;
  entries: HydrationEntry[];
};

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  return variant === "error" ? "danger" : variant;
}

function toFriendlyHydrationError(error: unknown, title: string): {
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
      message: "You’re offline. Entry saved locally and pending sync.",
      kind: "offline",
      retryable: true,
    };
  }
  if (appError.kind === "network") {
    return {
      title,
      message: "Couldn’t reach the server. Saved locally for sync.",
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
      message: appError.message || "Invalid hydration entry.",
      kind: "validation",
      retryable: false,
    };
  }

  return {
    title,
    message: appError.message || "Something went wrong. Try again.",
    kind: "unknown",
    retryable: true,
  };
}

function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown time";
  }
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toPendingHydrationEntry(entry: PendingHydrationEntry): HydrationEntry {
  return {
    id: entry.localId,
    amountMl: entry.amountMl,
    createdAt: entry.createdAt,
    pending: true,
    localId: entry.localId,
  };
}

export default function HydrationScreen() {
  const auth = useAuth();
  const router = useRouter();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const hydrationRefresh = useLastRefreshed("hydration");
  const hydrationLoadError = useLastError("hydrationLoad");
  const hydrationLogError = useLastError("hydrationLog");

  const [todayState, setTodayState] = useState<TodayState | null>(null);
  const [pendingEntries, setPendingEntries] = useState<PendingHydrationEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const patientId = auth.patient?.id ?? "";
  const today = useMemo(() => todayISO(), []);

  const pendingTodayEntries = useMemo(
    () => pendingEntries.filter((entry) => entry.date === today),
    [pendingEntries, today]
  );

  const mergedEntries = useMemo(() => {
    const pendingMapped = pendingTodayEntries.map((entry) =>
      toPendingHydrationEntry(entry)
    );
    const serverEntries = todayState?.entries ?? [];
    return [...pendingMapped, ...serverEntries].sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
    );
  }, [pendingTodayEntries, todayState?.entries]);

  const totalTodayMl = useMemo(() => {
    const serverTotal = todayState?.totalMl ?? 0;
    const pendingTotal = pendingTodayEntries.reduce(
      (sum, entry) => sum + entry.amountMl,
      0
    );
    return serverTotal + pendingTotal;
  }, [pendingTodayEntries, todayState?.totalMl]);

  const targetMl = todayState?.targetMl ?? 2000;
  const progressPercent = Math.min(100, Math.round((totalTodayMl / targetMl) * 100));
  const progressRatio = targetMl > 0 ? Math.max(0, Math.min(1, totalTodayMl / targetMl)) : 0;

  const recentAmountSeries = useMemo(
    () =>
      mergedEntries
        .slice()
        .reverse()
        .slice(-7)
        .map((entry) => entry.amountMl)
        .filter((value) => Number.isFinite(value)),
    [mergedEntries]
  );

  const persistTodaySnapshot = useCallback(
    async (nextState: TodayState, merged: HydrationEntry[]) => {
      if (!patientId) {
        return;
      }
      await setCachedHydrationDay(patientId, {
        cachedAt: Date.now(),
        date: nextState.date,
        totalMl: nextState.totalMl,
        targetMl: nextState.targetMl,
        entries: merged,
      });
    },
    [patientId]
  );

  const reloadPending = useCallback(async () => {
    if (!patientId) {
      setPendingEntries([]);
      return;
    }
    const pending = await getPendingHydration(patientId);
    setPendingEntries(pending);
  }, [patientId]);

  const loadToday = useCallback(async () => {
    if (!auth.token || !patientId) {
      return;
    }
    setIsLoading(true);
    setNotice(null);

    if (isOffline) {
      const [cached, pending] = await Promise.all([
        getCachedHydrationDay(patientId, today),
        getPendingHydration(patientId),
      ]);
      setPendingEntries(pending);
      if (cached) {
        setTodayState({
          date: cached.date,
          totalMl: cached.totalMl,
          targetMl: cached.targetMl,
          entries: cached.entries.filter((entry) => entry.pending !== true),
        });
      } else {
        setTodayState({
          date: today,
          totalMl: 0,
          targetMl: 2000,
          entries: [],
        });
      }
      setNotice({
        variant: "warning",
        title: "Offline",
        message: "Offline — hydration entries are queued and marked pending.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const response = await getHydrationToday(auth.token, today);
      setTodayState({
        date: response.date,
        totalMl: response.totalMl,
        targetMl: response.targetMl,
        entries: response.entries,
      });
      await setCachedHydrationToday(patientId, response);
      await hydrationRefresh.refreshLocal();
      await hydrationLoadError.clear();
      await reloadPending();
    } catch (error) {
      const friendly = toFriendlyHydrationError(error, "Couldn’t load hydration");
      await hydrationLoadError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });

      const [cached, pending] = await Promise.all([
        getCachedHydrationDay(patientId, today),
        getPendingHydration(patientId),
      ]);
      setPendingEntries(pending);

      if (cached) {
        setTodayState({
          date: cached.date,
          totalMl: cached.totalMl,
          targetMl: cached.targetMl,
          entries: cached.entries.filter((entry) => entry.pending !== true),
        });
        setNotice({
          variant: "warning",
          title: friendly.title,
          message: "Showing saved hydration data.",
        });
      } else {
        setTodayState({
          date: today,
          totalMl: 0,
          targetMl: 2000,
          entries: [],
        });
        setNotice({
          variant: "error",
          title: friendly.title,
          message: friendly.message,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    auth.token,
    hydrationLoadError,
    hydrationRefresh,
    isOffline,
    patientId,
    reloadPending,
    today,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadToday();
      return undefined;
    }, [auth.status, loadToday])
  );

  const queueOfflineEntry = useCallback(
    async (amountMl: number, reasonTitle: string, reasonMessage: string) => {
      if (!patientId) {
        return;
      }
      await addPendingHydration(patientId, { date: today, amountMl });
      const pending = await getPendingHydration(patientId);
      setPendingEntries(pending);

      const current = todayState ?? {
        date: today,
        totalMl: 0,
        targetMl: 2000,
        entries: [],
      };
      await persistTodaySnapshot(current, [
        ...pending
          .filter((entry) => entry.date === today)
          .map((entry) => toPendingHydrationEntry(entry)),
        ...current.entries,
      ]);

      await hydrationLogError.setLocalError({
        title: reasonTitle,
        message: reasonMessage,
        kind: "offline",
        retryable: true,
      });

      setNotice({
        variant: "warning",
        title: reasonTitle,
        message: reasonMessage,
      });
    },
    [hydrationLogError, patientId, persistTodaySnapshot, today, todayState]
  );

  const handleQuickAdd = useCallback(
    async (amountMl: number) => {
      if (!auth.token || !patientId) {
        return;
      }

      if (isOffline) {
        await queueOfflineEntry(
          amountMl,
          "Saved locally",
          "Offline — hydration entry queued. Sync when back online."
        );
        return;
      }

      try {
        await logHydration(auth.token, { date: today, amountMl });
        await hydrationLogError.clear();
        await loadToday();
        setNotice({
          variant: "info",
          title: "Logged",
          message: `${amountMl} ml added.`,
        });
      } catch (error) {
        const friendly = toFriendlyHydrationError(error, "Saved locally");
        await queueOfflineEntry(amountMl, friendly.title, friendly.message);
      }
    },
    [auth.token, hydrationLogError, isOffline, loadToday, patientId, queueOfflineEntry, today]
  );

  const handleSyncPending = useCallback(async () => {
    if (!auth.token || !patientId || isOffline) {
      return;
    }
    const currentPending = await getPendingHydration(patientId);
    if (currentPending.length === 0) {
      return;
    }

    setIsSyncing(true);
    setNotice(null);

    for (const pending of currentPending) {
      try {
        await logHydration(auth.token, {
          date: pending.date,
          amountMl: pending.amountMl,
        });
        await removePendingHydration(patientId, pending.localId);
      } catch (error) {
        const friendly = toFriendlyHydrationError(error, "Sync failed");
        await hydrationLogError.setLocalError({
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
        setIsSyncing(false);
        await reloadPending();
        return;
      }
    }

    await hydrationLogError.clear();
    await hydrationRefresh.refreshLocal();
    await loadToday();
    setNotice({
      variant: "info",
      title: "Synced",
      message: "Pending hydration entries were synced.",
    });
    setIsSyncing(false);
  }, [
    auth.token,
    hydrationLogError,
    hydrationRefresh,
    isOffline,
    loadToday,
    patientId,
    reloadPending,
  ]);

  const handleDeleteEntry = useCallback(
    async (entry: HydrationEntry) => {
      if (!patientId) {
        return;
      }

      if (entry.pending && entry.localId) {
        await removePendingHydration(patientId, entry.localId);
        await reloadPending();
        setNotice({
          variant: "info",
          title: "Removed",
          message: "Pending hydration entry removed.",
        });
        return;
      }

      if (!auth.token) {
        return;
      }

      if (isOffline) {
        setNotice({
          variant: "warning",
          title: "Offline",
          message: "You can only remove server entries while online.",
        });
        return;
      }

      try {
        await deleteHydrationEntry(auth.token, entry.id);
        await loadToday();
      } catch (error) {
        const friendly = toFriendlyHydrationError(error, "Couldn’t delete entry");
        setNotice({
          variant: "error",
          title: friendly.title,
          message: friendly.message,
        });
      }
    },
    [auth.token, isOffline, loadToday, patientId, reloadPending]
  );

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
                <DomainIcon icon="info" tone="muted" accessibilityLabel="Diagnostics icon" />
                <Text style={styles.diagTitle}>Diagnostics (dev)</Text>
              </View>
              <StatusPill label={showDiagnostics ? "Open" : "Closed"} variant="neutral" />
            </Pressable>
            {showDiagnostics ? (
              <View style={styles.diagContent}>
                <LastRefreshed value={hydrationRefresh.label} compact />
                <LastFailedAttempt
                  label="Last load failure"
                  value={hydrationLoadError.label}
                  title={hydrationLoadError.lastError?.title}
                  message={hydrationLoadError.lastError?.message}
                  onClear={hydrationLoadError.lastError ? hydrationLoadError.clear : undefined}
                  compact
                />
                <LastFailedAttempt
                  label="Last log failure"
                  value={hydrationLogError.label}
                  title={hydrationLogError.lastError?.title}
                  message={hydrationLogError.lastError?.message}
                  onClear={hydrationLogError.lastError ? hydrationLogError.clear : undefined}
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
            message="Hydration taps are stored locally and marked pending."
          />
        ) : null}

        {showNotice && notice ? (
          <Banner
            variant={toBannerVariant(notice.variant)}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

        <View style={styles.trackerGrid}>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="hydration"
              label="Today"
              value={`${totalTodayMl} ml`}
              delta="Current intake"
              tone="accent"
              micro={{ type: "ring", progress: progressRatio }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="hydration"
              label="Goal"
              value={`${targetMl} ml`}
              delta="Target"
              tone="primary"
              micro={
                recentAmountSeries.length >= 2
                  ? { type: "bars", values: recentAmountSeries }
                  : { type: "dots", values: [0, 0, 0, 0, 0, 0, 0] }
              }
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="progress"
              label="Progress"
              value={`${progressPercent}%`}
              delta="Toward daily target"
              tone="success"
              micro={{ type: "ring", progress: progressRatio }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="warning"
              label="Pending"
              value={`${pendingEntries.length}`}
              delta="Awaiting sync"
              tone="warning"
              micro={{ type: "dots", values: [pendingEntries.length, 0, 0, 0, 0, 0, 0] }}
            />
          </View>
        </View>

        <Card variant="outlined" padding={tokens.spacing.md}>
          <View style={styles.quickAddCard}>
            <Text style={styles.cardTitle}>Quick add</Text>
            <View style={styles.quickAddRow}>
              {[250, 500, 750].map((amount) => (
                <View key={`add-${amount}`} style={styles.quickButtonWrap}>
                  <SecondaryButton
                    label={`+${amount}`}
                    onPress={() => {
                      void handleQuickAdd(amount);
                    }}
                  />
                </View>
              ))}
            </View>
            {pendingEntries.length > 0 ? (
              <PrimaryButton
                label={isSyncing ? "Syncing..." : "Sync now"}
                loading={isSyncing}
                disabled={isOffline || isSyncing}
                onPress={() => {
                  void handleSyncPending();
                }}
              />
            ) : null}
          </View>
        </Card>
      </View>
    );
  }, [
    handleQuickAdd,
    handleSyncPending,
    hydrationLoadError.clear,
    hydrationLoadError.label,
    hydrationLoadError.lastError?.message,
    hydrationLoadError.lastError?.title,
    hydrationLogError.clear,
    hydrationLogError.label,
    hydrationLogError.lastError?.message,
    hydrationLogError.lastError?.title,
    hydrationRefresh.label,
    isOffline,
    isSyncing,
    notice,
    pendingEntries.length,
    progressPercent,
    progressRatio,
    recentAmountSeries,
    showDiagnostics,
    styles.cardTitle,
    styles.diagContent,
    styles.diagTitle,
    styles.diagTitleRow,
    styles.diagToggle,
    styles.listHeader,
    styles.pressed,
    styles.quickAddCard,
    styles.quickAddRow,
    styles.quickButtonWrap,
    styles.trackerGrid,
    styles.trackerTileWrap,
    targetMl,
    tokens.spacing.md,
    totalTodayMl,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Hydration" subtitle="Track water intake" />}
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
          title="Hydration"
          subtitle="Track water intake"
          left={<Avatar size={40} name="Hydration" fallback="icon" iconKey="hydration" />}
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
              icon: "safety",
              tone: "warning",
              accessibilityLabel: "Open Safety support",
              onPress: () => {
                router.push("/safety");
              },
            },
          ]}
        />
      }
    >
      <FlatList
        data={mergedEntries}
        keyExtractor={(entry) => `${entry.id}:${entry.pending ? "pending" : "saved"}`}
        renderItem={({ item }) => (
          <MediaCard
            leading={{ type: "icon", icon: "hydration", tone: item.pending ? "warning" : "muted" }}
            title={`${item.amountMl} ml`}
            subtitle={formatTime(item.createdAt)}
            chips={[{ text: item.pending ? "Pending sync" : "Saved", tone: item.pending ? "warning" : "muted" }]}
            statusPill={{ text: item.pending ? "Pending" : "Saved", tone: item.pending ? "warning" : "info" }}
            actions={[
              {
                label: "Remove",
                kind: "secondary",
                onPress: () => {
                  Alert.alert("Remove entry?", "This action cannot be undone.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: () => {
                        void handleDeleteEntry(item);
                      },
                    },
                  ]);
                },
              },
            ]}
          />
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <Card variant="outlined" padding={tokens.spacing.md}>
              <Text style={styles.subText}>No hydration entries yet for today.</Text>
            </Card>
          )
        }
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        contentContainerStyle={styles.container}
      />
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      paddingBottom: tokens.spacing.xxxl,
      gap: tokens.spacing.md,
    },
    listHeader: {
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.md,
    },
    listSeparator: {
      height: tokens.spacing.md,
    },
    centered: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 96,
    },
    subText: {
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
    quickAddCard: {
      gap: tokens.spacing.md,
    },
    quickAddRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    quickButtonWrap: {
      flex: 1,
      minWidth: 0,
    },
    cardTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
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
