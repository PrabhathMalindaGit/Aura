import type { KeyboardEvent, MouseEvent } from 'react';
import type { AlertItem } from '../../types/models';
import type { SeenAlertMap } from '../../services/seenStore';
import { isAlertUnseenForUi } from '../../utils/seen';
import { formatRiskLabel, getEffectiveRisk, hasRiskOverride, riskBadgeVariant } from '../../utils/risk';
import {
  alertSourceLabel,
  alertStatusLabel,
  resolveNotificationStatus,
  shortReferenceLabel,
} from '../../utils/notification';
import { AssignmentActions } from './AssignmentActions';
import { AssignmentChip } from './AssignmentChip';
import { NotificationStatusBadge } from './NotificationStatusBadge';
import { OverrideChip } from './OverrideChip';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { formatExactTime, formatRelativeTime } from '../../utils/time';
import { cn } from '../../utils/cn';

const HOURS_24_MS = 24 * 60 * 60 * 1000;

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

function patientAnchorLabel(patientId: string): string {
  const compact = patientId.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return compact.slice(-3) || 'PT';
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

function statusSupportLabel(status: AlertItem['status']): string {
  if (status === 'acknowledged') {
    return 'In review';
  }

  if (status === 'resolved') {
    return 'Closed';
  }

  return 'Needs action';
}

function assignmentSupportLabel(alert: AlertItem, clinicianId: string): string {
  if (!alert.assignedTo) {
    return 'Needs owner';
  }

  if (alert.assignedTo === clinicianId) {
    return 'Current owner';
  }

  return 'Owned elsewhere';
}

function notificationSupportLabel(status: AlertItem['notificationStatus']): string {
  const normalized = resolveNotificationStatus(status);

  if (normalized === 'sent') {
    return 'Delivery recorded';
  }

  if (normalized === 'failed') {
    return 'Retry may be needed';
  }

  if (normalized === 'skipped') {
    return 'Delivery skipped';
  }

  return 'Delivery state not yet reported';
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
              New
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--patient">
              Patient
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--reason">
              Attention
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--risk">
              Risk
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--assignment">
              Owner
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--created">
              Created
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--source">
              Source
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--status">
              Status
            </th>
            <th scope="col" className="alerts-table__head alerts-table__head--notification">
              Delivery
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
            const notificationStatus = resolveNotificationStatus(alert.notificationStatus);
            const createdAtMs = Date.parse(alert.createdAt);
            const isAged = Number.isFinite(createdAtMs) && Date.now() - createdAtMs > HOURS_24_MS;
            const alertReference = shortReferenceLabel(alert._id);
            const sourceReference = shortReferenceLabel(alert.source.sourceId, 'Source ref');

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
                  alert.assignedTo === clinicianId && 'alerts-table__row--assigned-me',
                  notificationStatus === 'failed' && 'alerts-table__row--delivery-failed',
                  isAged && 'alerts-table__row--aged',
                  hasRiskOverride(alert) && 'alerts-table__row--overridden',
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
                <td className="alerts-table__cell alerts-table__cell--patient">
                  <div className="alerts-patient-cell">
                    <span className="alerts-patient-cell__avatar" aria-hidden="true">
                      {patientAnchorLabel(alert.patientId)}
                    </span>
                    <div className="alerts-patient-cell__copy">
                      <span className="patient-id-text alerts-patient-cell__id">{alert.patientId}</span>
                      <span className="alerts-patient-cell__meta">{alertReference ?? alert._id}</span>
                    </div>
                  </div>
                </td>
                <td className="alerts-table__cell alerts-table__cell--reason" title={reasonText}>
                  <div className="alerts-reason-cell">
                    <p className="alerts-table__reason">{reasonText}</p>
                    <div className="alerts-reason-cell__meta-row">
                      <span className="alerts-reason-cell__meta">{statusSupportLabel(alert.status)}</span>
                      {notificationStatus === 'failed' ? (
                        <span className="alerts-reason-cell__flag alerts-reason-cell__flag--delivery">
                          Delivery issue
                        </span>
                      ) : null}
                      {isAged ? (
                        <span className="alerts-reason-cell__flag alerts-reason-cell__flag--aged">
                          Older than 24h
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="alerts-table__cell alerts-table__cell--risk">
                  <div className="alerts-risk-cell">
                    <Badge className="alerts-risk-badge" variant={riskBadgeVariant(effectiveRisk)}>
                      {formatRiskLabel(effectiveRisk)}
                    </Badge>
                    <OverrideChip alert={alert} />
                  </div>
                </td>
                <td className="alerts-table__cell alerts-table__cell--assignment">
                  <div className="alerts-assignment-cell">
                    <AssignmentChip alert={alert} clinicianId={clinicianId} />
                    <span className="alerts-assignment-cell__meta">
                      {assignmentSupportLabel(alert, clinicianId)}
                    </span>
                  </div>
                </td>
                <td className="alerts-table__cell alerts-table__cell--created">
                  <div className="alerts-time-cell">
                    <time className="alerts-table__created-time" dateTime={alert.createdAt} title={formatExactTime(alert.createdAt)}>
                      {formatRelativeTime(alert.createdAt)}
                    </time>
                    <span className="alerts-time-cell__meta">{formatExactTime(alert.createdAt)}</span>
                  </div>
                </td>
                <td className="alerts-table__cell alerts-table__cell--source">
                  <div className="alerts-source-cell">
                    <span className="alerts-source-pill alerts-source-pill--row">
                      {alertSourceLabel(alert.source.type)}
                    </span>
                    {sourceReference ? <span className="alerts-source-cell__id">{sourceReference}</span> : null}
                  </div>
                </td>
                <td className="alerts-table__cell alerts-table__cell--status">
                  <div className="alerts-status-cell">
                    <Badge className="alerts-status-badge" variant={statusBadgeVariant(alert.status)} icon>
                      {alertStatusLabel(alert.status)}
                    </Badge>
                    <span className="alerts-status-cell__meta">{statusSupportLabel(alert.status)}</span>
                  </div>
                </td>
                <td className="alerts-table__cell alerts-table__cell--notification">
                  <div className="alerts-notification-cell">
                    <NotificationStatusBadge className="alerts-notification-badge" status={alert.notificationStatus} />
                    <span className="alerts-notification-cell__meta">
                      {notificationSupportLabel(alert.notificationStatus)}
                    </span>
                  </div>
                </td>
                <td className="alerts-table__cell alerts-table__cell--actions">
                  <div
                    className="alerts-actions alerts-actions--table"
                    onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
                  >
                    <div className="alerts-actions__primary-row">
                      <Button
                        className="alerts-actions__open"
                        variant="primary"
                        data-testid={`alert-open-${alert._id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(alert, event.currentTarget);
                        }}
                      >
                        Review alert
                      </Button>
                    </div>
                    <div className="alerts-actions__secondary-row">
                      <AssignmentActions
                        alert={alert}
                        clinicianId={clinicianId}
                        busy={assignmentPending}
                        size="sm"
                        onAssignToMe={onAssignToMe}
                        onTakeOver={onTakeOver}
                      />
                      <Button
                        className="alerts-actions__ack"
                        variant="secondary"
                        size="sm"
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
                        variant="secondary"
                        size="sm"
                        disabled={alert.status === 'resolved' || mutationPending || assignedToOther}
                        onClick={(event) => {
                          event.stopPropagation();
                          onResolve(alert);
                        }}
                      >
                        Resolve
                      </Button>
                    </div>
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
