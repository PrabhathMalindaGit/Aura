/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import { CLINICIAN_ID_STORAGE_KEY, CLINICIAN_NAME_STORAGE_KEY } from '../utils/storageKeys';
import {
  MAX_CLINICIAN_PROFILE_PHOTO_BYTES,
  clearClinicianProfileForTests,
  getClinicianProfile,
  getClinicianProfileStorageKey,
  setClinicianProfile,
  type ClinicianProfile,
} from './clinicianProfile';

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

function setActiveToken(input: { sub: string; name?: string }): void {
  window.localStorage.setItem('aura_access_token', buildToken(input));
}

describe('clinicianProfile', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
  });

  it('seeds once from authenticated identity and stores by auth scope', () => {
    setActiveToken({ sub: 'auth-clinician-1', name: 'Dr Rivera' });
    window.localStorage.setItem(CLINICIAN_ID_STORAGE_KEY, 'legacy-clinician');
    window.localStorage.setItem(CLINICIAN_NAME_STORAGE_KEY, 'Legacy Name');

    const profile = getClinicianProfile();

    expect(profile.displayName).toBe('Dr Rivera');
    expect(profile.clinicianId).toBe('auth-clinician-1');
    expect(window.localStorage.getItem(getClinicianProfileStorageKey('auth-clinician-1'))).toContain(
      '"authScopeId":"auth-clinician-1"',
    );
    expect(window.localStorage.getItem(CLINICIAN_ID_STORAGE_KEY)).toBe('auth-clinician-1');
    expect(window.localStorage.getItem(CLINICIAN_NAME_STORAGE_KEY)).toBe('Dr Rivera');
  });

  it('loads an existing scoped profile instead of reseeding on later reads', () => {
    setActiveToken({ sub: 'auth-clinician-2', name: 'Dr Hall' });

    const first = getClinicianProfile();
    const saved = setClinicianProfile({
      ...first,
      displayName: 'Dr Elena Hall',
      clinicianId: 'local-hall',
      roleTitle: 'Lead rehab clinician',
    });

    window.localStorage.setItem(CLINICIAN_NAME_STORAGE_KEY, 'Different Legacy Value');

    const restored = getClinicianProfile();

    expect(saved.saved).toBe(true);
    expect(restored.displayName).toBe('Dr Elena Hall');
    expect(restored.clinicianId).toBe('local-hall');
    expect(restored.roleTitle).toBe('Lead rehab clinician');
  });

  it('keeps scoped profiles separate across authenticated clinicians', () => {
    setActiveToken({ sub: 'auth-a', name: 'Clinician A' });

    const first = getClinicianProfile();
    setClinicianProfile({
      ...first,
      displayName: 'Clinician A Saved',
      clinicianId: 'clinician-a-local',
    });

    setActiveToken({ sub: 'auth-b', name: 'Clinician B' });

    const second = getClinicianProfile();
    expect(second.displayName).toBe('Clinician B');
    expect(second.clinicianId).toBe('auth-b');

    setActiveToken({ sub: 'auth-a', name: 'Clinician A' });

    const restoredFirst = getClinicianProfile();
    expect(restoredFirst.displayName).toBe('Clinician A Saved');
    expect(restoredFirst.clinicianId).toBe('clinician-a-local');
  });

  it('falls back safely when scoped storage is malformed', () => {
    setActiveToken({ sub: 'auth-clinician-3', name: 'Dr Chen' });
    window.localStorage.setItem(getClinicianProfileStorageKey('auth-clinician-3'), '{bad-json');

    const profile = getClinicianProfile();

    expect(profile.displayName).toBe('Dr Chen');
    expect(profile.clinicianId).toBe('auth-clinician-3');
  });

  it('rejects invalid photo payloads during save normalization', () => {
    setActiveToken({ sub: 'auth-clinician-4', name: 'Dr Lopez' });
    const initial = getClinicianProfile();

    const result = setClinicianProfile({
      ...initial,
      photo: {
        dataUrl: 'data:image/png;base64,abc',
        mimeType: 'image/png',
        fileName: 'too-large.png',
        sizeBytes: MAX_CLINICIAN_PROFILE_PHOTO_BYTES + 1,
      },
    });

    expect(result.saved).toBe(true);
    expect(result.profile.photo).toBeNull();
  });

  it('does not save when there is no active authenticated scope', () => {
    const profile: ClinicianProfile = {
      displayName: 'Clinician Offline',
      clinicianId: 'offline-clinician',
      roleTitle: 'Rehab clinician',
      specialty: 'Recovery follow-up',
      bio: '',
      preferredPronouns: undefined,
      contactNote: '',
      photo: null,
    };

    const result = setClinicianProfile(profile);

    expect(result.saved).toBe(false);
    expect(window.localStorage.getItem(getClinicianProfileStorageKey('offline-clinician'))).toBeNull();
  });
});
