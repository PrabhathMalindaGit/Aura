import { describe, expect, it } from 'vitest';
import type { PatientSummary } from '../types/models';
import { applyPatientFilters, defaultPatientFilters, isMissedCheckin, sortPatients } from './patientFilters';

const NOW_MS = Date.parse('2026-02-20T10:00:00.000Z');

const patients: PatientSummary[] = [
  {
    id: 'patient-a',
    displayName: 'Taylor Moss',
    status: 'active',
    lastCheckinAt: '2026-02-20T09:00:00.000Z',
    openAlertCount: 1,
    lastPain: 3,
  },
  {
    id: 'patient-b',
    displayName: 'Jordan Lee',
    status: 'on_hold',
    lastCheckinAt: '2026-02-18T08:00:00.000Z',
    openAlertCount: 4,
    lastPain: 6,
  },
  {
    id: 'patient-c',
    displayName: 'Alex Kent',
    status: 'inactive',
    lastCheckinAt: '2026-02-10T10:00:00.000Z',
    openAlertCount: 0,
  },
];

describe('patientFilters utilities', () => {
  it('filters by search text and status', () => {
    const filters = {
      ...defaultPatientFilters(),
      search: 'taylor',
      status: 'active' as const,
    };

    const result = applyPatientFilters(patients, filters, NOW_MS);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('patient-a');
  });

  it('sorts by open alerts descending', () => {
    const sorted = sortPatients(patients, 'alerts-desc');

    expect(sorted.map((patient) => patient.id)).toEqual(['patient-b', 'patient-a', 'patient-c']);
  });

  it('sorts by most recent check-in first', () => {
    const sorted = sortPatients(patients, 'last-checkin-desc');

    expect(sorted.map((patient) => patient.id)).toEqual(['patient-a', 'patient-b', 'patient-c']);
  });

  it('marks missed check-ins older than 2 days', () => {
    expect(isMissedCheckin(patients[0], NOW_MS)).toBe(false);
    expect(isMissedCheckin(patients[2], NOW_MS)).toBe(true);
  });
});
