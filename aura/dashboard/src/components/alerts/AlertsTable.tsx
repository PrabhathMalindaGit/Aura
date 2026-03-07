import type { KeyboardEvent, MouseEvent } from 'react';
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
import { formatExactTime, formatRelativeTime } from '../../utils/time';
import { cn } from '../../utils/cn';

interface AlertsTableProps {
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

function moveFocusToRow(
  event: KeyboardEvent<HTMLTableRowElement>,
  direction: 'next' | 'prev',
): void {
  const current = event.currentTarget;
  const index = Number(current.dataset.rowIndex ?? '0');
  const nextIndex = direction === 'next' ? index + 1 : index - 1;
  const container = current.closest('tbody');
  const nextRow = container?.querySelector<HTMLTableRowElement>(`tr[data-row-index="${nextIndex}"]`);

  if (nextRow) {
    event.preventDefault();
    nextRow.focus();
  }
}

export function AlertsTable({
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
}: AlertsTableProps): JSX.Element {
  return (
    <div className="alerts-table-wrap" role="region" aria-label="Alerts queue table">
      <table className="alerts-table">
        <thead>
          <tr>
            <th scope="col">Unseen</th>
            <th scope="col">Created</th>
            <th scope="col">Patient</th>
            <th scope="col">Reason</th>
            <th scope="col">Source</th>
            <th scope="col">Risk</th>
            <th scope="col">Status</th>
            <th scope="col">Assignment</th>
            <th scope="col">Notification</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert, index) => {
            const unseen = isAlertUnseenForUi(alert, seenAlertMap);
            const reasonText = asReasonText(alert.reason);
            const assignedToOther = Boolean(alert.assignedTo && alert.assignedTo !== clinicianId);
            const effectiveRisk = getEffectiveRisk(alert);
            const showRetry = shouldShowNotificationRetry(alert.notificationStatus);

            return (
              <tr
                key={alert._id}
                data-row-index={index}
                data-testid={`alert-row-${alert._id}`}
                tabIndex={0}
                className={cn(
                  'alerts-table__row',
                  unseen && 'alerts-table__row--unseen',
                  effectiveRisk === 'high' && 'alerts-table__row--high-risk',
                  highlightedAlertIds.includes(alert._id) && 'alert-arrived',
                )}
                onClick={(event) => onOpen(alert, event.currentTarget)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    moveFocusToRow(event, 'next');
                    return;
                  }

                  if (event.key === 'ArrowUp') {
                    moveFocusToRow(event, 'prev');
                    return;
                  }

                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpen(alert, event.currentTarget);
                    return;
                  }

                  if (event.key.toLowerCase() === 'a' && alert.status === 'open') {
                    event.preventDefault();
                    if (!assignedToOther) {
                      onAcknowledge(alert);
                    }
                  }
                }}
                aria-label={`Alert ${alert._id} for patient ${alert.patientId}`}
              >
                <td>
                  {unseen ? (
                    <Badge variant="new" icon aria-label="Unseen alert">
                      Unseen
                    </Badge>
                  ) : (
                    <span className="alerts-seen">Seen</span>
                  )}
                </td>
                <td>
                  <time dateTime={alert.createdAt} title={formatExactTime(alert.createdAt)}>
                    {formatRelativeTime(alert.createdAt)}
                  </time>
                </td>
                <td>
                  <div className="alerts-patient-cell">
                    <span className="patient-id-text alerts-patient-cell__id">{alert.patientId}</span>
                    <span className="alerts-patient-cell__meta">Alert {alert._id}</span>
                  </div>
                </td>
                <td className="alerts-table__reason" title={reasonText}>
                  {reasonText}
                </td>
                <td>
                  <span className="alerts-source-pill">
                    {alert.source.type} • {alert.source.sourceId}
                  </span>
                </td>
                <td>
                  <div className="alerts-risk-cell">
                    <Badge variant={riskBadgeVariant(effectiveRisk)}>
                      {formatRiskLabel(effectiveRisk)}
                    </Badge>
                    <OverrideChip alert={alert} />
                  </div>
                </td>
                <td>
                  <Badge variant={statusBadgeVariant(alert.status)} icon>
                    {alert.status}
                  </Badge>
                </td>
                <td>
                  <AssignmentChip alert={alert} clinicianId={clinicianId} />
                </td>
                <td>
                  <div className="alerts-notification-cell">
                    <NotificationStatusBadge status={alert.notificationStatus} />
                    {showRetry ? (
                      <Button
                        variant="ghost"
                        disabled={!NOTIFICATION_RETRY_ENABLED}
                        title={!NOTIFICATION_RETRY_ENABLED ? 'Retry requires backend endpoint' : undefined}
                        aria-label={`Retry notification for alert ${alert._id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </td>
                <td>
                  <div
                    className="alerts-actions"
                    onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      data-testid={`alert-open-${alert._id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(alert, event.currentTarget);
                      }}
                    >
                      Open
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={alert.status !== 'open' || mutationPending || assignedToOther}
                      onClick={(event) => {
                        event.stopPropagation();
                        onAcknowledge(alert);
                      }}
                    >
                      Ack
                    </Button>
                    <Button
                      variant="danger"
                      disabled={alert.status === 'resolved' || mutationPending || assignedToOther}
                      onClick={(event) => {
                        event.stopPropagation();
                        onResolve(alert);
                      }}
                    >
                      Resolve
                    </Button>
                    <AssignmentActions
                      alert={alert}
                      clinicianId={clinicianId}
                      busy={assignmentPending}
                      onAssignToMe={onAssignToMe}
                      onTakeOver={onTakeOver}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
