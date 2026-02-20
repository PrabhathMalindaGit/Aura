import { describe, expect, it } from 'vitest';
import type { TrendPointRaw } from '../types/models';
import { buildCalendarDateRange, normalizeTrendPoints } from './trends';

describe('trends normalization', () => {
  it('creates date range with expected length for 14 and 30 day windows', () => {
    const endDate = new Date('2026-02-20T10:00:00.000Z');

    expect(buildCalendarDateRange(14, endDate)).toHaveLength(14);
    expect(buildCalendarDateRange(30, endDate)).toHaveLength(30);
  });

  it('fills missing days with null values', () => {
    const raw: TrendPointRaw[] = [
      { date: '2026-02-18', pain: 8, mood: 4, adherence: { exercises: 0.5, medication: true } },
      { date: '2026-02-20', pain: 6, mood: 6, adherence: { exercises: 0.75, medication: false } },
    ];

    const normalized = normalizeTrendPoints(raw, 14, new Date('2026-02-20T10:00:00.000Z'));
    const missing = normalized.find((point) => point.date === '2026-02-19');

    expect(missing).toEqual(
      expect.objectContaining({
        pain: null,
        mood: null,
        exercises: null,
        medication: null,
      }),
    );
  });

  it('keeps null gaps between known points (no interpolation in data)', () => {
    const raw: TrendPointRaw[] = [
      { date: '2026-02-18', pain: 3 },
      { date: '2026-02-20', pain: 9 },
    ];

    const normalized = normalizeTrendPoints(raw, 14, new Date('2026-02-20T10:00:00.000Z'));
    const painByDate = Object.fromEntries(normalized.map((point) => [point.date, point.pain]));

    expect(painByDate['2026-02-18']).toBe(3);
    expect(painByDate['2026-02-19']).toBeNull();
    expect(painByDate['2026-02-20']).toBe(9);
  });
});
