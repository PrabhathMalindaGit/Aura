import { BentoCard } from './BentoCard';
import { KpiCounter } from './KpiCounter';
import { Skeleton } from '../ui/Skeleton';

export type KpiCardTone = 'primary' | 'risk-high' | 'warning' | 'success';

interface KpiCardProps {
  label: string;
  value: number;
  helper: string;
  tone: KpiCardTone;
  loading?: boolean;
}

export function KpiCard({ label, value, helper, tone, loading = false }: KpiCardProps): JSX.Element {
  return (
    <BentoCard className="kpi-card" size="xs" colSpan={1} rowSpan={1} gradient={tone}>
      <div className="kpi-card__stack">
        <p className="kpi-card__label">{label}</p>
        {loading ? (
          <div className="kpi-card__skeleton" aria-label={`${label} loading`}>
            <Skeleton height={32} width="52%" />
          </div>
        ) : (
          <KpiCounter value={value} reserveDigits={4} />
        )}
        <p className="kpi-card__helper">{helper}</p>
      </div>
    </BentoCard>
  );
}
