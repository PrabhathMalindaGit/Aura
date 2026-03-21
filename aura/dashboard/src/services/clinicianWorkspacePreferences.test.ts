/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearClinicianProfileForTests,
  getClinicianProfile,
  getClinicianProfileStorageKey,
  setClinicianProfile,
} from './clinicianProfile';
import {
  formatWorkingHoursSummary,
  getClinicianWorkspacePreferences,
  getPreferredDashboardLandingPath,
} from './clinicianWorkspacePreferences';

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildToken(input: { sub: string; name?: string; exp?: number }): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: input.sub,
      name: input.name,
      exp: input.exp ?? Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  );

  return `${header}.${payload}.signature`;
}

function signInAs(input: { sub: string; name?: string }): void {
  window.localStorage.setItem('aura_access_token', buildToken(input));
}

describe('clinicianWorkspacePreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
    signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });
  });

  it('returns normalized defaults from the clinician profile store', () => {
    const preferences = getClinicianWorkspacePreferences();

    expect(preferences.availabilityStatus).toBe('available');
    expect(preferences.defaultLandingRoute).toBe('/dashboard');
    expect(preferences.defaultPatientsPreset).toBe('');
    expect(preferences.defaultCommunicationFilter).toBe('all');
    expect(preferences.resolvedTimezone.length).toBeGreaterThan(0);
  });

  it('falls back safely when the saved timezone and landing route are invalid', () => {
    const profile = getClinicianProfile();
    setClinicianProfile({
      ...profile,
      workspacePreferences: {
        ...profile.workspacePreferences,
        timezone: 'Not/A_Real_Timezone',
        defaultLandingRoute: '/dashboard',
      },
    });
    window.localStorage.setItem(
      getClinicianProfileStorageKey('auth-clinician-1'),
      JSON.stringify({
        version: 2,
        authScopeId: 'auth-clinician-1',
        updatedAt: new Date().toISOString(),
        profile: {
          ...getClinicianProfile(),
          workspacePreferences: {
            ...getClinicianProfile().workspacePreferences,
            timezone: 'Not/A_Real_Timezone',
            defaultLandingRoute: '/not-valid',
          },
        },
      }),
    );

    const preferences = getClinicianWorkspacePreferences();

    expect(preferences.resolvedTimezone).not.toBe('Not/A_Real_Timezone');
    expect(getPreferredDashboardLandingPath()).toBe('/dashboard');
  });

  it('formats compact working-hours summaries', () => {
    expect(
      formatWorkingHoursSummary({
        enabledDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        startTime: '09:00',
        endTime: '17:00',
      }),
    ).toBe('Mon-Fri · 9:00 AM-5:00 PM');
  });
});
