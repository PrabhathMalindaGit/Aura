/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import type { AlertItem } from '../types/models';
import { deriveAlertTimeline } from './clinicianApi';

describe('deriveAlertTimeline', () => {
  it('includes expected audit events from alert fields', () => {
    const alert: AlertItem = {
      _id: 'alt-777',
      patientId: 'patient-7',
      risk: 'high',
      reason: 'Escalating pain',
      source: { type: 'chat', sourceId: 'chat-15' },
      status: 'resolved',
      createdAt: '2026-02-20T10:00:00.000Z',
      updatedAt: '2026-02-20T10:30:00.000Z',
      notificationStatus: 'failed',
      notificationError: 'Delivery timeout',
      seenAt: '2026-02-20T10:05:00.000Z',
      acknowledgedAt: '2026-02-20T10:10:00.000Z',
      resolvedAt: '2026-02-20T10:20:00.000Z',
      assignedTo: 'clinician-22',
      riskAuto: 'low',
      riskFinal: 'high',
      overrideReason: 'Clinical judgement',
    };

    const events = deriveAlertTimeline(alert);
    const eventTypes = events.map((event) => event.type);

    expect(eventTypes).toEqual(
      expect.arrayContaining([
        'ALERT_CREATED',
        'NOTIFICATION_FAILED',
        'SEEN',
        'ACKNOWLEDGED',
        'RESOLVED',
        'OVERRIDE_RISK',
        'ASSIGNED',
      ]),
    );

    expect(events[0]?.type).toBe('ALERT_CREATED');
  });
});
