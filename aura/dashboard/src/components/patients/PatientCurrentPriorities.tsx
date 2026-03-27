import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import {
  type PatientActionKey,
  type PatientPriorityItem,
} from '../../utils/patientDetail';
import { formatDashboardRelativeTime } from '../../utils/dashboard';

interface PatientCurrentPrioritiesProps {
  items: PatientPriorityItem[];
  isLoading?: boolean;
  error?: string | null;
  onRetry: () => void;
  onAction: (key: PatientActionKey) => void;
}

function toneVariant(tone: PatientPriorityItem['tone']): 'danger' | 'warning' | 'success' | 'neutral' {
  if (tone === 'danger') {
    return 'danger';
  }
  if (tone === 'warning') {
    return 'warning';
  }
  if (tone === 'success') {
    return 'success';
  }
  return 'neutral';
}

function toneLabel(tone: PatientPriorityItem['tone']): string {
  if (tone === 'danger') {
    return 'Urgent';
  }
  if (tone === 'warning') {
    return 'Needs review';
  }
  if (tone === 'success') {
    return 'On track';
  }
  return 'Monitor';
}

export function PatientCurrentPriorities({
  items,
  isLoading = false,
  error,
  onRetry,
  onAction,
}: PatientCurrentPrioritiesProps): JSX.Element {
  return (
    <Card
      id="patient-current-priorities"
      className="patient-detail-panel patient-detail-panel--attention patient-detail-panel--attention-primary"
      title="Current priorities"
      action={
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Refresh
        </Button>
      }
      data-testid="patient-current-priorities"
    >
      {isLoading ? (
        <div className="patient-detail-skeleton-grid" aria-label="Current priorities loading placeholder">
          <Skeleton height={54} />
          <Skeleton height={54} />
          <Skeleton height={54} />
        </div>
      ) : error ? (
        <div className="patient-detail-inline-state" role="status">
          <p className="muted-text">{error}</p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No immediate priorities detected"
          description="This patient does not have an active alert, response-needed message, overdue task, or urgent appointment issue right now."
          tone="success"
        />
      ) : (
        <div className="patient-priority-list">
          <div className="patient-priority-list__intro">
            <p className="patient-priority-list__eyebrow">Decision focus</p>
            <strong className="patient-priority-list__headline">
              {items.length} active {items.length === 1 ? 'priority' : 'priorities'} in this review pass
            </strong>
            <p className="patient-priority-list__hint">
              Review these issue-first cues before moving into slower trajectory or reference context.
            </p>
          </div>
          {items.map((item) => (
            <article key={item.id} className={`patient-priority-item patient-priority-item--${item.tone}`}>
              <div className="patient-priority-item__copy">
                <div className="patient-priority-item__meta">
                  <Badge variant={toneVariant(item.tone)}>{toneLabel(item.tone)}</Badge>
                  {item.timestamp ? (
                    <span className="muted-text">{formatDashboardRelativeTime(item.timestamp)}</span>
                  ) : null}
                </div>
                <strong className="patient-priority-item__title">{item.title}</strong>
                <p className="patient-priority-item__reason">{item.reason}</p>
              </div>
              {item.actionKey && item.actionLabel ? (
                <Button
                  className="patient-priority-item__action"
                  variant="secondary"
                  size="sm"
                  onClick={() => onAction(item.actionKey!)}
                >
                  {item.actionLabel}
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}
