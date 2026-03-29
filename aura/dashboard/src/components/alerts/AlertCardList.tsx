import { useState } from 'react';
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
import { OverrideChip } from './OverrideChip';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { formatExactTime, formatRelativeTime } from '../../utils/time';
import { cn } from '../../utils/cn';

const HOURS_24_MS = 24 * 60 * 60 * 1000;

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

function notificationSupportLabel(status: AlertItem['notificationStatus']): string {
  const normalized = resolveNotificationStatus(status);

  if (normalized === 'sent') {
    return 'Delivered';
  }

  if (normalized === 'failed') {
    return 'Delivery failed';
  }

  if (normalized === 'skipped') {
    return 'Delivery skipped';
  }

  return 'Delivery status unknown';
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
        const notificationStatus = resolveNotificationStatus(alert.notificationStatus);
        const createdAtMs = Date.parse(alert.createdAt);
        const isAged = Number.isFinite(createdAtMs) && Date.now() - createdAtMs > HOURS_24_MS;
        const isReasonExpanded = Boolean(expandedReasonByAlertId[alert._id]);
        const showReasonToggle = reasonText.length > 120;
        const alertReference = shortReferenceLabel(alert._id);
        const sourceReference = shortReferenceLabel(alert.source.sourceId, 'Source ref');

        return (
          <Card
            key={alert._id}
            title={null}
            className={cn(
              'alerts-card-list__card',
              unseen && 'alerts-card-list__card--unseen',
              effectiveRisk === 'high' && 'alerts-card-list__card--high-risk',
              notificationStatus === 'failed' && 'alerts-card-list__card--delivery-failed',
              alert.assignedTo === clinicianId && 'alerts-card-list__card--assigned-me',
              isAged && 'alerts-card-list__card--aged',
              hasRiskOverride(alert) && 'alerts-card-list__card--overridden',
              highlightedAlertIds.includes(alert._id) && 'alert-arrived',
            )}
            aria-label={`Alert ${alert._id} for patient ${alert.patientId}`}
            data-testid={`alert-card-${alert._id}`}
          >
            <div className="alerts-card-list__body">
              <div className="alerts-card-list__top">
                <div className="alerts-card-list__patient-group">
                  <div className="alerts-card-list__patient-anchor">
                    <span className="alerts-card-list__patient-avatar" aria-hidden="true">
                      {patientAnchorLabel(alert.patientId)}
                    </span>
                    <div className="alerts-card-list__patient-copy">
                      <div className="alerts-card-list__patient-line">
                        <strong className="alerts-card-list__patient patient-id-text">
                          Patient {alert.patientId}
                        </strong>
                        {unseen ? (
                          <Badge className="alerts-unseen-badge" variant="new" icon aria-label="Unseen alert">
                            Unseen
                          </Badge>
                        ) : (
                          <span className="alerts-seen alerts-seen--quiet">Seen</span>
                        )}
                      </div>
                      <span className="muted-text alerts-card-list__meta-line">{alertReference ?? alert._id}</span>
                    </div>
                  </div>
                  <span className="muted-text alerts-card-list__meta-line alerts-card-list__time-pill">
                    <time dateTime={alert.createdAt} title={formatExactTime(alert.createdAt)}>
                      {formatRelativeTime(alert.createdAt)}
                    </time>
                  </span>
                </div>
                <div className="alerts-card-list__top-badges">
                  <Badge className="alerts-risk-badge" variant={riskBadgeVariant(effectiveRisk)}>
                    {formatRiskLabel(effectiveRisk)}
                  </Badge>
                  <Badge className="alerts-status-badge" variant={statusBadgeVariant(alert.status)} icon>
                    {alertStatusLabel(alert.status)}
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
                <div className="alerts-card-list__reason-flags">
                  {notificationStatus === 'failed' ? (
                    <span className="alerts-card-list__reason-flag alerts-card-list__reason-flag--delivery">
                      Delivery issue
                    </span>
                  ) : null}
                  {isAged ? (
                    <span className="alerts-card-list__reason-flag alerts-card-list__reason-flag--aged">
                      Older than 24h
                    </span>
                  ) : null}
                </div>
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
                    <AssignmentChip alert={alert} clinicianId={clinicianId} />
                    <OverrideChip alert={alert} />
                  </div>
                  <div className="alerts-card-list__meta-secondary">
                    <span className="alerts-source-pill alerts-source-pill--row">{alertSourceLabel(alert.source.type)}</span>
                    {sourceReference ? <span className="alerts-card-list__source-id">{sourceReference}</span> : null}
                  </div>
                  <div className="alerts-card-list__meta-tertiary">
                    <span className="alerts-card-list__notification-meta">
                      {assignedToOther ? 'Owned elsewhere' : alert.assignedTo ? 'Current owner set' : 'Needs owner'}
                    </span>
                    <span className="alerts-card-list__notification-meta">
                      {notificationSupportLabel(alert.notificationStatus)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="alerts-actions alerts-actions--stack alerts-card-list__actions">
                <div className="alerts-card-list__actions-primary">
                  <Button
                    className="alerts-actions__open"
                    variant="primary"
                    data-testid={`alert-open-${alert._id}`}
                    onClick={(event) => onOpen(alert, event.currentTarget)}
                    fullWidth
                  >
                    Review alert
                  </Button>
                </div>
                <div className="alerts-card-list__actions-secondary">
                  <AssignmentActions
                    alert={alert}
                    clinicianId={clinicianId}
                    busy={assignmentPending}
                    size="sm"
                    fullWidth
                    onAssignToMe={onAssignToMe}
                    onTakeOver={onTakeOver}
                  />
                  <Button
                    className="alerts-actions__ack"
                    variant="secondary"
                    size="sm"
                    disabled={alert.status !== 'open' || mutationPending || assignedToOther}
                    onClick={() => onAcknowledge(alert)}
                    fullWidth
                  >
                    Ack
                  </Button>
                  <Button
                    className="alerts-actions__resolve"
                    variant="secondary"
                    size="sm"
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
