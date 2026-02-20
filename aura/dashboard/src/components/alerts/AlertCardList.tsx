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

interface AlertCardListProps {
  alerts: AlertItem[];
  seenAlertMap: SeenAlertMap;
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

function statusBadgeVariant(status: AlertItem['status']): 'default' | 'warning' | 'success' {
  if (status === 'acknowledged') {
    return 'warning';
  }

  if (status === 'resolved') {
    return 'success';
  }

  return 'default';
}

export function AlertCardList({
  alerts,
  seenAlertMap,
  clinicianId,
  mutationPending,
  assignmentPending,
  onOpen,
  onAssignToMe,
  onTakeOver,
  onAcknowledge,
  onResolve,
}: AlertCardListProps): JSX.Element {
  return (
    <div className="alerts-card-list" aria-label="Alerts card list">
      {alerts.map((alert) => {
        const reasonText = asReasonText(alert.reason);
        const unseen = isAlertUnseenForUi(alert, seenAlertMap);
        const assignedToOther = Boolean(alert.assignedTo && alert.assignedTo !== clinicianId);
        const effectiveRisk = getEffectiveRisk(alert);
        const showRetry = shouldShowNotificationRetry(alert.notificationStatus);

        return (
          <Card key={alert._id} title={alert._id}>
            <div className="alerts-card-list__body">
              <p>
                <strong>Patient:</strong> {alert.patientId}
              </p>
              <p>
                <strong>Reason:</strong> {reasonText}
              </p>
              <p>
                <strong>Source:</strong> {alert.source.type} ({alert.source.sourceId})
              </p>
              <p>
                <strong>Risk:</strong>{' '}
                <Badge variant={riskBadgeVariant(effectiveRisk)}>
                  {formatRiskLabel(effectiveRisk)}
                </Badge>
              </p>
              <p>
                <strong>Created:</strong>{' '}
                <time dateTime={alert.createdAt} title={formatExactTime(alert.createdAt)}>
                  {formatRelativeTime(alert.createdAt)}
                </time>
              </p>
              <div className="alerts-card-list__notification">
                <strong>Notification:</strong>
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
              </div>
              <div className="alerts-card-list__meta">
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
                <OverrideChip alert={alert} />
                <AssignmentChip alert={alert} clinicianId={clinicianId} />
              </div>
              <div className="alerts-actions alerts-actions--stack">
                <Button
                  variant="ghost"
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
