/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  getClinicianIdentity,
  clearClinicianIdentityForTests,
  getClinicianId,
  getClinicianInitials,
  getClinicianName,
  getClinicianSecondaryLine,
  setClinicianId,
  setClinicianIdentity,
  setClinicianName,
} from './clinicianIdentity';
import { clearClinicianProfileForTests, getClinicianProfile, setClinicianProfile } from './clinicianProfile';

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

beforeEach(() => {
  window.localStorage.clear();
  clearClinicianIdentityForTests();
  clearClinicianProfileForTests();
});

describe('clinicianIdentity', () => {
  it('returns defaults when values are missing', () => {
    expect(getClinicianId()).toBe('clinician-1');
    expect(getClinicianName()).toBe('Clinician');
    expect(getClinicianSecondaryLine()).toBe('Rehab clinician · Recovery follow-up');
  });

  it('sets and reads clinician identity values', () => {
    setClinicianIdentity('clinician-22', 'Dr Rivera');

    expect(getClinicianId()).toBe('clinician-22');
    expect(getClinicianName()).toBe('Dr Rivera');
  });

  it('supports individual setters', () => {
    setClinicianId('clinician-11');
    setClinicianName('Dr Grey');

    expect(getClinicianId()).toBe('clinician-11');
    expect(getClinicianName()).toBe('Dr Grey');
  });

  it('falls back to defaults when empty values are saved', () => {
    setClinicianIdentity('', '');

    expect(getClinicianId()).toBe('clinician-1');
    expect(getClinicianName()).toBe('Clinician');
  });

  it('builds the shared fallback model from saved profile fields first', () => {
    signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });
    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: 'Dr Elena Hall',
      clinicianId: 'elena-hall-local',
      roleTitle: 'Lead rehab clinician',
      specialty: 'Post-op recovery',
      preferredPronouns: 'she/her',
      contactNote: 'Local handoff note.',
    });

    const identity = getClinicianIdentity();

    expect(identity.displayName).toBe('Dr Elena Hall');
    expect(identity.clinicianId).toBe('elena-hall-local');
    expect(identity.secondaryLine).toBe('Lead rehab clinician · Post-op recovery');
    expect(identity.initials).toBe('DE');
    expect(identity.preferredPronouns).toBe('she/her');
    expect(identity.contactNote).toBe('Local handoff note.');
  });

  it('falls back to auth name before legacy saved display name', () => {
    signInAs({ sub: 'auth-clinician-2', name: 'Dr Auth' });
    setClinicianName('Legacy Saved Name');

    expect(getClinicianName()).toBe('Dr Auth');
  });

  it('uses clinician ID initials and finally CL when name data is unavailable', () => {
    expect(getClinicianInitials('', 'clinician-22')).toBe('C2');
    expect(getClinicianInitials('', '')).toBe('CL');
  });
});
