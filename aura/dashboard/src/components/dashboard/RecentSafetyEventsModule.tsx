import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { DashboardModuleState } from './DashboardModuleState';
import type { DashboardSafetyEvent } from '../../types/models';
import {
  formatDashboardDateTime,
  formatDashboardRelativeTime,
  humanizeDashboardLabel,
} from '../../utils/dashboard';

interface RecentSafetyEventsModuleProps {
  items: DashboardSafetyEvent[];
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
  retrying?: boolean;
  resolvePatientLabel: (patientId: string) => string;
  onOpenAlerts: () => void;
}

function notificationVariant(status?: string): 'neutral' | 'warning' | 'success' | 'danger' {
  if (status === 'failed') {
    return 'danger';
  }

  if (status === 'sent') {
    return 'success';
  }

  if (status === 'attempted' || status === 'skipped') {
    return 'warning';
  }

  return 'neutral';
}

function alertStatusVariant(status?: string): 'neutral' | 'status-open' | 'status-ack' | 'status-resolved' {
  if (status === 'open') {
    return 'status-open';
  }

  if (status === 'acknowledged' || status === 'in_review') {
    return 'status-ack';
  }

  if (status === 'resolved' || status === 'closed') {
    return 'status-resolved';
  }

  return 'neutral';
}

function eventStreamLabel(item: DashboardSafetyEvent): string {
  if (item.notificationStatus) {
    return 'Notification activity';
  }

  if (item.type.toUpperCase().includes('ALERT')) {
    return 'Alert lifecycle';
  }

  return 'Safety workflow';
}

function timelineTone(item: DashboardSafetyEvent): 'success' | 'warning' | 'danger' | 'neutral' {
  if (item.notificationStatus === 'failed') {
    return 'danger';
  }

  if (item.notificationStatus === 'sent') {
    return 'success';
  }

  if (item.notificationStatus === 'attempted' || item.notificationStatus === 'skipped') {
    return 'warning';
  }

  if (item.type.toUpperCase().includes('ALERT') || item.alertStatus === 'open') {
    return 'danger';
  }

  return 'neutral';
}

export function RecentSafetyEventsModule({
  items,
  loading,
  hasError,
  onRetry,
  retrying = false,
  resolvePatientLabel,
  onOpenAlerts,
}: RecentSafetyEventsModuleProps): JSX.Element {
  const alertEventsCount = items.filter((item) => item.alertStatus).length;
  const notificationEventsCount = items.filter((item) => item.notificationStatus).length;

  return (
    <Card
      className="dashboard-module-card dashboard-safety-card"
      title={
        <span className="dashboard-widget-heading dashboard-widget-heading--safety">
          <span className="dashboard-widget-heading__eyebrow">Safety timeline</span>
          <span className="dashboard-module-card__title-row">
            <span className="dashboard-module-card__title">
              Recent safety events
              <span className="dashboard-module-card__count">{items.length}</span>
            </span>
          </span>
          <span className="dashboard-widget-heading__copy">
            Latest alert creation and notification activity recorded by the Safety Spine.
          </span>
        </span>
      }
      action={
        <div className="dashboard-module-card__action-shell">
          <Button variant="ghost" size="sm" onClick={onOpenAlerts}>
            Open alerts
          </Button>
        </div>
      }
    >
      {loading && items.length === 0 ? (
        <DashboardModuleState mode="loading" lines={4} />
      ) : hasError && items.length === 0 ? (
        <DashboardModuleState
          mode="error"
          title="Unable to load safety events"
          description="Recent alert and notification activity could not be loaded."
          onRetry={onRetry}
          retrying={retrying}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No recent safety activity"
          description="Alert creation and notification activity will appear here when the Safety Spine records a new event."
        />
      ) : (
        <div className="dashboard-safety-card__content">
          <div className="dashboard-widget-bar dashboard-widget-bar--timeline" aria-label="Recent safety event summary">
            <span className="dashboard-widget-bar__item">
              <strong>{alertEventsCount}</strong>
              <span>alert events</span>
            </span>
            <span className="dashboard-widget-bar__item">
              <strong>{notificationEventsCount}</strong>
              <span>notification updates</span>
            </span>
          </div>

          <div className="dashboard-list dashboard-list--timeline" role="list">
            {items.map((item) => {
              const streamLabel = eventStreamLabel(item);
              const primaryBadge = item.notificationStatus ? (
                <Badge variant={notificationVariant(item.notificationStatus)}>
                  {humanizeDashboardLabel(item.notificationStatus)}
                </Badge>
              ) : item.alertStatus ? (
                <Badge variant={alertStatusVariant(item.alertStatus)}>
                  {humanizeDashboardLabel(item.alertStatus)}
                </Badge>
              ) : null;

              return (
                <article
                  key={item.id}
                  className={`dashboard-list-item dashboard-list-item--timeline dashboard-list-item--timeline-${timelineTone(item)}`}
                  role="listitem"
                >
                  <div className="dashboard-list-item__timeline-rail" aria-hidden="true">
                    <div className="dashboard-list-item__timeline-dot" />
                  </div>
                  <div className="dashboard-list-item__content dashboard-list-item__content--timeline">
                    <div className="dashboard-list-item__timeline-header">
                      <div className="dashboard-list-item__patient-block dashboard-list-item__patient-block--timeline">
                        <span className="dashboard-list-item__patient">{resolvePatientLabel(item.patientId)}</span>
                        <span className="dashboard-list-item__timeline-kind">{streamLabel}</span>
                      </div>
                      <div className="dashboard-list-item__timeline-meta">
                        {primaryBadge}
                        <span className="dashboard-list-item__timestamp" title={formatDashboardDateTime(item.createdAt)}>
                          {formatDashboardRelativeTime(item.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="dashboard-list-item__title-row dashboard-list-item__title-row--timeline">
                      <h3 className="dashboard-list-item__title dashboard-list-item__title--timeline">
                        {humanizeDashboardLabel(item.type)}
                      </h3>
                    </div>

                    <p className="dashboard-list-item__description dashboard-list-item__description--timeline">{item.summary}</p>

                    <div className="dashboard-list-item__tag-row dashboard-list-item__tag-row--timeline">
                      {item.alertStatus ? <span className="dashboard-list-item__tag">Alert recorded</span> : null}
                      {item.notificationStatus ? <span className="dashboard-list-item__tag">Callback logged</span> : null}
                      {item.alertId ? <span className="dashboard-list-item__tag">Alert linked</span> : null}
                    </div>

                    <div className="dashboard-list-item__footer dashboard-list-item__footer--timeline">
                      <div className="dashboard-list-item__meta dashboard-list-item__meta--supporting dashboard-list-item__meta--timeline">
                        {item.alertStatus ? <span>Alert workflow updated</span> : null}
                        {item.notificationStatus ? <span>Notification status captured</span> : null}
                        <span>{formatDashboardDateTime(item.createdAt)}</span>
                      </div>
                      <div className="dashboard-list-item__action dashboard-list-item__action--timeline">
                        <Button variant="ghost" size="sm" onClick={onOpenAlerts}>
                          Open alerts
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
