import { describe, expect, it } from 'vitest';
import type {
  DashboardCommunicationOverviewItem,
  PatientSummary,
  WorklistRecord,
} from '../types/models';
import {
  getCompareAdherenceValue,
  getComparePainSnapshot,
  getCommunicationPreviewText,
  groupCommunicationSignalsByPatient,
  isBenchmarkCommunicationText,
  normalizeRequestedComparePatientIds,
  resolveComparePatientSelection,
} from './patientCompare';
import type { TrendSummaryMetrics } from './trends';

const patients: PatientSummary[] = [
  { id: 'b', displayName: 'Jordan Lee', status: 'active', openAlertCount: 2, lastPain: 6.5 },
  { id: 'a', displayName: 'Taylor Moss', status: 'active', openAlertCount: 1, lastPain: 4.2 },
  { id: 'c', displayName: 'Casey Brown', status: 'on_hold', openAlertCount: 0, lastPain: 2.8 },
  { id: 'd', displayName: 'Morgan Yu', status: 'active', openAlertCount: 0, lastPain: 3.1 },
];

describe('patientCompare', () => {
  it('normalizes compare ids by trimming and preserving first-seen order after de-duplication', () => {
    expect(
      normalizeRequestedComparePatientIds([' b ', 'a', 'b', 'c', 'd']),
    ).toEqual(['b', 'a', 'c', 'd']);
  });

  it('keeps the first 3 valid current-roster patients after normalization', () => {
    const selection = resolveComparePatientSelection(
      ['b', 'a', 'b', 'c', 'd'],
      patients,
    );

    expect(selection.requestedIds).toEqual(['b', 'a', 'c', 'd']);
    expect(selection.validIds).toEqual(['b', 'a', 'c']);
    expect(selection.validPatients.map((patient) => patient.id)).toEqual(['b', 'a', 'c']);
    expect(selection.overflowed).toBe(true);
    expect(selection.unavailableCount).toBe(0);
  });

  it('omits unavailable patients while preserving the remaining valid order', () => {
    const selection = resolveComparePatientSelection(
      ['missing', 'a', 'c', 'also-missing'],
      patients,
    );

    expect(selection.validIds).toEqual(['a', 'c']);
    expect(selection.unavailableCount).toBe(2);
  });

  it('falls back from trend summary to worklist and roster pain snapshots', () => {
    const trendSummary: TrendSummaryMetrics = {
      latestPain: 7.8,
      latestMood: null,
      latestExercises: null,
      latestMedication: null,
      lastCheckinDate: '2026-03-20',
      avgPain7d: 6.4,
      adherence7d: 0.72,
    };
    const worklistItem: WorklistRecord = {
      patientId: 'a',
      patientName: 'Taylor Moss',
      patientStatus: 'active',
      lastCheckinAt: '2026-03-20T10:00:00.000Z',
      openAlertsCount: 1,
      latestRiskLevel: 'medium',
      lastPainScore: 5.5,
      adherenceSummary: {
        exercisesPct: 0.62,
        medicationTaken: true,
      },
      missedCheckins: {
        flag: false,
        count: 0,
      },
      communicationNeedsResponse: false,
      activeTaskCount: 0,
      updatedAt: '2026-03-20T12:00:00.000Z',
    };

    expect(getComparePainSnapshot(patients[1], worklistItem, trendSummary)).toBe(7.8);
    expect(getComparePainSnapshot(patients[1], worklistItem, null)).toBe(5.5);
    expect(getComparePainSnapshot(patients[1], null, null)).toBe(4.2);
  });

  it('falls back from trend adherence to worklist adherence', () => {
    const trendSummary: TrendSummaryMetrics = {
      latestPain: null,
      latestMood: null,
      latestExercises: null,
      latestMedication: null,
      lastCheckinDate: '2026-03-20',
      avgPain7d: null,
      adherence7d: 0.78,
    };
    const worklistItem: WorklistRecord = {
      patientId: 'a',
      patientName: 'Taylor Moss',
      patientStatus: 'active',
      lastCheckinAt: '2026-03-20T10:00:00.000Z',
      openAlertsCount: 1,
      latestRiskLevel: 'medium',
      lastPainScore: 5.5,
      adherenceSummary: {
        exercisesPct: 0.62,
        medicationTaken: true,
      },
      missedCheckins: {
        flag: false,
        count: 0,
      },
      communicationNeedsResponse: false,
      activeTaskCount: 0,
      updatedAt: '2026-03-20T12:00:00.000Z',
    };

    expect(getCompareAdherenceValue(worklistItem, trendSummary)).toBe(0.78);
    expect(getCompareAdherenceValue(worklistItem, null)).toBe(0.62);
    expect(getCompareAdherenceValue(null, null)).toBeNull();
  });

  it('groups communication by patient using current dashboard signals only', () => {
    const items: DashboardCommunicationOverviewItem[] = [
      {
        id: 'comm-1',
        patientId: 'a',
        patientName: 'Taylor Moss',
        messageId: 'msg-1',
        needsResponse: true,
        flaggedBySafety: false,
        followUpRequested: true,
        messageCreatedAt: '2026-03-20T12:00:00.000Z',
        messagePreview: 'Can someone confirm the next step?',
      },
      {
        id: 'comm-2',
        patientId: 'a',
        patientName: 'Taylor Moss',
        messageId: 'msg-2',
        needsResponse: false,
        flaggedBySafety: false,
        followUpRequested: false,
        messageCreatedAt: '2026-03-19T11:00:00.000Z',
        messagePreview: 'Thanks for the follow-up.',
      },
      {
        id: 'comm-3',
        patientId: 'c',
        patientName: 'Casey Brown',
        messageId: 'msg-3',
        needsResponse: false,
        flaggedBySafety: true,
        followUpRequested: false,
        messageCreatedAt: '2026-03-21T09:00:00.000Z',
        messagePreview: 'Pain is much higher after today.',
      },
    ];

    const grouped = groupCommunicationSignalsByPatient(items);

    expect(Object.keys(grouped)).toEqual(['a', 'c']);
    expect(grouped.a.latestItem?.id).toBe('comm-1');
    expect(grouped.a.needsResponse).toBe(true);
    expect(grouped.a.followUpSignal).toBe(true);
    expect(grouped.c.latestItem?.id).toBe('comm-3');
    expect(grouped.c.followUpSignal).toBe(true);
  });

  it('omits only clearly benchmark-marked communication preview text', () => {
    const benchmarkItem: DashboardCommunicationOverviewItem = {
      id: 'comm-bench',
      patientId: 'a',
      patientName: 'Taylor Moss',
      messageId: 'msg-bench',
      needsResponse: true,
      flaggedBySafety: false,
      followUpRequested: false,
      messageCreatedAt: '2026-03-20T12:00:00.000Z',
      messagePreview:
        '[AURA_LATENCY_BENCH:845047b4-7ff6-4ab5-aec7-608a590ee1c9] I cant breathe and need help. Sample 15.',
    };
    const normalItem: DashboardCommunicationOverviewItem = {
      id: 'comm-normal',
      patientId: 'b',
      patientName: 'Jordan Lee',
      messageId: 'msg-normal',
      needsResponse: false,
      flaggedBySafety: false,
      followUpRequested: false,
      messageCreatedAt: '2026-03-20T12:00:00.000Z',
      messagePreview: 'Pain is still elevated after the last exercise block.',
    };

    expect(isBenchmarkCommunicationText(benchmarkItem.messagePreview)).toBe(true);
    expect(isBenchmarkCommunicationText(normalItem.messagePreview)).toBe(false);
    expect(getCommunicationPreviewText({ items: [benchmarkItem], latestItem: benchmarkItem, needsResponse: true, followUpSignal: false })).toBe(
      'No recent communication preview in the current dashboard signals.',
    );
    expect(getCommunicationPreviewText({ items: [normalItem], latestItem: normalItem, needsResponse: false, followUpSignal: false })).toBe(
      'Pain is still elevated after the last exercise block.',
    );
  });
});
