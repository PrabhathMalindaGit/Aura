export interface DateRangeValue {
  from: string;
  to: string;
}

export type DateRangePresetId = 'last7' | 'last14' | 'last30' | 'thisMonth';

export interface DateRangePreset {
  id: DateRangePresetId;
  label: string;
}

const MS_IN_DAY = 24 * 60 * 60 * 1000;

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last14', label: 'Last 14 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'thisMonth', label: 'This month' },
];

function toUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function toISODate(value: Date | string | number): string {
  const parsed = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;

  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
}

export function createLastDaysRange(days: number, now: Date = new Date()): DateRangeValue {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;
  const to = toUtcDate(now);
  const from = new Date(to.getTime() - (safeDays - 1) * MS_IN_DAY);

  return {
    from: toISODate(from),
    to: toISODate(to),
  };
}

export function createThisMonthRange(now: Date = new Date()): DateRangeValue {
  const todayUtc = toUtcDate(now);
  const from = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 1));

  return {
    from: toISODate(from),
    to: toISODate(todayUtc),
  };
}

export function getPresetDateRange(preset: DateRangePresetId, now: Date = new Date()): DateRangeValue {
  if (preset === 'last14') {
    return createLastDaysRange(14, now);
  }

  if (preset === 'last30') {
    return createLastDaysRange(30, now);
  }

  if (preset === 'thisMonth') {
    return createThisMonthRange(now);
  }

  return createLastDaysRange(7, now);
}

export function validateDateRange(range: DateRangeValue): string | null {
  if (!range.from || !range.to) {
    return 'Select both From and To dates.';
  }

  if (range.from > range.to) {
    return 'From date cannot be after To date.';
  }

  return null;
}

export function isDateInRange(dateValue: string, range: DateRangeValue): boolean {
  const isoDate = toISODate(dateValue);
  if (!isoDate) {
    return false;
  }

  return isoDate >= range.from && isoDate <= range.to;
}

export function clampDateRange(range: DateRangeValue): DateRangeValue {
  if (!range.from || !range.to || range.from <= range.to) {
    return range;
  }

  return {
    from: range.to,
    to: range.to,
  };
}
