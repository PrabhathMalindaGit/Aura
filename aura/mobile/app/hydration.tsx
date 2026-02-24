import { Redirect } from "expo-router";
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
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
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
  const isOffline = useIsOffline();
  const hydrationRefresh = useLastRefreshed("hydration");
  const hydrationLoadError = useLastError("hydrationLoad");
  const hydrationLogError = useLastError("hydrationLog");

  const [todayState, setTodayState] = useState<TodayState | null>(null);
  const [pendingEntries, setPendingEntries] = useState<PendingHydrationEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

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

  if (auth.status === "loading") {
    return (
      <Screen title="Hydration">
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
    <Screen title="Hydration">
      <View style={styles.container}>
        <LastRefreshed value={hydrationRefresh.label} />
        <LastFailedAttempt
          value={hydrationLoadError.label}
          title={hydrationLoadError.lastError?.title}
          message={hydrationLoadError.lastError?.message}
          onClear={hydrationLoadError.lastError ? hydrationLoadError.clear : undefined}
        />
        <LastFailedAttempt
          value={hydrationLogError.label}
          title={hydrationLogError.lastError?.title}
          message={hydrationLogError.lastError?.message}
          onClear={hydrationLogError.lastError ? hydrationLogError.clear : undefined}
        />

        <Section title="Today">
          <Text style={styles.bigValue}>{totalTodayMl} ml</Text>
          <Text style={styles.subText}>
            Target {targetMl} ml · {progressPercent}%
          </Text>
          <Text style={styles.subText}>Pending sync: {pendingEntries.length}</Text>
        </Section>

        <Section title="Quick add">
          <View style={styles.quickActions}>
            {[250, 500, 750].map((amount) => (
              <PrimaryButton
                key={`add-${amount}`}
                label={`+${amount} ml`}
                onPress={() => {
                  void handleQuickAdd(amount);
                }}
              />
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
        </Section>

        {isOffline ? (
          <InlineNotice
            variant="warning"
            title="Offline"
            message="Hydration taps are stored locally and marked pending."
          />
        ) : null}

        {notice ? (
          <InlineNotice
            variant={notice.variant}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

        <Section title="Entries">
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : mergedEntries.length === 0 ? (
            <Text style={styles.subText}>No hydration entries yet for today.</Text>
          ) : (
            <FlatList
              data={mergedEntries}
              keyExtractor={(entry) => `${entry.id}:${entry.pending ? "pending" : "saved"}`}
              scrollEnabled={false}
              contentContainerStyle={styles.entriesList}
              renderItem={({ item }) => (
                <View style={styles.entryRow}>
                  <View>
                    <Text style={styles.entryAmount}>
                      {item.amountMl} ml {item.pending ? "(Pending)" : ""}
                    </Text>
                    <Text style={styles.entryTime}>{formatTime(item.createdAt)}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      Alert.alert(
                        "Remove entry?",
                        "This action cannot be undone.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Remove",
                            style: "destructive",
                            onPress: () => {
                              void handleDeleteEntry(item);
                            },
                          },
                        ]
                      );
                    }}
                    style={({ pressed }) => [
                      styles.deleteButton,
                      pressed ? styles.deleteButtonPressed : null,
                    ]}
                  >
                    <Text style={styles.deleteButtonText}>Remove</Text>
                  </Pressable>
                </View>
              )}
            />
          )}
        </Section>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 24,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 80,
  },
  bigValue: {
    fontSize: 28,
    fontWeight: "700",
  },
  subText: {
    color: "#4b5563",
    fontSize: 13,
  },
  quickActions: {
    gap: 8,
    marginBottom: 8,
  },
  entriesList: {
    gap: 8,
  },
  entryRow: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  entryAmount: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  entryTime: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteButtonPressed: {
    opacity: 0.8,
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
});
