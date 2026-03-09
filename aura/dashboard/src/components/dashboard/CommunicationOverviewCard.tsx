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
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
  retrying?: boolean;
  onOpenPatient: (patientId: string) => void;
  onOpenPatients: () => void;
}

export function CommunicationOverviewCard({
  overview,
  loading,
  hasError,
  onRetry,
  retrying = false,
  onOpenPatient,
  onOpenPatients,
}: CommunicationOverviewCardProps): JSX.Element {
  const items = overview?.items ?? [];
  const counts = overview?.counts;

  return (
    <Card
      className="dashboard-module-card dashboard-communication-card"
      title={
        <span className="dashboard-module-card__title">
          Communication review
          <span className="dashboard-module-card__count">{counts?.needsResponseCount ?? items.length}</span>
        </span>
      }
      action={
        <Button variant="ghost" size="sm" onClick={onOpenPatients}>
          Open patients
        </Button>
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
            <div className="dashboard-communication-card__summary" aria-label="Communication overview counts">
              <div className="dashboard-communication-card__metric">
                <span className="dashboard-communication-card__metric-label">Needs response</span>
                <strong className="dashboard-communication-card__metric-value">{counts.needsResponseCount}</strong>
              </div>
              <div className="dashboard-communication-card__metric">
                <span className="dashboard-communication-card__metric-label">Safety flagged</span>
                <strong className="dashboard-communication-card__metric-value">{counts.flaggedBySafetyCount}</strong>
              </div>
              <div className="dashboard-communication-card__metric">
                <span className="dashboard-communication-card__metric-label">Follow-up requested</span>
                <strong className="dashboard-communication-card__metric-value">{counts.followUpRequestedCount}</strong>
              </div>
            </div>
          ) : null}

          <div className="dashboard-list" role="list">
            {items.map((item) => (
              <article key={item.id} className="dashboard-list-item" role="listitem">
                <div className="dashboard-list-item__content">
                  <div className="dashboard-list-item__eyebrow">
                    <span className="dashboard-list-item__patient">{item.patientName}</span>
                    <span className="dashboard-list-item__timestamp" title={formatDashboardDateTime(item.messageCreatedAt)}>
                      {formatDashboardRelativeTime(item.messageCreatedAt)}
                    </span>
                  </div>
                  <div className="dashboard-list-item__title-row">
                    <h3 className="dashboard-list-item__title">Needs clinician response</h3>
                    {item.flaggedBySafety ? <Badge variant="risk-high">Safety flagged</Badge> : <Badge variant="warning">Review</Badge>}
                  </div>
                  <p className="dashboard-list-item__description">
                    {item.messagePreview?.trim() || 'Conversation preview unavailable.'}
                  </p>
                  <div className="dashboard-list-item__meta">
                    {item.followUpRequested ? <span>Follow-up requested</span> : null}
                    {item.linkedTaskId ? <span>Task linked</span> : null}
                  </div>
                </div>
                <div className="dashboard-list-item__action">
                  <Button variant="secondary" size="sm" onClick={() => onOpenPatient(item.patientId)}>
                    Open patient
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
