/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PatientHistoryPaneProps } from './PatientHistoryPane';
import { PatientHistoryPane } from './PatientHistoryPane';

const fetchPhotoBlobMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../services/clinicianApi', () => ({
  fetchPhotoBlob: fetchPhotoBlobMock,
}));

vi.mock('../../../../components/patients/DayDetailPanel', () => ({
  DayDetailPanel: () => null,
}));

vi.mock('../../../../components/patients/TrendCharts', () => ({
  TrendCharts: () => <div data-testid="trend-charts">Trend charts</div>,
}));

function createProps(overrides: Partial<PatientHistoryPaneProps> = {}): PatientHistoryPaneProps {
  return {
    history: {
      freshnessLabel: 'Loaded just now',
      summaryItems: [
        { label: 'Pain trend', value: 'Stable', note: 'Chart context available' },
        { label: 'Mood trend', value: 'Stable', note: 'Chart context available' },
        { label: 'Adherence', value: '70%', note: 'Chart context available' },
        { label: 'Sessions', value: '2', note: 'Reference only' },
      ],
    },
    normalizedTrends: [],
    showTrendsLoading: false,
    expandedTrendMetric: null,
    onExpandedTrendMetricChange: vi.fn(),
    selectedDayPoint: null,
    selectedDayAlerts: [],
    chronologyItems: [],
    recentSleepRows: [],
    recentBodyMapSummary: [],
    recentHydrationSummary: { avgDailyMl: null, daysMeetingTarget: 0 },
    recentNutritionSummary: { trackedDays: 0, avgFruitVeg: null, proteinOkHighDays: 0 },
    recentWearablesSummary: {
      trackedDays: null,
      avgSteps: null,
      avgActiveMinutes: null,
      avgRestingHr: null,
      source: null,
    },
    recentMedicationSummary: { scheduled: 0, taken: 0, skipped: 0, adherencePct: null },
    recentPhotos: [
      {
        id: 'photo-1',
        date: '2026-04-17',
        kind: 'swelling',
        notePreview: 'Left knee swelling.',
        createdAt: '2026-04-17T08:00:00.000Z',
      },
    ],
    onSelectDayKey: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

describe('PatientHistoryPane', () => {
  beforeEach(() => {
    fetchPhotoBlobMock.mockReset();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:photo-1'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('renders a secondary symptom photo review surface and opens stored photo data on request', async () => {
    const user = userEvent.setup();
    fetchPhotoBlobMock.mockResolvedValue(new Blob(['photo'], { type: 'image/png' }));

    render(<PatientHistoryPane {...createProps()} />);

    expect(screen.getByRole('heading', { name: 'Secondary image review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View Swelling symptom photo from Apr 17, 2026/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /View Swelling symptom photo from Apr 17, 2026/i }));

    expect(fetchPhotoBlobMock).toHaveBeenCalledWith('photo-1');
    expect(await screen.findByRole('img', { name: /Swelling symptom photo from Apr 17, 2026/i })).toHaveAttribute('src', 'blob:photo-1');
    expect(screen.queryByText(/diagnosis|infection|healing status|clinical severity/i)).not.toBeInTheDocument();
  });

  it('shows honest unavailable copy when photo preview data cannot be loaded', async () => {
    const user = userEvent.setup();
    fetchPhotoBlobMock.mockRejectedValue(new Error('unavailable'));

    render(<PatientHistoryPane {...createProps()} />);

    await user.click(screen.getByRole('button', { name: /View Swelling symptom photo from Apr 17, 2026/i }));

    expect(await screen.findByText('Photo metadata available; image preview unavailable from this view.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Swelling symptom photo/i })).not.toBeInTheDocument();
  });
});
