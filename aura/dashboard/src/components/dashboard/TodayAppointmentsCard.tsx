import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { DashboardModuleState } from './DashboardModuleState';
import type { DashboardTodayAppointmentItem } from '../../types/models';
import {
  formatDashboardDateTime,
  formatDashboardTimeRange,
  humanizeDashboardLabel,
} from '../../utils/dashboard';

interface TodayAppointmentsCardProps {
  items: DashboardTodayAppointmentItem[];
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
  retrying?: boolean;
  resolvePatientLabel: (patientId: string) => string;
  onOpenPatient: (patientId: string) => void;
  onOpenAppointments: () => void;
}

function statusVariant(status: DashboardTodayAppointmentItem['status']): 'warning' | 'success' | 'neutral' | 'danger' {
  if (status === 'missed') {
    return 'danger';
  }

  if (status === 'completed') {
    return 'success';
  }

  if (status === 'awaiting_confirmation' || status === 'reschedule_requested') {
    return 'warning';
  }

  return 'neutral';
}

export function TodayAppointmentsCard({
  items,
  loading,
  hasError,
  onRetry,
  retrying = false,
  resolvePatientLabel,
  onOpenPatient,
  onOpenAppointments,
}: TodayAppointmentsCardProps): JSX.Element {
  const upcomingCount = items.filter((item) => item.status === 'upcoming').length;
  const reviewCount = items.filter(
    (item) => item.status === 'awaiting_confirmation' || item.status === 'reschedule_requested',
  ).length;
  const missedCount = items.filter((item) => item.status === 'missed').length;

  return (
    <Card
      className="dashboard-module-card dashboard-appointments-card"
      title={
        <span className="dashboard-widget-heading dashboard-widget-heading--appointments">
          <span className="dashboard-widget-heading__eyebrow">Schedule</span>
          <span className="dashboard-module-card__title-row">
            <span className="dashboard-module-card__title">
              Today&apos;s appointments
              <span className="dashboard-module-card__count">{items.length}</span>
            </span>
          </span>
          <span className="dashboard-widget-heading__copy">
            Confirmed, pending, and exception visits that shape today&apos;s schedule.
          </span>
        </span>
      }
      action={
        <div className="dashboard-module-card__action-shell">
          <Button variant="ghost" size="sm" onClick={onOpenAppointments}>
            Open appointments
          </Button>
        </div>
      }
    >
      {loading && items.length === 0 ? (
        <DashboardModuleState mode="loading" lines={3} />
      ) : hasError && items.length === 0 ? (
        <DashboardModuleState
          mode="error"
          title="Unable to load appointments"
          description="Today&apos;s schedule could not be loaded."
          onRetry={onRetry}
          retrying={retrying}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No appointments today"
          description="Today&apos;s confirmed, pending, and exception appointments will appear here."
        />
      ) : (
        <div className="dashboard-appointments-card__content">
          <div className="dashboard-widget-bar dashboard-widget-bar--appointments" aria-label="Today's schedule summary">
            <span className="dashboard-widget-bar__item">
              <strong>{upcomingCount}</strong>
              <span>upcoming</span>
            </span>
            <span className="dashboard-widget-bar__item">
              <strong>{reviewCount}</strong>
              <span>need review</span>
            </span>
            <span className="dashboard-widget-bar__item">
              <strong>{missedCount}</strong>
              <span>missed</span>
            </span>
          </div>

          <div className="dashboard-list dashboard-list--appointments" role="list">
            {items.map((item) => (
              <article key={item.id} className="dashboard-list-item dashboard-list-item--appointments" role="listitem">
                <div className="dashboard-list-item__content">
                  <div className="dashboard-list-item__eyebrow">
                    <span className="dashboard-list-item__patient">{resolvePatientLabel(item.patientId)}</span>
                    <span className="dashboard-list-item__timestamp" title={formatDashboardDateTime(item.updatedAt)}>
                      Updated {formatDashboardDateTime(item.updatedAt)}
                    </span>
                  </div>
                  <div className="dashboard-list-item__title-row">
                    <h3 className="dashboard-list-item__title">{formatDashboardTimeRange(item.startsAt, item.endsAt)}</h3>
                    <Badge variant={statusVariant(item.status)}>{humanizeDashboardLabel(item.status)}</Badge>
                  </div>
                  <p className="dashboard-list-item__description">
                    {item.note?.trim() || `${humanizeDashboardLabel(item.requestStatus)} ${item.modality} visit`}
                  </p>
                  <div className="dashboard-list-item__tag-row">
                    <span className="dashboard-list-item__tag">{humanizeDashboardLabel(item.requestStatus)}</span>
                    <span className="dashboard-list-item__tag">{item.modality}</span>
                  </div>
                  <div className="dashboard-list-item__footer">
                    <div className="dashboard-list-item__meta dashboard-list-item__meta--supporting">
                      <span>{humanizeDashboardLabel(item.status)} visit</span>
                      <span>Updated {formatDashboardDateTime(item.updatedAt)}</span>
                    </div>
                    <div className="dashboard-list-item__action">
                      <Button variant="secondary" size="sm" onClick={() => onOpenPatient(item.patientId)}>
                        Open patient
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
