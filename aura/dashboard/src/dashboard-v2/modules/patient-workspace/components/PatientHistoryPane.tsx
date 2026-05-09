import { useEffect, useState } from 'react';
import { DayDetailPanel } from '../../../../components/patients/DayDetailPanel';
import { TrendCharts } from '../../../../components/patients/TrendCharts';
import type { AlertItem, SymptomPhotoItem, TrendPointNormalized } from '../../../../types/models';
import { fetchPhotoBlob } from '../../../../services/clinicianApi';
import type { PatientHistoryChronologyItem } from '../usePatientWorkspaceViewModel';
import type { PatientWorkspaceHistoryVm } from '../../../adapters/patientWorkspace';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { DashboardV2Button } from '../../../primitives/Button';

export interface PatientHistoryPaneProps {
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
  recentWearablesSummary: { trackedDays: number | null; avgSteps: number | null; avgActiveMinutes: number | null; avgRestingHr: number | null; source: string | null };
  recentMedicationSummary: { scheduled: number; taken: number; skipped: number; adherencePct: number | null };
  recentPhotos: SymptomPhotoItem[];
  onSelectDayKey: (date: string | null) => void;
  onRetry: () => void;
}

interface PhotoPreviewState {
  photo: SymptomPhotoItem;
  src: string | null;
  loading: boolean;
  error: string | null;
}

function formatPhotoDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || 'Date unavailable';
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPhotoKind(kind: SymptomPhotoItem['kind']): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function getPhotoDirectUrl(photo: SymptomPhotoItem): string | null {
  return photo.fileUrl ?? photo.photoUrl ?? photo.imageUrl ?? photo.url ?? null;
}

function getPhotoAccessibleName(photo: SymptomPhotoItem): string {
  return `${formatPhotoKind(photo.kind)} symptom photo from ${formatPhotoDate(photo.date)}`;
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
  const [preview, setPreview] = useState<PhotoPreviewState | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  const handleViewPhoto = async (photo: SymptomPhotoItem): Promise<void> => {
    const directUrl = getPhotoDirectUrl(photo);

    if (directUrl) {
      setObjectUrl(null);
      setPreview({ photo, src: directUrl, loading: false, error: null });
      return;
    }

    if (!photo.id) {
      setObjectUrl(null);
      setPreview({
        photo,
        src: null,
        loading: false,
        error: 'Photo metadata available; image preview unavailable from this view.',
      });
      return;
    }

    setObjectUrl(null);
    setPreview({ photo, src: null, loading: true, error: null });

    try {
      const blob = await fetchPhotoBlob(photo.id);
      const nextObjectUrl = URL.createObjectURL(blob);
      setObjectUrl(nextObjectUrl);
      setPreview({ photo, src: nextObjectUrl, loading: false, error: null });
    } catch {
      setPreview({
        photo,
        src: null,
        loading: false,
        error: 'Photo metadata available; image preview unavailable from this view.',
      });
    }
  };

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
                {recentWearablesSummary.source && recentWearablesSummary.trackedDays !== null
                  ? `${recentWearablesSummary.trackedDays} wearable day${recentWearablesSummary.trackedDays === 1 ? '' : 's'}`
                  : 'No connected wearable source'}
              </DashboardV2Text>
              <DashboardV2Text tone="muted">
                {recentWearablesSummary.source
                  ? `Medication adherence ${recentMedicationSummary.adherencePct !== null ? `${recentMedicationSummary.adherencePct}%` : 'not recorded'}`
                  : 'Medication and check-in history remain visible in the main timeline.'}
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
          <section
            className="v2-patient-photo-review"
            aria-labelledby="v2-patient-photo-review-heading"
          >
            <div className="v2-patient-photo-review__header">
              <div>
                <DashboardV2Text tone="label">Recent symptom photos</DashboardV2Text>
                <DashboardV2Heading as="h4" id="v2-patient-photo-review-heading">
                  Secondary image review
                </DashboardV2Heading>
              </div>
              <DashboardV2Text tone="caption">
                No image interpretation is generated in this view.
              </DashboardV2Text>
            </div>
            {recentPhotos.length === 0 ? (
              <DashboardV2Text tone="muted">No recent symptom photo metadata is available in this review window.</DashboardV2Text>
            ) : (
              <div className="v2-patient-photo-review__list">
                {recentPhotos.slice(0, 4).map((photo) => (
                  <article key={photo.id} className="v2-patient-photo-review__item">
                    <div className="v2-patient-photo-review__copy">
                      <DashboardV2Text tone="label">{formatPhotoKind(photo.kind)}</DashboardV2Text>
                      <DashboardV2Text as="strong" tone="strong">{formatPhotoDate(photo.date)}</DashboardV2Text>
                      {photo.notePreview ? (
                        <DashboardV2Text tone="muted">{photo.notePreview}</DashboardV2Text>
                      ) : (
                        <DashboardV2Text tone="muted">No patient note preview is available.</DashboardV2Text>
                      )}
                      <div className="v2-patient-photo-review__meta">
                        {photo.source ? <span>{photo.source}</span> : null}
                        {photo.status ? <span>{photo.status}</span> : null}
                        <span>Uploaded {formatPhotoDate(photo.createdAt)}</span>
                      </div>
                    </div>
                    <DashboardV2Button
                      tone="row"
                      size="sm"
                      aria-label={`View ${getPhotoAccessibleName(photo)}`}
                      onPress={() => {
                        void handleViewPhoto(photo);
                      }}
                    >
                      View photo
                    </DashboardV2Button>
                  </article>
                ))}
              </div>
            )}
            {preview ? (
              <div
                className="v2-patient-photo-preview"
                aria-live="polite"
                aria-label={`${getPhotoAccessibleName(preview.photo)} preview`}
              >
                <div className="v2-patient-photo-preview__header">
                  <div>
                    <DashboardV2Text tone="label">Selected photo</DashboardV2Text>
                    <DashboardV2Text as="strong" tone="strong">
                      {getPhotoAccessibleName(preview.photo)}
                    </DashboardV2Text>
                  </div>
                  <DashboardV2Button
                    tone="quiet"
                    size="sm"
                    onPress={() => setPreview(null)}
                  >
                    Close preview
                  </DashboardV2Button>
                </div>
                {preview.loading ? (
                  <DashboardV2Text tone="muted">Loading stored symptom photo…</DashboardV2Text>
                ) : preview.src ? (
                  <img
                    className="v2-patient-photo-preview__image"
                    src={preview.src}
                    alt={getPhotoAccessibleName(preview.photo)}
                  />
                ) : (
                  <DashboardV2Text tone="muted">
                    {preview.error ?? 'Photo metadata available; image preview unavailable from this view.'}
                  </DashboardV2Text>
                )}
              </div>
            ) : null}
          </section>
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
