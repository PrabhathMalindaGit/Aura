import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { Banner, type BannerVariant } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { EmptyState } from "@/src/components/EmptyState";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { SkeletonBlock } from "@/src/components/Skeleton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrustBanner } from "@/src/components/TrustBanner";
import { Row } from "@/src/components/Row";
import { useAuth } from "@/src/state/auth";
import { getCachedCheckins, setCachedCheckins } from "@/src/state/checkinsCache";
import {
  getCachedHydrationRange,
  mergeCachedHydrationDayTotals,
} from "@/src/state/hydrationCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { setSelectedCheckin } from "@/src/state/progressSelection";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTrustStatus } from "@/src/state/trustStatus";
import { useTokens } from "@/src/theme/tokens";
import { addDaysISO, todayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";
import { parseCheckinTime } from "@/src/utils/progressStats";

// Layout: Single Screen wrapper; avoid nested ScrollView.
const DAY_MS = 24 * 60 * 60 * 1000;

type LoadSource = "live" | "cache" | "none";
type RangeDays = 7 | 30 | 90;
type PillVariant = "neutral" | "info" | "success" | "warning" | "danger";

type NoticeState = {
  variant: BannerVariant;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type KpiItem = {
  key: string;
  title: string;
  value: string;
  assessment: string;
  variant: PillVariant;
  helper?: string;
};

type TrendItem = {
  key: string;
  title: string;
  deltaLabel: string;
  assessment: string;
  direction: "up" | "down" | "flat";
  variant: PillVariant;
};

type TrendSplit = {
  previous: number | null;
  recent: number | null;
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

function formatDateTitle(item: CheckInItem): string {
  const source = item.date ?? item.createdAt;
  if (!source) {
    return "Unknown date";
  }

  const parsed = new Date(source);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function formatValue(value: number | null, suffix = "", decimals = 1): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  const rounded = Number(value.toFixed(decimals));
  return `${rounded}${suffix}`;
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

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function deriveAssessment(
  value: number | null,
  thresholds: { good: number; okay: number },
  preferHigh = true
): { label: string; variant: PillVariant } {
  if (value === null || !Number.isFinite(value)) {
    return { label: "No data yet", variant: "neutral" };
  }

  if (preferHigh) {
    if (value >= thresholds.good) {
      return { label: "Improving", variant: "success" };
    }
    if (value >= thresholds.okay) {
      return { label: "Stable", variant: "info" };
    }
    return { label: "Needs attention", variant: "warning" };
  }

  if (value <= thresholds.good) {
    return { label: "Improving", variant: "success" };
  }
  if (value <= thresholds.okay) {
    return { label: "Stable", variant: "info" };
  }
  return { label: "Needs attention", variant: "warning" };
}

function computeTrendSplit(
  items: CheckInItem[],
  rangeDays: RangeDays,
  selector: (item: CheckInItem) => number | null
): TrendSplit {
  const now = Date.now();
  const windowStart = now - rangeDays * DAY_MS;
  const midpoint = now - (rangeDays * DAY_MS) / 2;

  const previousValues: number[] = [];
  const recentValues: number[] = [];

  for (const item of items) {
    const ts = parseCheckinTime(item);
    if (!Number.isFinite(ts) || ts < windowStart || ts > now) {
      continue;
    }

    const value = selector(item);
    if (value === null || !Number.isFinite(value)) {
      continue;
    }

    if (ts < midpoint) {
      previousValues.push(value);
    } else {
      recentValues.push(value);
    }
  }

  return {
    previous: average(previousValues),
    recent: average(recentValues),
  };
}

function evaluateTrend(
  previous: number | null,
  recent: number | null,
  betterWhen: "higher" | "lower",
  threshold: number,
  unit = ""
): TrendItem {
  if (
    previous === null ||
    recent === null ||
    !Number.isFinite(previous) ||
    !Number.isFinite(recent)
  ) {
    return {
      key: "",
      title: "",
      deltaLabel: "Not enough data",
      assessment: "No data yet",
      direction: "flat",
      variant: "neutral",
    };
  }

  const delta = recent - previous;
  const absDelta = Math.abs(delta);
  const rounded = Number(delta.toFixed(1));
  const sign = rounded > 0 ? "+" : "";
  const deltaLabel = `${sign}${rounded}${unit}`;

  if (absDelta <= threshold) {
    return {
      key: "",
      title: "",
      deltaLabel,
      assessment: "Stable",
      direction: "flat",
      variant: "info",
    };
  }

  const improving = betterWhen === "higher" ? delta > 0 : delta < 0;

  return {
    key: "",
    title: "",
    deltaLabel,
    assessment: improving ? "Improving" : "Needs attention",
    direction: improving ? (betterWhen === "higher" ? "up" : "down") : betterWhen === "higher" ? "down" : "up",
    variant: improving ? "success" : "warning",
  };
}

function trendArrow(direction: "up" | "down" | "flat"): string {
  if (direction === "up") {
    return "↑";
  }
  if (direction === "down") {
    return "↓";
  }
  return "→";
}

function hydrationAverage(
  days: HydrationDayTotal[],
  rangeDays: RangeDays
): { avg: number | null; daysMeetingTarget: number; totalDays: number } {
  const end = todayISO();
  const from = addDaysISO(end, -(rangeDays - 1));

  const filtered = days.filter(
    (day) => Date.parse(day.date) >= Date.parse(from) && Date.parse(day.date) <= Date.parse(end)
  );

  if (filtered.length === 0) {
    return {
      avg: null,
      daysMeetingTarget: 0,
      totalDays: 0,
    };
  }

  const totalMl = filtered.reduce((sum, day) => sum + day.totalMl, 0);
  return {
    avg: totalMl / filtered.length,
    daysMeetingTarget: filtered.filter((day) => day.totalMl >= 2000).length,
    totalDays: filtered.length,
  };
}

export default function ProgressScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

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

  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
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

  const filteredItems = useMemo(() => {
    const now = Date.now();
    const threshold = now - rangeDays * DAY_MS;
    return items.filter((item) => {
      const ts = parseCheckinTime(item);
      return Number.isFinite(ts) && ts >= threshold;
    });
  }, [items, rangeDays]);

  const hydrationStats = useMemo(
    () => hydrationAverage(hydrationDays, rangeDays),
    [hydrationDays, rangeDays]
  );

  const painAvg = useMemo(
    () => average(filteredItems.map((item) => item.pain)),
    [filteredItems]
  );
  const moodAvg = useMemo(
    () => average(filteredItems.map((item) => item.mood)),
    [filteredItems]
  );
  const exerciseAvgPct = useMemo(() => {
    const values = filteredItems
      .map((item) => item.adherence?.exercises)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .map((value) => value * 100);
    return average(values);
  }, [filteredItems]);
  const medicationPct = useMemo(() => {
    const values = filteredItems
      .map((item) => item.adherence?.medication)
      .filter((value): value is boolean => typeof value === "boolean");
    if (values.length === 0) {
      return null;
    }
    const yesCount = values.filter(Boolean).length;
    return (yesCount / values.length) * 100;
  }, [filteredItems]);
  const sleepAvgHours = useMemo(() => {
    const values = filteredItems
      .map((item) => item.sleep?.hours)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return average(values);
  }, [filteredItems]);

  const trendItems = useMemo<TrendItem[]>(() => {
    const painTrend = evaluateTrend(
      computeTrendSplit(filteredItems, rangeDays, (item) => item.pain).previous,
      computeTrendSplit(filteredItems, rangeDays, (item) => item.pain).recent,
      "lower",
      0.3,
      ""
    );
    const moodTrend = evaluateTrend(
      computeTrendSplit(filteredItems, rangeDays, (item) => item.mood).previous,
      computeTrendSplit(filteredItems, rangeDays, (item) => item.mood).recent,
      "higher",
      0.2,
      ""
    );
    const adherenceTrend = evaluateTrend(
      computeTrendSplit(filteredItems, rangeDays, (item) => {
        if (typeof item.adherence?.exercises !== "number") {
          return null;
        }
        return item.adherence.exercises * 100;
      }).previous,
      computeTrendSplit(filteredItems, rangeDays, (item) => {
        if (typeof item.adherence?.exercises !== "number") {
          return null;
        }
        return item.adherence.exercises * 100;
      }).recent,
      "higher",
      5,
      "%"
    );

    return [
      {
        ...painTrend,
        key: "pain",
        title: "Pain",
      },
      {
        ...moodTrend,
        key: "mood",
        title: "Mood",
      },
      {
        ...adherenceTrend,
        key: "adherence",
        title: "Adherence",
      },
    ];
  }, [filteredItems, rangeDays]);

  const kpiItems = useMemo<KpiItem[]>(() => {
    const painStatus = deriveAssessment(painAvg, { good: 4, okay: 6 }, false);
    const moodStatus = deriveAssessment(moodAvg, { good: 4, okay: 3 }, true);
    const adherenceStatus = deriveAssessment(exerciseAvgPct, { good: 75, okay: 50 }, true);
    const medicationStatus = deriveAssessment(medicationPct, { good: 80, okay: 60 }, true);

    const base: KpiItem[] = [
      {
        key: "pain",
        title: "Pain",
        value: formatValue(painAvg, "/10"),
        assessment: painStatus.label,
        variant: painStatus.variant,
      },
      {
        key: "mood",
        title: "Mood",
        value: formatValue(moodAvg, "/5"),
        assessment: moodStatus.label,
        variant: moodStatus.variant,
      },
      {
        key: "adherence",
        title: "Exercise adherence",
        value: formatValue(exerciseAvgPct, "%", 0),
        assessment: adherenceStatus.label,
        variant: adherenceStatus.variant,
      },
      {
        key: "medication",
        title: "Medication taken",
        value: formatValue(medicationPct, "%", 0),
        assessment: medicationStatus.label,
        variant: medicationStatus.variant,
      },
    ];

    if (sleepAvgHours !== null) {
      const sleepStatus = deriveAssessment(sleepAvgHours, { good: 7, okay: 6 }, true);
      base.push({
        key: "sleep",
        title: "Sleep",
        value: formatValue(sleepAvgHours, "h"),
        assessment: sleepStatus.label,
        variant: sleepStatus.variant,
      });
    }

    if (hydrationStats.avg !== null) {
      const hydrationStatus = deriveAssessment(
        hydrationStats.avg,
        { good: 1800, okay: 1400 },
        true
      );
      base.push({
        key: "hydration",
        title: "Hydration",
        value: formatValue(hydrationStats.avg, " ml", 0),
        assessment: hydrationStatus.label,
        variant: hydrationStatus.variant,
        helper: `${hydrationStats.daysMeetingTarget}/${hydrationStats.totalDays} goal days`,
      });
    }

    return base.slice(0, 6);
  }, [exerciseAvgPct, hydrationStats, medicationPct, moodAvg, painAvg, sleepAvgHours]);

  const subtitle = useMemo(() => {
    if (isOffline) {
      return "Offline — showing saved info.";
    }
    if (source === "cache") {
      return "Showing saved data.";
    }
    return `Last updated ${progressRefreshLabel}`;
  }, [isOffline, progressRefreshLabel, source]);

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

      const hydrationFrom = addDaysISO(todayISO(), -89);
      const hydrationTo = todayISO();

      if (isOffline) {
        const [cached, cachedHydration] = await Promise.all([
          getCachedCheckins(patientId),
          getCachedHydrationRange(patientId, hydrationFrom, hydrationTo),
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

        loadInFlightRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
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
          getCachedHydrationRange(patientId, hydrationFrom, hydrationTo),
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
            variant: "warning",
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
      <Screen scroll={false}>
        <View style={styles.loadingWrap}>
          <SkeletonBlock height={28} width="40%" />
          <SkeletonBlock height={18} width="55%" />
          <SkeletonBlock height={96} />
          <SkeletonBlock height={96} />
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.headerIntro}>
        <Text style={styles.title}>Progress</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.headerPillRow}>
          <StatusPill
            label={`Range ${rangeDays}d`}
            variant="neutral"
          />
          {trustStatus.kind === "syncing" ? (
            <StatusPill
              label={`Pending ${Math.max(0, trustStatus.pendingCount)}`}
              variant="info"
            />
          ) : null}
        </View>
      </View>

      {notice ? (
        <Banner
          variant={notice.variant}
          title={notice.title}
          message={notice.message}
          actionLabel={notice.actionLabel}
          onAction={notice.onAction}
        />
      ) : null}

      {progressLoadLastError && !notice ? (
        <Banner
          variant="warning"
          title="Last refresh issue"
          message={`${progressLoadErrorLabel}. ${progressLoadLastError.message}`}
          actionLabel="Clear"
          onAction={() => {
            void clearProgressLoadError();
          }}
        />
      ) : null}

      <Card variant="outlined">
        <View style={styles.rangeSelector}>
          {[7, 30, 90].map((range) => {
            const selected = rangeDays === range;
            return (
              <Pressable
                key={range}
                accessibilityRole="button"
                accessibilityLabel={`Show last ${range} days`}
                onPress={() => setRangeDays(range as RangeDays)}
                style={({ pressed }) => [
                  styles.rangeChip,
                  selected ? styles.rangeChipSelected : null,
                  pressed ? styles.rangeChipPressed : null,
                ]}
              >
                <Text
                  style={[styles.rangeChipText, selected ? styles.rangeChipTextSelected : null]}
                >
                  {range} days
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Section title="Key metrics" card>
        {isLoading && items.length === 0 ? (
          <View style={styles.kpiGrid}>
            {[0, 1, 2, 3].map((key) => (
              <SkeletonBlock key={key} height={94} style={styles.kpiTileSkeleton} />
            ))}
          </View>
        ) : (
          <View style={styles.kpiGrid}>
            {kpiItems.map((kpi) => (
              <Card key={kpi.key} variant="outlined" style={styles.kpiTile}>
                <View style={styles.kpiTileBody}>
                  <Text style={styles.kpiTitle}>{kpi.title}</Text>
                  <Text style={styles.kpiValue}>{kpi.value}</Text>
                  <Text style={styles.kpiAssessment}>{kpi.assessment}</Text>
                  <StatusPill label={kpi.assessment} variant={kpi.variant} />
                  {kpi.helper ? <Text style={styles.kpiHelper}>{kpi.helper}</Text> : null}
                </View>
              </Card>
            ))}
          </View>
        )}
      </Section>

      <Section title="Trends" card>
        <View style={styles.trendList}>
          {trendItems.map((trend) => (
            <View key={trend.key} style={styles.trendRow}>
              <View style={styles.trendLeft}>
                <Text style={styles.trendTitle}>{trend.title}</Text>
                <Text style={styles.trendDelta}>
                  {trendArrow(trend.direction)} {trend.deltaLabel}
                </Text>
              </View>
              <StatusPill label={trend.assessment} variant={trend.variant} />
            </View>
          ))}
        </View>
      </Section>

      <Text style={styles.historyTitle}>Recent check-ins</Text>
      {/* IMPORTANT: Header belongs in ListHeaderComponent only; do not duplicate in renderItem. */}
    </View>
  );

  return (
    <Screen
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
        data={filteredItems}
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
            <View style={styles.historyRowWrap}>
              <Row
                title={formatDateTitle(item)}
                subtitle={`Pain ${item.pain}/10 · Mood ${item.mood}/5 · Exercises ${exercisePct}${sleepSummary ? ` · Sleep ${sleepSummary}` : ""} · Medication ${medTaken}`}
                onPress={() => {
                  setSelectedCheckin(item);
                  router.push("/checkin-detail" as any);
                }}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyLoadingWrap}>
              {[0, 1, 2].map((key) => (
                <SkeletonBlock key={key} height={72} style={styles.historySkeleton} />
              ))}
            </View>
          ) : (
            <EmptyState
              variant="compact"
              illustrationKey={isOffline ? "offline" : "progress"}
              title={isOffline ? "Offline — showing saved info" : "No check-ins in this range"}
              description={
                isOffline
                  ? "Connect to refresh progress data."
                  : "Try a different range or complete today’s check-in."
              }
              ctaLabel={isOffline ? undefined : "Start today’s check-in"}
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

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    loadingWrap: {
      flex: 1,
      justifyContent: "center",
      gap: tokens.spacing.md,
    },
    listHeader: {
      gap: tokens.spacing.md,
    },
    headerIntro: {
      gap: tokens.spacing.xs,
    },
    title: {
      color: tokens.colors.text,
      fontSize: tokens.typography.title.fontSize,
      lineHeight: tokens.typography.title.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    subtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    headerPillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xs,
    },
    rangeSelector: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    rangeChip: {
      minHeight: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.md,
      alignItems: "center",
      justifyContent: "center",
    },
    rangeChipSelected: {
      borderColor: tokens.colors.accent,
      backgroundColor: tokens.colors.accentTextOn,
    },
    rangeChipPressed: {
      opacity: 0.82,
    },
    rangeChipText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    rangeChipTextSelected: {
      color: tokens.colors.accent,
      fontWeight: tokens.typography.weights.semibold,
    },
    kpiGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    kpiTile: {
      width: "48%",
      flexGrow: 1,
      minHeight: 100,
    },
    kpiTileSkeleton: {
      width: "48%",
      flexGrow: 1,
      minHeight: 94,
      borderRadius: tokens.radius.md,
    },
    kpiTileBody: {
      gap: tokens.spacing.xs,
    },
    kpiTitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    kpiValue: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    kpiAssessment: {
      color: tokens.colors.text,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    kpiHelper: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    trendList: {
      gap: tokens.spacing.sm,
    },
    trendRow: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    trendLeft: {
      flex: 1,
      gap: 2,
    },
    trendTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    trendDelta: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    historyTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      marginTop: tokens.spacing.xs,
    },
    listContent: {
      gap: tokens.spacing.sm,
      paddingBottom: tokens.spacing.xl,
    },
    historyRowWrap: {
      marginBottom: tokens.spacing.xs,
    },
    emptyLoadingWrap: {
      gap: tokens.spacing.sm,
    },
    historySkeleton: {
      borderRadius: tokens.radius.md,
      minHeight: 72,
    },
  });
}
