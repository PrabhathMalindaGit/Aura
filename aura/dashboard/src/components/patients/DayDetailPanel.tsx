import type { RefObject } from 'react';
import type { AlertItem, TrendPointNormalized } from '../../types/models';
import { alertSourceLabel, alertStatusLabel, shortReferenceLabel } from '../../utils/notification';
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
  const hasNotes = Boolean(dayPoint?.notes);

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
          <div className="day-detail-intro">
            <div className="day-detail-intro__copy">
              <p className="day-detail-intro__eyebrow">Daily review</p>
              <strong className="day-detail-intro__title">
                Use this snapshot to support the trend view, not replace it.
              </strong>
              <p className="day-detail-intro__text">
                Review the recorded check-in summary, any patient note, and linked alerts for this day before
                returning to the wider trend context.
              </p>
            </div>
            <div className="day-detail-intro__badges" aria-label="Day detail summary">
              <Badge variant={hasCheckin ? 'success' : 'neutral'}>{hasCheckin ? 'Check-in recorded' : 'No check-in'}</Badge>
              <Badge variant={dayAlerts.length > 0 ? 'warning' : 'neutral'}>
                {dayAlerts.length > 0 ? `${dayAlerts.length} alert${dayAlerts.length === 1 ? '' : 's'}` : 'No alerts'}
              </Badge>
              <Badge variant={hasNotes ? 'default' : 'neutral'}>{hasNotes ? 'Patient note' : 'No note'}</Badge>
            </div>
          </div>

          <section className="day-detail-section">
            <div className="day-detail-section__header">
              <h3>Check-in snapshot</h3>
              <p className="day-detail-section__text">
                Core patient-reported data captured for this day.
              </p>
            </div>
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
              <p className="day-detail-support muted-text">
                No structured check-in was recorded for this day. Use the surrounding trend view and any same-day
                alerts to understand the wider context.
              </p>
            ) : null}

            {dayPoint.notes ? (
              <div className="day-detail-notes">
                <p className="day-detail-notes__label">Patient note</p>
                <p className="day-detail-notes__body">{dayPoint.notes}</p>
              </div>
            ) : (
              <p className="day-detail-support muted-text">
                No free-text note was recorded for this day.
              </p>
            )}

            {hasCheckin ? (
              <p className="day-detail-support muted-text">
                Expanded day-level check-in detail is not available in this workspace yet. Use this snapshot alongside
                the charts and alerts for day-level review.
              </p>
            ) : null}
          </section>

          <section className="day-detail-section">
            <div className="day-detail-section__header">
              <h3>Alerts on this day</h3>
              <p className="day-detail-section__text">
                Safety events linked to the same calendar day.
              </p>
            </div>
            {dayAlerts.length === 0 ? (
              <p className="day-detail-support muted-text">No alerts were recorded on this day.</p>
            ) : (
              <ul className="day-detail-alert-list">
                {dayAlerts.map((alert) => (
                  <li key={alert._id} className="day-detail-alert-list__item">
                    <div className="day-detail-alert-list__body">
                      <p>
                        <strong className="day-detail-alert-list__id">{shortReferenceLabel(alert._id) ?? alert._id}</strong>
                      </p>
                      <p className="muted-text day-detail-alert-list__reason">{reasonText(alert.reason)}</p>
                      <p className="muted-text day-detail-alert-list__meta">
                        {alertSourceLabel(alert.source.type)} · {new Date(alert.createdAt).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <Badge className="day-detail-alert-list__status" variant={statusBadgeVariant(alert.status)} icon>
                      {alertStatusLabel(alert.status)}
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
