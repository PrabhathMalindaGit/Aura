/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyAssignmentToAlert,
  clearAssignmentStoreForTests,
  getAssignment,
  getAssignmentMap,
  getAssignmentStorageKey,
  pruneAssignmentMap,
  removeAssignment,
  setAssignment,
} from './assignmentStore';
import type { AlertItem } from '../types/models';

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const baseAlert: AlertItem = {
  _id: 'alt-1',
  patientId: 'patient-1',
  risk: 'high',
  reason: 'Escalating pain',
  source: { type: 'checkin', sourceId: 'checkin-1' },
  status: 'open',
  createdAt: '2026-02-20T08:00:00.000Z',
  updatedAt: '2026-02-20T08:00:00.000Z',
};

beforeEach(() => {
  window.localStorage.clear();
  clearAssignmentStoreForTests();
});

describe('assignmentStore', () => {
  it('writes and reads assignments safely', () => {
    setAssignment('alt-1', {
      assignedTo: 'clinician-3',
      assignedToName: 'Dr Lane',
      assignedAtISO: '2026-02-20T09:00:00.000Z',
    });

    const assignment = getAssignment('alt-1');
    expect(assignment?.assignedTo).toBe('clinician-3');
    expect(assignment?.assignedToName).toBe('Dr Lane');

    const merged = applyAssignmentToAlert(baseAlert, getAssignmentMap());
    expect(merged.assignedTo).toBe('clinician-3');
    expect(merged.assignedToName).toBe('Dr Lane');
  });

  it('removes assignments', () => {
    setAssignment('alt-2', {
      assignedTo: 'clinician-4',
      assignedToName: 'Dr Sky',
      assignedAtISO: '2026-02-20T09:00:00.000Z',
    });

    removeAssignment('alt-2');
    expect(getAssignment('alt-2')).toBeUndefined();
  });

  it('prunes stale entries and keeps max 2000', () => {
    const seed: Record<string, { assignedTo: string; assignedAtISO: string }> = {
      stale: { assignedTo: 'clinician-stale', assignedAtISO: daysAgoIso(120) },
    };

    for (let index = 0; index < 2010; index += 1) {
      seed[`recent-${index}`] = {
        assignedTo: `clinician-${index}`,
        assignedAtISO: daysAgoIso(index % 30),
      };
    }

    window.localStorage.setItem(getAssignmentStorageKey(), JSON.stringify(seed));

    const pruned = pruneAssignmentMap();
    expect(pruned.stale).toBeUndefined();
    expect(Object.keys(pruned)).toHaveLength(2000);
  });

  it('handles malformed JSON without throwing', () => {
    window.localStorage.setItem(getAssignmentStorageKey(), '{bad-json');
    expect(getAssignmentMap()).toEqual({});
  });
});
