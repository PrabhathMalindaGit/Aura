import { useState } from 'react';
import type { AlertItem } from '../../types/models';
import type { SeenAlertMap } from '../../services/seenStore';
import { isAlertUnseenForUi } from '../../utils/seen';
import { formatRiskLabel, getEffectiveRisk, riskBadgeVariant } from '../../utils/risk';
import {
  NOTIFICATION_RETRY_ENABLED,
  resolveNotificationStatus,
  shouldShowNotificationRetry,
} from '../../utils/notification';
import { AssignmentActions } from './AssignmentActions';
import { AssignmentChip } from './AssignmentChip';
import { NotificationStatusBadge } from './NotificationStatusBadge';
import { OverrideChip } from './OverrideChip';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { formatExactTime, formatRelativeTime } from '../../utils/time';
import { cn } from '../../utils/cn';

interface AlertCardListProps {
  alerts: AlertItem[];
  seenAlertMap: SeenAlertMap;
  highlightedAlertIds: string[];
  clinicianId: string;
  mutationPending: boolean;
  assignmentPending: boolean;
  onOpen: (alert: AlertItem, triggerElement?: HTMLElement | null) => void;
  onAssignToMe: (alert: AlertItem) => void | Promise<void>;
  onTakeOver: (alert: AlertItem) => void | Promise<void>;
  onAcknowledge: (alert: AlertItem) => void;
  onResolve: (alert: AlertItem) => void;
}

function asReasonText(reason: string | string[]): string {
  return Array.isArray(reason) ? reason.join(', ') : reason;
}

function statusBadgeVariant(
  status: AlertItem['status'],
): 'status-open' | 'status-ack' | 'status-resolved' {
  if (status === 'acknowledged') {
    return 'status-ack';
  }

  if (status === 'resolved') {
    return 'status-resolved';
  }

  return 'status-open';
}

function notificationSupportLabel(status: AlertItem['notificationStatus']): string {
  const normalized = resolveNotificationStatus(status);

  if (normalized === 'sent') {
    return 'Callback recorded';
  }

  if (normalized === 'failed') {
    return 'Retry may be needed';
  }

  if (normalized === 'skipped') {
    return 'Delivery skipped';
  }

  return 'Awaiting delivery signal';
}

