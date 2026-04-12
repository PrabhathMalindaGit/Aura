/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonResponse } from '../test/mocks';
import {
  getPatientCoordination,
  postPatientCoordinationNote,
  putPatientCurrentHandoff,
  recordCommunicationThreadOpened,
} from './clinicianApi';
import {
  buildClinicianCoordinationFollowUpOwner,
  toClinicianCoordinationNextStep,
} from '../utils/clinicianCoordination';

describe('clinician coordination api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when no shared coordination record exists yet', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createJsonResponse({
        ok: true,
        coordination: null,
      }),
    );

    await expect(getPatientCoordination('patient-1')).resolves.toBeNull();
  });

  it('serializes current handoff saves with monitoring mapping and clinician owner payloads', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createJsonResponse({
        ok: true,
        coordination: {
          patientId: 'patient-1',
          currentHandoff: null,
          noteHistory: [],
          createdAt: '2026-04-05T09:00:00.000Z',
          updatedAt: '2026-04-05T09:00:00.000Z',
        },
      }),
    );

    await putPatientCurrentHandoff('patient-1', {
      summary: '',
      nextStep: toClinicianCoordinationNextStep(''),
      followUpOwner: buildClinicianCoordinationFollowUpOwner({
        kind: 'clinician',
        clinicianId: 'clinician-1',
        displayName: 'Dr Elena Hall',
      }),
      messageId: 'msg-1',
    });

    const [calledUrl, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(calledUrl)).toContain('/clinician/patients/patient-1/coordination/current-handoff');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      summary: '',
      nextStep: 'monitoring',
      followUpOwner: {
        kind: 'clinician',
        clinicianId: 'clinician-1',
        displayName: 'Dr Elena Hall',
      },
      messageId: 'msg-1',
    });
  });

  it('serializes shared coordination note appends with the expected request shape', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createJsonResponse(
        {
          ok: true,
          coordination: {
            patientId: 'patient-1',
            currentHandoff: null,
            noteHistory: [
              {
                id: 'coord-note-1',
                text: 'Shared note text',
                createdBy: {
                  clinicianId: 'clinician-1',
                  displayName: 'Dr Elena Hall',
                },
                createdAt: '2026-04-05T09:05:00.000Z',
              },
            ],
            createdAt: '2026-04-05T09:00:00.000Z',
            updatedAt: '2026-04-05T09:05:00.000Z',
          },
        },
        201,
      ),
    );

    await postPatientCoordinationNote('patient-1', {
      text: 'Shared note text',
      messageId: 'msg-1',
    });

    const [calledUrl, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(calledUrl)).toContain('/clinician/patients/patient-1/coordination/notes');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      text: 'Shared note text',
      messageId: 'msg-1',
    });
  });

  it('serializes internal thread-open events without inventing reviewed semantics', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createJsonResponse({ ok: true }, 201),
    );

    await recordCommunicationThreadOpened('patient-1', {
      sourceSurface: 'communication_inbox',
    });

    const [calledUrl, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(calledUrl)).toContain('/clinician/patients/patient-1/communication/events');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      eventType: 'thread_opened',
      sourceSurface: 'communication_inbox',
    });
  });
});
