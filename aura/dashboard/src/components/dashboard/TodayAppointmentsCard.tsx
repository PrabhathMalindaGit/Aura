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
  return (
    <Card
      className="dashboard-module-card dashboard-appointments-card"
      title={
        <span className="dashboard-module-card__title">
          Today&apos;s appointments
          <span className="dashboard-module-card__count">{items.length}</span>
        </span>
      }
      action={
        <Button variant="ghost" size="sm" onClick={onOpenAppointments}>
          View all
        </Button>
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
        <div className="dashboard-list" role="list">
          {items.map((item) => (
            <article key={item.id} className="dashboard-list-item" role="listitem">
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
              </div>
              <div className="dashboard-list-item__action">
                <Button variant="secondary" size="sm" onClick={() => onOpenPatient(item.patientId)}>
                  Open patient
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}
