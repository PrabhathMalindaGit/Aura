import { formatDateKey, formatMedication, formatMoodValue, formatPainValue, formatPercent, formatNumber } from '../../utils/format';
import type { TrendSummaryMetrics } from '../../utils/trends';
import { Badge } from '../ui/Badge';

interface PatientSummaryCardsProps {
  metrics: TrendSummaryMetrics;
  openAlertCount: number;
}

interface SummaryCardProps {
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  caption?: string;
}

function SummaryCard({ label, value, tone = 'default', caption }: SummaryCardProps): JSX.Element {
  return (
    <article className="patient-summary-card">
      <p className="patient-summary-card__label">{label}</p>
      <div className="patient-summary-card__value-row">
        <strong className="patient-summary-card__value">{value}</strong>
        <Badge variant={tone}>{label}</Badge>
      </div>
      {caption ? <p className="patient-summary-card__caption">{caption}</p> : null}
    </article>
  );
}

export function PatientSummaryCards({ metrics, openAlertCount }: PatientSummaryCardsProps): JSX.Element {
  const painTone = metrics.latestPain !== null && metrics.latestPain >= 7 ? 'danger' : 'default';

  return (
    <section className="patient-summary-grid" aria-label="Patient summary metrics">
      <SummaryCard label="Latest pain" value={formatPainValue(metrics.latestPain)} tone={painTone} />
      <SummaryCard label="Latest mood" value={formatMoodValue(metrics.latestMood)} />
      <SummaryCard
        label="Latest adherence"
        value={`${formatPercent(metrics.latestExercises)} / ${formatMedication(metrics.latestMedication)}`}
        caption={`7d adherence: ${formatPercent(metrics.adherence7d)}`}
        tone="success"
      />
      <SummaryCard
        label="Open alerts"
        value={String(openAlertCount)}
        tone={openAlertCount > 0 ? 'danger' : 'default'}
      />
      <SummaryCard
        label="Last check-in"
        value={metrics.lastCheckinDate ? formatDateKey(metrics.lastCheckinDate) : 'No check-ins yet'}
      />
      <SummaryCard
        label="Avg pain (7d)"
        value={formatNumber(metrics.avgPain7d)}
      />
    </section>
  );
}
