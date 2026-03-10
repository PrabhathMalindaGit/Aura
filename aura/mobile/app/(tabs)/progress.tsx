import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { SkeletonBlock } from "@/src/components/Skeleton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
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
import { parseCheckinTime } from "@/src/utils/progressStats";

// Layout: Single Screen wrapper; avoid nested ScrollView.
const DAY_MS = 24 * 60 * 60 * 1000;
const MICRO_FALLBACK_SERIES = [0, 0, 0, 0, 0, 0, 0];

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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
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

function trendTitle(key: TrendItem["key"]): string {
  if (key === "pain") {
    return "Pain trend";
  }
  if (key === "mood") {
    return "Mood trend";
  }
  return "Adherence trend";
}

function trendNarrative(trend: TrendItem, rangeDays: RangeDays): string {
  const label = trend.title.toLowerCase();

  if (trend.assessment === "Improving") {
    return `${label} is moving in a better direction across the last ${rangeDays} days.`;
  }

  if (trend.assessment === "Stable") {
    return `${label} looks steady across the last ${rangeDays} days.`;
  }

  return `${label} may need a closer look across this ${rangeDays}-day window.`;
}

function historyStatus(item: CheckInItem): HistoryCardStatus {
  if (item.support?.needsUrgentHelp || item.support?.feelsSafe === false) {
    return { text: "Safety", tone: "danger" };
  }

  if (item.support?.wantsFollowUp || item.support?.wantsExtraSupport) {
    return { text: "Follow-up", tone: "warning" };
  }

  if (item.notes?.trim()) {
    return { text: "Note", tone: "info" };
  }

  return undefined;
}

