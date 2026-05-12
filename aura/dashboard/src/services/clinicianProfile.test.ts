/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import { CLINICIAN_ID_STORAGE_KEY, CLINICIAN_NAME_STORAGE_KEY } from '../utils/storageKeys';
import {
  CLINICIAN_COMMUNICATION_AUTHORING_LIMITS,
  MAX_CLINICIAN_PROFILE_PHOTO_BYTES,
  clearClinicianProfileForTests,
  getActiveClinicianProfileScopeId,
  getClinicianProfile,
  getClinicianProfileStorageKey,
  setClinicianProfile,
  type ClinicianProfile,
} from './clinicianProfile';

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildToken(input: { sub: string; name?: string; email?: string; exp?: number }): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: input.sub,
      name: input.name,
      email: input.email,
      exp: input.exp ?? Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  );
  return `${header}.${payload}.signature`;
}

function setActiveToken(input: { sub: string; name?: string; email?: string }): void {
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
      workspacePreferences: {
        ...first.workspacePreferences,
        availabilityStatus: 'in-review',
        teamLabel: 'North Clinic',
        defaultLandingRoute: '/communication',
      },
    });

    window.localStorage.setItem(CLINICIAN_NAME_STORAGE_KEY, 'Different Legacy Value');

    const restored = getClinicianProfile();

    expect(saved.saved).toBe(true);
    expect(restored.displayName).toBe('Dr Elena Hall');
    expect(restored.clinicianId).toBe('local-hall');
    expect(restored.roleTitle).toBe('Lead rehab clinician');
    expect(restored.workspacePreferences.availabilityStatus).toBe('in-review');
    expect(restored.workspacePreferences.teamLabel).toBe('North Clinic');
    expect(restored.workspacePreferences.defaultLandingRoute).toBe('/communication');
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

  it('migrates legacy subject-scoped profiles to a stable email-scoped key', () => {
    setActiveToken({
      sub: 'auth-clinician-email-subject',
      name: 'Dr Stable',
      email: 'clinician1@example.com',
    });
    const seededFallback = getClinicianProfile();
    window.localStorage.removeItem(getClinicianProfileStorageKey('email:clinician1@example.com'));

    window.localStorage.setItem(
      getClinicianProfileStorageKey('auth-clinician-email-subject'),
      JSON.stringify({
        version: 2,
        authScopeId: 'auth-clinician-email-subject',
        updatedAt: new Date().toISOString(),
        profile: {
          ...seededFallback,
          displayName: 'Dr Stable Saved',
          clinicianId: 'stable-local-id',
          photo: {
            dataUrl: 'data:image/png;base64,abc123',
            mimeType: 'image/png',
            fileName: 'avatar.png',
            sizeBytes: 128,
          },
        },
      }),
    );

    const restored = getClinicianProfile();
    const activeScopeId = getActiveClinicianProfileScopeId();

    expect(activeScopeId).toBe('email:clinician1@example.com');
    expect(restored.displayName).toBe('Dr Stable Saved');
    expect(restored.clinicianId).toBe('stable-local-id');
    expect(restored.photo?.fileName).toBe('avatar.png');
    expect(
      window.localStorage.getItem(getClinicianProfileStorageKey('email:clinician1@example.com')),
    ).toContain('"displayName":"Dr Stable Saved"');
  });

  it('seeds the local demo clinician with saved communication authoring settings', () => {
    setActiveToken({
      sub: 'demo-clinician-subject',
      name: 'Clinician One',
      email: 'clinician1@example.com',
    });

    const profile = getClinicianProfile();

    expect(profile.communicationAuthoring.autoAppendSignature).toBe(false);
    expect(profile.communicationAuthoring.defaultSignature).toBe(
      'Clinician One\nRehab clinician · Recovery follow-up',
    );
    expect(profile.communicationAuthoring.templates).toEqual([
      {
        id: 'demo-review-acknowledged',
        title: 'Review acknowledged',
        body: 'Thanks for the update. I have reviewed this note and will follow up through the care plan.',
      },
    ]);
  });

  it('falls back safely when scoped storage is malformed', () => {
    setActiveToken({ sub: 'auth-clinician-3', name: 'Dr Chen' });
    window.localStorage.setItem(getClinicianProfileStorageKey('auth-clinician-3'), '{bad-json');

    const profile = getClinicianProfile();

    expect(profile.displayName).toBe('Dr Chen');
    expect(profile.clinicianId).toBe('auth-clinician-3');
    expect(profile.workspacePreferences.defaultLandingRoute).toBe('/dashboard');
    expect(profile.communicationAuthoring.defaultSignature).toBe('');
    expect(profile.communicationAuthoring.templates).toEqual([]);
    expect(profile.notificationPreferences.communication.cueMode).toBe('default');
    expect(profile.notificationPreferences.safety.cueMode).toBe('default');
    expect(profile.notificationPreferences.quietHours.enabled).toBe(false);
  });

  it('normalizes workspace preference defaults for older saved records', () => {
    setActiveToken({ sub: 'auth-clinician-legacy', name: 'Dr Legacy' });
    window.localStorage.setItem(
      getClinicianProfileStorageKey('auth-clinician-legacy'),
      JSON.stringify({
        version: 1,
        authScopeId: 'auth-clinician-legacy',
        updatedAt: new Date().toISOString(),
        profile: {
          displayName: 'Dr Legacy',
          clinicianId: 'auth-clinician-legacy',
          roleTitle: 'Rehab clinician',
          specialty: 'Recovery follow-up',
          bio: '',
          preferredPronouns: undefined,
          contactNote: '',
          photo: null,
        },
      }),
    );

    const profile = getClinicianProfile();

    expect(profile.workspacePreferences.availabilityStatus).toBe('available');
    expect(profile.workspacePreferences.defaultLandingRoute).toBe('/dashboard');
    expect(profile.workspacePreferences.defaultPatientsPreset).toBe('');
    expect(profile.workspacePreferences.defaultCommunicationFilter).toBe('all');
    expect(profile.communicationAuthoring.defaultSignature).toBe('');
    expect(profile.communicationAuthoring.autoAppendSignature).toBe(false);
    expect(profile.communicationAuthoring.templates).toEqual([]);
    expect(profile.notificationPreferences.communication.cueMode).toBe('default');
    expect(profile.notificationPreferences.safety.cueMode).toBe('default');
    expect(profile.notificationPreferences.quietHours).toEqual({
      enabled: false,
      startTime: '22:00',
      endTime: '07:00',
    });
  });

  it('normalizes communication authoring content, bounds, and empty templates during save', () => {
    setActiveToken({ sub: 'auth-clinician-templates', name: 'Dr Templates' });
    const initial = getClinicianProfile();
    const overlongSignature = `${' Dr Hall  \n'.repeat(80)}thanks`;
    const overlongTitle = `  ${'Template title '.repeat(12)}  `;
    const overlongBody = `\n${'Please keep checking in. '.repeat(40)}\n`;

    const result = setClinicianProfile({
      ...initial,
      communicationAuthoring: {
        defaultSignature: overlongSignature,
        autoAppendSignature: true,
        templates: [
          {
            id: 'duplicate',
            title: overlongTitle,
            body: overlongBody,
          },
          {
            id: 'duplicate',
            title: '  ',
            body: '   ',
          },
          {
            id: 'duplicate',
            title: 'Reviewed update',
            body: 'Thanks, I have reviewed this update.',
          },
          ...Array.from({ length: 10 }, (_, index) => ({
            id: `extra-${index}`,
            title: `Extra ${index + 1}`,
            body: `Body ${index + 1}`,
          })),
        ],
      },
    });

    expect(result.saved).toBe(true);
    expect(result.profile.communicationAuthoring.defaultSignature.length).toBeLessThanOrEqual(
      CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.signature,
    );
    expect(result.profile.communicationAuthoring.defaultSignature).not.toMatch(/^\s+$/);
    expect(result.profile.communicationAuthoring.autoAppendSignature).toBe(true);
    expect(result.profile.communicationAuthoring.templates).toHaveLength(
      CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templates,
    );
    expect(result.profile.communicationAuthoring.templates[0]?.title.length).toBeLessThanOrEqual(
      CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templateTitle,
    );
    expect(result.profile.communicationAuthoring.templates[0]?.body.length).toBeLessThanOrEqual(
      CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templateBody,
    );
    expect(
      result.profile.communicationAuthoring.templates.every(
        (template) => template.title.trim().length > 0 && template.body.trim().length > 0,
      ),
    ).toBe(true);
    expect(result.profile.communicationAuthoring.templates[0]?.id).toBe('duplicate');
    expect(result.profile.communicationAuthoring.templates[1]?.id).toBe('duplicate-2');
  });

  it('normalizes notification preference defaults and invalid saved values safely', () => {
    setActiveToken({ sub: 'auth-clinician-notifications', name: 'Dr Notifications' });
    window.localStorage.setItem(
      getClinicianProfileStorageKey('auth-clinician-notifications'),
      JSON.stringify({
        version: 2,
        authScopeId: 'auth-clinician-notifications',
        updatedAt: new Date().toISOString(),
        profile: {
          ...getClinicianProfile(),
          notificationPreferences: {
            communication: { cueMode: 'loud' },
            safety: { cueMode: 'muted' },
            quietHours: {
              enabled: true,
              startTime: '25:00',
              endTime: 'xx:yy',
            },
          },
        },
      }),
    );

    const profile = getClinicianProfile();

    expect(profile.notificationPreferences.communication.cueMode).toBe('default');
    expect(profile.notificationPreferences.safety.cueMode).toBe('default');
    expect(profile.notificationPreferences.quietHours).toEqual({
      enabled: true,
      startTime: '22:00',
      endTime: '07:00',
    });
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
      workspacePreferences: {
        availabilityStatus: 'available',
        teamLabel: '',
        timezone: 'UTC',
        workingHours: {
          enabledDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
          startTime: '09:00',
          endTime: '17:00',
        },
        defaultLandingRoute: '/dashboard',
        defaultPatientsPreset: '',
        defaultCommunicationFilter: 'all',
      },
      communicationAuthoring: {
        defaultSignature: '',
        autoAppendSignature: false,
        templates: [],
      },
      notificationPreferences: {
        communication: {
          cueMode: 'default',
        },
        safety: {
          cueMode: 'default',
        },
        quietHours: {
          enabled: false,
          startTime: '22:00',
          endTime: '07:00',
        },
      },
    };

    const result = setClinicianProfile(profile);

    expect(result.saved).toBe(false);
    expect(window.localStorage.getItem(getClinicianProfileStorageKey('offline-clinician'))).toBeNull();
  });
});
