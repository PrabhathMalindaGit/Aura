import type { AlertKpiSummary } from '../../utils/kpi';
import { KpiCard } from './KpiCard';

interface KpiRowProps {
  summary: AlertKpiSummary;
  loading?: boolean;
}

export function KpiRow({ summary, loading = false }: KpiRowProps): JSX.Element {
  return (
    <section className="kpi-row" aria-label="Alert workflow KPI counters">
      <div className="kpi-row__item cq">
        <KpiCard
          label="Open alerts"
          value={summary.openCount}
          helper={
            summary.overdueCount > 0
              ? `${summary.overdueCount} older than 24h`
              : `${summary.createdLast24hCount} in last 24h`
          }
          tone="risk-high"
          loading={loading}
        />
      </div>
      <div className="kpi-row__item cq">
        <KpiCard
          label="Unseen"
          value={summary.unseenCount}
          helper="Needs first review"
          tone="warning"
          loading={loading}
        />
      </div>
      <div className="kpi-row__item cq">
        <KpiCard
          label="Assigned to me"
          value={summary.assignedToMeCount}
          helper="Current ownership"
          tone="primary"
          loading={loading}
        />
      </div>
      <div className="kpi-row__item cq">
        <KpiCard
          label="Delivery failed"
          value={summary.notifFailedCount}
          helper="Delivery needs attention"
          tone="warning"
          loading={loading}
        />
      </div>
    </section>
  );
}
