import { RetryButton } from '../system/RetryButton';
import { Skeleton } from '../ui/Skeleton';

interface DashboardModuleStateProps {
  mode: 'loading' | 'error';
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
  lines?: number;
}

export function DashboardModuleState({
  mode,
  title,
  description,
  onRetry,
  retrying = false,
  retryLabel = 'Retry',
  lines = 4,
}: DashboardModuleStateProps): JSX.Element {
  if (mode === 'loading') {
    return (
      <div className="dashboard-module-state dashboard-module-state--loading" aria-label="Module loading">
        <Skeleton height={18} width="34%" />
        {Array.from({ length: lines }).map((_, index) => (
          <div key={`dashboard-module-skeleton-${index}`} className="dashboard-module-state__row">
            <Skeleton height={14} width={index === lines - 1 ? '42%' : '86%'} />
            <Skeleton height={14} width="24%" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="dashboard-module-state dashboard-module-state--error" role="alert">
      <div className="dashboard-module-state__copy">
        <h3 className="dashboard-module-state__title">{title ?? 'Unable to load module'}</h3>
        <p className="dashboard-module-state__description">
          {description ?? 'Refresh to try loading this dashboard module again.'}
        </p>
      </div>
      {onRetry ? <RetryButton onRetry={onRetry} loading={retrying} label={retryLabel} /> : null}
    </div>
  );
}
