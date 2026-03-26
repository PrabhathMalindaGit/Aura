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
  visibleItemCount?: number;
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

function actionClassName(item: DashboardPriorityQueueItem): string {
  if (item.itemType === 'alert') {
    return 'dashboard-list-item__action-btn dashboard-list-item__action-btn--alert';
  }

  if (item.itemType === 'appointment_exception') {
    return 'dashboard-list-item__action-btn dashboard-list-item__action-btn--appointment';
  }

  return 'dashboard-list-item__action-btn dashboard-list-item__action-btn--patient';
}

function queueKindLabel(itemType: DashboardPriorityQueueItem['itemType']): string {
  switch (itemType) {
    case 'alert':
      return 'Alert review';
    case 'appointment_exception':
      return 'Appointment exception';
    case 'communication':
      return 'Communication follow-up';
    case 'missed_checkin':
      return 'Missed check-in';
    case 'task':
    default:
      return 'Follow-up task';
  }
}

function priorityToneClass(priority: DashboardPriorityQueueItem['priority']): string {
  if (priority === 'urgent' || priority === 'high') {
    return 'high';
  }

  if (priority === 'medium') {
    return 'medium';
  }

  return 'neutral';
}

function queueTimestampLabel(item: DashboardPriorityQueueItem): string {
  if (item.dueAt) {
    return `Due ${formatDashboardRelativeTime(item.dueAt)}`;
  }

  return formatDashboardRelativeTime(item.createdAt);
}

function queueTimestampTitle(item: DashboardPriorityQueueItem): string {
  if (item.dueAt) {
    return `Due ${formatDashboardDateTime(item.dueAt)}`;
  }

  return formatDashboardDateTime(item.createdAt);
}

export function PriorityQueueModule({
  items,
  visibleItemCount,
  loading,
  hasError,
  onRetry,
  retrying = false,
  resolvePatientLabel,
  onOpenItem,
  onOpenAlerts,
}: PriorityQueueModuleProps): JSX.Element {
  const visibleItems = visibleItemCount ? items.slice(0, visibleItemCount) : items;
  const urgentCount = items.filter((item) => item.priority === 'urgent' || item.priority === 'high').length;
  const alertCount = items.filter((item) => item.itemType === 'alert').length;

  return (
    <Card
      className="dashboard-module-card dashboard-priority-card"
      title={
        <span className="dashboard-widget-heading dashboard-widget-heading--priority">
          <span className="dashboard-widget-heading__eyebrow">Attention now</span>
          <span className="dashboard-module-card__title-row">
            <span className="dashboard-module-card__title">
              Priority queue
              <span className="dashboard-module-card__count">{items.length}</span>
            </span>
          </span>
          <span className="dashboard-widget-heading__copy">
            Escalations and high-priority follow-up ready now.
          </span>
        </span>
      }
      action={
        <div className="dashboard-module-card__action-shell">
          <Button variant="secondary" size="sm" onClick={onOpenAlerts}>
            Open alerts
          </Button>
        </div>
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
          description="High-priority alerts, missed check-ins, appointment exceptions, and follow-up items will appear here."
          tone="success"
          action={
            <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
              {retrying ? 'Refreshing...' : 'Refresh queue'}
            </Button>
          }
        />
      ) : (
        <div className="dashboard-priority-card__content">
          <div className="dashboard-widget-bar dashboard-widget-bar--priority" aria-label="Priority queue summary">
            <span className="dashboard-widget-bar__item">
              <strong>{urgentCount}</strong>
              <span>urgent or high</span>
            </span>
            <span className="dashboard-widget-bar__item">
              <strong>{alertCount}</strong>
              <span>alerts</span>
            </span>
            <span className="dashboard-widget-bar__item">
              <strong>{Math.max(items.length - alertCount, 0)}</strong>
              <span>follow-up items</span>
            </span>
          </div>

          <div className="dashboard-list dashboard-list--priority" role="list">
            {visibleItems.map((item) => (
              <article
                key={item.id}
                className={`dashboard-list-item dashboard-list-item--priority dashboard-list-item--priority-${priorityToneClass(
                  item.priority,
                )}`}
                role="listitem"
              >
                <div className="dashboard-list-item__content dashboard-list-item__content--priority">
                  <div className="dashboard-list-item__eyebrow dashboard-list-item__eyebrow--priority">
                    <span className="dashboard-list-item__patient-block">
                      <span className="dashboard-list-item__patient">{resolvePatientLabel(item.patientId)}</span>
                      <span className="dashboard-list-item__queue-kind">{queueKindLabel(item.itemType)}</span>
                    </span>
                    <span className="dashboard-list-item__timestamp" title={queueTimestampTitle(item)}>
                      {queueTimestampLabel(item)}
                    </span>
                  </div>
                  <div className="dashboard-list-item__title-row dashboard-list-item__title-row--priority">
                    <h3 className="dashboard-list-item__headline">{item.title}</h3>
                    <Badge className="dashboard-list-item__priority-badge" variant={priorityVariant(item.priority)}>
                      {humanizeDashboardLabel(item.priority)}
                    </Badge>
                  </div>
                  {item.subtitle ? <p className="dashboard-list-item__description">{item.subtitle}</p> : null}
                  <div className="dashboard-list-item__footer dashboard-list-item__footer--priority">
                    <div className="dashboard-list-item__meta dashboard-list-item__meta--supporting dashboard-list-item__meta--priority">
                      <span>{`${humanizeDashboardLabel(item.source)} · ${humanizeDashboardLabel(item.status)}`}</span>
                      <span>{item.dueAt ? `Due ${formatDashboardDateTime(item.dueAt)}` : `Opened ${formatDashboardDateTime(item.createdAt)}`}</span>
                    </div>
                    <div className="dashboard-list-item__action dashboard-list-item__action--priority">
                      <Button
                        className={actionClassName(item)}
                        variant="secondary"
                        size="sm"
                        onClick={() => onOpenItem(item)}
                      >
                        {actionLabel(item)}
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
