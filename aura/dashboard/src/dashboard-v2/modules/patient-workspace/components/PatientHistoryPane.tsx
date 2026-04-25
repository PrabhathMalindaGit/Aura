import { DayDetailPanel } from '../../../../components/patients/DayDetailPanel';
import { TrendCharts } from '../../../../components/patients/TrendCharts';
import type { AlertItem, SymptomPhotoItem, TrendPointNormalized } from '../../../../types/models';
import type { PatientHistoryChronologyItem } from '../usePatientWorkspaceViewModel';
import type { PatientWorkspaceHistoryVm } from '../../../adapters/patientWorkspace';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { DashboardV2Button } from '../../../primitives/Button';

interface PatientHistoryPaneProps {
  history: PatientWorkspaceHistoryVm;
  normalizedTrends: TrendPointNormalized[];
  showTrendsLoading: boolean;
  expandedTrendMetric: 'pain' | 'mood' | 'adherence' | null;
  onExpandedTrendMetricChange: (metric: 'pain' | 'mood' | 'adherence' | null) => void;
  selectedDayPoint: TrendPointNormalized | null;
  selectedDayAlerts: AlertItem[];
  chronologyItems: PatientHistoryChronologyItem[];
  recentSleepRows: Array<{ date: string; hours: number | null; quality: number | null; disturbances: number | null }>;
  recentBodyMapSummary: Array<{ region: string; label: string; count: number }>;
  recentHydrationSummary: { avgDailyMl: number | null; daysMeetingTarget: number };
  recentNutritionSummary: { trackedDays: number; avgFruitVeg: number | null; proteinOkHighDays: number };
  recentWearablesSummary: { trackedDays: number; avgSteps: number | null; avgActiveMinutes: number | null; avgRestingHr: number | null; source: string };
  recentMedicationSummary: { scheduled: number; taken: number; skipped: number; adherencePct: number | null };
  recentPhotos: SymptomPhotoItem[];
  onSelectDayKey: (date: string | null) => void;
  onRetry: () => void;
}

