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
            <th scope="col" className="alerts-table__head alerts-table__head--unseen">
              Unseen
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--created">
              Created
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--patient">
              Patient
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--reason">
              Reason
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--source">
              Source
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--risk">
              Risk
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--status">
              Status
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--assignment">
              Assignment
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--notification">
              Notification
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--actions">
              Actions
            </th>
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
                  assignedToOther && 'alerts-table__row--assigned-other',
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
                <td className="alerts-table__cell alerts-table__cell--unseen">
                  {unseen ? (
                    <Badge className="alerts-unseen-badge" variant="new" icon aria-label="Unseen alert">
                      Unseen
                    </Badge>
                  ) : (
                    <span className="alerts-seen alerts-seen--quiet">Seen</span>
                  )}
                </td>
                <td className="alerts-table__cell alerts-table__cell--created">
                  <time className="alerts-table__created-time" dateTime={alert.createdAt} title={formatExactTime(alert.createdAt)}>
                    {formatRelativeTime(alert.createdAt)}
                  </time>
                </td>
                <td className="alerts-table__cell alerts-table__cell--patient">
                  <div className="alerts-patient-cell">
                    <span className="patient-id-text alerts-patient-cell__id">{alert.patientId}</span>
                    <span className="alerts-patient-cell__meta">Alert {alert._id}</span>
                  </div>
                </td>
                <td className="alerts-table__cell alerts-table__cell--reason alerts-table__reason" title={reasonText}>
                  {reasonText}
                </td>
                <td className="alerts-table__cell alerts-table__cell--source">
                  <span className="alerts-source-pill alerts-source-pill--row">
                    {alert.source.type} • {alert.source.sourceId}
                  </span>
                </td>
                <td className="alerts-table__cell alerts-table__cell--risk">
                  <div className="alerts-risk-cell">
                    <Badge className="alerts-risk-badge" variant={riskBadgeVariant(effectiveRisk)}>
                      {formatRiskLabel(effectiveRisk)}
                    </Badge>
                    <OverrideChip alert={alert} />
                  </div>
                </td>
                <td className="alerts-table__cell alerts-table__cell--status">
                  <Badge className="alerts-status-badge" variant={statusBadgeVariant(alert.status)} icon>
                    {alert.status}
                  </Badge>
                </td>
                <td className="alerts-table__cell alerts-table__cell--assignment">
                  <AssignmentChip alert={alert} clinicianId={clinicianId} />
                </td>
                <td className="alerts-table__cell alerts-table__cell--notification">
                  <div className="alerts-notification-cell">
                    <NotificationStatusBadge className="alerts-notification-badge" status={alert.notificationStatus} />
                    {showRetry ? (
                      <Button
                        className="alerts-notification-retry"
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
                <td className="alerts-table__cell alerts-table__cell--actions">
                  <div
                    className="alerts-actions"
                    onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
                  >
                    <Button
                      className="alerts-actions__open"
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
                      className="alerts-actions__ack"
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
                      className="alerts-actions__resolve"
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
