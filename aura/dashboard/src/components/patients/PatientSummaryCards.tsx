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
  const leadCaption = metrics.lastCheckinDate
    ? `Last check-in ${formatDateKey(metrics.lastCheckinDate)}`
    : 'No recent check-in recorded';
  const painCaption =
    metrics.latestMood !== null ? `Mood ${formatMoodValue(metrics.latestMood)}` : 'Mood not reported';
  const adherenceCaption =
    metrics.avgPain7d !== null ? `7d average pain ${formatNumber(metrics.avgPain7d)}` : '7d average pain unavailable';

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
      <SummaryCard
        metric="pain"
        label="Latest pain"
        value={formatPainValue(metrics.latestPain)}
        tone={painTone}
        caption={painCaption}
      />
      <SummaryCard
        metric="last-checkin"
        label="Recent check-in"
        value={metrics.lastCheckinDate ? formatDateKey(metrics.lastCheckinDate) : 'No check-ins yet'}
        tone={metrics.lastCheckinDate ? 'default' : 'warning'}
        caption={metrics.latestMood !== null ? `Mood ${formatMoodValue(metrics.latestMood)}` : undefined}
      />
      <SummaryCard
        metric="adherence"
        label="7d adherence"
        value={`${formatPercent(metrics.adherence7d)} completion`}
        caption={adherenceCaption}
        tone="success"
        meterValue={(metrics.adherence7d ?? 0) * 100}
      />
    </section>
  );
}