export function AlertCardList({
  alerts,
  seenAlertMap,
  highlightedAlertIds,
  clinicianId,
  mutationPending,
  assignmentPending,
  onOpen,
  onAssignToMe,
  onTakeOver,
  onAcknowledge,
  onResolve,
}: AlertCardListProps): JSX.Element {
  const [expandedReasonByAlertId, setExpandedReasonByAlertId] = useState<Record<string, boolean>>({});

  return (
    <div className="alerts-card-list" aria-label="Alerts card list">
      {alerts.map((alert) => {
        const reasonText = asReasonText(alert.reason);
        const unseen = isAlertUnseenForUi(alert, seenAlertMap);
        const assignedToOther = Boolean(alert.assignedTo && alert.assignedTo !== clinicianId);
        const effectiveRisk = getEffectiveRisk(alert);
        const showRetry = shouldShowNotificationRetry(alert.notificationStatus);
        const isReasonExpanded = Boolean(expandedReasonByAlertId[alert._id]);
        const showReasonToggle = reasonText.length > 120;

        return (
          <Card
            key={alert._id}
            title={null}
            className={cn(
              'alerts-card-list__card',
              unseen && 'alerts-card-list__card--unseen',
              effectiveRisk === 'high' && 'alerts-card-list__card--high-risk',
              highlightedAlertIds.includes(alert._id) && 'alert-arrived',
            )}
            aria-label={`Alert ${alert._id} for patient ${alert.patientId}`}
            data-testid={`alert-card-${alert._id}`}
          >
            <div className="alerts-card-list__body">
              <div className="alerts-card-list__top">
                <div className="alerts-card-list__patient-group">
                  <strong className="alerts-card-list__patient patient-id-text">
                    Patient {alert.patientId}
                  </strong>
                  <span className="muted-text alerts-card-list__meta-line">Alert {alert._id}</span>
                  <span className="muted-text alerts-card-list__meta-line">
                    Created{' '}
                    <time dateTime={alert.createdAt} title={formatExactTime(alert.createdAt)}>
                      {formatRelativeTime(alert.createdAt)}
                    </time>
                  </span>
                </div>
                <div className="alerts-card-list__top-badges">
                  {unseen ? (
                    <Badge className="alerts-unseen-badge" variant="new" icon aria-label="Unseen alert">
                      Unseen
                    </Badge>
                  ) : (
                    <span className="alerts-seen alerts-seen--quiet">Seen</span>
                  )}
                  <Badge className="alerts-status-badge" variant={statusBadgeVariant(alert.status)} icon>
                    {alert.status}
                  </Badge>
                </div>
              </div>

              <div className="alerts-card-list__middle">
                <p
                  className={cn(
                    'alerts-card-list__reason',
                    !isReasonExpanded && 'alerts-card-list__reason--clamped',
                  )}
                >
                  {reasonText}
                </p>
                {showReasonToggle ? (
                  <Button
                    variant="ghost"
                    className="alerts-card-list__reason-toggle"
                    onClick={() =>
                      setExpandedReasonByAlertId((current) => ({
                        ...current,
                        [alert._id]: !isReasonExpanded,
                      }))
                    }
                  >
                    {isReasonExpanded ? 'Show less' : 'Show more'}
                  </Button>
                ) : null}

                <div className="alerts-card-list__meta">
                  <div className="alerts-card-list__meta-primary">
                    <Badge className="alerts-risk-badge" variant={riskBadgeVariant(effectiveRisk)}>
                      {formatRiskLabel(effectiveRisk)}
                    </Badge>
                    <OverrideChip alert={alert} />
                    <AssignmentChip alert={alert} clinicianId={clinicianId} />
                  </div>
                  <div className="alerts-card-list__meta-secondary">
                    <span className="alerts-source-pill alerts-source-pill--row">{alert.source.type}</span>
                    <span className="alerts-card-list__source-id">{alert.source.sourceId}</span>
                  </div>
                </div>

                <div className="alerts-card-list__notification">
                  <NotificationStatusBadge className="alerts-notification-badge" status={alert.notificationStatus} />
                  <span className="alerts-card-list__notification-meta">
                    {notificationSupportLabel(alert.notificationStatus)}
                  </span>
                  {showRetry ? (
                    <Button
                      className="alerts-notification-retry"
                      variant="ghost"
                      disabled={!NOTIFICATION_RETRY_ENABLED}
                      title={!NOTIFICATION_RETRY_ENABLED ? 'Retry requires backend endpoint' : undefined}
                    >
                      Retry
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="alerts-actions alerts-actions--stack alerts-card-list__actions">
                <div className="alerts-card-list__actions-primary">
                  <Button
                    className="alerts-actions__open"
                    variant="ghost"
                    data-testid={`alert-open-${alert._id}`}
                    onClick={(event) => onOpen(alert, event.currentTarget)}
                    fullWidth
                  >
                    Open
                  </Button>
                  <AssignmentActions
                    alert={alert}
                    clinicianId={clinicianId}
                    busy={assignmentPending}
                    fullWidth
                    onAssignToMe={onAssignToMe}
                    onTakeOver={onTakeOver}
                  />
                </div>
                <div className="alerts-card-list__actions-secondary">
                  <Button
                    className="alerts-actions__ack"
                    variant="secondary"
                    disabled={alert.status !== 'open' || mutationPending || assignedToOther}
                    onClick={() => onAcknowledge(alert)}
                    fullWidth
                  >
                    Ack
                  </Button>
                  <Button
                    className="alerts-actions__resolve"
                    variant="danger"
                    disabled={alert.status === 'resolved' || mutationPending || assignedToOther}
                    onClick={() => onResolve(alert)}
                    fullWidth
                  >
                    Resolve
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
