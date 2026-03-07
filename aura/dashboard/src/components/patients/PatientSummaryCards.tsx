import { formatDateKey, formatMedication, formatMoodValue, formatPainValue, formatPercent, formatNumber } from '../../utils/format';
import type { TrendSummaryMetrics } from '../../utils/trends';
import { cn } from '../../utils/cn';

interface PatientSummaryCardsProps {
  metrics: TrendSummaryMetrics;
  openAlertCount: number;
}

interface SummaryCardProps {
  metric:
    | 'pain'
    | 'mood'
    | 'adherence'
    | 'open-alerts'
    | 'last-checkin'
    | 'avg-pain';
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  caption?: string;
}

function SummaryCard({ metric, label, value, tone = 'default', caption }: SummaryCardProps): JSX.Element {
  return (
    <article className={cn('patient-summary-card glass-card', `patient-summary-card--${tone}`, `patient-summary-card--${metric}`)}>
      <p className="patient-summary-card__label">{label}</p>
      <strong className="patient-summary-card__value">{value}</strong>
      {caption ? <p className="patient-summary-card__caption">{caption}</p> : null}
    </article>
  );
}

export function PatientSummaryCards({ metrics, openAlertCount }: PatientSummaryCardsProps): JSX.Element {
  const painTone = metrics.latestPain !== null && metrics.latestPain >= 7 ? 'danger' : 'default';

  return (
    <section className="patient-summary-grid" aria-label="Patient summary metrics">
      <SummaryCard metric="pain" label="Latest pain" value={formatPainValue(metrics.latestPain)} tone={painTone} />
      <SummaryCard metric="mood" label="Latest mood" value={formatMoodValue(metrics.latestMood)} />
      <SummaryCard
        metric="adherence"
        label="Latest adherence"
        value={`${formatPercent(metrics.latestExercises)} / ${formatMedication(metrics.latestMedication)}`}
        caption={`7d adherence: ${formatPercent(metrics.adherence7d)}`}
        tone="success"
      />
      <SummaryCard
        metric="open-alerts"
        label="Open alerts"
        value={String(openAlertCount)}
        tone={openAlertCount > 0 ? 'danger' : 'default'}
      />
      <SummaryCard
        metric="last-checkin"
        label="Last check-in"
        value={metrics.lastCheckinDate ? formatDateKey(metrics.lastCheckinDate) : 'No check-ins yet'}
      />
      <SummaryCard
        metric="avg-pain"
        label="Avg pain (7d)"
        value={formatNumber(metrics.avgPain7d)}
      />
    </section>
  );
}
