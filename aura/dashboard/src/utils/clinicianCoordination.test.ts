import { describe, expect, it } from 'vitest';
import type { ClinicianCoordinationRecord } from '../types/models';
import { getClinicianCoordinationLatestActivity } from './clinicianCoordination';

function createCoordinationRecord(
  overrides: Partial<ClinicianCoordinationRecord> = {},
): ClinicianCoordinationRecord {
  return {
    patientId: 'patient-1',
    currentHandoff: {
      summary: 'Shared handoff summary for the next review.',
      nextStep: 'plan',
      followUpOwner: {
        kind: 'clinician',
        clinicianId: 'clinician-1',
        displayName: 'Dr Elena Hall',
      },
      updatedBy: {
        clinicianId: 'clinician-1',
        displayName: 'Dr Elena Hall',
      },
      updatedAt: '2026-04-06T10:00:00.000Z',
    },
    noteHistory: [
      {
        id: 'note-1',
        text: 'Shared coordination note for the next clinician.',
        createdBy: {
          clinicianId: 'clinician-2',
          displayName: 'Dr Morgan Shaw',
        },
        createdAt: '2026-04-06T09:00:00.000Z',
      },
    ],
    createdAt: '2026-04-06T08:00:00.000Z',
    updatedAt: '2026-04-06T10:00:00.000Z',
    ...overrides,
  };
}

describe('clinicianCoordination latest activity helpers', () => {
  it('prefers the current handoff when it is newer than the latest note', () => {
    const record = createCoordinationRecord();

    expect(getClinicianCoordinationLatestActivity(record)).toEqual({
      kind: 'handoff',
      label: 'Current shared handoff updated',
      author: {
        clinicianId: 'clinician-1',
        displayName: 'Dr Elena Hall',
      },
      timestamp: '2026-04-06T10:00:00.000Z',
      text: 'Shared handoff summary for the next review.',
    });
  });

  it('prefers the latest note when it is newer than the current handoff', () => {
    const record = createCoordinationRecord({
      noteHistory: [
        {
          id: 'note-2',
          text: 'Newest note becomes the latest activity.',
          createdBy: {
            clinicianId: 'clinician-2',
            displayName: 'Dr Morgan Shaw',
          },
          createdAt: '2026-04-06T11:00:00.000Z',
        },
      ],
    });

    expect(getClinicianCoordinationLatestActivity(record)).toEqual({
      kind: 'note',
      label: 'Shared coordination note added',
      author: {
        clinicianId: 'clinician-2',
        displayName: 'Dr Morgan Shaw',
      },
      timestamp: '2026-04-06T11:00:00.000Z',
      text: 'Newest note becomes the latest activity.',
    });
  });

  it('returns the handoff when it is the only shared coordination activity', () => {
    const record = createCoordinationRecord({
      noteHistory: [],
    });

    expect(getClinicianCoordinationLatestActivity(record)).toEqual({
      kind: 'handoff',
      label: 'Current shared handoff updated',
      author: {
        clinicianId: 'clinician-1',
        displayName: 'Dr Elena Hall',
      },
      timestamp: '2026-04-06T10:00:00.000Z',
      text: 'Shared handoff summary for the next review.',
    });
  });

  it('returns the latest note when notes exist without a current handoff', () => {
    const record = createCoordinationRecord({
      currentHandoff: null,
    });

    expect(getClinicianCoordinationLatestActivity(record)).toEqual({
      kind: 'note',
      label: 'Shared coordination note added',
      author: {
        clinicianId: 'clinician-2',
        displayName: 'Dr Morgan Shaw',
      },
      timestamp: '2026-04-06T09:00:00.000Z',
      text: 'Shared coordination note for the next clinician.',
    });
  });

  it('returns null when there is no shared coordination activity yet', () => {
    const record = createCoordinationRecord({
      currentHandoff: null,
      noteHistory: [],
    });

    expect(getClinicianCoordinationLatestActivity(record)).toBeNull();
  });

  it('does not infer follow-up ownership from the latest note author', () => {
    const record = createCoordinationRecord({
      currentHandoff: {
        summary: 'Keep current structured ownership intact.',
        nextStep: 'alerts',
        followUpOwner: {
          kind: 'custom',
          label: 'Weekend review desk',
        },
        updatedBy: {
          clinicianId: 'clinician-1',
          displayName: 'Dr Elena Hall',
        },
        updatedAt: '2026-04-06T08:00:00.000Z',
      },
      noteHistory: [
        {
          id: 'note-3',
          text: 'Coverage clinician added a later note.',
          createdBy: {
            clinicianId: 'clinician-2',
            displayName: 'Dr Morgan Shaw',
          },
          createdAt: '2026-04-06T12:00:00.000Z',
        },
      ],
    });

    expect(getClinicianCoordinationLatestActivity(record)).toMatchObject({
      kind: 'note',
      author: {
        clinicianId: 'clinician-2',
        displayName: 'Dr Morgan Shaw',
      },
    });
    expect(record.currentHandoff?.followUpOwner).toEqual({
      kind: 'custom',
      label: 'Weekend review desk',
    });
  });
});
