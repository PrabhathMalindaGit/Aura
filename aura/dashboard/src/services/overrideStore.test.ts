/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AlertItem } from '../types/models';
import {
  applyRiskOverrideToAlert,
  clearRiskOverride,
  clearRiskOverrideStoreForTests,
  getRiskOverride,
  getRiskOverrideMap,
  getRiskOverrideStorageKey,
  pruneRiskOverrideMap,
  setRiskOverride,
} from './overrideStore';

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const baseAlert: AlertItem = {
  _id: 'alt-override-1',
  patientId: 'patient-override-1',
  risk: 'high',
  reason: 'Escalating pain',
  source: { type: 'checkin', sourceId: 'checkin-1' },
  status: 'open',
  createdAt: '2026-02-20T10:00:00.000Z',
  updatedAt: '2026-02-20T10:00:00.000Z',
  riskAuto: 'high',
};

beforeEach(() => {
  window.localStorage.clear();
  clearRiskOverrideStoreForTests();
});

describe('overrideStore', () => {
  it('writes and reads overrides safely', () => {
    setRiskOverride('alt-override-1', {
      riskAuto: 'high',
      riskFinal: 'medium',
      overrideReason: 'Symptoms stabilized after review.',
      overriddenAtISO: '2026-02-20T11:00:00.000Z',
      overriddenBy: 'clinician-2',
      overriddenByName: 'Dr Lane',
    });

    const override = getRiskOverride('alt-override-1');
    expect(override?.riskFinal).toBe('medium');
    expect(override?.overriddenByName).toBe('Dr Lane');

    const merged = applyRiskOverrideToAlert(baseAlert, getRiskOverrideMap());
    expect(merged.riskFinal).toBe('medium');
    expect(merged.overrideReason).toBe('Symptoms stabilized after review.');
    expect(merged.overriddenBy).toBe('clinician-2');
  });

  it('removes an override entry', () => {
    setRiskOverride('alt-override-2', {
      riskAuto: 'low',
      riskFinal: 'high',
      overrideReason: 'Sudden deterioration reported.',
      overriddenAtISO: '2026-02-20T11:00:00.000Z',
      overriddenBy: 'clinician-3',
      overriddenByName: 'Dr Grey',
    });

    clearRiskOverride('alt-override-2');
    expect(getRiskOverride('alt-override-2')).toBeUndefined();
  });

  it('prunes stale entries and keeps at most 2000', () => {
    const seed: Record<string, unknown> = {
      stale: {
        riskAuto: 'high',
        riskFinal: 'low',
        overrideReason: 'Stale record',
        overriddenAtISO: daysAgoIso(220),
        overriddenBy: 'clinician-stale',
      },
    };

    for (let index = 0; index < 2020; index += 1) {
      seed[`recent-${index}`] = {
        riskAuto: 'high',
        riskFinal: 'medium',
        overrideReason: `Recent ${index}`,
        overriddenAtISO: daysAgoIso(index % 60),
        overriddenBy: `clinician-${index}`,
      };
    }

    window.localStorage.setItem(getRiskOverrideStorageKey(), JSON.stringify(seed));
    const pruned = pruneRiskOverrideMap();

    expect(pruned.stale).toBeUndefined();
    expect(Object.keys(pruned)).toHaveLength(2000);
  });

  it('handles malformed storage safely', () => {
    window.localStorage.setItem(getRiskOverrideStorageKey(), '{bad-json');
    expect(getRiskOverrideMap()).toEqual({});
  });
});
