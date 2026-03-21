/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  getClinicianCommunicationScopeKey,
} from './clinicianIdentity';
import {
  clearClinicianProfileForTests,
  getClinicianProfile,
  setClinicianProfile,
} from './clinicianProfile';
import {
  addCommunicationThreadReply,
  getCommunicationWorkspaceStorageKey,
  readCommunicationWorkspaceLocalState,
} from './communicationWorkspace';

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

describe('communicationWorkspace', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
  });

  it('snapshots only lightweight authored identity metadata for new local replies', () => {
    signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });
    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: 'Dr Elena Hall',
      clinicianId: 'elena-hall-local',
      roleTitle: 'Lead rehab clinician',
      specialty: 'Post-op recovery',
      preferredPronouns: 'she/her',
      bio: 'Safety-aware post-op review.',
      contactNote: 'Local handoff note.',
    });

    const scopeKey = getClinicianCommunicationScopeKey();
    const nextState = addCommunicationThreadReply(
      readCommunicationWorkspaceLocalState(scopeKey),
      {
        patientId: 'patient-1',
        text: 'Please keep tomorrow for now.',
        createdAt: '2026-03-09T12:00:00.000Z',
      },
      scopeKey,
    );

    expect(nextState.repliesByPatient['patient-1']).toHaveLength(1);

    const stored = JSON.parse(
      window.localStorage.getItem(getCommunicationWorkspaceStorageKey(scopeKey)) ?? '{}',
    ) as {
      repliesByPatient?: Record<string, Array<Record<string, unknown>>>;
    };
    const reply = stored.repliesByPatient?.['patient-1']?.[0];

    expect(scopeKey).toBe('auth-clinician-1');
    expect(reply?.authorDisplayName).toBe('Dr Elena Hall');
    expect(reply?.authorRoleTitle).toBe('Lead rehab clinician');
    expect(reply?.authorSpecialty).toBe('Post-op recovery');
    expect(reply).not.toHaveProperty('photo');
    expect(reply).not.toHaveProperty('preferredPronouns');
    expect(reply).not.toHaveProperty('bio');
    expect(reply).not.toHaveProperty('contactNote');
  });

  it('migrates legacy clinicianId buckets into auth-scope storage and keeps new replies after clinicianId edits', () => {
    signInAs({ sub: 'auth-clinician-legacy', name: 'Dr Legacy' });
    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: 'Dr Legacy',
      clinicianId: 'legacy-local',
      roleTitle: 'Rehab clinician',
      specialty: 'Recovery follow-up',
    });

    window.localStorage.setItem(
      getCommunicationWorkspaceStorageKey('legacy-local'),
      JSON.stringify({
        repliesByPatient: {
          'patient-1': [
            {
              id: 'legacy-reply-1',
              patientId: 'patient-1',
              text: 'Legacy browser-local reply.',
              createdAt: '2026-03-09T10:00:00.000Z',
              clinicianId: 'legacy-local',
            },
          ],
        },
        reviewedAtByPatient: {
          'patient-1': '2026-03-09T10:00:00.000Z',
        },
      }),
    );

    const authScopeKey = getClinicianCommunicationScopeKey();
    const migratedState = readCommunicationWorkspaceLocalState(authScopeKey);

    expect(authScopeKey).toBe('auth-clinician-legacy');
    expect(migratedState.repliesByPatient['patient-1']).toHaveLength(1);
    expect(migratedState.repliesByPatient['patient-1'][0]?.text).toBe('Legacy browser-local reply.');
    expect(
      window.localStorage.getItem(getCommunicationWorkspaceStorageKey(authScopeKey)),
    ).toContain('Legacy browser-local reply.');

    addCommunicationThreadReply(
      migratedState,
      {
        patientId: 'patient-1',
        text: 'New auth-scoped reply.',
        createdAt: '2026-03-09T11:00:00.000Z',
      },
      authScopeKey,
    );

    setClinicianProfile({
      ...getClinicianProfile(),
      clinicianId: 'legacy-local-updated',
    });

    const afterClinicianIdEdit = readCommunicationWorkspaceLocalState(getClinicianCommunicationScopeKey());
    const replyTexts = afterClinicianIdEdit.repliesByPatient['patient-1']?.map((reply) => reply.text) ?? [];

    expect(replyTexts).toContain('Legacy browser-local reply.');
    expect(replyTexts).toContain('New auth-scoped reply.');
    expect(
      window.localStorage.getItem(
        getCommunicationWorkspaceStorageKey(getClinicianCommunicationScopeKey()),
      ),
    ).toContain('New auth-scoped reply.');
  });
});
