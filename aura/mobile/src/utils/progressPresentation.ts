import type { CheckInItem } from "@/src/api/patient";
import type { StatusPillVariant } from "@/src/components/StatusPill";
import { parseCheckinTime } from "@/src/utils/progressStats";

export type ProgressMetricKey = "pain" | "mood" | "adherence" | "hydration" | "sleep";
export type ProgressAssessment = "Improving" | "Stable" | "Worsening" | "No data yet";

export type ProgressStoryTrend = {
  key: "pain" | "mood" | "adherence";
  title: string;
  assessment: ProgressAssessment;
  deltaValue: number | null;
  direction: "up" | "down" | "flat";
  hasData: boolean;
};

export type ProgressStoryCopy = {
  title: string;
  body: string;
};

export type ProgressHistoryRow =
  | {
      type: "header";
      key: string;
      label: string;
    }
  | {
      type: "item";
      key: string;
      item: CheckInItem;
    };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const VALUE_THRESHOLDS = {
  pain: { good: 3, okay: 5, preferHigh: false },
  mood: { good: 4, okay: 3, preferHigh: true },
  adherence: { good: 80, okay: 60, preferHigh: true },
  hydration: { good: 1800, okay: 1400, preferHigh: true },
  sleep: { good: 7, okay: 6, preferHigh: true },
} as const;

const TREND_THRESHOLDS = {
  pain: { threshold: 0.3, betterWhen: "lower" as const },
  mood: { threshold: 0.2, betterWhen: "higher" as const },
  adherence: { threshold: 5, betterWhen: "higher" as const, unit: "%" },
} as const;

export function assessProgressValue(
  key: ProgressMetricKey,
  value: number | null,
): { label: ProgressAssessment; variant: StatusPillVariant } {
  if (value === null || !Number.isFinite(value)) {
    return { label: "No data yet", variant: "neutral" };
  }

  const thresholds = VALUE_THRESHOLDS[key];
  if (thresholds.preferHigh) {
    if (value >= thresholds.good) {
      return { label: "Improving", variant: "success" };
    }
    if (value >= thresholds.okay) {
      return { label: "Stable", variant: "info" };
    }
    return { label: "Worsening", variant: "warning" };
  }

  if (value <= thresholds.good) {
    return { label: "Improving", variant: "success" };
  }
  if (value <= thresholds.okay) {
    return { label: "Stable", variant: "info" };
  }
  return { label: "Worsening", variant: "warning" };
}

export function evaluateProgressTrend(input: {
  key: ProgressStoryTrend["key"];
  previous: number | null;
  recent: number | null;
}): Omit<ProgressStoryTrend, "title"> & {
  deltaLabel: string;
  variant: StatusPillVariant;
} {
  const thresholds = TREND_THRESHOLDS[input.key];

  if (
    input.previous === null ||
    input.recent === null ||
    !Number.isFinite(input.previous) ||
    !Number.isFinite(input.recent)
  ) {
    return {
      key: input.key,
      deltaLabel: "Building",
      deltaValue: null,
      assessment: "No data yet",
      direction: "flat",
      variant: "neutral",
      hasData: false,
    };
  }

  const delta = input.recent - input.previous;
  const absDelta = Math.abs(delta);
  const unit = "unit" in thresholds ? thresholds.unit : "";
  const rounded = Number(delta.toFixed(unit === "%" ? 0 : 1));
  const sign = rounded > 0 ? "+" : "";
  const deltaLabel = `${sign}${rounded}${unit}`;

  if (absDelta <= thresholds.threshold) {
    return {
      key: input.key,
      deltaLabel,
      deltaValue: rounded,
      assessment: "Stable",
      direction: "flat",
      variant: "info",
      hasData: true,
    };
  }

  const improving = thresholds.betterWhen === "higher" ? delta > 0 : delta < 0;
  return {
    key: input.key,
    deltaLabel,
    deltaValue: rounded,
    assessment: improving ? "Improving" : "Worsening",
    direction:
      improving
        ? thresholds.betterWhen === "higher"
          ? "up"
          : "down"
        : thresholds.betterWhen === "higher"
          ? "down"
          : "up",
    variant: improving ? "success" : "warning",
    hasData: true,
  };
}

