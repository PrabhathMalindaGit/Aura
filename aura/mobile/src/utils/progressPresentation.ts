import type { CheckInItem } from "@/src/api/patient";
import { parseCheckinTime } from "@/src/utils/progressStats";

export type ProgressStoryTrend = {
  key: "pain" | "mood" | "adherence";
  title: string;
  assessment: string;
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
    withData.find((trend) => trend.assessment === "Needs attention") ??
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
