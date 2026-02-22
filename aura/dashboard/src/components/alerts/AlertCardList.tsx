import { useState } from 'react';
import type { AlertItem } from '../../types/models';
import type { SeenAlertMap } from '../../services/seenStore';
import { isAlertUnseenForUi } from '../../utils/seen';
import { formatRiskLabel, getEffectiveRisk, riskBadgeVariant } from '../../utils/risk';
import {
  NOTIFICATION_RETRY_ENABLED,
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
                  <span className="muted-text">Alert {alert._id}</span>
                </div>
                <div className="alerts-card-list__top-badges">
                  {unseen ? (
                    <Badge variant="new" icon aria-label="Unseen alert">
                      Unseen
                    </Badge>
                  ) : (
                    <span className="alerts-seen">Seen</span>
                  )}
                  <Badge variant={statusBadgeVariant(alert.status)} icon>
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
                  <span className="alerts-source-pill">
                    {alert.source.type} • {alert.source.sourceId}
                  </span>
                  <Badge variant={riskBadgeVariant(effectiveRisk)}>{formatRiskLabel(effectiveRisk)}</Badge>
                  <OverrideChip alert={alert} />
                  <AssignmentChip alert={alert} clinicianId={clinicianId} />
                </div>

                <div className="alerts-card-list__notification">
                  <NotificationStatusBadge status={alert.notificationStatus} />
                  {showRetry ? (
                    <Button
                      variant="ghost"
                      disabled={!NOTIFICATION_RETRY_ENABLED}
                      title={!NOTIFICATION_RETRY_ENABLED ? 'Retry requires backend endpoint' : undefined}
                    >
                      Retry
                    </Button>
                  ) : null}
                  <span className="muted-text">
                    Created{' '}
                    <time dateTime={alert.createdAt} title={formatExactTime(alert.createdAt)}>
                      {formatRelativeTime(alert.createdAt)}
                    </time>
                  </span>
                </div>
              </div>

              <div className="alerts-actions alerts-actions--stack alerts-card-list__actions">
                <Button
                  variant="ghost"
                  data-testid={`alert-open-${alert._id}`}
                  onClick={(event) => onOpen(alert, event.currentTarget)}
                  fullWidth
                >
                  Open
                </Button>
                <Button
                  variant="secondary"
                  disabled={alert.status !== 'open' || mutationPending || assignedToOther}
                  onClick={() => onAcknowledge(alert)}
                  fullWidth
                >
                  Ack
                </Button>
                <Button
                  variant="danger"
                  disabled={alert.status === 'resolved' || mutationPending || assignedToOther}
                  onClick={() => onResolve(alert)}
                  fullWidth
                >
                  Resolve
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
            </div>
          </Card>
        );
      })}
    </div>
  );
}
