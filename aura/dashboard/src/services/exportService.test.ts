import { describe, expect, it } from 'vitest';
import type { AlertItem, TrendPointNormalized } from '../types/models';
import {
  buildPatientTrendExportColumns,
  buildPatientTrendExportRows,
} from './exportService';

const baseAlert: AlertItem = {
  _id: 'alt-1',
  patientId: 'patient-1',
  risk: 'high',
  reason: 'Escalation',
  source: { type: 'checkin', sourceId: 'check-1' },
  status: 'open',
  createdAt: '2026-02-21T10:00:00.000Z',
  updatedAt: '2026-02-21T10:00:00.000Z',
};

const points: TrendPointNormalized[] = [
  {
    date: '2026-02-21',
    pain: 8,
    mood: 4,
    exercises: 0.5,
    medication: true,
    notes: 'Patient reported pain spike.',
  },
];

describe('exportService patient trend columns', () => {
  it('include notes toggle changes columns', () => {
    const withoutNotes = buildPatientTrendExportColumns({
      includeNotes: false,
      includeAdvancedAlertFields: false,
    });
    const withNotes = buildPatientTrendExportColumns({
      includeNotes: true,
      includeAdvancedAlertFields: false,
    });

    expect(withoutNotes.map((column) => column.key)).not.toContain('notes');
    expect(withNotes.map((column) => column.key)).toContain('notes');
  });

  it('derives hadAlert and alertCount values from alerts by day', () => {
    const rows = buildPatientTrendExportRows(points, [baseAlert], {
      includeNotes: false,
      includeAdvancedAlertFields: false,
    });

    expect(rows[0]?.hadAlert).toBe('true');
    expect(rows[0]?.alertCount).toBe(1);
  });
});
