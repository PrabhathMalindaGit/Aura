import { Button } from '../ui/Button';
import { DashboardModuleState } from './DashboardModuleState';
import { cn } from '../../utils/cn';

export interface DashboardSummaryMetric {
  key: string;
  label: string;
  value: number;
  helper: string;
  tone?: 'primary' | 'risk' | 'warning' | 'success' | 'neutral';
  onSelect?: () => void;
}

interface DashboardSummaryCardsProps {
  metrics: DashboardSummaryMetric[];
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
  retrying?: boolean;
}

export function DashboardSummaryCards({
  metrics,
  loading,
  hasError,
  onRetry,
  retrying = false,
}: DashboardSummaryCardsProps): JSX.Element {
  if (loading && metrics.length === 0) {
    return (
      <section className="dashboard-summary-grid" aria-label="Dashboard summary loading">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={`dashboard-summary-loading-${index}`} className="dashboard-summary-card dashboard-summary-card--loading">
            <DashboardModuleState mode="loading" lines={2} />
          </div>
        ))}
      </section>
    );
  }

  if (hasError && metrics.length === 0) {
    return (
      <section className="dashboard-summary-grid dashboard-summary-grid--state" aria-label="Dashboard summary error">
        <DashboardModuleState
          mode="error"
          title="Unable to load dashboard summary"
          description="The command-center counters could not be loaded."
          onRetry={onRetry}
          retrying={retrying}
        />
      </section>
    );
  }

  return (
    <section className="dashboard-summary-grid" aria-label="Dashboard summary">
      {metrics.map((metric) => {
        const content = (
          <>
            <div className="dashboard-summary-card__topline">
              <p className="dashboard-summary-card__label">{metric.label}</p>
              <span className="dashboard-summary-card__chevron" aria-hidden="true">
                ↗
              </span>
            </div>
            <p className="dashboard-summary-card__value">{metric.value}</p>
            <p className="dashboard-summary-card__helper">{metric.helper}</p>
          </>
        );

        if (!metric.onSelect) {
          return (
            <article
              key={metric.key}
              className={cn('dashboard-summary-card', metric.tone && `dashboard-summary-card--${metric.tone}`)}
            >
              {content}
            </article>
          );
        }

        return (
          <button
            key={metric.key}
            type="button"
            className={cn('dashboard-summary-card', metric.tone && `dashboard-summary-card--${metric.tone}`)}
            onClick={metric.onSelect}
          >
            {content}
          </button>
        );
      })}

      {hasError ? (
        <div className="dashboard-summary-grid__footer">
          <Button variant="ghost" size="sm" onClick={onRetry} disabled={retrying}>
            {retrying ? 'Refreshing...' : 'Refresh summary'}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
