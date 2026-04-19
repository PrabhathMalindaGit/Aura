import { describe, expect, it } from 'vitest';
import {
  buildPatientEntryReturnTo,
  createPatientEntryState,
  readPatientEntryContextFromState,
} from './patientEntryContext';

describe('patientEntryContext', () => {
  it('reads valid route state for the active patient', () => {
    const state = createPatientEntryState({
      patientId: 'patient-42',
      source: 'alerts',
      subtype: 'open',
      hint: 'Pain increase and missed medication',
      focus: 'alerts',
      returnTo: '/alerts?patientId=patient-42',
    });

    expect(readPatientEntryContextFromState(state, 'patient-42')).toEqual({
      patientId: 'patient-42',
      source: 'alerts',
      subtype: 'open',
      hint: 'Pain increase and missed medication',
      focus: 'alerts',
      returnTo: '/alerts?patientId=patient-42',
    });
  });

  it('falls back when the route state patient does not match the current patient', () => {
    const state = createPatientEntryState({
      patientId: 'patient-99',
      source: 'worklist',
      focus: 'workflow',
      returnTo: '/worklist',
    });

    expect(readPatientEntryContextFromState(state, 'patient-42')).toBeNull();
  });

  it('falls back to /patients for unsafe return targets', () => {
    const state = createPatientEntryState({
      patientId: 'patient-42',
      source: 'insights',
      focus: 'insights',
      returnTo: '/dashboard?foo=bar',
    });

    expect(readPatientEntryContextFromState(state, 'patient-42')?.returnTo).toBe('/patients');
  });

  it('preserves dashboard returns as a supported patient-entry path', () => {
    const state = createPatientEntryState({
      patientId: 'patient-42',
      source: 'dashboard',
      focus: 'workflow',
      returnTo: '/dashboard',
    });

    expect(readPatientEntryContextFromState(state, 'patient-42')).toEqual({
      patientId: 'patient-42',
      source: 'dashboard',
      focus: 'workflow',
      returnTo: '/dashboard',
    });
  });

  it('preserves only already-supported safe search on alerts and patients', () => {
    expect(buildPatientEntryReturnTo('/dashboard')).toBe('/dashboard');
    expect(buildPatientEntryReturnTo('/alerts', '?patientId=patient-42')).toBe(
      '/alerts?patientId=patient-42',
    );
    expect(buildPatientEntryReturnTo('/patients', '?search=taylor')).toBe('/patients?search=taylor');
    expect(buildPatientEntryReturnTo('/alerts', '?patientId=patient-42&unknown=1')).toBe('/patients');
    expect(buildPatientEntryReturnTo('/insights', '?search=review')).toBe('/patients');
  });
});
