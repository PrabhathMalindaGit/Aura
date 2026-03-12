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

function SummaryMetricIcon({ metricKey }: { metricKey: string }): JSX.Element {
  switch (metricKey) {
    case 'open-alerts':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5a4 4 0 0 1 4 4v2.4c0 .8.24 1.58.7 2.22L18.5 16H5.5l1.8-2.38A3.7 3.7 0 0 0 8 11.4V9a4 4 0 0 1 4-4Z" />
          <path d="M10.2 18a2 2 0 0 0 3.6 0" />
        </svg>
      );
    case 'assigned-to-me':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
          <path d="M5 18.5a7 7 0 0 1 14 0" />
          <path d="m17.5 10.5 1.6 1.6 3.4-3.4" />
        </svg>
      );
    case 'pending-insights':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4.5 13.82 8.18 18 10l-4.18 1.82L12 15.5l-1.82-3.68L6 10l4.18-1.82L12 4.5Z" />
          <path d="M18.5 4.5 19.3 6.2 21 7l-1.7.8-.8 1.7-.8-1.7L16 7l1.7-.8.8-1.7Z" />
          <path d="M5.5 14.5 6.3 16.2 8 17l-1.7.8-.8 1.7-.8-1.7L3 17l1.7-.8.8-1.7Z" />
        </svg>
      );
    case 'today-appointments':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="6" width="16" height="14" rx="3" />
          <path d="M8 3.5v5M16 3.5v5M4 10.5h16" />
          <path d="M8.5 14h.01M12 14h.01M15.5 14h.01M8.5 17h.01M12 17h.01" />
        </svg>
      );
    case 'missed-checkins':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7.5 4.5h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" />
          <path d="M9 8.5h6M9 12h3" />
          <path d="M16.5 13.5 19 16l2.5-2.5" />
        </svg>
      );
    case 'follow-up-tasks':
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="6" y="5" width="12" height="15" rx="2.5" />
          <path d="M9 5.5h6M9 10h6M9 13.5h4" />
          <path d="m14.5 17 1.6 1.6 2.9-2.9" />
        </svg>
      );
  }
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
        const tierClass =
          metric.key === 'open-alerts'
            ? 'dashboard-summary-card--featured'
            : metric.key === 'today-appointments'
              ? 'dashboard-summary-card--overview'
              : metric.key === 'assigned-to-me' || metric.key === 'pending-insights'
                ? 'dashboard-summary-card--support'
                : 'dashboard-summary-card--secondary-tier';

        const content = (
          <>
            <div className="dashboard-summary-card__topline">
              <span className="dashboard-summary-card__icon" aria-hidden="true">
                <SummaryMetricIcon metricKey={metric.key} />
              </span>
              {metric.onSelect ? (
                <span className="dashboard-summary-card__chevron" aria-hidden="true">
                  ↗
                </span>
              ) : null}
            </div>
            <div className="dashboard-summary-card__content">
              <div className="dashboard-summary-card__metric">
                <p className="dashboard-summary-card__label">{metric.label}</p>
                <p className="dashboard-summary-card__value">{metric.value}</p>
              </div>
              <p className="dashboard-summary-card__helper">{metric.helper}</p>
            </div>
          </>
        );

        if (!metric.onSelect) {
          return (
            <article
              key={metric.key}
              className={cn(
                'dashboard-summary-card',
                tierClass,
                metric.tone && `dashboard-summary-card--${metric.tone}`,
              )}
            >
              {content}
            </article>
          );
        }

        return (
          <button
            key={metric.key}
            type="button"
            className={cn(
              'dashboard-summary-card',
              tierClass,
              metric.tone && `dashboard-summary-card--${metric.tone}`,
            )}
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
