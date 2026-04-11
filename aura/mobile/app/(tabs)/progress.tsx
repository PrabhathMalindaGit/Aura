import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import {
  FlatList,
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
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { MediaCard, type MediaCardChip } from "@/src/components/MediaCard";
import { type MicroSparklineTone } from "@/src/components/MicroSparkline";
import { ProgressSignalCard } from "@/src/components/progress/ProgressSignalCard";
import { ProgressTrendCard } from "@/src/components/progress/ProgressTrendCard";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { SkeletonBlock } from "@/src/components/Skeleton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrustBanner } from "@/src/components/TrustBanner";
import { TrustCues } from "@/src/components/TrustCues";
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
import {
  buildProgressHistoryRows,
  buildProgressStoryCopy,
  describeTrendChange,
  type ProgressHistoryRow,
} from "@/src/utils/progressPresentation";
import { parseCheckinTime } from "@/src/utils/progressStats";

const DAY_MS = 24 * 60 * 60 * 1000;
const MICRO_FALLBACK_SERIES = [0, 0, 0, 0, 0];

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

type TrendItem = {
  key: "pain" | "mood" | "adherence";
  title: string;
  deltaLabel: string;
  deltaValue: number | null;
  assessment: string;
  direction: "up" | "down" | "flat";
  variant: PillVariant;
  hasData: boolean;
};

type SignalItem = {
  key: string;
  title: string;
  value: string;
  assessment: string;
  variant: PillVariant;
  detail: string;
  sparklineValues: number[];
  sparklineTone: MicroSparklineTone;
};

type TrendSplit = {
  previous: number | null;
  recent: number | null;
};

type HistoryCardStatus =
  | {
      text: string;
      tone: "neutral" | "info" | "success" | "warning" | "danger";
    }
  | undefined;

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
  preferHigh = true,
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
  selector: (item: CheckInItem) => number | null,
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
  unit = "",
): Omit<TrendItem, "key" | "title"> {
  if (
    previous === null ||
    recent === null ||
    !Number.isFinite(previous) ||
    !Number.isFinite(recent)
  ) {
    return {
      deltaLabel: "Building",
      deltaValue: null,
      assessment: "No data yet",
      direction: "flat",
      variant: "neutral",
      hasData: false,
    };
  }

  const delta = recent - previous;
  const absDelta = Math.abs(delta);
  const rounded = Number(delta.toFixed(unit === "%" ? 0 : 1));
  const sign = rounded > 0 ? "+" : "";
  const deltaLabel = `${sign}${rounded}${unit}`;

  if (absDelta <= threshold) {
    return {
      deltaLabel,
      deltaValue: rounded,
      assessment: "Stable",
      direction: "flat",
      variant: "info",
      hasData: true,
    };
  }

  const improving = betterWhen === "higher" ? delta > 0 : delta < 0;

  return {
    deltaLabel,
    deltaValue: rounded,
    assessment: improving ? "Improving" : "Needs attention",
    direction:
      improving
        ? betterWhen === "higher"
          ? "up"
          : "down"
        : betterWhen === "higher"
          ? "down"
          : "up",
    variant: improving ? "success" : "warning",
    hasData: true,
  };
}

function historyStatus(item: CheckInItem): HistoryCardStatus {
  if (item.support?.needsUrgentHelp || item.support?.feelsSafe === false) {
    return { text: "Safety check", tone: "danger" };
  }

  if (item.support?.wantsFollowUp || item.support?.wantsExtraSupport) {
    return { text: "Support requested", tone: "warning" };
  }

  if (item.notes?.trim()) {
    return { text: "Note added", tone: "info" };
  }

  return undefined;
}

function historySubtitle(item: CheckInItem): string {
  const parts = [`Pain ${item.pain}/10`, `Mood ${item.mood}/5`];

  if (typeof item.sleep?.hours === "number") {
    parts.push(`Sleep ${item.sleep.hours.toFixed(1)}h`);
  }

  return parts.join(" · ");
}

