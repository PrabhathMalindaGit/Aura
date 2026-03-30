import {
  formatDateKey,
  formatMoodValue,
  formatPainValue,
  formatPercent,
} from '../../utils/format';
import type { TrendSummaryMetrics } from '../../utils/trends';

interface PatientSummaryCardsProps {
  metrics: TrendSummaryMetrics;
  openAlertCount: number;
}

interface SnapshotRow {
  label: string;
  value: string;
  caption: string;
  tone: 'default' | 'warning' | 'danger' | 'success';
}

export function PatientSummaryCards({
  metrics,
  openAlertCount,
}: PatientSummaryCardsProps): JSX.Element {
  const rows: SnapshotRow[] = [
    {
      label: 'Alert burden',
      value:
        openAlertCount > 0
          ? `${openAlertCount} open alert${openAlertCount === 1 ? '' : 's'}`
          : 'No open alerts',
      caption: metrics.lastCheckinDate
        ? `Last check-in ${formatDateKey(metrics.lastCheckinDate)}`
        : 'No recent check-in recorded',
      tone: openAlertCount > 0 ? 'danger' : 'default',
    },
    {
      label: 'Latest pain',
      value: formatPainValue(metrics.latestPain),
      caption:
        metrics.latestMood !== null
          ? `Mood ${formatMoodValue(metrics.latestMood)}`
          : 'Mood not reported',
      tone: metrics.latestPain !== null && metrics.latestPain >= 7 ? 'danger' : 'default',
    },
    {
      label: 'Review window',
      value: metrics.lastCheckinDate ? formatDateKey(metrics.lastCheckinDate) : 'No recent check-in',
      caption:
        metrics.lastCheckinDate
          ? 'Most recent patient-reported check-in'
          : 'No check-in recorded in this window',
      tone: metrics.lastCheckinDate ? 'default' : 'warning',
    },
    {
      label: '7d adherence',
      value: `${formatPercent(metrics.adherence7d)} completion`,
      caption:
        metrics.avgPain7d !== null
          ? `7d average pain ${metrics.avgPain7d}`
          : '7d average pain unavailable',
      tone: (metrics.adherence7d ?? 0) >= 0.7 ? 'success' : 'warning',
    },
  ];

  return (
    <section className="patient-summary-snapshot" aria-label="Patient summary metrics">
      <dl className="patient-summary-snapshot__rows">
        {rows.map((row) => (
          <div
            key={row.label}
            className={`patient-summary-row patient-summary-row--${row.tone}`}
          >
            <dt className="patient-summary-row__label">{row.label}</dt>
            <dd className="patient-summary-row__value">{row.value}</dd>
            <p className="patient-summary-row__caption">{row.caption}</p>
          </div>
        ))}
      </dl>
    </section>
  );
}
