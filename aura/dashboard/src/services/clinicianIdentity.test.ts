/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearClinicianIdentityForTests,
  getClinicianId,
  getClinicianName,
  setClinicianId,
  setClinicianIdentity,
  setClinicianName,
} from './clinicianIdentity';
import { clearClinicianProfileForTests } from './clinicianProfile';

beforeEach(() => {
  window.localStorage.clear();
  clearClinicianIdentityForTests();
  clearClinicianProfileForTests();
});

describe('clinicianIdentity', () => {
  it('returns defaults when values are missing', () => {
    expect(getClinicianId()).toBe('clinician-1');
    expect(getClinicianName()).toBe('Clinician 1');
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
    expect(getClinicianName()).toBe('Clinician 1');
  });
});
