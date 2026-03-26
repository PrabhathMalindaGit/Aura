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
  visibleItemCount?: number;
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

function timelineSupportLine(item: DashboardSafetyEvent): string {
  if (item.notificationStatus) {
    return 'Notification activity recorded';
  }

  if (item.alertStatus) {
    return 'Alert state updated';
  }

  return 'Safety event recorded';
}

function timelineTags(item: DashboardSafetyEvent): string[] {
  const tags: string[] = [];

  if (item.notificationStatus && item.alertStatus) {
    tags.push(humanizeDashboardLabel(item.alertStatus));
  }

  return tags;
}

export function RecentSafetyEventsModule({
  items,
  visibleItemCount,
  loading,
  hasError,
  onRetry,
  retrying = false,
  resolvePatientLabel,
  onOpenAlerts,
}: RecentSafetyEventsModuleProps): JSX.Element {
  const visibleItems = visibleItemCount ? items.slice(0, visibleItemCount) : items;
  const alertEventsCount = items.filter((item) => item.alertStatus).length;
  const notificationEventsCount = items.filter((item) => item.notificationStatus).length;

  return (
    <Card
      className="dashboard-module-card dashboard-safety-card"
      title={
        <span className="dashboard-widget-heading dashboard-widget-heading--safety">
          <span className="dashboard-widget-heading__eyebrow">Safety feed</span>
          <span className="dashboard-module-card__title-row">
            <span className="dashboard-module-card__title">
              Recent safety events
              <span className="dashboard-module-card__count">{items.length}</span>
            </span>
          </span>
          <span className="dashboard-widget-heading__copy">
            Latest alert and notification movement.
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
          <div className="dashboard-module-inline-stats dashboard-module-inline-stats--timeline" aria-label="Recent safety event summary">
            <span className="dashboard-module-inline-stat dashboard-module-inline-stat--risk">
              <strong>{alertEventsCount}</strong>
              <span>alert events</span>
            </span>
            <span className="dashboard-module-inline-stat dashboard-module-inline-stat--primary">
              <strong>{notificationEventsCount}</strong>
              <span>notification updates</span>
            </span>
          </div>

          <div className="dashboard-safety-feed" role="list">
            {visibleItems.map((item) => {
              const streamLabel = eventStreamLabel(item);
              const supportingTags = timelineTags(item);
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
                  className={`dashboard-safety-feed__item dashboard-safety-feed__item--${timelineTone(item)}`}
                  role="listitem"
                >
                  <div className="dashboard-safety-feed__rail" aria-hidden="true">
                    <div className="dashboard-safety-feed__dot" />
                  </div>
                  <div className="dashboard-safety-feed__content">
                    <div className="dashboard-safety-feed__top">
                      <div className="dashboard-safety-feed__patient-block">
                        <span className="dashboard-safety-feed__patient">{resolvePatientLabel(item.patientId)}</span>
                        <span className="dashboard-safety-feed__kind">{streamLabel}</span>
                      </div>
                      <span
                        className="dashboard-safety-feed__freshness"
                        title={formatDashboardDateTime(item.createdAt)}
                      >
                        {formatDashboardRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    <div className="dashboard-safety-feed__title-row">
                      <h3 className="dashboard-safety-feed__title">{humanizeDashboardLabel(item.type)}</h3>
                      {primaryBadge}
                    </div>

                    <p className="dashboard-safety-feed__summary">{item.summary}</p>

                    <div className="dashboard-safety-feed__facts">
                        <span>{timelineSupportLine(item)}</span>
                        {supportingTags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                        <span>{formatDashboardDateTime(item.createdAt)}</span>
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
