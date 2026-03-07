import type { AlertItem } from '../../types/models';
import type { SeenAlertMap } from '../../services/seenStore';
import { formatDateKey } from '../../utils/format';
import { toDateKey } from '../../utils/trends';
import { isAlertUnseenForUi } from '../../utils/seen';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';

interface RecentAlertsPanelProps {
  alerts: AlertItem[];
  seenAlertMap: SeenAlertMap;
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

export function RecentAlertsPanel({
  alerts,
  seenAlertMap,
  mutationPending,
  onAcknowledge,
  onResolve,
  onViewAll,
}: RecentAlertsPanelProps): JSX.Element {
  const visibleAlerts = alerts.slice(0, 5);

  return (
    <Card
      className="patient-detail-recent-alerts-card"
      title="Recent alerts"
      action={
        alerts.length > 5 && onViewAll ? (
          <Button variant="ghost" onClick={onViewAll}>
            View all alerts
          </Button>
        ) : null
      }
    >
      {alerts.length === 0 ? (
        <EmptyState
          title="No recent alerts"
          description="This patient has no alerts in the fetched queue."
        />
      ) : (
        <ul className="recent-alert-list" aria-label="Recent alerts for patient">
          {visibleAlerts.map((alert) => {
            const unseen = isAlertUnseenForUi(alert, seenAlertMap);

            return (
              <li key={alert._id} className="recent-alert-list__item">
                <div className="recent-alert-list__body">
                  <p>
                    <strong className="recent-alert-list__id">{alert._id}</strong>
                  </p>
                  <p className="muted-text recent-alert-list__reason">{reasonText(alert.reason)}</p>
                  <p className="muted-text recent-alert-list__date">Date: {formatDateKey(toDateKey(alert.createdAt))}</p>
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
                    <Badge className="recent-alert-list__status" variant={statusBadgeVariant(alert.status)} icon>
                      {alert.status}
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
                      onClick={() => onResolve(alert)}
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
