import { useEffect, useRef, useState } from 'react';
import type { AlertItem } from '../../types/models';
import { alertSourceLabel, alertStatusLabel, shortReferenceLabel } from '../../utils/notification';
import { formatRiskLabel, getEffectiveRisk, riskBadgeVariant } from '../../utils/risk';
import type { SeenAlertMap } from '../../services/seenStore';
import { formatDateKey } from '../../utils/format';
import { toDateKey } from '../../utils/trends';
import { isAlertUnseenForUi } from '../../utils/seen';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';

interface RecentAlertsPanelProps {
  alerts: AlertItem[];
  seenAlertMap: SeenAlertMap;
  freshnessLabel?: string | null;
  mutationPending: boolean;
  onAcknowledge: (alert: AlertItem) => void;
  onResolve: (alert: AlertItem) => void;
  onViewAll?: () => void;
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

function reasonText(value: string | string[]): string {
  return Array.isArray(value) ? value.join(', ') : value;
}

function alertToneClass(alert: AlertItem, unseen: boolean): 'critical' | 'warning' | 'calm' {
  if (unseen && alert.status === 'open') {
    return 'critical';
  }

  if (alert.status === 'open') {
    return 'warning';
  }

  return 'calm';
}

export function RecentAlertsPanel({
  alerts,
  seenAlertMap,
  freshnessLabel,
  mutationPending,
  onAcknowledge,
  onResolve,
  onViewAll,
}: RecentAlertsPanelProps): JSX.Element {
  const [pendingResolveAlert, setPendingResolveAlert] = useState<AlertItem | null>(null);
  const resolveActionRef = useRef<HTMLButtonElement | null>(null);
  const visibleAlerts = alerts.slice(0, 5);

  useEffect(() => {
    if (pendingResolveAlert && !alerts.some((alert) => alert._id === pendingResolveAlert._id)) {
      setPendingResolveAlert(null);
    }
  }, [alerts, pendingResolveAlert]);

  function handleResolveAction(button: HTMLButtonElement, alert: AlertItem): void {
    if (alert.status === 'open') {
      resolveActionRef.current = button;
      setPendingResolveAlert(alert);
      return;
    }

    onResolve(alert);
  }

  function handleResolveConfirmed(): void {
    if (!pendingResolveAlert) {
      return;
    }

    const alert = pendingResolveAlert;
    setPendingResolveAlert(null);
    onResolve(alert);
  }

  return (
    <>
      <Card
        className="patient-detail-panel patient-detail-panel--attention patient-detail-panel--review-feed patient-detail-recent-alerts-card"
        title="Recent alerts"
        action={
          freshnessLabel || (alerts.length > 5 && onViewAll) ? (
            <div className="patient-detail-panel__header-tools">
              {freshnessLabel ? <span className="patient-detail-panel__freshness">{freshnessLabel}</span> : null}
              {alerts.length > 5 && onViewAll ? (
                <Button variant="ghost" onClick={onViewAll}>
                  View all alerts
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {alerts.length === 0 ? (
          <EmptyState
            title="No recent alerts"
            description="This patient has no alerts in the fetched queue."
          />
        ) : (
          <div className="recent-alert-list">
            <ul aria-label="Recent alerts for patient">
              {visibleAlerts.map((alert) => {
                const unseen = isAlertUnseenForUi(alert, seenAlertMap);
                const effectiveRisk = getEffectiveRisk(alert);

                return (
                  <li
                    key={alert._id}
                    className={`recent-alert-list__item recent-alert-list__item--${alertToneClass(alert, unseen)}`}
                  >
                    <div className="recent-alert-list__body">
                      <div className="recent-alert-list__eyebrow-row">
                        <span className="recent-alert-list__source">{alertSourceLabel(alert.source.type)} safety event</span>
                        <span className="muted-text recent-alert-list__date">
                          {formatDateKey(toDateKey(alert.createdAt))}
                        </span>
                      </div>
                      <p>
                        <strong className="recent-alert-list__title">{reasonText(alert.reason)}</strong>
                      </p>
                      <p className="muted-text recent-alert-list__reason">
                        <span className="recent-alert-list__id">{shortReferenceLabel(alert._id) ?? alert._id}</span>
                      </p>
                    </div>
                    <div className="recent-alert-list__meta">
                      <div className="recent-alert-list__badges">
                        {unseen ? (
                          <Badge className="recent-alert-list__unseen" variant="new" icon aria-label="Unseen alert">
                            Unseen
                          </Badge>
                        ) : (
                          <span className="alerts-seen recent-alert-list__seen">Seen</span>
                        )}
                        <Badge variant={riskBadgeVariant(effectiveRisk)}>{formatRiskLabel(effectiveRisk)}</Badge>
                        <Badge className="recent-alert-list__status" variant={statusBadgeVariant(alert.status)} icon>
                          {alertStatusLabel(alert.status)}
                        </Badge>
                      </div>
                      <div className="recent-alert-list__actions">
                        <Button
                          className="recent-alert-list__ack"
                          variant="secondary"
                          disabled={alert.status !== 'open' || mutationPending}
                          onClick={() => onAcknowledge(alert)}
                        >
                          Acknowledge
                        </Button>
                        <Button
                          className="recent-alert-list__resolve"
                          variant="danger"
                          disabled={alert.status === 'resolved' || mutationPending}
                          onClick={(event) => {
                            handleResolveAction(event.currentTarget, alert);
                          }}
                        >
                          Resolve
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pendingResolveAlert)}
        title="Resolve alert now?"
        description="This alert is still open. Resolve only if clinical follow-up is complete."
        confirmLabel="Resolve"
        confirmVariant="danger"
        busy={mutationPending}
        returnFocusRef={resolveActionRef}
        onCancel={() => setPendingResolveAlert(null)}
        onConfirm={handleResolveConfirmed}
      />
    </>
  );
}
