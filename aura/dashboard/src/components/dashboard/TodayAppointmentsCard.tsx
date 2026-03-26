import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { DashboardModuleState } from './DashboardModuleState';
import type { DashboardTodayAppointmentItem } from '../../types/models';
import {
  formatDashboardDateTime,
  formatDashboardRelativeTime,
  formatDashboardTimeRange,
  humanizeDashboardLabel,
} from '../../utils/dashboard';

interface TodayAppointmentsCardProps {
  items: DashboardTodayAppointmentItem[];
  totalCount?: number;
  visibleItemCount?: number;
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

function appointmentToneClass(status: DashboardTodayAppointmentItem['status']): string {
  if (status === 'missed') {
    return 'danger';
  }

  if (status === 'awaiting_confirmation' || status === 'reschedule_requested') {
    return 'warning';
  }

  if (status === 'completed') {
    return 'success';
  }

  return 'neutral';
}

function appointmentSupportLine(item: DashboardTodayAppointmentItem): string {
  if (item.note?.trim()) {
    return item.note.trim();
  }

  if (item.status === 'awaiting_confirmation') {
    return 'Waiting for patient confirmation.';
  }

  if (item.status === 'reschedule_requested') {
    return 'Reschedule review is waiting.';
  }

  if (item.status === 'missed') {
    return 'Missed visit needs follow-up.';
  }

  return 'Visit is currently scheduled.';
}

export function TodayAppointmentsCard({
  items,
  totalCount,
  visibleItemCount,
  loading,
  hasError,
  onRetry,
  retrying = false,
  resolvePatientLabel,
  onOpenPatient,
  onOpenAppointments,
}: TodayAppointmentsCardProps): JSX.Element {
  const visibleItems = visibleItemCount ? items.slice(0, visibleItemCount) : items;
  const appointmentsCount = totalCount ?? items.length;
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
          <span className="dashboard-widget-heading__eyebrow">Agenda</span>
          <span className="dashboard-module-card__title-row">
            <span className="dashboard-module-card__title">
              Today&apos;s appointments
              <span className="dashboard-module-card__count">{appointmentsCount}</span>
            </span>
          </span>
          <span className="dashboard-widget-heading__copy">
            Visits and exceptions shaping today.
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
          <div className="dashboard-module-inline-stats dashboard-module-inline-stats--appointments" aria-label="Today's schedule summary">
            <span className="dashboard-module-inline-stat dashboard-module-inline-stat--primary">
              <strong>{upcomingCount}</strong>
              <span>upcoming</span>
            </span>
            <span className="dashboard-module-inline-stat dashboard-module-inline-stat--warning">
              <strong>{reviewCount}</strong>
              <span>need review</span>
            </span>
            <span className="dashboard-module-inline-stat dashboard-module-inline-stat--risk">
              <strong>{missedCount}</strong>
              <span>missed</span>
            </span>
          </div>

          <div className="dashboard-side-widget__list dashboard-side-widget__list--appointments" role="list">
            {visibleItems.map((item) => (
              <article
                key={item.id}
                className={`dashboard-side-widget__item dashboard-side-widget__item--appointments dashboard-side-widget__item--${appointmentToneClass(
                  item.status,
                )}`}
                role="listitem"
              >
                <div className="dashboard-side-widget__time">
                  <span>{formatDashboardTimeRange(item.startsAt, item.endsAt)}</span>
                </div>
                <div className="dashboard-side-widget__body">
                  <div className="dashboard-side-widget__top">
                    <span className="dashboard-side-widget__eyebrow">{resolvePatientLabel(item.patientId)}</span>
                    <span className="dashboard-side-widget__freshness" title={formatDashboardDateTime(item.updatedAt)}>
                      Updated {formatDashboardRelativeTime(item.updatedAt)}
                    </span>
                  </div>
                  <div className="dashboard-side-widget__title-row">
                    <h3 className="dashboard-side-widget__title">
                      {humanizeDashboardLabel(item.modality)} visit
                    </h3>
                    <Badge variant={statusVariant(item.status)}>{humanizeDashboardLabel(item.status)}</Badge>
                  </div>
                  <p className="dashboard-side-widget__copy">{appointmentSupportLine(item)}</p>
                  <div className="dashboard-side-widget__footer">
                    <div className="dashboard-side-widget__meta">
                      <span>{humanizeDashboardLabel(item.requestStatus)} request</span>
                      <span>Updated {formatDashboardDateTime(item.updatedAt)}</span>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => onOpenPatient(item.patientId)}>
                      Open patient
                    </Button>
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
