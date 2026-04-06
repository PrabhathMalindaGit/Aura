import { beforeEach, describe, expect, it } from 'vitest';

import {
  CLINICIAN_ID_STORAGE_KEY,
  CLINICIAN_NAME_STORAGE_KEY,
  CLINICIAN_PROFILE_STORAGE_PREFIX,
  ASSIGNMENTS_STORAGE_KEY,
  PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY,
  RISK_OVERRIDES_STORAGE_KEY,
  SEEN_ALERTS_STORAGE_PREFIX,
  clearDashboardSessionData,
} from './storageKeys';

describe('clearDashboardSessionData', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('removes all known token variants including clinicianToken from local and session storage', () => {
    const sharedKeys = [
      'aura_access_token',
      'aura_auth_token',
      'aura_refresh_token',
      'clinicianToken',
      ASSIGNMENTS_STORAGE_KEY,
      RISK_OVERRIDES_STORAGE_KEY,
      CLINICIAN_ID_STORAGE_KEY,
      CLINICIAN_NAME_STORAGE_KEY,
      `${SEEN_ALERTS_STORAGE_PREFIX}:clinician-1`,
    ];

    for (const key of sharedKeys) {
      window.localStorage.setItem(key, 'value-local');
      window.sessionStorage.setItem(key, 'value-session');
    }

    window.localStorage.setItem('preserve_local', 'keep');
    window.sessionStorage.setItem('preserve_session', 'keep');
    window.localStorage.setItem(`${CLINICIAN_PROFILE_STORAGE_PREFIX}:clinician-auth-1`, 'profile-local');
    window.sessionStorage.setItem(`${CLINICIAN_PROFILE_STORAGE_PREFIX}:clinician-auth-1`, 'profile-session');
    window.localStorage.setItem(PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY, 'handoff-local');
    window.sessionStorage.setItem(PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY, 'handoff-session');

    const cleared = clearDashboardSessionData();

    for (const key of sharedKeys) {
      expect(window.localStorage.getItem(key)).toBeNull();
      expect(window.sessionStorage.getItem(key)).toBeNull();
    }

    expect(window.localStorage.getItem('preserve_local')).toBe('keep');
    expect(window.sessionStorage.getItem('preserve_session')).toBe('keep');
    expect(window.localStorage.getItem(`${CLINICIAN_PROFILE_STORAGE_PREFIX}:clinician-auth-1`)).toBe(
      'profile-local',
    );
    expect(window.sessionStorage.getItem(`${CLINICIAN_PROFILE_STORAGE_PREFIX}:clinician-auth-1`)).toBe(
      'profile-session',
    );
    expect(window.localStorage.getItem(PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY)).toBeNull();

    expect(cleared.local).toContain('clinicianToken');
    expect(cleared.session).toContain('clinicianToken');
    expect(cleared.local).toContain(PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY);
    expect(cleared.session).toContain(PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY);
  });
});
