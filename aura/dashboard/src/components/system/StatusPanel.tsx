import type { ReactNode } from 'react';
import { Card } from '../ui/Card';
import { cn } from '../../utils/cn';

type StatusPanelVariant = 'empty' | 'error' | 'info' | 'success';
type StatusPanelSize = 'sm' | 'md';

interface StatusPanelDetails {
  endpoint?: string;
  status?: number;
  timestamp?: string;
}

interface StatusPanelProps {
  variant: StatusPanelVariant;
  title: string;
  description: string;
  icon?: ReactNode;
  actions?: ReactNode;
  hint?: ReactNode;
  details?: StatusPanelDetails;
  size?: StatusPanelSize;
  className?: string;
}

export function StatusPanel({
  variant,
  title,
  description,
  icon,
  actions,
  hint,
  details,
  size = 'md',
  className,
}: StatusPanelProps): JSX.Element {
  const hasDetails = Boolean(details?.endpoint || details?.status || details?.timestamp);

  return (
    <Card
      className={cn(
        'status-panel',
        `status-panel--${variant}`,
        `status-panel--${size}`,
        className,
      )}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? undefined : 'polite'}
      title={null}
    >
      <div className="status-panel__content">
        {icon ? <div className="status-panel__icon">{icon}</div> : null}
        <div className="status-panel__copy">
          <h3 className="status-panel__title">{title}</h3>
          <p className="status-panel__description">{description}</p>
        </div>
      </div>

      {actions ? <div className="status-panel__actions">{actions}</div> : null}

      {hint ? <div className="status-panel__hint">{hint}</div> : null}

      {hasDetails ? (
        <details className="status-panel__details">
          <summary>View troubleshooting</summary>
          <dl>
            {details?.endpoint ? (
              <div>
                <dt>Endpoint</dt>
                <dd>{details.endpoint}</dd>
              </div>
            ) : null}
            {typeof details?.status === 'number' ? (
              <div>
                <dt>Status</dt>
                <dd>{details.status}</dd>
              </div>
            ) : null}
            {details?.timestamp ? (
              <div>
                <dt>Time</dt>
                <dd>{details.timestamp}</dd>
              </div>
            ) : null}
          </dl>
        </details>
      ) : null}
    </Card>
  );
}
