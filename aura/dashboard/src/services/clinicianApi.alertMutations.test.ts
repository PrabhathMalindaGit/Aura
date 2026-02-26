/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertItem, PatchAlertResponse } from '../types/models';

const { fetchJsonMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
}));

vi.mock('./apiClient', () => ({
  fetchJson: fetchJsonMock,
  getApiBaseUrl: vi.fn(() => 'http://localhost:3001/api'),
}));

import {
  assignAlert,
  markAlertSeen,
  overrideAlertRisk,
  unassignAlert,
} from './clinicianApi';

function createAlert(overrides: Partial<AlertItem> = {}): AlertItem {
  return {
    _id: 'alt-1',
    patientId: 'p1',
    risk: 'high',
    reason: 'Escalating pain',
    source: { type: 'checkin', sourceId: 'chk-1' },
    status: 'open',
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    ...overrides,
  };
}

function createPatchAlertResponse(alert: AlertItem): PatchAlertResponse {
  return { ok: true, alert };
}

describe('clinicianApi alert mutation wiring', () => {
  beforeEach(() => {
    fetchJsonMock.mockReset();
  });

  it('calls PATCH /clinician/alerts/:id/seen for markAlertSeen', async () => {
    fetchJsonMock.mockResolvedValue(createPatchAlertResponse(createAlert()));

    await markAlertSeen('alt-1');

    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/clinician/alerts/alt-1/seen',
      expect.objectContaining({
        method: 'PATCH',
        json: {},
      }),
    );
  });

  it('calls PATCH /clinician/alerts/:id/assignment for assignAlert', async () => {
    fetchJsonMock.mockResolvedValue(
      createPatchAlertResponse(
        createAlert({
          assignedTo: 'clinician-1',
          assignedToName: 'Clinician One',
          assignedAt: '2026-03-01T10:05:00.000Z',
        }),
      ),
    );

    const record = await assignAlert('alt-1', 'clinician-1', 'Clinician One');

    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/clinician/alerts/alt-1/assignment',
      expect.objectContaining({
        method: 'PATCH',
        json: {
          assignedTo: 'clinician-1',
          assignedToName: 'Clinician One',
          force: false,
        },
      }),
    );
    expect(record).toMatchObject({
      assignedTo: 'clinician-1',
      assignedToName: 'Clinician One',
      assignedAtISO: '2026-03-01T10:05:00.000Z',
    });
  });

  it('calls PATCH /clinician/alerts/:id/assignment with assignedTo=null for unassignAlert', async () => {
    fetchJsonMock.mockResolvedValue(createPatchAlertResponse(createAlert()));

    await unassignAlert('alt-1');

    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/clinician/alerts/alt-1/assignment',
      expect.objectContaining({
        method: 'PATCH',
        json: { assignedTo: null },
      }),
    );
  });

  it('calls PATCH /clinician/alerts/:id/risk-override for overrideAlertRisk', async () => {
    fetchJsonMock.mockResolvedValue(
      createPatchAlertResponse(
        createAlert({
          riskAuto: 'low',
          riskFinal: 'high',
          overrideReason: 'Escalation verified',
          overriddenAt: '2026-03-01T10:10:00.000Z',
          overriddenBy: 'clinician-1',
          overriddenByName: 'Clinician One',
        }),
      ),
    );

    const record = await overrideAlertRisk('alt-1', {
      riskAuto: 'low',
      riskFinal: 'high',
      overrideReason: 'Escalation verified',
      overriddenBy: 'clinician-1',
      overriddenByName: 'Clinician One',
    });

    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/clinician/alerts/alt-1/risk-override',
      expect.objectContaining({
        method: 'PATCH',
        json: {
          riskFinal: 'high',
          overrideReason: 'Escalation verified',
          overriddenBy: 'clinician-1',
          overriddenByName: 'Clinician One',
        },
      }),
    );
    expect(record).toMatchObject({
      riskAuto: 'low',
      riskFinal: 'high',
      overrideReason: 'Escalation verified',
      overriddenBy: 'clinician-1',
      overriddenByName: 'Clinician One',
    });
  });
});