function historyChips(item: CheckInItem): MediaCardChip[] {
  const chips: MediaCardChip[] = [];

  if (typeof item.adherence?.exercises === "number") {
    chips.push({
      text: `Exercises ${Math.round(item.adherence.exercises * 100)}%`,
      tone:
        item.adherence.exercises >= 0.75
          ? "success"
          : item.adherence.exercises >= 0.5
            ? "info"
            : "warning",
    });
  }

  if (typeof item.adherence?.medication === "boolean") {
    chips.push({
      text: item.adherence.medication ? "Medication taken" : "Medication missed",
      tone: item.adherence.medication ? "success" : "warning",
    });
  }

  if (item.support?.wantsFollowUp || item.support?.wantsExtraSupport) {
    chips.push({
      text: "Support requested",
      tone: "warning",
    });
  }

  if (item.notes?.trim()) {
    chips.push({
      text: "Note recorded",
      tone: "info",
    });
  }

  return chips.slice(0, 4);
}

function hydrationAverage(
  days: HydrationDayTotal[],
  rangeDays: RangeDays,
): { avg: number | null; daysMeetingTarget: number; totalDays: number } {
  const end = todayISO();
  const from = addDaysISO(end, -(rangeDays - 1));

  const filtered = days.filter(
    (day) => Date.parse(day.date) >= Date.parse(from) && Date.parse(day.date) <= Date.parse(end),
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

function sparklineToneFromVariant(variant: PillVariant): MicroSparklineTone {
  if (variant === "success") {
    return "success";
  }
  if (variant === "warning" || variant === "danger") {
    return "warning";
  }
  if (variant === "info") {
    return "primary";
  }
  return "muted";
}

function detailFromTrend(
  trend: TrendItem,
  rangeDays: RangeDays,
  fallback: string,
): string {
  if (!trend.hasData) {
    return fallback;
  }

  return `${describeTrendChange(trend, rangeDays)}.`;
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

  const historyRows = useMemo(
    () => buildProgressHistoryRows(filteredItems),
    [filteredItems],
  );

  const hydrationStats = useMemo(
    () => hydrationAverage(hydrationDays, rangeDays),
    [hydrationDays, rangeDays],
  );

  const last7Oldest = useMemo(() => {
    const newestFirst = sortByNewest(filteredItems);
    const latestWindow = newestFirst.slice(0, 7);
    return [...latestWindow].reverse();
  }, [filteredItems]);

  const painSeries = useMemo(
    () =>
      last7Oldest
        .map((item) => item.pain)
        .filter((value): value is number => Number.isFinite(value)),
    [last7Oldest],
  );
  const moodSeries = useMemo(
    () =>
      last7Oldest
        .map((item) => item.mood)
        .filter((value): value is number => Number.isFinite(value)),
    [last7Oldest],
  );
  const adherenceSeries = useMemo(
    () =>
      last7Oldest
        .map((item) => item.adherence?.exercises)
        .filter(
          (value): value is number => typeof value === "number" && Number.isFinite(value),
        )
        .map((value) => value * 100),
    [last7Oldest],
  );
  const sleepSeries = useMemo(
    () =>
      last7Oldest
        .map((item) => item.sleep?.hours)
        .filter(
          (value): value is number => typeof value === "number" && Number.isFinite(value),
        ),
    [last7Oldest],
  );
  const hydrationSeries = useMemo(() => {
    const end = todayISO();
    const from = addDaysISO(end, -(rangeDays - 1));
    const fromTs = Date.parse(from);
    const endTs = Date.parse(end);

    const inRange = hydrationDays
      .filter((day) => {
        const ts = Date.parse(day.date);
        return Number.isFinite(ts) && ts >= fromTs && ts <= endTs;
      })
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

    return inRange
      .slice(-7)
      .map((day) => day.totalMl)
      .filter((value): value is number => Number.isFinite(value));
  }, [hydrationDays, rangeDays]);

  const painAvg = useMemo(
    () => average(filteredItems.map((item) => item.pain)),
    [filteredItems],
  );
  const moodAvg = useMemo(
    () => average(filteredItems.map((item) => item.mood)),
    [filteredItems],
  );
  const exerciseAvgPct = useMemo(() => {
    const values = filteredItems
      .map((item) => item.adherence?.exercises)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .map((value) => value * 100);
    return average(values);
  }, [filteredItems]);
  const sleepAvgHours = useMemo(() => {
    const values = filteredItems
      .map((item) => item.sleep?.hours)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return average(values);
  }, [filteredItems]);

  const trendItems = useMemo<TrendItem[]>(() => {
    const painSplit = computeTrendSplit(filteredItems, rangeDays, (item) => item.pain);
    const moodSplit = computeTrendSplit(filteredItems, rangeDays, (item) => item.mood);
    const adherenceSplit = computeTrendSplit(filteredItems, rangeDays, (item) => {
      if (typeof item.adherence?.exercises !== "number") {
        return null;
      }
      return item.adherence.exercises * 100;
    });

    return [
      {
        ...evaluateTrend(painSplit.previous, painSplit.recent, "lower", 0.3),
        key: "pain",
        title: "Pain",
      },
      {
        ...evaluateTrend(moodSplit.previous, moodSplit.recent, "higher", 0.2),
        key: "mood",
        title: "Mood",
      },
      {
        ...evaluateTrend(adherenceSplit.previous, adherenceSplit.recent, "higher", 5, "%"),
        key: "adherence",
        title: "Exercise adherence",
      },
    ];
  }, [filteredItems, rangeDays]);

  const signalItems = useMemo<SignalItem[]>(() => {
    const painStatus = deriveAssessment(painAvg, { good: 4, okay: 6 }, false);
    const moodStatus = deriveAssessment(moodAvg, { good: 4, okay: 3 }, true);
    const adherenceStatus = deriveAssessment(exerciseAvgPct, { good: 75, okay: 50 }, true);

    const painTrend = trendItems.find((trend) => trend.key === "pain") ?? {
      key: "pain",
      title: "Pain",
      deltaLabel: "Building",
      deltaValue: null,
      assessment: "No data yet",
      direction: "flat" as const,
      variant: "neutral" as const,
      hasData: false,
    };
    const moodTrend = trendItems.find((trend) => trend.key === "mood") ?? {
      key: "mood",
      title: "Mood",
      deltaLabel: "Building",
      deltaValue: null,
      assessment: "No data yet",
      direction: "flat" as const,
      variant: "neutral" as const,
      hasData: false,
    };
    const adherenceTrend = trendItems.find((trend) => trend.key === "adherence") ?? {
      key: "adherence",
      title: "Exercise adherence",
      deltaLabel: "Building",
      deltaValue: null,
      assessment: "No data yet",
      direction: "flat" as const,
      variant: "neutral" as const,
      hasData: false,
    };

    const summary: SignalItem[] = [
      {
        key: "pain",
        title: "Pain",
        value: formatValue(painAvg, "/10"),
        assessment: painStatus.label,
        variant: painStatus.variant,
        detail: detailFromTrend(
          painTrend,
          rangeDays,
          `Add a few more check-ins to see your pain pattern over ${rangeDays} days.`,
        ),
        sparklineValues: painSeries.length >= 2 ? painSeries : MICRO_FALLBACK_SERIES,
        sparklineTone: sparklineToneFromVariant(painTrend.variant),
      },
      {
        key: "mood",
        title: "Mood",
        value: formatValue(moodAvg, "/5"),
        assessment: moodStatus.label,
        variant: moodStatus.variant,
        detail: detailFromTrend(
          moodTrend,
          rangeDays,
          `Mood trends will become clearer once you have a few more recent entries.`,
        ),
        sparklineValues: moodSeries.length >= 2 ? moodSeries : MICRO_FALLBACK_SERIES,
        sparklineTone: sparklineToneFromVariant(moodTrend.variant),
      },
      {
        key: "adherence",
        title: "Exercise adherence",
        value: formatValue(exerciseAvgPct, "%", 0),
        assessment: adherenceStatus.label,
        variant: adherenceStatus.variant,
        detail: detailFromTrend(
          adherenceTrend,
          rangeDays,
          `Exercise check-ins will show a fuller pattern over this ${rangeDays}-day window.`,
        ),
        sparklineValues: adherenceSeries.length >= 2 ? adherenceSeries : MICRO_FALLBACK_SERIES,
        sparklineTone: sparklineToneFromVariant(adherenceTrend.variant),
      },
    ];

    if (hydrationStats.avg !== null || hydrationSeries.length > 0) {
      const hydrationStatus = deriveAssessment(
        hydrationStats.avg,
        { good: 1800, okay: 1400 },
        true,
      );

      summary.push({
        key: "hydration",
        title: "Hydration",
        value: formatValue(hydrationStats.avg, " ml", 0),
        assessment: hydrationStatus.label,
        variant: hydrationStatus.variant,
        detail:
          hydrationStats.totalDays > 0
            ? `${hydrationStats.daysMeetingTarget}/${hydrationStats.totalDays} days met your daily water target.`
            : `Hydration totals will appear here once there is enough recent data.`,
        sparklineValues: hydrationSeries.length >= 2 ? hydrationSeries : MICRO_FALLBACK_SERIES,
        sparklineTone: sparklineToneFromVariant(hydrationStatus.variant),
      });
    } else {
      const sleepStatus = deriveAssessment(sleepAvgHours, { good: 7, okay: 6 }, true);
      summary.push({
        key: "sleep",
        title: "Sleep",
        value: formatValue(sleepAvgHours, "h"),
        assessment: sleepStatus.label,
        variant: sleepStatus.variant,
        detail:
          sleepAvgHours !== null
            ? `Average sleep across this ${rangeDays}-day window.`
            : `Sleep entries will appear here as you continue checking in.`,
        sparklineValues: sleepSeries.length >= 2 ? sleepSeries : MICRO_FALLBACK_SERIES,
        sparklineTone: sparklineToneFromVariant(sleepStatus.variant),
      });
    }

    return summary.slice(0, 4);
  }, [
    adherenceSeries,
    exerciseAvgPct,
    hydrationSeries,
    hydrationStats,
    moodAvg,
    moodSeries,
    painAvg,
    painSeries,
    rangeDays,
    sleepAvgHours,
    sleepSeries,
    trendItems,
  ]);

  const subtitle = useMemo(() => {
    if (source === "cache") {
      return "Showing saved progress from your recent check-ins.";
    }
    return "Review your recent recovery patterns.";
  }, [source]);

  const latestCheckin = filteredItems[0] ?? null;
  const supportRequestsInRange = useMemo(
    () =>
      filteredItems.filter(
        (item) =>
          item.support?.wantsFollowUp ||
          item.support?.wantsExtraSupport ||
          item.support?.needsUrgentHelp,
      ).length,
    [filteredItems],
  );

  const progressStory = useMemo(
    () => buildProgressStoryCopy(trendItems, rangeDays, filteredItems.length),
    [filteredItems.length, rangeDays, trendItems],
  );

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
          mergeCachedHydrationDayTotals(
            patientId,
            hydrationRange.days,
            hydrationRange.targetMl,
          ),
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
            message: "Showing saved progress. Live refresh failed.",
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
    ],
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
    <View testID="progress-shell" style={styles.listHeader}>
      <HeroHeader
        title="Recovery progress"
        subtitle={subtitle}
        rightActions={[
          {
            icon: "checkin",
            tone: "primary",
            accessibilityLabel: "Open today’s check-in",
            onPress: () => {
              router.push("/(tabs)/checkin");
            },
          },
        ]}
      >
        <View style={styles.headerPillRow}>
          <StatusPill
            label={
              source === "cache"
                ? "Saved view"
                : source === "live"
                  ? "Live view"
                  : "No data yet"
            }
            variant={source === "cache" ? "warning" : source === "live" ? "success" : "neutral"}
          />
          <StatusPill
            label={`${filteredItems.length} check-in${filteredItems.length === 1 ? "" : "s"}`}
            variant="info"
          />
        </View>

        <TrustCues
          status={trustStatus}
          lastUpdatedLabel={progressRefreshLabel}
          showLastUpdated
          showPending
          showSavedLocalHint
          style={styles.trustCueRow}
        />

        <Card variant="outlined" style={styles.storyCard}>
          <View style={styles.storyCopy}>
            <Text style={styles.storyEyebrow}>Trend story</Text>
            <Text style={styles.storyTitle}>{progressStory.title}</Text>
            <Text style={styles.storyText}>{progressStory.body}</Text>
          </View>

          <View style={styles.storyFactsRow}>
            <View style={styles.storyFact}>
              <Text style={styles.storyFactLabel}>Latest check-in</Text>
              <Text style={styles.storyFactValue}>
                {latestCheckin ? formatDateTitle(latestCheckin) : "Not logged yet"}
              </Text>
            </View>
            <View style={styles.storyFact}>
              <Text style={styles.storyFactLabel}>Entries in view</Text>
              <Text style={styles.storyFactValue}>{filteredItems.length || 0}</Text>
            </View>
            <View style={styles.storyFact}>
              <Text style={styles.storyFactLabel}>Support requested</Text>
              <Text style={styles.storyFactValue}>
                {supportRequestsInRange > 0 ? `${supportRequestsInRange} time${supportRequestsInRange === 1 ? "" : "s"}` : "None"}
              </Text>
            </View>
          </View>
        </Card>
      </HeroHeader>

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
        <Card variant="outlined" style={styles.failureCard}>
          <LastFailedAttempt
            label="Last refresh issue"
            value={progressLoadErrorLabel}
            title={progressLoadLastError.title}
            message={progressLoadLastError.message}
            onClear={() => {
              void clearProgressLoadError();
            }}
          />
        </Card>
      ) : null}

      <Section
        title="Review window"
        subtitle="Choose the period you want to review."
        right={<StatusPill label={`${rangeDays} days`} variant="info" />}
        card
      >
        <SegmentedControl
          testID="progress-range-selector"
          value={String(rangeDays) as "7" | "30" | "90"}
          options={[
            { value: "7", label: "7d" },
            { value: "30", label: "30d" },
            { value: "90", label: "90d" },
          ]}
          onChange={(value) => setRangeDays(Number(value) as RangeDays)}
          accessibilityLabel="Progress range selector"
          tone="primary"
        />
        <Text style={styles.rangeHelp}>
          Short windows highlight recent change. Longer windows show steadier recovery patterns.
        </Text>
      </Section>

      <Section
        title="Current signals"
        subtitle="Start here for the clearest recent measures in this review window."
        card
      >
        {isLoading && items.length === 0 ? (
          <View style={styles.signalGrid}>
            {[0, 1, 2, 3].map((key) => (
              <SkeletonBlock
                key={key}
                height={176}
                style={styles.signalSkeleton}
              />
            ))}
          </View>
        ) : (
          <View testID="progress-signal-grid" style={styles.signalGrid}>
            {signalItems.map((signal) => (
              <View key={signal.key} style={styles.signalCardWrap}>
                <ProgressSignalCard
                  testID={`progress-signal-${signal.key}`}
                  title={signal.title}
                  value={signal.value}
                  summary={signal.assessment}
                  detail={signal.detail}
                  sparklineValues={signal.sparklineValues}
                  sparklineTone={signal.sparklineTone}
                  variant={signal.variant}
                />
              </View>
            ))}
          </View>
        )}
      </Section>

      <Section
        title="Trend story"
        subtitle="Specific changes across this review window."
        card
      >
        <View testID="progress-trend-list" style={styles.trendList}>
          {trendItems.map((trend) => {
            const sparklineValues =
              trend.key === "pain"
                ? painSeries
                : trend.key === "mood"
                  ? moodSeries
                  : adherenceSeries;

            return (
              <ProgressTrendCard
                key={trend.key}
                testID={`progress-trend-${trend.key}`}
                title={trend.title}
                sentence={describeTrendChange(trend, rangeDays)}
                deltaLabel={trend.hasData ? trend.deltaLabel : "Building"}
                rangeLabel={`Last ${rangeDays} days`}
                statusLabel={trend.assessment}
                variant={trend.variant}
                sparklineValues={
                  sparklineValues.length >= 2 ? sparklineValues : MICRO_FALLBACK_SERIES
                }
                sparklineTone={sparklineToneFromVariant(trend.variant)}
              />
            );
          })}
        </View>
      </Section>

      <View style={styles.historyHeader}>
        <Text style={styles.historyEyebrow}>Supporting history</Text>
        <Text accessibilityRole="header" style={styles.historyTitle}>
          Recent check-ins
        </Text>
        <Text style={styles.historySubtitle}>
          Grouped by week so it is easier to review the detail beneath your trends.
        </Text>
      </View>
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
      <FlatList<ProgressHistoryRow>
        testID="progress-history-list"
        data={historyRows}
        keyExtractor={(row) => row.key}
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
        renderItem={({ item: row }) => {
          if (row.type === "header") {
            return (
              <View style={styles.weekHeader}>
                <Text style={styles.weekHeaderText}>{row.label}</Text>
              </View>
            );
          }

          const item = row.item;

          return (
            <View style={styles.historyRowWrap}>
              <MediaCard
                variant="compact"
                leading={{
                  type: "icon",
                  icon: "checkin",
                  tone:
                    item.support?.needsUrgentHelp || item.support?.feelsSafe === false
                      ? "danger"
                      : item.support?.wantsFollowUp || item.support?.wantsExtraSupport
                        ? "warning"
                        : item.notes?.trim()
                          ? "accent"
                          : "muted",
                }}
                title={formatDateTitle(item)}
                subtitle={historySubtitle(item)}
                chips={historyChips(item)}
                maxChips={3}
                statusPill={historyStatus(item)}
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
                <SkeletonBlock key={key} height={76} style={styles.historySkeleton} />
              ))}
            </View>
          ) : (
            <EmptyState
              variant="compact"
              illustrationKey={isOffline ? "offline" : "progress"}
              title={isOffline ? "Offline — no saved progress yet" : "No check-ins in this window yet"}
              description={
                isOffline
                  ? "Connect again to refresh your recovery history."
                  : "Your recovery story will appear here as you complete check-ins."
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
      gap: tokens.spacing.lg,
    },
    headerPillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    trustCueRow: {
      marginTop: tokens.spacing.xs,
    },
    storyCard: {
      gap: tokens.spacing.lg,
      backgroundColor: tokens.colors.surface,
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
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    storyText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    storyFactsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    storyFact: {
      flexGrow: 1,
      minWidth: 96,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: 2,
    },
    storyFactLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      fontWeight: tokens.typography.weights.medium,
    },
    storyFactValue: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    failureCard: {
      backgroundColor: tokens.colors.surface,
    },
    rangeHelp: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    signalGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    signalCardWrap: {
      width: "48%",
      flexGrow: 1,
    },
    signalSkeleton: {
      width: "48%",
      flexGrow: 1,
      minHeight: 176,
      borderRadius: tokens.radius.lg,
    },
    trendList: {
      gap: tokens.spacing.sm,
    },
    historyHeader: {
      gap: tokens.spacing.xs,
      marginTop: tokens.spacing.xs,
    },
    historyEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      fontWeight: tokens.typography.weights.medium,
    },
    historyTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    historySubtitle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    listContent: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xl,
    },
    weekHeader: {
      paddingTop: tokens.spacing.sm,
      paddingBottom: tokens.spacing.xs,
    },
    weekHeaderText: {
      color: tokens.colors.textTertiary,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    historyRowWrap: {
      marginBottom: tokens.spacing.xs,
    },
    emptyLoadingWrap: {
      gap: tokens.spacing.sm,
    },
    historySkeleton: {
      borderRadius: tokens.radius.md,
      minHeight: 76,
    },
  });
}
