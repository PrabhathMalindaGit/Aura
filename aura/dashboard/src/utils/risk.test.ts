import { describe, expect, it } from 'vitest';
import type { AlertItem } from '../types/models';
import { formatRiskLabel, hasRiskOverride, isOverrideReasonRequired, riskBadgeVariant } from './risk';

const baseAlert: AlertItem = {
  _id: 'alt-risk-1',
  patientId: 'patient-risk-1',
  risk: 'medium',
  reason: 'Escalating pain',
  source: { type: 'checkin', sourceId: 'checkin-1' },
  status: 'open',
  createdAt: '2026-02-20T10:00:00.000Z',
  updatedAt: '2026-02-20T10:00:00.000Z',
  riskAuto: 'medium',
};

describe('risk helpers', () => {
  it('requires reason only when final differs from auto', () => {
    expect(isOverrideReasonRequired('medium', 'medium')).toBe(false);
    expect(isOverrideReasonRequired('medium', 'high')).toBe(true);
  });

  it('detects override presence only when risk changed', () => {
    expect(hasRiskOverride({ ...baseAlert, riskFinal: 'medium' })).toBe(false);
    expect(hasRiskOverride({ ...baseAlert, riskFinal: 'high' })).toBe(true);
  });

  it('formats risk labels and badge variants', () => {
    expect(formatRiskLabel('low')).toBe('Low');
    expect(formatRiskLabel('custom')).toBe('Custom');
    expect(riskBadgeVariant('high')).toBe('danger');
    expect(riskBadgeVariant('medium')).toBe('warning');
    expect(riskBadgeVariant('low')).toBe('success');
  });
});
