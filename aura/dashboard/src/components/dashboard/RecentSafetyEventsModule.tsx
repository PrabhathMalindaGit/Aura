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
            View alerts
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
            {items.map((item) => (
              <article key={item.id} className="dashboard-list-item dashboard-list-item--timeline" role="listitem">
              <div className="dashboard-list-item__timeline-dot" aria-hidden="true" />
              <div className="dashboard-list-item__content">
                <div className="dashboard-list-item__eyebrow">
                  <span className="dashboard-list-item__patient">{resolvePatientLabel(item.patientId)}</span>
                  <span className="dashboard-list-item__timestamp" title={formatDashboardDateTime(item.createdAt)}>
                    {formatDashboardRelativeTime(item.createdAt)}
                  </span>
                </div>
                <div className="dashboard-list-item__title-row">
                  <h3 className="dashboard-list-item__title">{humanizeDashboardLabel(item.type)}</h3>
                </div>
                <p className="dashboard-list-item__description">{item.summary}</p>
                <div className="dashboard-list-item__tag-row">
                  {item.alertStatus ? <span className="dashboard-list-item__tag">{humanizeDashboardLabel(item.alertStatus)}</span> : null}
                  {item.notificationStatus ? (
                    <Badge variant={notificationVariant(item.notificationStatus)}>
                      {humanizeDashboardLabel(item.notificationStatus)}
                    </Badge>
                  ) : null}
                </div>
                <div className="dashboard-list-item__meta dashboard-list-item__meta--supporting">
                  {item.alertStatus ? <span>{humanizeDashboardLabel(item.alertStatus)}</span> : null}
                  {item.notificationStatus ? (
                    <Badge variant={notificationVariant(item.notificationStatus)}>
                      {humanizeDashboardLabel(item.notificationStatus)}
                    </Badge>
                  ) : null}
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