function historyChips(item: CheckInItem): MediaCardChip[] {
  const chips: MediaCardChip[] = [];

  if (typeof item.adherence?.exercises === "number") {
    chips.push({
      text: `Exercises ${Math.round(item.adherence.exercises * 100)}%`,
      tone: item.adherence.exercises >= 0.75 ? "success" : item.adherence.exercises >= 0.5 ? "info" : "warning",
    });
  }

  if (typeof item.adherence?.medication === "boolean") {
    chips.push({
      text: item.adherence.medication ? "Medication taken" : "Medication missed",
      tone: item.adherence.medication ? "success" : "warning",
    });
  }

  if (typeof item.sleep?.hours === "number") {
    chips.push({
      text: `Sleep ${item.sleep.hours.toFixed(1)}h`,
      tone: item.sleep.hours >= 7 ? "success" : item.sleep.hours >= 6 ? "info" : "warning",
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
    [last7Oldest]
  );
  const moodSeries = useMemo(
    () =>
      last7Oldest
        .map((item) => item.mood)
        .filter((value): value is number => Number.isFinite(value)),
    [last7Oldest]
  );
  const adherenceSeries = useMemo(
    () =>
      last7Oldest
        .map((item) => item.adherence?.exercises)
        .filter(
          (value): value is number => typeof value === "number" && Number.isFinite(value)
        )
        .map((value) => value * 100),
    [last7Oldest]
  );
  const medsSeries = useMemo(
    () =>
      last7Oldest
        .map((item) => item.adherence?.medication)
        .filter((value): value is boolean => typeof value === "boolean")
        .map((value) => (value ? 1 : 0)),
    [last7Oldest]
  );
  const sleepSeries = useMemo(
    () =>
      last7Oldest
        .map((item) => item.sleep?.hours)
        .filter(
          (value): value is number => typeof value === "number" && Number.isFinite(value)
        ),
    [last7Oldest]
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
    if (source === "cache") {
      return "Showing saved trend data.";
    }
    return "Your recovery trends over time.";
  }, [source]);

  const latestCheckin = filteredItems[0] ?? null;
  const supportRequestsInRange = useMemo(
    () =>
      filteredItems.filter(
        (item) => item.support?.wantsFollowUp || item.support?.wantsExtraSupport || item.support?.needsUrgentHelp,
      ).length,
    [filteredItems],
  );

  const progressStory = useMemo(() => {
    if (filteredItems.length === 0) {
      return {
        title: "Your recovery story will build as new check-ins come in.",
        body: "Use this screen to notice current direction first, then review the daily detail underneath.",
      };
    }

    const warningCount = trendItems.filter((item) => item.variant === "warning" || item.variant === "danger").length;
    const improvingCount = trendItems.filter((item) => item.variant === "success").length;

    if (warningCount > 0) {
      return {
        title: "A few recovery signals need a closer look.",
        body: "Start with the trend cards below, then review recent check-ins to understand what changed.",
      };
    }

    if (improvingCount >= 2) {
      return {
        title: "Recovery looks steady across this window.",
        body: "You have enough recent data to see a clearer direction in pain, mood, and adherence.",
      };
    }

    return {
      title: "Recent recovery signals look broadly stable.",
      body: "Use the trend summary for the headline view, then dip into the daily history for supporting detail.",
    };
  }, [filteredItems.length, trendItems]);

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
      <HeroHeader
        title="Progress"
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
          <StatusPill label={`Range ${rangeDays}d`} variant="neutral" />
          <StatusPill
            label={source === "cache" ? "Saved view" : source === "live" ? "Live trends" : "No data yet"}
            variant={source === "cache" ? "warning" : source === "live" ? "success" : "neutral"}
          />
          {filteredItems.length > 0 ? (
            <StatusPill
              label={`${filteredItems.length} check-in${filteredItems.length === 1 ? "" : "s"}`}
              variant="info"
            />
          ) : null}
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
          <View style={styles.storyCardCopy}>
            <Text style={styles.storyEyebrow}>Current direction</Text>
            <Text style={styles.storyTitle}>{progressStory.title}</Text>
            <Text style={styles.storyText}>{progressStory.body}</Text>
          </View>
          <View style={styles.storyFacts}>
            <View style={styles.storyFact}>
              <Text style={styles.storyFactLabel}>Latest check-in</Text>
              <Text style={styles.storyFactValue}>
                {latestCheckin ? formatDateTitle(latestCheckin) : "Not logged yet"}
              </Text>
            </View>
            <View style={styles.storyFact}>
              <Text style={styles.storyFactLabel}>Entries in view</Text>
              <Text style={styles.storyFactValue}>{filteredItems.length || "0"}</Text>
            </View>
            <View style={styles.storyFact}>
              <Text style={styles.storyFactLabel}>Support requests</Text>
              <Text style={styles.storyFactValue}>
                {supportRequestsInRange > 0 ? `${supportRequestsInRange} flagged` : "None in range"}
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
        subtitle="Short windows highlight recent change. Longer windows show steadier recovery patterns."
        card
      >
        <SegmentedControl
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
      </Section>

      <Section
        title="Current signals"
        subtitle="Start here for the clearest recent recovery measures in this window."
        card
      >
        {isLoading && items.length === 0 ? (
          <View style={styles.kpiGrid}>
            {[0, 1, 2, 3].map((key) => (
              <SkeletonBlock key={key} height={110} style={styles.kpiTileSkeleton} />
            ))}
          </View>
        ) : (
          <View style={styles.kpiGrid}>
            {kpiItems.map((kpi) => {
              const mappedTone =
                kpi.variant === "success"
                  ? "success"
                  : kpi.variant === "warning" || kpi.variant === "danger"
                    ? "warning"
                    : kpi.variant === "info"
                      ? "accent"
                      : "muted";

              const mappedIcon =
                kpi.key === "pain" || kpi.key === "mood"
                  ? "checkin"
                  : kpi.key === "adherence"
                    ? "exercise"
                    : kpi.key === "medication"
                      ? "meds"
                      : kpi.key === "sleep"
                        ? "sleep"
                        : kpi.key === "hydration"
                          ? "hydration"
                          : "progress";

              const mappedMicro =
                kpi.key === "pain"
                  ? painSeries.length >= 2
                    ? { type: "sparkline" as const, values: painSeries, tone: "warning" as const }
                    : { type: "dots" as const, values: MICRO_FALLBACK_SERIES }
                  : kpi.key === "mood"
                    ? moodSeries.length >= 2
                      ? { type: "sparkline" as const, values: moodSeries, tone: "success" as const }
                      : { type: "dots" as const, values: MICRO_FALLBACK_SERIES }
                    : kpi.key === "adherence"
                      ? adherenceSeries.length >= 2
                        ? { type: "bars" as const, values: adherenceSeries }
                        : { type: "dots" as const, values: MICRO_FALLBACK_SERIES }
                      : kpi.key === "medication"
                        ? medsSeries.length >= 2
                          ? {
                              type: "ring" as const,
                              progress: clamp01((medicationPct ?? 0) / 100),
                            }
                          : { type: "dots" as const, values: MICRO_FALLBACK_SERIES }
                        : kpi.key === "sleep"
                          ? sleepSeries.length >= 2
                            ? { type: "sparkline" as const, values: sleepSeries, tone: "muted" as const }
                            : { type: "dots" as const, values: MICRO_FALLBACK_SERIES }
                          : hydrationSeries.length >= 2
                            ? { type: "bars" as const, values: hydrationSeries }
                            : { type: "dots" as const, values: MICRO_FALLBACK_SERIES };

              const deltaLabel = kpi.helper
                ? `${kpi.assessment} · ${kpi.helper}`
                : `${kpi.assessment} · Last ${rangeDays}d`;

              return (
                <View key={kpi.key} style={styles.kpiTileWrap}>
                  <TrackerTile
                    icon={mappedIcon}
                    label={kpi.title}
                    value={kpi.value}
                    delta={deltaLabel}
                    tone={mappedTone}
                    micro={mappedMicro}
                  />
                </View>
              );
            })}
          </View>
        )}
      </Section>

      <Section
        title="Trend story"
        subtitle="These summaries help you see what is improving, what is steady, and what may need more attention."
        card
      >
        <View style={styles.trendList}>
          {trendItems.map((trend) => (
            <MediaCard
              key={trend.key}
              variant="compact"
              leading={{
                type: "icon",
                icon: trend.key === "adherence" ? "exercise" : trend.key === "mood" ? "progress" : "checkin",
                tone:
                  trend.variant === "success"
                    ? "success"
                    : trend.variant === "warning" || trend.variant === "danger"
                      ? "warning"
                      : trend.variant === "info"
                        ? "accent"
                        : "muted",
              }}
              title={trendTitle(trend.key)}
              subtitle={`${trendArrow(trend.direction)} ${trend.deltaLabel} · ${trendNarrative(trend, rangeDays)}`}
              chips={[
                { text: `Last ${rangeDays}d`, tone: "muted" },
                {
                  text: `Change ${trend.deltaLabel}`,
                  tone:
                    trend.variant === "success"
                      ? "success"
                      : trend.variant === "warning" || trend.variant === "danger"
                        ? "warning"
                        : trend.variant === "info"
                          ? "info"
                          : "muted",
                },
              ]}
              statusPill={{ text: trend.assessment, tone: trend.variant }}
              showChevron={false}
            />
          ))}
        </View>
      </Section>

      <View style={styles.historyHeader}>
        <Text style={styles.historyEyebrow}>Deeper history</Text>
        <Text accessibilityRole="header" style={styles.historyTitle}>
          Recent check-ins
        </Text>
        <Text style={styles.historySubtitle}>
          Use these daily entries as supporting detail beneath the trend summary above.
        </Text>
      </View>
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
                subtitle={`Pain ${item.pain}/10 · Mood ${item.mood}/5 · Exercises ${exercisePct}${sleepSummary ? ` · Sleep ${sleepSummary}` : ""} · Medication ${medTaken}`}
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
                <SkeletonBlock key={key} height={72} style={styles.historySkeleton} />
              ))}
            </View>
          ) : (
            <EmptyState
              variant="compact"
              illustrationKey={isOffline ? "offline" : "progress"}
              title={isOffline ? "Offline — no saved progress yet" : "No check-ins in this range yet"}
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
      gap: tokens.spacing.md,
      backgroundColor: tokens.colors.surface,
    },
    storyCardCopy: {
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
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    storyFacts: {
      gap: tokens.spacing.sm,
    },
    storyFact: {
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
    kpiGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    kpiTileWrap: {
      width: "48%",
      flexGrow: 1,
    },
    kpiTileSkeleton: {
      width: "48%",
      flexGrow: 1,
      minHeight: 110,
      borderRadius: tokens.radius.md,
    },
    trendList: {
      gap: tokens.spacing.sm,
    },
    historyHeader: {
      gap: tokens.spacing.xs,
      marginTop: tokens.spacing.xs,
      marginBottom: tokens.spacing.xs,
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
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    listContent: {
      gap: tokens.spacing.md,
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