export function PatientHistoryPane({
  history,
  normalizedTrends,
  showTrendsLoading,
  expandedTrendMetric,
  onExpandedTrendMetricChange,
  selectedDayPoint,
  selectedDayAlerts,
  chronologyItems,
  recentSleepRows,
  recentBodyMapSummary,
  recentHydrationSummary,
  recentNutritionSummary,
  recentWearablesSummary,
  recentMedicationSummary,
  recentPhotos,
  onSelectDayKey,
  onRetry,
}: PatientHistoryPaneProps): JSX.Element {
  return (
    <div className="v2-patient-pane v2-patient-pane--history" data-testid="v2-patient-history-pane">
      <DashboardV2Surface className="v2-patient-pane-intro" tone="muted">
        <div className="v2-patient-pane-intro__header">
          <div>
            <DashboardV2Text tone="label">History</DashboardV2Text>
            <DashboardV2Heading as="h3">Trend history and slower recovery context</DashboardV2Heading>
          </div>
          <DashboardV2Button tone="secondary" size="sm" onPress={onRetry}>
            Refresh
          </DashboardV2Button>
        </div>
        {history.freshnessLabel ? <DashboardV2Text tone="caption">{history.freshnessLabel}</DashboardV2Text> : null}
      </DashboardV2Surface>

      <DashboardV2Surface className="v2-patient-history-chart" tone="base">
        <div className="v2-patient-pane-intro__header">
          <div>
            <DashboardV2Text tone="label">Clinical review board</DashboardV2Text>
            <DashboardV2Heading as="h3">Longitudinal patient trajectory</DashboardV2Heading>
          </div>
        </div>
        <div className="v2-patient-review-summary__grid v2-patient-review-summary__grid--embedded">
          {history.summaryItems.map((item) => (
            <article key={item.label} className="v2-patient-review-summary__item">
              <DashboardV2Text tone="label">{item.label}</DashboardV2Text>
              <DashboardV2Text as="strong" tone="strong">{item.value}</DashboardV2Text>
              <DashboardV2Text tone="muted">{item.note}</DashboardV2Text>
            </article>
          ))}
        </div>
        {showTrendsLoading ? (
          <DashboardV2Text tone="muted">Loading trend history…</DashboardV2Text>
        ) : normalizedTrends.length === 0 ? (
          <DashboardV2Text tone="muted">No trend history is available in this review window.</DashboardV2Text>
        ) : (
          <TrendCharts
            points={normalizedTrends}
            presentation="workspace"
            expandedMetric={expandedTrendMetric}
            onSelectDate={(date) => onSelectDayKey(date)}
            onExpandMetric={(metric) => onExpandedTrendMetricChange(metric)}
            onCollapseMetric={() => onExpandedTrendMetricChange(null)}
          />
        )}
      </DashboardV2Surface>

      <div className="v2-patient-history-support-grid">
        <DashboardV2Surface className="v2-patient-history-card v2-patient-history-card--chronology" tone="base">
          <DashboardV2Text tone="label">Chronology</DashboardV2Text>
          <DashboardV2Heading as="h3">Grouped recent events</DashboardV2Heading>
          <div className="v2-patient-history-chronology">
            {chronologyItems.length === 0 ? (
              <DashboardV2Text tone="muted">No history events are available in the current window.</DashboardV2Text>
            ) : (
              chronologyItems.slice(0, 12).map((item, index) => (
                <article key={`${item.id}-${item.occurredAt}-${index}`} className="v2-patient-history-chronology__item">
                  <div>
                    <DashboardV2Text tone="label">{item.family}</DashboardV2Text>
                    <DashboardV2Text as="strong" tone="strong">{item.title}</DashboardV2Text>
                    <DashboardV2Text tone="muted">{item.detail}</DashboardV2Text>
                  </div>
                  <DashboardV2Text tone="caption">{new Date(item.occurredAt).toLocaleString()}</DashboardV2Text>
                </article>
              ))
            )}
          </div>
        </DashboardV2Surface>

        <DashboardV2Surface className="v2-patient-history-card v2-patient-history-card--reference" tone="base">
          <DashboardV2Text tone="label">Reference signals</DashboardV2Text>
          <DashboardV2Heading as="h3">Symptoms and support trends</DashboardV2Heading>
          <div className="v2-patient-digest-list">
            <article className="v2-patient-digest-item">
              <DashboardV2Text tone="label">Sleep</DashboardV2Text>
              <DashboardV2Text as="strong" tone="strong">
                {recentSleepRows.length > 0 ? `${recentSleepRows.length} recent entries` : 'No recent entries'}
              </DashboardV2Text>
              <DashboardV2Text tone="muted">
                Body map hotspots: {recentBodyMapSummary.map((item) => item.label).join(', ') || 'No hotspots recorded'}
              </DashboardV2Text>
            </article>
            <article className="v2-patient-digest-item">
              <DashboardV2Text tone="label">Hydration and nutrition</DashboardV2Text>
              <DashboardV2Text as="strong" tone="strong">
                {recentHydrationSummary.avgDailyMl !== null ? `${recentHydrationSummary.avgDailyMl} ml/day` : 'No hydration average'}
              </DashboardV2Text>
              <DashboardV2Text tone="muted">
                {recentNutritionSummary.trackedDays} nutrition day{recentNutritionSummary.trackedDays === 1 ? '' : 's'} tracked
              </DashboardV2Text>
            </article>
            <article className="v2-patient-digest-item">
              <DashboardV2Text tone="label">Wearables and medication</DashboardV2Text>
              <DashboardV2Text as="strong" tone="strong">
                {recentWearablesSummary.trackedDays > 0 ? `${recentWearablesSummary.trackedDays} wearable days` : 'No wearable days'}
              </DashboardV2Text>
              <DashboardV2Text tone="muted">
                Medication adherence {recentMedicationSummary.adherencePct !== null ? `${recentMedicationSummary.adherencePct}%` : 'not recorded'}
              </DashboardV2Text>
            </article>
            <article className="v2-patient-digest-item">
              <DashboardV2Text tone="label">Symptom photos</DashboardV2Text>
              <DashboardV2Text as="strong" tone="strong">
                {recentPhotos.length > 0 ? `${recentPhotos.length} recent upload${recentPhotos.length === 1 ? '' : 's'}` : 'No recent uploads'}
              </DashboardV2Text>
              <DashboardV2Text tone="muted">Reference images stay secondary to the main clinical timeline.</DashboardV2Text>
            </article>
          </div>
        </DashboardV2Surface>
      </div>

      <DayDetailPanel
        open={Boolean(selectedDayPoint)}
        dayPoint={selectedDayPoint}
        dayAlerts={selectedDayAlerts}
        onClose={() => onSelectDayKey(null)}
      />
    </div>
  );
}
