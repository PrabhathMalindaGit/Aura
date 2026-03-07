import type { RefObject } from 'react';
import type { AlertItem, TrendPointNormalized } from '../../types/models';
import { formatDateKey, formatMedication, formatMoodValue, formatPainValue, formatPercent } from '../../utils/format';
import { trendPointHasAnyData } from '../../utils/trends';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

interface DayDetailPanelProps {
  open: boolean;
  dayPoint: TrendPointNormalized | null;
  dayAlerts: AlertItem[];
  returnFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
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

export function DayDetailPanel({
  open,
  dayPoint,
  dayAlerts,
  returnFocusRef,
  onClose,
}: DayDetailPanelProps): JSX.Element {
  const hasCheckin = dayPoint ? trendPointHasAnyData(dayPoint) : false;

  return (
    <Drawer
      open={open}
      title={dayPoint ? `Day detail ${formatDateKey(dayPoint.date)}` : 'Day detail'}
      mobileFullscreen
      dataTestId="day-detail-panel"
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      footer={
        <div className="drawer-footer-actions safe-bottom">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {dayPoint ? (
        <div className="day-detail-stack">
          <section className="day-detail-section">
            <h3>Check-in snapshot</h3>
            <dl className="day-detail-grid">
              <div>
                <dt>Date</dt>
                <dd>{formatDateKey(dayPoint.date)}</dd>
              </div>
              <div>
                <dt>Pain</dt>
                <dd>{formatPainValue(dayPoint.pain)}</dd>
              </div>
              <div>
                <dt>Mood</dt>
                <dd>{formatMoodValue(dayPoint.mood)}</dd>
              </div>
              <div>
                <dt>Exercises</dt>
                <dd>{formatPercent(dayPoint.exercises)}</dd>
              </div>
              <div>
                <dt>Medication</dt>
                <dd>{formatMedication(dayPoint.medication)}</dd>
              </div>
            </dl>
            {!hasCheckin ? (
              <p className="muted-text">No check-in recorded for this day.</p>
            ) : dayPoint.notes ? (
              <p className="day-detail-notes">
                <strong>Notes:</strong> {dayPoint.notes}
              </p>
            ) : (
              <p className="muted-text">
                Full check-in detail requires endpoint GET /clinician/patients/:patientId/checkins?from&to.
              </p>
            )}
          </section>

          <section className="day-detail-section">
            <h3>Alerts on this day</h3>
            {dayAlerts.length === 0 ? (
              <p className="muted-text">No alerts recorded on this date.</p>
            ) : (
              <ul className="day-detail-alert-list">
                {dayAlerts.map((alert) => (
                  <li key={alert._id} className="day-detail-alert-list__item">
                    <div>
                      <p>
                        <strong className="day-detail-alert-list__id">{alert._id}</strong>
                      </p>
                      <p className="muted-text day-detail-alert-list__reason">{reasonText(alert.reason)}</p>
                    </div>
                    <Badge className="day-detail-alert-list__status" variant={statusBadgeVariant(alert.status)} icon>
                      {alert.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}
