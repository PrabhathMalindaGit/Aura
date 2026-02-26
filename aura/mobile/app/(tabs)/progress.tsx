import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  getHydrationRange,
  listCheckins,
  type CheckInItem,
  type HydrationDayTotal,
} from "@/src/api/patient";
import { EmptyState } from "@/src/components/EmptyState";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { Screen } from "@/src/components/Screen";
import { TrustBanner } from "@/src/components/TrustBanner";
import { useAuth } from "@/src/state/auth";
import {
  getCachedCheckins,
  setCachedCheckins,
} from "@/src/state/checkinsCache";
import {
  getCachedHydrationRange,
  mergeCachedHydrationDayTotals,
} from "@/src/state/hydrationCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { setSelectedCheckin } from "@/src/state/progressSelection";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTrustStatus } from "@/src/state/trustStatus";
import { addDaysISO, formatISOToHuman, todayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";
import { computeSummary, parseCheckinTime } from "@/src/utils/progressStats";

// Layout: Single Screen wrapper; avoid nested ScrollView.
type LoadSource = "live" | "cache" | "none";
type WindowDays = 14 | 30;

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type HydrationSummary = {
  avgDailyMl: number | null;
  daysMeetingTarget: number;
};

function toFriendlyProgressError(error: unknown): {
  title: string;
  message: string;
  kind: "offline" | "network" | "server" | "validation" | "unknown";
  retryable: boolean;
} {
  let apiError: ApiError;
  if (isApiError(error)) {
    apiError = error;
  } else {
    const normalized = normalizeUnknownError(error);
    apiError = {
      title: normalized.title,
      message: normalized.message,
      kind: normalized.kind,
      retryable: normalized.retryable,
      detail: normalized.detail,
    };
  }

  if (apiError.kind === "offline") {
    return {
      title: "Couldn’t refresh",
      message: "You’re offline. Nothing was loaded.",
      kind: "offline",
      retryable: true,
    };
  }

  if (apiError.kind === "network") {
    return {
      title: "Couldn’t refresh",
      message: "Couldn’t reach the service. Please try again.",
      kind: "network",
      retryable: true,
    };
  }

  if (apiError.kind === "server") {
    return {
      title: "Couldn’t refresh",
      message: "Service unavailable. Please try again shortly.",
      kind: "server",
      retryable: true,
    };
  }

  if (apiError.kind === "validation") {
    return {
      title: "Couldn’t refresh",
      message: apiError.message || "The request was invalid.",
      kind: "validation",
      retryable: false,
    };
  }

  return {
    title: "Couldn’t refresh",
    message: apiError.message || "Something went wrong. Please try again.",
    kind: "unknown",
    retryable: true,
  };
}

function displayDate(item: CheckInItem): string {
  if (item.date) {
    return formatISOToHuman(item.date);
  }
  if (item.createdAt) {
    return formatISOToHuman(item.createdAt);
  }
  return "Unknown date";
}

function formatValue(value: number | null, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return `${value}${suffix}`;
}

function sortByNewest(items: CheckInItem[]): CheckInItem[] {
  const sorted = [...items].sort((a, b) => parseCheckinTime(b) - parseCheckinTime(a));
  const seenIds = new Set<string>();
  const deduped: CheckInItem[] = [];
  for (const item of sorted) {
    if (seenIds.has(item.id)) {
      continue;
    }
    seenIds.add(item.id);
    deduped.push(item);
  }
  return deduped;
}

export default function ProgressScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const {
    label: progressRefreshLabel,
    refreshLocal: refreshProgressStamp,
  } = useLastRefreshed("progress");
  const {
    label: progressLoadErrorLabel,
    lastError: progressLoadLastError,
    setLocalError: setProgressLoadError,
    clear: clearProgressLoadError,
  } = useLastError("progressLoad");
  const loadInFlightRef = useRef(false);

  const [windowDays, setWindowDays] = useState<WindowDays>(14);
  const [items, setItems] = useState<CheckInItem[]>([]);
  const [hydrationDays, setHydrationDays] = useState<HydrationDayTotal[]>([]);
  const [source, setSource] = useState<LoadSource>("none");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const patientId = auth.patient?.id ?? "";
  const trustStatus = useTrustStatus({
    patientId,
    errorRecords: [progressLoadLastError],
  });
  const historyItems = useMemo(() => items.slice(0, 30), [items]);

  const summary14 = useMemo(() => computeSummary(items, 14), [items]);
  const summary30 = useMemo(() => computeSummary(items, 30), [items]);
  const activeSummary = windowDays === 14 ? summary14 : summary30;
  const hydrationSummary = useMemo<HydrationSummary>(() => {
    const end = todayISO();
    const from = addDaysISO(end, -(windowDays - 1));
    const filtered = hydrationDays.filter(
      (day) => Date.parse(day.date) >= Date.parse(from) && Date.parse(day.date) <= Date.parse(end)
    );
    if (filtered.length === 0) {
      return {
        avgDailyMl: null,
        daysMeetingTarget: 0,
      };
    }

    const total = filtered.reduce((sum, day) => sum + day.totalMl, 0);
    const avgDailyMl = Math.round((total / filtered.length) * 10) / 10;
    const daysMeetingTarget = filtered.filter((day) => day.totalMl >= 2000).length;
    return {
      avgDailyMl,
      daysMeetingTarget,
    };
  }, [hydrationDays, windowDays]);

  // Keep dependencies stable (functions/primitives only) to avoid repeated effect reloads.
  const loadProgress = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!auth.token || !patientId || loadInFlightRef.current) {
        return;
      }
      loadInFlightRef.current = true;

      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setNotice(null);

      if (isOffline) {
        const [cached, cachedHydration] = await Promise.all([
          getCachedCheckins(patientId),
          getCachedHydrationRange(patientId, addDaysISO(todayISO(), -29), todayISO()),
        ]);
        if (cached && cached.length > 0) {
          setItems(sortByNewest(cached));
          setSource("cache");
        } else {
          setItems([]);
          setSource("none");
        }
        setNotice(null);
        setHydrationDays(cachedHydration?.days ?? []);

        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const hydrationFrom = addDaysISO(todayISO(), -29);
        const hydrationTo = todayISO();
        const [nextItems, hydrationRange] = await Promise.all([
          listCheckins(auth.token, { limit: 200 }),
          getHydrationRange(auth.token, {
            from: hydrationFrom,
            to: hydrationTo,
          }),
        ]);
        const sortedItems = sortByNewest(nextItems);
        setItems(sortedItems);
        setHydrationDays(hydrationRange.days);
        setSource("live");
        await Promise.all([
          setCachedCheckins(patientId, sortedItems),
          mergeCachedHydrationDayTotals(patientId, hydrationRange.days, hydrationRange.targetMl),
          refreshProgressStamp(),
          clearProgressLoadError(),
        ]);
      } catch (error) {
        const friendly = toFriendlyProgressError(error);
        await setProgressLoadError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const [cached, cachedHydration] = await Promise.all([
          getCachedCheckins(patientId),
          getCachedHydrationRange(patientId, addDaysISO(todayISO(), -29), todayISO()),
        ]);
        setHydrationDays(cachedHydration?.days ?? []);
        if (cached && cached.length > 0) {
          setItems(sortByNewest(cached));
          setSource("cache");
          setNotice({
            variant: "warning",
            title: friendly.title,
            message: "Showing saved data. Live refresh failed.",
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadProgress("refresh");
                }
              : undefined,
          });
        } else {
          setItems([]);
          setSource("none");
          setNotice({
            variant: "error",
            title: friendly.title,
            message: friendly.message,
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadProgress("refresh");
                }
              : undefined,
          });
        }
      } finally {
        loadInFlightRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [
      auth.token,
      clearProgressLoadError,
      isOffline,
      patientId,
      refreshProgressStamp,
      setProgressLoadError,
    ]
  );

  useEffect(() => {
    if (auth.status !== "signedIn") {
      return;
    }
    void loadProgress("initial");
  }, [auth.status, loadProgress]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) {
        console.warn(`[progress] duplicate check-in id detected: ${item.id}`);
        break;
      }
      seen.add(item.id);
    }
  }, [items]);

  if (auth.status === "loading") {
    return (
      <Screen title="Progress" scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  // IMPORTANT: Keep summary/toggles/notices in ListHeaderComponent.
  // Banner belongs in Screen.banner; do not duplicate in header/items.
  const listHeader = (
    <View style={styles.listHeader}>
      <LastRefreshed value={progressRefreshLabel} />
      <LastFailedAttempt
        value={progressLoadErrorLabel}
        title={progressLoadLastError?.title}
        message={progressLoadLastError?.message}
        onClear={progressLoadLastError ? clearProgressLoadError : undefined}
      />

      {source === "cache" && !isOffline ? (
        <InlineNotice
          variant="info"
          title="Saved data"
          message="Showing saved data while live refresh is unavailable."
        />
      ) : null}

      {notice ? (
        <InlineNotice
          variant={notice.variant}
          title={notice.title}
          message={notice.message}
          actionLabel={notice.actionLabel}
          onAction={notice.onAction}
        />
      ) : null}

      <View style={styles.toggleRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setWindowDays(14)}
          style={({ pressed }) => [
            styles.toggleChip,
            windowDays === 14 ? styles.toggleChipActive : null,
            pressed ? styles.toggleChipPressed : null,
          ]}
        >
          <Text style={[styles.toggleText, windowDays === 14 ? styles.toggleTextActive : null]}>
            14 days
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setWindowDays(30)}
          style={({ pressed }) => [
            styles.toggleChip,
            windowDays === 30 ? styles.toggleChipActive : null,
            pressed ? styles.toggleChipPressed : null,
          ]}
        >
          <Text style={[styles.toggleText, windowDays === 30 ? styles.toggleTextActive : null]}>
            30 days
          </Text>
        </Pressable>
      </View>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Check-ins</Text>
          <Text style={styles.summaryValue}>{activeSummary.checkinCount}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Average pain</Text>
          <Text style={styles.summaryValue}>{formatValue(activeSummary.avgPain, "/10")}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Average mood</Text>
          <Text style={styles.summaryValue}>{formatValue(activeSummary.avgMood, "/5")}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Exercise adherence</Text>
          <Text style={styles.summaryValue}>
            {formatValue(activeSummary.avgExerciseAdherencePct, "%")}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Medication taken</Text>
          <Text style={styles.summaryValue}>{formatValue(activeSummary.medicationYesPct, "%")}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Avg sleep (hrs)</Text>
          <Text style={styles.summaryValue}>{formatValue(activeSummary.avgSleepHours)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Avg sleep quality</Text>
          <Text style={styles.summaryValue}>
            {formatValue(activeSummary.avgSleepQuality, "/5")}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Avg hydration</Text>
          <Text style={styles.summaryValue}>{formatValue(hydrationSummary.avgDailyMl, " ml")}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Hydration goal days</Text>
          <Text style={styles.summaryValue}>{hydrationSummary.daysMeetingTarget}</Text>
        </View>
      </View>

      <Text style={styles.historyTitle}>Recent check-ins</Text>
    </View>
  );

  return (
    <Screen
      title="Progress"
      scroll={false}
      banner={
        <TrustBanner
          status={trustStatus}
          onRetry={() => {
            void loadProgress("refresh");
          }}
        />
      }
    >
      <FlatList
        data={historyItems}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadProgress("refresh");
            }}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => {
          const exercisePct =
            typeof item.adherence?.exercises === "number"
              ? `${Math.round(item.adherence.exercises * 100)}%`
              : "—";
          const medTaken =
            typeof item.adherence?.medication === "boolean"
              ? item.adherence.medication
                ? "Yes"
                : "No"
              : "—";
          const sleepSummary =
            typeof item.sleep?.hours === "number"
              ? `${item.sleep.hours.toFixed(1)}h`
              : typeof item.sleep?.quality === "number"
                ? `Q${item.sleep.quality}/5`
                : null;

          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSelectedCheckin(item);
                router.push("/checkin-detail" as any);
              }}
              style={({ pressed }) => [styles.rowCard, pressed ? styles.rowCardPressed : null]}
            >
              <Text style={styles.rowDate}>{displayDate(item)}</Text>
              <Text style={styles.rowMeta}>Pain {item.pain}/10</Text>
              <Text style={styles.rowMeta}>Mood {item.mood}/5</Text>
              <Text style={styles.rowMeta}>Exercises {exercisePct}</Text>
              <Text style={styles.rowMeta}>Medication {medTaken}</Text>
              {sleepSummary ? <Text style={styles.rowMeta}>Sleep {sleepSummary}</Text> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <EmptyState
              variant="compact"
              illustrationKey={isOffline ? "offline" : "progress"}
              title={isOffline ? "Offline — showing saved info only" : "No check-ins yet"}
              description={
                isOffline
                  ? "Connect to refresh progress data."
                  : "Your trends will appear after your first check-in."
              }
              ctaLabel={isOffline ? undefined : "Start check-in"}
              onCtaPress={
                isOffline
                  ? undefined
                  : () => {
                      router.push("/(tabs)/checkin");
                    }
              }
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listHeader: {
    gap: 8,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  toggleChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
  },
  toggleChipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  toggleChipPressed: {
    opacity: 0.75,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  toggleTextActive: {
    color: "#ffffff",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryCard: {
    minWidth: "48%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#f9fafb",
    gap: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#4b5563",
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: 20,
    color: "#111827",
    fontWeight: "700",
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  listContent: {
    gap: 8,
    paddingBottom: 20,
  },
  rowCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
    gap: 2,
  },
  rowCardPressed: {
    opacity: 0.8,
  },
  rowDate: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  rowMeta: {
    fontSize: 13,
    color: "#4b5563",
  },
});
