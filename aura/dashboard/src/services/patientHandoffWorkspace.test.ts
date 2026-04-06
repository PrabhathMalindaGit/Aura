/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearClinicianProfileForTests,
  getClinicianProfile,
  setClinicianProfile,
} from './clinicianProfile';
import {
  PATIENT_HANDOFF_LIMITS,
  addPatientHandoffNote,
  clearPatientHandoffWorkspaceForTests,
  discardLegacyPatientHandoffRecord,
  getPatientHandoffRecord,
  getPatientHandoffWorkspace,
  getPatientHandoffWorkspaceStorageKey,
  savePatientCurrentHandoff,
  subscribePatientHandoff,
} from './patientHandoffWorkspace';
import { clearDashboardSessionData } from '../utils/storageKeys';

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

describe('patientHandoffWorkspace', () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
    clearPatientHandoffWorkspaceForTests();
  });

  it('stores minimal authored metadata and structured owner states only', () => {
    signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });
    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: 'Dr Elena Hall',
      clinicianId: 'elena-hall-local',
      roleTitle: 'Lead rehab clinician',
      specialty: 'Post-op recovery',
      preferredPronouns: 'she/her',
      bio: 'Detailed browser-local profile text.',
      contactNote: 'Coverage note.',
    });

    savePatientCurrentHandoff('patient-1', {
      summary: 'Check alert burden before the next outreach.',
      nextAction: 'alerts',
      followUpOwner: {
        kind: 'self',
        clinicianId: 'stale-id',
        authorDisplayName: 'Stale Name',
      },
    });
    savePatientCurrentHandoff('patient-2', {
      summary: 'Weekend coverage will pick this up.',
      nextAction: '',
      followUpOwner: {
        kind: 'custom',
        label: 'Weekend coverage desk',
      },
    });
    savePatientCurrentHandoff('patient-3', {
      summary: 'No owner is needed yet.',
      nextAction: '',
      followUpOwner: { kind: 'unassigned' },
    });
    addPatientHandoffNote('patient-1', 'Local note for the next browser review.');

    const patientOne = getPatientHandoffRecord('patient-1');
    const patientTwo = getPatientHandoffRecord('patient-2');
    const patientThree = getPatientHandoffRecord('patient-3');

    expect(patientOne?.currentHandoff?.followUpOwner.kind).toBe('self');
    expect(patientOne?.currentHandoff?.followUpOwner).toMatchObject({
      kind: 'self',
      clinicianId: 'elena-hall-local',
      authorDisplayName: 'Dr Elena Hall',
      authorRoleTitle: 'Lead rehab clinician',
      authorSpecialty: 'Post-op recovery',
    });
    expect(patientTwo?.currentHandoff?.followUpOwner).toEqual({
      kind: 'custom',
      label: 'Weekend coverage desk',
    });
    expect(patientThree?.currentHandoff?.followUpOwner).toEqual({
      kind: 'unassigned',
    });

    const stored = JSON.parse(
      window.localStorage.getItem(getPatientHandoffWorkspaceStorageKey()) ?? '{}',
    ) as Record<string, { currentHandoff?: Record<string, unknown>; notes?: Array<Record<string, unknown>> }>;
    const storedUpdatedBy = stored['patient-1']?.currentHandoff?.updatedBy as Record<string, unknown>;
    const storedOwner = stored['patient-1']?.currentHandoff?.followUpOwner as Record<string, unknown>;
    const storedNoteAuthor = stored['patient-1']?.notes?.[0]?.createdBy as Record<string, unknown>;

    expect(storedUpdatedBy).toEqual({
      clinicianId: 'elena-hall-local',
      authorDisplayName: 'Dr Elena Hall',
      authorRoleTitle: 'Lead rehab clinician',
      authorSpecialty: 'Post-op recovery',
    });
    expect(storedOwner).toEqual({
      kind: 'self',
      clinicianId: 'elena-hall-local',
      authorDisplayName: 'Dr Elena Hall',
      authorRoleTitle: 'Lead rehab clinician',
      authorSpecialty: 'Post-op recovery',
    });
    expect(storedNoteAuthor).toEqual({
      clinicianId: 'elena-hall-local',
      authorDisplayName: 'Dr Elena Hall',
      authorRoleTitle: 'Lead rehab clinician',
      authorSpecialty: 'Post-op recovery',
    });
    expect(storedUpdatedBy).not.toHaveProperty('photo');
    expect(storedUpdatedBy).not.toHaveProperty('preferredPronouns');
    expect(storedUpdatedBy).not.toHaveProperty('bio');
    expect(storedUpdatedBy).not.toHaveProperty('contactNote');
  });

  it('clears only the current handoff when the structured handoff is saved blank and preserves notes', () => {
    signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });

    savePatientCurrentHandoff('patient-42', {
      summary: 'Review alerts before next contact.',
      nextAction: 'alerts',
      followUpOwner: { kind: 'unassigned' },
    });
    addPatientHandoffNote('patient-42', 'Patient sounded calmer after yesterday’s call.');

    const clearedRecord = savePatientCurrentHandoff('patient-42', {
      summary: '   ',
      nextAction: '',
      followUpOwner: { kind: 'unassigned' },
    });

    expect(clearedRecord?.currentHandoff).toBeUndefined();
    expect(clearedRecord?.notes).toHaveLength(1);
    expect(clearedRecord?.notes[0]?.text).toBe('Patient sounded calmer after yesterday’s call.');
  });

  it('keeps saved author labels stable after later clinician profile edits', () => {
    signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });
    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: 'Dr Elena Hall',
      clinicianId: 'elena-hall-local',
      roleTitle: 'Lead rehab clinician',
      specialty: 'Post-op recovery',
    });

    savePatientCurrentHandoff('patient-42', {
      summary: 'Stable for now, but keep alerts in view.',
      nextAction: 'alerts',
      followUpOwner: { kind: 'self', clinicianId: '', authorDisplayName: '' },
    });
    addPatientHandoffNote('patient-42', 'Initial internal note.');

    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: 'Dr Morgan Shaw',
      clinicianId: 'morgan-shaw-local',
      roleTitle: 'Coverage clinician',
      specialty: 'Weekend escalation',
    });

    const record = getPatientHandoffRecord('patient-42');
    expect(record?.currentHandoff?.updatedBy).toMatchObject({
      clinicianId: 'elena-hall-local',
      authorDisplayName: 'Dr Elena Hall',
      authorRoleTitle: 'Lead rehab clinician',
      authorSpecialty: 'Post-op recovery',
    });
    expect(record?.notes[0]?.createdBy).toMatchObject({
      clinicianId: 'elena-hall-local',
      authorDisplayName: 'Dr Elena Hall',
      authorRoleTitle: 'Lead rehab clinician',
      authorSpecialty: 'Post-op recovery',
    });
  });

  it('discards one patient legacy record and keeps other patients intact', () => {
    signInAs({ sub: 'auth-clinician-a', name: 'Clinician A' });

    savePatientCurrentHandoff('patient-42', {
      summary: 'Discard this local artifact only.',
      nextAction: 'appointments',
      followUpOwner: { kind: 'unassigned' },
    });
    addPatientHandoffNote('patient-42', 'Patient 42 local note.');
    savePatientCurrentHandoff('patient-43', {
      summary: 'Keep this second local artifact.',
      nextAction: 'alerts',
      followUpOwner: { kind: 'unassigned' },
    });

    const listener = vi.fn();
    const unsubscribe = subscribePatientHandoff(listener);

    discardLegacyPatientHandoffRecord('patient-42');

    expect(getPatientHandoffRecord('patient-42')).toBeNull();
    expect(getPatientHandoffRecord('patient-43')?.currentHandoff?.summary).toBe(
      'Keep this second local artifact.',
    );
    expect(listener).toHaveBeenCalledTimes(1);

    const stored = JSON.parse(
      window.localStorage.getItem(getPatientHandoffWorkspaceStorageKey()) ?? '{}',
    ) as Record<string, unknown>;
    expect(stored['patient-42']).toBeUndefined();
    expect(stored['patient-43']).toBeDefined();

    unsubscribe();
  });

  it('removes the legacy handoff storage key when the last patient record is discarded', () => {
    signInAs({ sub: 'auth-clinician-a', name: 'Clinician A' });

    savePatientCurrentHandoff('patient-42', {
      summary: 'Discard the final legacy artifact.',
      nextAction: 'appointments',
      followUpOwner: { kind: 'unassigned' },
    });

    expect(window.localStorage.getItem(getPatientHandoffWorkspaceStorageKey())).not.toBeNull();

    discardLegacyPatientHandoffRecord('patient-42');

    expect(window.localStorage.getItem(getPatientHandoffWorkspaceStorageKey())).toBeNull();
    expect(getPatientHandoffWorkspace()).toEqual({});
  });

  it('is cleared on sign-out and later sign-in on the same browser', () => {
    signInAs({ sub: 'auth-clinician-a', name: 'Clinician A' });
    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: 'Clinician A Saved',
      clinicianId: 'clinician-a-local',
      roleTitle: 'Lead rehab clinician',
      specialty: 'Post-op recovery',
    });

    savePatientCurrentHandoff('patient-42', {
      summary: 'Carry this forward on the same browser.',
      nextAction: 'appointments',
      followUpOwner: { kind: 'self', clinicianId: '', authorDisplayName: '' },
    });

    clearDashboardSessionData();
    signInAs({ sub: 'auth-clinician-b', name: 'Clinician B' });

    const record = getPatientHandoffRecord('patient-42');
    expect(record).toBeNull();
    expect(window.localStorage.getItem(getPatientHandoffWorkspaceStorageKey())).toBeNull();
  });

  it('keeps note history bounded per patient and prunes the overall patient map by recency', () => {
    vi.useFakeTimers();
    signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });

    for (let index = 0; index < PATIENT_HANDOFF_LIMITS.notesPerPatient + 3; index += 1) {
      vi.setSystemTime(new Date(2026, 0, 1, 9, 0, index));
      addPatientHandoffNote('patient-42', `Note ${index + 1}`);
    }

    const patientNotes = getPatientHandoffRecord('patient-42')?.notes ?? [];
    expect(patientNotes).toHaveLength(PATIENT_HANDOFF_LIMITS.notesPerPatient);
    expect(patientNotes[0]?.text).toBe(`Note ${PATIENT_HANDOFF_LIMITS.notesPerPatient + 3}`);
    expect(
      patientNotes.some((note) => note.text === 'Note 1'),
    ).toBe(false);

    for (let index = 0; index < PATIENT_HANDOFF_LIMITS.patientRecords + 5; index += 1) {
      vi.setSystemTime(new Date(2026, 0, 2, 10, 0, index));
      savePatientCurrentHandoff(`patient-${index + 1}`, {
        summary: `Summary ${index + 1}`,
        nextAction: '',
        followUpOwner: { kind: 'unassigned' },
      });
    }

    const workspace = getPatientHandoffWorkspace();
    expect(Object.keys(workspace)).toHaveLength(PATIENT_HANDOFF_LIMITS.patientRecords);
  });
});