export function getProgressHistoryStatus(
  item: CheckInItem,
): { text: string; tone: "info" | "success" | "warning" | "danger" } | undefined {
  if (item.support?.needsUrgentHelp || item.support?.feelsSafe === false) {
    return { text: "Safety check", tone: "danger" };
  }

  if (item.support?.wantsFollowUp || item.support?.wantsExtraSupport) {
    return { text: "Support requested", tone: "warning" };
  }

  const painAssessment = assessProgressValue("pain", item.pain);
  if (painAssessment.label === "Worsening") {
    return { text: "High pain day", tone: "warning" };
  }

  if (item.notes?.trim()) {
    return { text: "Note added", tone: "info" };
  }

  return undefined;
}

function formatMagnitude(value: number, key: ProgressStoryTrend["key"]): string {
  if (key === "adherence") {
    return `${Math.abs(Math.round(value))}%`;
  }

  const rounded = Math.abs(Number(value.toFixed(1)));
  const suffix = rounded === 1 ? "point" : "points";
  return `${rounded} ${suffix}`;
}

function metricVerb(
  key: ProgressStoryTrend["key"],
  assessment: ProgressStoryTrend["assessment"],
): string {
  if (assessment === "Improving") {
    return "improved";
  }

  if (assessment === "Worsening") {
    return key === "pain" ? "increased" : "dropped";
  }

  if (key === "pain") {
    return "increased";
  }

  return "decreased";
}

export function describeTrendChange(
  trend: ProgressStoryTrend,
  rangeDays: number,
): string {
  if (!trend.hasData || trend.deltaValue === null) {
    return `${trend.title} is still building a clear story over ${rangeDays} days`;
  }

  if (trend.assessment === "Stable" || trend.direction === "flat") {
    return `${trend.title} stayed within your recent range over ${rangeDays} days`;
  }

  return `${trend.title} ${metricVerb(trend.key, trend.assessment)} ${formatMagnitude(
    trend.deltaValue,
    trend.key,
  )} over ${rangeDays} days`;
}

export function buildProgressStoryCopy(
  trends: ProgressStoryTrend[],
  rangeDays: number,
  itemCount: number,
): ProgressStoryCopy {
  if (itemCount === 0) {
    return {
      title: "Your recovery story will build as new check-ins come in.",
      body: "Complete a few check-ins to see your trends, recent signals, and history in one place.",
    };
  }

  const withData = trends.filter((trend) => trend.hasData && trend.deltaValue !== null);
  const primaryTrend =
    withData.find((trend) => trend.assessment === "Improving") ??
    withData.find((trend) => trend.assessment === "Worsening") ??
    withData[0] ??
    trends[0];

  return {
    title: describeTrendChange(primaryTrend, rangeDays),
    body: `${itemCount} check-in${itemCount === 1 ? "" : "s"} in view. Review the signal summary and history below for supporting detail.`,
  };
}

function startOfIsoWeek(date: Date): Date {
  const safe = new Date(date);
  safe.setHours(0, 0, 0, 0);
  const day = safe.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  safe.setDate(safe.getDate() + diff);
  return safe;
}

function isSameWeek(a: Date, b: Date): boolean {
  return startOfIsoWeek(a).getTime() === startOfIsoWeek(b).getTime();
}

export function formatProgressWeekLabel(start: Date, now = new Date()): string {
  const currentWeek = startOfIsoWeek(now);
  const previousWeek = new Date(currentWeek.getTime() - WEEK_MS);

  if (isSameWeek(start, currentWeek)) {
    return "This week";
  }

  if (isSameWeek(start, previousWeek)) {
    return "Last week";
  }

  return `Week of ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(start)}`;
}

export function buildProgressHistoryRows(
  items: CheckInItem[],
  now = new Date(),
): ProgressHistoryRow[] {
  const rows: ProgressHistoryRow[] = [];
  let previousWeekKey: string | null = null;

  for (const item of items) {
    const timestamp = parseCheckinTime(item);
    const hasValidDate = Number.isFinite(timestamp);
    const date = hasValidDate ? new Date(timestamp) : null;
    const weekStart = date ? startOfIsoWeek(date) : null;
    const weekKey = weekStart ? weekStart.toISOString().slice(0, 10) : "unknown";

    if (weekKey !== previousWeekKey) {
      rows.push({
        type: "header",
        key: `header-${weekKey}`,
        label: weekStart ? formatProgressWeekLabel(weekStart, now) : "Earlier entries",
      });
      previousWeekKey = weekKey;
    }

    rows.push({
      type: "item",
      key: item.id,
      item,
    });
  }

  return rows;
}
