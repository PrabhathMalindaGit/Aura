/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearClinicianProfileForTests,
  getClinicianProfile,
  setClinicianProfile,
} from './clinicianProfile';
import {
  draftEndsWithSignatureBlock,
  getCommunicationAuthoring,
  insertSignatureIntoDraft,
  insertTemplateIntoDraft,
} from './communicationAuthoring';

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

describe('communicationAuthoring helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
  });

  it('derives the current communication authoring snapshot from the clinician profile', () => {
    signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });
    setClinicianProfile({
      ...getClinicianProfile(),
      communicationAuthoring: {
        defaultSignature: 'Dr Rivera\nLead rehab clinician',
        autoAppendSignature: true,
        templates: [
          {
            id: 'reviewed',
            title: 'Reviewed',
            body: 'Thanks, I have reviewed this.',
          },
        ],
      },
    });

    expect(getCommunicationAuthoring()).toEqual({
      defaultSignature: 'Dr Rivera\nLead rehab clinician',
      autoAppendSignature: true,
      templates: [
        {
          id: 'reviewed',
          title: 'Reviewed',
          body: 'Thanks, I have reviewed this.',
        },
      ],
      hasSignature: true,
      templateCount: 1,
    });
  });

  it('inserts templates into empty drafts and keeps signature-only drafts ordered correctly', () => {
    const signature = 'Dr Rivera\nLead rehab clinician';

    expect(insertTemplateIntoDraft('', 'Please keep checking in tomorrow.')).toBe(
      'Please keep checking in tomorrow.',
    );
    expect(
      insertTemplateIntoDraft(signature, 'Please keep checking in tomorrow.', {
        signature,
      }),
    ).toBe(`Please keep checking in tomorrow.\n\n${signature}`);
  });

  it('normalizes spacing when appending templates and signatures to existing drafts', () => {
    const signature = 'Dr Rivera\nLead rehab clinician';
    const withTemplate = insertTemplateIntoDraft(
      'Thanks for the update.\n\n',
      '\nPlease keep logging your symptoms.\n\n',
    );
    const withSignature = insertSignatureIntoDraft(withTemplate, `\n${signature}\n`);

    expect(withTemplate).toBe('Thanks for the update.\n\nPlease keep logging your symptoms.');
    expect(withSignature).toBe(
      'Thanks for the update.\n\nPlease keep logging your symptoms.\n\nDr Rivera\nLead rehab clinician',
    );
  });

  it('dedupes an exact signature block when it is inserted repeatedly', () => {
    const draft = 'Please keep checking in tomorrow.';
    const signature = 'Dr Rivera\nLead rehab clinician';
    const firstInsert = insertSignatureIntoDraft(draft, signature);
    const secondInsert = insertSignatureIntoDraft(firstInsert, signature);

    expect(firstInsert).toBe(`${draft}\n\n${signature}`);
    expect(secondInsert).toBe(`${draft}\n\n${signature}`);
    expect(draftEndsWithSignatureBlock(secondInsert, signature)).toBe(true);
  });
});
