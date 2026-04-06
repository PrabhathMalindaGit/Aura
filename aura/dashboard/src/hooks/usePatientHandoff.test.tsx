/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePatientHandoff } from './usePatientHandoff';
import {
  clearClinicianProfileForTests,
  getClinicianProfile,
  setClinicianProfile,
} from '../services/clinicianProfile';
import {
  addPatientHandoffNote,
  clearPatientHandoffWorkspaceForTests,
  discardLegacyPatientHandoffRecord,
  getPatientHandoffWorkspaceStorageKey,
  savePatientCurrentHandoff,
} from '../services/patientHandoffWorkspace';

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

function HandoffSubscriber({ patientId, label }: { patientId: string; label: string }): JSX.Element {
  const record = usePatientHandoff(patientId);
  return (
    <div>
      <strong>{label}</strong>
      <span>{record?.currentHandoff?.summary ?? 'No handoff'}</span>
      <span>{record?.notes.length ?? 0} notes</span>
    </div>
  );
}

function HandoffMutations({ patientId }: { patientId: string }): JSX.Element {
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          savePatientCurrentHandoff(patientId, {
            summary: 'Reactive handoff summary',
            nextAction: 'alerts',
            followUpOwner: { kind: 'unassigned' },
          })
        }
      >
        Save handoff
      </button>
      <button type="button" onClick={() => addPatientHandoffNote(patientId, 'Reactive note')}>
        Add note
      </button>
      <button type="button" onClick={() => discardLegacyPatientHandoffRecord(patientId)}>
        Discard handoff
      </button>
    </div>
  );
}

describe('usePatientHandoff', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
    clearPatientHandoffWorkspaceForTests();
    signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });
    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: 'Dr Elena Hall',
      clinicianId: 'elena-hall-local',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('updates multiple same-tab subscribers when the patient handoff changes', async () => {
    const user = userEvent.setup();

    render(
      <>
        <HandoffSubscriber patientId="patient-42" label="Subscriber A" />
        <HandoffSubscriber patientId="patient-42" label="Subscriber B" />
        <HandoffMutations patientId="patient-42" />
      </>,
    );

    expect(screen.getAllByText('No handoff')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Save handoff' }));

    await waitFor(() => {
      expect(screen.getAllByText('Reactive handoff summary')).toHaveLength(2);
    });

    await user.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => {
      expect(screen.getAllByText('1 notes')).toHaveLength(2);
    });

    await user.click(screen.getByRole('button', { name: 'Discard handoff' }));

    await waitFor(() => {
      expect(screen.getAllByText('No handoff')).toHaveLength(2);
      expect(screen.getAllByText('0 notes')).toHaveLength(2);
    });
  });

  it('updates subscribers when the legacy handoff store changes from a storage event', async () => {
    savePatientCurrentHandoff('patient-42', {
      summary: 'Cross-tab legacy handoff',
      nextAction: 'alerts',
      followUpOwner: { kind: 'unassigned' },
    });

    render(<HandoffSubscriber patientId="patient-42" label="Subscriber A" />);

    expect(screen.getByText('Cross-tab legacy handoff')).toBeInTheDocument();

    window.localStorage.removeItem(getPatientHandoffWorkspaceStorageKey());
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: getPatientHandoffWorkspaceStorageKey(),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('No handoff')).toBeInTheDocument();
      expect(screen.getByText('0 notes')).toBeInTheDocument();
    });
  });
});
