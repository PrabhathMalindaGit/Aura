import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { DashboardModuleState } from './DashboardModuleState';
import type { DashboardPriorityQueueItem } from '../../types/models';
import {
  formatDashboardDateTime,
  formatDashboardRelativeTime,
  humanizeDashboardLabel,
} from '../../utils/dashboard';

interface PriorityQueueModuleProps {
  items: DashboardPriorityQueueItem[];
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
  retrying?: boolean;
  resolvePatientLabel: (patientId: string) => string;
  onOpenItem: (item: DashboardPriorityQueueItem) => void;
  onOpenAlerts: () => void;
}

function priorityVariant(priority: DashboardPriorityQueueItem['priority']): 'neutral' | 'warning' | 'risk-high' {
  if (priority === 'urgent' || priority === 'high') {
    return 'risk-high';
  }

  if (priority === 'medium') {
    return 'warning';
  }

  return 'neutral';
}

function actionLabel(item: DashboardPriorityQueueItem): string {
  if (item.itemType === 'alert') {
    return 'Open alerts';
  }

  if (item.itemType === 'appointment_exception') {
    return 'Open appointments';
  }

  return 'Open patient';
}

export function PriorityQueueModule({
  items,
  loading,
  hasError,
  onRetry,
  retrying = false,
  resolvePatientLabel,
  onOpenItem,
  onOpenAlerts,
}: PriorityQueueModuleProps): JSX.Element {
  return (
    <Card
      className="dashboard-module-card dashboard-priority-card"
      title={
        <span className="dashboard-module-card__title">
          Priority queue
          <span className="dashboard-module-card__count">{items.length}</span>
        </span>
      }
      action={
        <Button variant="ghost" size="sm" onClick={onOpenAlerts}>
          Open alerts
        </Button>
      }
    >
      {loading && items.length === 0 ? (
        <DashboardModuleState mode="loading" lines={5} />
      ) : hasError && items.length === 0 ? (
        <DashboardModuleState
          mode="error"
          title="Unable to load priority queue"
          description="The mixed clinician work queue could not be loaded."
          onRetry={onRetry}
          retrying={retrying}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing urgent right now"
          description="High-priority alerts, missed check-ins, appointment exceptions, and clinician follow-up items will appear here."
          tone="success"
          action={
            <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
              {retrying ? 'Refreshing...' : 'Refresh queue'}
            </Button>
          }
        />
      ) : (
        <div className="dashboard-list dashboard-list--priority" role="list">
          {items.map((item) => (
            <article key={item.id} className="dashboard-list-item dashboard-list-item--priority" role="listitem">
              <div className="dashboard-list-item__content">
                <div className="dashboard-list-item__eyebrow">
                  <span className="dashboard-list-item__patient">{resolvePatientLabel(item.patientId)}</span>
                  <span className="dashboard-list-item__timestamp" title={formatDashboardDateTime(item.createdAt)}>
                    {formatDashboardRelativeTime(item.createdAt)}
                  </span>
                </div>
                <div className="dashboard-list-item__title-row">
                  <h3 className="dashboard-list-item__title">{item.title}</h3>
                  <Badge variant={priorityVariant(item.priority)}>{humanizeDashboardLabel(item.priority)}</Badge>
                </div>
                {item.subtitle ? <p className="dashboard-list-item__description">{item.subtitle}</p> : null}
                <div className="dashboard-list-item__meta">
                  <span>{humanizeDashboardLabel(item.source)}</span>
                  <span>{humanizeDashboardLabel(item.status)}</span>
                  {item.dueAt ? <span>Due {formatDashboardDateTime(item.dueAt)}</span> : null}
                </div>
              </div>
              <div className="dashboard-list-item__action">
                <Button variant="secondary" size="sm" onClick={() => onOpenItem(item)}>
                  {actionLabel(item)}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}
