/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { AlertItem } from '../types/models';
import { createJsonResponse } from '../test/mocks';
import {
  clinicianQueryKeys,
  deriveAlertTimeline,
  getPresentationSeedStatus,
  invalidatePresentationDashboardQueries,
  listAppointmentRequests,
  listAppointmentSlots,
  listInsightsQueue,
} from './clinicianApi';

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

describe('clinicianApi list query limits', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clamps dashboard list queries to the clinician route max of 100', async () => {
    const requestUrls: URL[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      requestUrls.push(new URL(requestUrl, 'http://localhost'));
      return createJsonResponse({ ok: true, items: [] });
    });

    await Promise.all([
      listAppointmentSlots({ status: 'available', limit: 200 }),
      listAppointmentRequests({ status: 'pending', limit: 200 }),
      listInsightsQueue('pending', 200),
    ]);

    const slotsUrl = requestUrls.find(
      (url) => url.pathname === '/clinician/appointments/slots',
    );
    const requestsUrl = requestUrls.find(
      (url) => url.pathname === '/clinician/appointments/requests',
    );
    const insightsUrl = requestUrls.find(
      (url) => url.pathname === '/clinician/insights',
    );

    expect(slotsUrl?.searchParams.get('limit')).toBe('100');
    expect(requestsUrl?.searchParams.get('limit')).toBe('100');
    expect(insightsUrl?.searchParams.get('limit')).toBe('100');
  });
});

describe('presentation seed dashboard queries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps presentation seed metadata from the backend response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createJsonResponse({
        ok: true,
        enabled: true,
        loaded: true,
        seedId: 'phase-10c-presentation-seed-v1',
        counts: { patients: 8, appointmentSlots: 10 },
        lastLoadedAt: '2026-05-11T10:00:00.000Z',
        metadata: {
          firstPatientId: 'presentation-emily-chen',
          patientIds: ['presentation-emily-chen'],
          healthDateRange: { start: '2026-04-28', end: '2026-05-11' },
          appointmentDateRange: { start: '2026-05-11', end: '2026-05-17' },
        },
      }),
    );

    const status = await getPresentationSeedStatus();

    expect(status.metadata?.firstPatientId).toBe('presentation-emily-chen');
    expect(status.metadata?.appointmentDateRange?.start).toBe('2026-05-11');
  });

  it('invalidates presentation-sensitive route data after load or reset', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(clinicianQueryKeys.presentationSeedStatus(), {
      enabled: true,
      loaded: false,
      seedId: 'phase-10c-presentation-seed-v1',
      counts: {},
      lastLoadedAt: null,
    });
    queryClient.setQueryData(['appointments-schedule-slots', 'from', 'to'], []);
    queryClient.setQueryData(['appointments-requests', 'pending'], []);
    queryClient.setQueryData(['patient-recent-checkins', 'presentation-emily-chen'], []);
    queryClient.setQueryData(['alerts', 'open'], []);

    await invalidatePresentationDashboardQueries(queryClient);

    expect(
      queryClient.getQueryState(['appointments-schedule-slots', 'from', 'to'])?.isInvalidated,
    ).toBe(true);
    expect(queryClient.getQueryState(['appointments-requests', 'pending'])?.isInvalidated).toBe(
      true,
    );
    expect(
      queryClient.getQueryState(['patient-recent-checkins', 'presentation-emily-chen'])
        ?.isInvalidated,
    ).toBe(true);
    expect(queryClient.getQueryState(['alerts', 'open'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(clinicianQueryKeys.presentationSeedStatus())?.isInvalidated).toBe(
      true,
    );
  });
});
