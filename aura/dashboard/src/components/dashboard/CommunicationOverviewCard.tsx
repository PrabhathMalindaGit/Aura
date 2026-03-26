import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { DashboardModuleState } from './DashboardModuleState';
import type { DashboardCommunicationOverview } from '../../types/models';
import {
  formatDashboardDateTime,
  formatDashboardRelativeTime,
} from '../../utils/dashboard';

interface CommunicationOverviewCardProps {
  overview?: DashboardCommunicationOverview;
  visibleItemCount?: number;
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
  retrying?: boolean;
  onOpenThread: (patientId: string) => void;
  onOpenCommunication: () => void;
}

function communicationToneClass(item: DashboardCommunicationOverview['items'][number]): string {
  if (item.flaggedBySafety) {
    return 'danger';
  }

  if (item.needsResponse) {
    return 'warning';
  }

  return 'neutral';
}

export function CommunicationOverviewCard({
  overview,
  visibleItemCount,
  loading,
  hasError,
  onRetry,
  retrying = false,
  onOpenThread,
  onOpenCommunication,
}: CommunicationOverviewCardProps): JSX.Element {
  const items = overview?.items ?? [];
  const visibleItems = visibleItemCount ? items.slice(0, visibleItemCount) : items;
  const counts = overview?.counts;
  const communicationNeedsAttention = Boolean(
    (counts?.flaggedBySafetyCount ?? 0) > 0 || (counts?.needsResponseCount ?? 0) > 0,
  );

  return (
    <Card
      className={`dashboard-module-card dashboard-communication-card${
        communicationNeedsAttention ? ' dashboard-communication-card--attention' : ''
      }`}
      title={
        <span className="dashboard-widget-heading dashboard-widget-heading--communication">
          <span className="dashboard-widget-heading__eyebrow">Inbox review</span>
          <span className="dashboard-module-card__title-row">
            <span className="dashboard-module-card__title">
              Communication review
              <span className="dashboard-module-card__count">{counts?.needsResponseCount ?? items.length}</span>
            </span>
          </span>
          <span className="dashboard-widget-heading__copy">
            Messages waiting for clinician review or response.
          </span>
        </span>
      }
      action={
        <div className="dashboard-module-card__action-shell">
          <Button variant="ghost" size="sm" onClick={onOpenCommunication}>
            Open communication
          </Button>
        </div>
      }
    >
      {loading && items.length === 0 ? (
        <DashboardModuleState mode="loading" lines={3} />
      ) : hasError && items.length === 0 ? (
        <DashboardModuleState
          mode="error"
          title="Unable to load communication review"
          description="Messages needing clinician follow-up could not be loaded."
          onRetry={onRetry}
          retrying={retrying}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No communication waiting"
          description="Patient messages that need clinician follow-up will appear here."
          tone="success"
        />
      ) : (
        <div className="dashboard-communication-card__content">
          {counts ? (
            <div className="dashboard-module-inline-stats dashboard-module-inline-stats--communication" aria-label="Communication overview counts">
              <span className="dashboard-module-inline-stat dashboard-module-inline-stat--warning">
                <strong>{counts.needsResponseCount}</strong>
                <span>need response</span>
              </span>
              <span className="dashboard-module-inline-stat dashboard-module-inline-stat--risk">
                <strong>{counts.flaggedBySafetyCount}</strong>
                <span>safety flagged</span>
              </span>
              <span className="dashboard-module-inline-stat dashboard-module-inline-stat--primary">
                <strong>{counts.followUpRequestedCount}</strong>
                <span>follow-up requested</span>
              </span>
            </div>
          ) : null}

          <div className="dashboard-side-widget__list dashboard-side-widget__list--communication" role="list">
            {visibleItems.map((item) => (
              <article
                key={item.id}
                className={`dashboard-side-widget__item dashboard-side-widget__item--communication dashboard-side-widget__item--${communicationToneClass(
                  item,
                )}`}
                role="listitem"
              >
                <div className="dashboard-side-widget__body">
                  <div className="dashboard-side-widget__top">
                    <span className="dashboard-side-widget__eyebrow">Latest patient message</span>
                    <span className="dashboard-side-widget__freshness" title={formatDashboardDateTime(item.messageCreatedAt)}>
                      {formatDashboardRelativeTime(item.messageCreatedAt)}
                    </span>
                  </div>
                  <div className="dashboard-side-widget__title-row">
                    <h3 className="dashboard-side-widget__title">{item.patientName}</h3>
                    {item.flaggedBySafety ? <Badge variant="risk-high">Safety flagged</Badge> : <Badge variant="warning">Needs response</Badge>}
                  </div>
                  <p className="dashboard-side-widget__copy">
                    {item.messagePreview?.trim() || 'Conversation preview unavailable.'}
                  </p>
                  <div className="dashboard-side-widget__footer">
                    <div className="dashboard-side-widget__meta">
                      <span>Needs clinician response</span>
                      {item.followUpRequested ? <span>Follow-up requested</span> : null}
                      {item.linkedTaskId ? <span>Task linked</span> : null}
                      <span>Received {formatDashboardDateTime(item.messageCreatedAt)}</span>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => onOpenThread(item.patientId)}>
                      Open thread
                    </Button>
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
