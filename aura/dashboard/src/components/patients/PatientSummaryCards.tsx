import { formatDateKey, formatMoodValue, formatPainValue, formatPercent, formatNumber } from '../../utils/format';
import type { TrendSummaryMetrics } from '../../utils/trends';
import { cn } from '../../utils/cn';

interface PatientSummaryCardsProps {
  metrics: TrendSummaryMetrics;
  openAlertCount: number;
}

interface SnapshotFactProps {
  metric: 'review-burden' | 'pain' | 'checkin' | 'adherence';
  label: string;
  value: string;
  caption?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  emphasis?: 'lead' | 'support';
  meterValue?: number;
}

function SnapshotFact({
  metric,
  label,
  value,
  caption,
  tone = 'default',
  emphasis = 'support',
  meterValue,
}: SnapshotFactProps): JSX.Element {
  return (
    <article
      className={cn(
        'patient-summary-card',
        `patient-summary-card--${metric}`,
        `patient-summary-card--${tone}`,
        `patient-summary-card--${emphasis}`,
      )}
    >
      <span className="patient-summary-card__label">{label}</span>
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
  const leadValue =
    openAlertCount > 0 ? `${openAlertCount} ${openAlertCount === 1 ? 'alert' : 'alerts'}` : 'Review steady';
  const leadCaption = metrics.lastCheckinDate
    ? `Last check-in ${formatDateKey(metrics.lastCheckinDate)}`
    : 'No recent check-in recorded';
  const painCaption =
    metrics.latestMood !== null ? `Mood ${formatMoodValue(metrics.latestMood)}` : 'Mood not reported';
  const checkinValue = metrics.lastCheckinDate ? formatDateKey(metrics.lastCheckinDate) : 'No recent check-in';
  const adherenceCaption =
    metrics.avgPain7d !== null ? `7d average pain ${formatNumber(metrics.avgPain7d)}` : '7d average pain unavailable';

  return (
    <section className="patient-summary-snapshot" aria-label="Patient summary metrics">
      <SnapshotFact
        metric="review-burden"
        label="Review pressure"
        value={leadValue}
        tone={openAlertCount > 0 ? 'danger' : 'default'}
        caption={leadCaption}
        emphasis="lead"
      />

      <div className="patient-summary-snapshot__support">
        <SnapshotFact
          metric="pain"
          label="Latest pain"
          value={formatPainValue(metrics.latestPain)}
          tone={metrics.latestPain !== null && metrics.latestPain >= 7 ? 'danger' : 'default'}
          caption={painCaption}
        />
        <SnapshotFact
          metric="checkin"
          label="Recent check-in"
          value={checkinValue}
          tone={metrics.lastCheckinDate ? 'default' : 'warning'}
          caption={metrics.latestMood !== null ? `Mood ${formatMoodValue(metrics.latestMood)}` : 'No mood reported'}
        />
        <SnapshotFact
          metric="adherence"
          label="7d adherence"
          value={`${formatPercent(metrics.adherence7d)} completion`}
          tone="success"
          caption={adherenceCaption}
          meterValue={(metrics.adherence7d ?? 0) * 100}
        />
      </div>
    </section>
  );
}
