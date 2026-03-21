import { beforeEach, describe, expect, it } from 'vitest';

import { clearClinicianIdentityForTests, setClinicianIdentity } from './clinicianIdentity';
import {
  clearWorkspaceState,
  getWorkspaceStateStorageKey,
  hasWorkspaceState,
  normalizeWorkspaceSearch,
  readWorkspaceState,
  writeWorkspaceState,
} from './workspaceState';

describe('workspaceState', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearClinicianIdentityForTests();
  });

  it('reads and writes clinician-scoped workspace state safely', () => {
    setClinicianIdentity('clinician-42', 'Clinician Forty Two');

    writeWorkspaceState('insights', { activeView: 'approved' });

    expect(
      window.localStorage.getItem(getWorkspaceStateStorageKey('insights', 'clinician-42')),
    ).toBe(JSON.stringify({ activeView: 'approved' }));

    const restored = readWorkspaceState(
      'insights',
      { activeView: 'pending' },
      (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return { activeView: 'pending' };
        }

        const candidate = value as { activeView?: string };
        return candidate.activeView === 'approved'
          ? { activeView: 'approved' as const }
          : { activeView: 'pending' as const };
      },
    );

    expect(restored).toEqual({ activeView: 'approved' });
  });

  it('falls back safely when stored JSON is invalid', () => {
    window.localStorage.setItem(getWorkspaceStateStorageKey('worklist'), '{bad-json');

    const restored = readWorkspaceState(
      'worklist',
      { sort: 'priority' },
      () => ({ sort: 'updatedAt' }),
    );

    expect(restored).toEqual({ sort: 'priority' });
  });

  it('supports page-owned normalization and stale enum fallback', () => {
    writeWorkspaceState('appointments', {
      requestStatus: 'unknown',
      slotStatus: 'available',
    });

    const restored = readWorkspaceState(
      'appointments',
      { requestStatus: 'pending', slotStatus: 'available' },
      (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return { requestStatus: 'pending', slotStatus: 'available' };
        }

        const candidate = value as { requestStatus?: string; slotStatus?: string };

        return {
          requestStatus:
            candidate.requestStatus === 'approved' ||
            candidate.requestStatus === 'rejected' ||
            candidate.requestStatus === 'canceled'
              ? candidate.requestStatus
              : 'pending',
          slotStatus: candidate.slotStatus === 'closed' ? 'closed' : 'available',
        };
      },
    );

    expect(restored).toEqual({
      requestStatus: 'pending',
      slotStatus: 'available',
    });
  });

  it('normalizes free-text search for persistence', () => {
    expect(normalizeWorkspaceSearch('   ')).toBe('');
    expect(normalizeWorkspaceSearch('  Jordan Lee  ')).toBe('Jordan Lee');
    expect(normalizeWorkspaceSearch('x'.repeat(200))).toHaveLength(120);
  });

  it('clears saved state for a specific page and clinician scope', () => {
    setClinicianIdentity('clinician-7', 'Clinician Seven');
    writeWorkspaceState('patients', { search: 'Taylor' });

    clearWorkspaceState('patients');

    expect(
      window.localStorage.getItem(getWorkspaceStateStorageKey('patients', 'clinician-7')),
    ).toBeNull();
  });

  it('can distinguish between no saved state and a saved workspace entry', () => {
    setClinicianIdentity('clinician-8', 'Clinician Eight');

    expect(hasWorkspaceState('patients')).toBe(false);

    writeWorkspaceState('patients', { search: '' });

    expect(hasWorkspaceState('patients')).toBe(true);
  });
});
