import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import type { DashboardCommunicationOverviewItem } from '../../types/models';
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../../utils/dashboard';

interface PatientCommunicationPanelProps {
  items: DashboardCommunicationOverviewItem[];
  isLoading?: boolean;
  error?: string | null;
  onRetry: () => void;
  onOpenCommunication: () => void;
  onOpenAlerts: () => void;
  showQuickReply?: boolean;
  quickReplyBlockedBySafety?: boolean;
  quickReplyValue?: string;
  onQuickReplyChange?: (value: string) => void;
  onSendQuickReply?: () => void;
  latestLocalReply?: {
    text: string;
    occurredAt: string;
  } | null;
}

export function PatientCommunicationPanel({
  items,
  isLoading = false,
  error,
  onRetry,
  onOpenCommunication,
  onOpenAlerts,
  showQuickReply = false,
  quickReplyBlockedBySafety = false,
  quickReplyValue = '',
  onQuickReplyChange,
  onSendQuickReply,
  latestLocalReply = null,
}: PatientCommunicationPanelProps): JSX.Element {
  return (
    <Card
      id="patient-communication-panel"
      className="patient-detail-panel patient-detail-panel--operational"
      title="Patient communication"
      action={
        <div className="patient-detail-actions">
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={onOpenCommunication}>
            Open communication
          </Button>
        </div>
      }
      data-testid="patient-communication-panel"
    >
      {isLoading ? (
        <div className="patient-detail-skeleton-grid" aria-label="Patient communication loading placeholder">
          <Skeleton height={44} />
          <Skeleton height={68} />
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
          title="No recent communication needing follow-up"
          description="Messages that need clinician attention will appear here."
          tone="success"
        />
      ) : (
        <div className="patient-communication-list">
          {items.map((item) => (
            <article key={item.id} className="patient-communication-item">
              <div className="patient-communication-item__meta">
                <Badge variant={item.flaggedBySafety ? 'danger' : 'warning'}>
                  {item.flaggedBySafety ? 'Safety flagged' : 'Needs response'}
                </Badge>
                {item.followUpRequested ? <Badge variant="neutral">Follow-up requested</Badge> : null}
                {item.linkedTaskId ? <Badge variant="default">Task linked</Badge> : null}
              </div>
              <p className="patient-communication-item__preview">
                {item.messagePreview?.trim() || 'Recent patient communication is waiting for review.'}
              </p>
              <div className="patient-communication-item__footer">
                <span className="muted-text" title={formatDashboardDateTime(item.messageCreatedAt)}>
                  {formatDashboardRelativeTime(item.messageCreatedAt)}
                </span>
                <div className="patient-communication-item__actions">
                  <Button variant="secondary" size="sm" onClick={onOpenCommunication}>
                    Open communication
                  </Button>
                  {item.flaggedBySafety ? (
                    <Button variant="ghost" size="sm" onClick={onOpenAlerts}>
                      Open alerts
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}

          {quickReplyBlockedBySafety ? (
            <div className="patient-communication-inline-state" role="status">
              <p className="patient-communication-inline-state__title">Safety-sensitive communication stays on handoff review.</p>
              <p className="patient-communication-inline-state__copy">
                Continue in Communication or Alerts to review the full context before responding.
              </p>
            </div>
          ) : null}

          {!quickReplyBlockedBySafety && latestLocalReply ? (
            <article className="patient-communication-local-reply" aria-label="Latest local clinician reply">
              <div className="patient-communication-local-reply__meta">
                <Badge variant="default">Local clinician reply</Badge>
                <span className="muted-text" title={formatDashboardDateTime(latestLocalReply.occurredAt)}>
                  {formatDashboardRelativeTime(latestLocalReply.occurredAt)}
                </span>
              </div>
              <p className="patient-communication-local-reply__preview">{latestLocalReply.text}</p>
            </article>
          ) : null}

          {showQuickReply && onQuickReplyChange && onSendQuickReply ? (
            <div className="patient-communication-quick-reply">
              <label className="form-field patient-communication-quick-reply__field">
                <span>Quick reply</span>
                <textarea
                  rows={3}
                  value={quickReplyValue}
                  onChange={(event) => onQuickReplyChange(event.target.value)}
                  placeholder="Add a short clinician follow-up for this patient."
                />
              </label>
              <div className="patient-communication-quick-reply__footer">
                <p className="patient-communication-quick-reply__note">
                  Stored locally for this clinician in this browser during this communication pass.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onSendQuickReply}
                  disabled={quickReplyValue.trim().length === 0}
                >
                  Send quick reply
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
