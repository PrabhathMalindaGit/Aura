import { formatDateKey, formatMoodValue, formatPainValue, formatPercent, formatNumber } from '../../utils/format';
import type { TrendSummaryMetrics } from '../../utils/trends';
import { cn } from '../../utils/cn';

interface PatientSummaryCardsProps {
  metrics: TrendSummaryMetrics;
  openAlertCount: number;
}

interface SummaryCardProps {
  metric: 'review-burden' | 'pain' | 'mood' | 'adherence' | 'last-checkin' | 'avg-pain';
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  caption?: string;
  emphasis?: 'lead' | 'default';
  meterValue?: number;
}

function SummaryCard({
  metric,
  label,
  value,
  tone = 'default',
  caption,
  emphasis = 'default',
  meterValue,
}: SummaryCardProps): JSX.Element {
  return (
    <article
      className={cn(
        'patient-summary-card glass-card',
        `patient-summary-card--${tone}`,
        `patient-summary-card--${metric}`,
        `patient-summary-card--${emphasis}`,
      )}
    >
      <p className="patient-summary-card__label">{label}</p>
      <strong className="patient-summary-card__value">{value}</strong>
      {caption ? <p className="patient-summary-card__caption">{caption}</p> : null}
      {meterValue !== undefined ? (
        <div className="patient-summary-card__meter" aria-hidden="true">
          <span className="patient-summary-card__meter-track">
            <span
              className="patient-summary-card__meter-fill"
              style={{ width: `${Math.max(8, Math.min(100, meterValue))}%` }}
            />
          </span>
        </div>
      ) : null}
    </article>
  );
}

export function PatientSummaryCards({ metrics, openAlertCount }: PatientSummaryCardsProps): JSX.Element {
  const painTone = metrics.latestPain !== null && metrics.latestPain >= 7 ? 'danger' : 'default';
  const leadValue =
    openAlertCount > 0 ? `${openAlertCount} ${openAlertCount === 1 ? 'alert' : 'alerts'}` : 'Stable';
  const leadCaption = `Pain ${formatPainValue(metrics.latestPain)} · Last check-in ${
    metrics.lastCheckinDate ? formatDateKey(metrics.lastCheckinDate) : 'not yet recorded'
  }`;

  return (
    <section className="patient-summary-grid" aria-label="Patient summary metrics">
      <SummaryCard
        metric="review-burden"
        label="Review burden"
        value={leadValue}
        tone={openAlertCount > 0 ? 'danger' : 'default'}
        caption={leadCaption}
        emphasis="lead"
      />
      <SummaryCard metric="pain" label="Latest pain" value={formatPainValue(metrics.latestPain)} tone={painTone} />
      <SummaryCard
        metric="adherence"
        label="7d adherence"
        value={`${formatPercent(metrics.adherence7d)} completion`}
        caption={`7d adherence: ${formatPercent(metrics.adherence7d)}`}
        tone="success"
        meterValue={(metrics.adherence7d ?? 0) * 100}
      />
      <SummaryCard
        metric="last-checkin"
        label="Last check-in"
        value={metrics.lastCheckinDate ? formatDateKey(metrics.lastCheckinDate) : 'No check-ins yet'}
        tone={metrics.lastCheckinDate ? 'default' : 'warning'}
      />
      <SummaryCard
        metric="mood"
        label="Latest mood"
        value={formatMoodValue(metrics.latestMood)}
        meterValue={metrics.latestMood !== null ? metrics.latestMood * 10 : 0}
      />
      <SummaryCard
        metric="avg-pain"
        label="Avg pain (7d)"
        value={formatNumber(metrics.avgPain7d)}
        meterValue={metrics.avgPain7d !== null ? metrics.avgPain7d * 10 : 0}
      />
    </section>
  );
}
