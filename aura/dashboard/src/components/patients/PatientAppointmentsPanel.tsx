import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import type { AppointmentRequestItem } from '../../types/models';
import {
  appointmentWorkflowLabel,
  appointmentWorkflowTone,
} from '../../utils/patientDetail';
import {
  formatDashboardDateTime,
  formatDashboardRelativeTime,
  formatDashboardTimeRange,
} from '../../utils/dashboard';

interface PatientAppointmentsPanelProps {
  items: AppointmentRequestItem[];
  isLoading?: boolean;
  error?: string | null;
  freshnessLabel?: string | null;
  onRetry: () => void;
  onOpenAppointments: () => void;
}

function workflowVariant(
  value: AppointmentRequestItem['workflowStatus'],
): 'danger' | 'warning' | 'success' | 'neutral' {
  const tone = appointmentWorkflowTone(value);
  if (tone === 'danger') {
    return 'danger';
  }
  if (tone === 'warning') {
    return 'warning';
  }
  if (tone === 'success') {
    return 'success';
  }
  return 'neutral';
}

export function PatientAppointmentsPanel({
  items,
  isLoading = false,
  error,
  freshnessLabel,
  onRetry,
  onOpenAppointments,
}: PatientAppointmentsPanelProps): JSX.Element {
  const nextItem =
    items.find((item) => Date.parse(item.startsAt) >= Date.now()) ??
    items[0] ??
    null;
  const recentItems = nextItem ? items.filter((item) => item.requestId !== nextItem.requestId).slice(0, 3) : items.slice(0, 3);

  return (
    <Card
      id="patient-appointments-panel"
      className="patient-detail-panel patient-detail-panel--operational patient-detail-panel--operations-secondary patient-detail-panel--workflow-appointments"
      title="Appointments"
      action={
        <div className="patient-detail-panel__header-tools">
          {freshnessLabel ? <span className="patient-detail-panel__freshness">{freshnessLabel}</span> : null}
          <div className="patient-detail-actions">
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={onOpenAppointments}>
              Open appointments
            </Button>
          </div>
        </div>
      }
      data-testid="patient-appointments-panel"
    >
      {isLoading ? (
        <div className="patient-detail-skeleton-grid" aria-label="Patient appointments loading placeholder">
          <Skeleton height={44} />
          <Skeleton height={68} />
        </div>
      ) : error ? (
        <div className="patient-detail-inline-state" role="status">
          <p className="muted-text">{error}</p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No appointment activity to review"
          description="Upcoming and recent scheduling activity appears here."
          tone="neutral"
          action={
            <Button variant="secondary" size="sm" onClick={onOpenAppointments}>
              Open appointments
            </Button>
          }
        />
      ) : (
        <div className="patient-appointment-panel">
          {nextItem ? (
            <article className="patient-appointment-callout">
              <div className="patient-appointment-callout__meta">
                <Badge variant={workflowVariant(nextItem.workflowStatus)}>
                  {appointmentWorkflowLabel(nextItem.workflowStatus)}
                </Badge>
                <span className="muted-text" title={formatDashboardDateTime(nextItem.startsAt)}>
                  {formatDashboardRelativeTime(nextItem.startsAt)}
                </span>
              </div>
              <strong className="patient-appointment-callout__title">
                {formatDashboardTimeRange(nextItem.startsAt, nextItem.endsAt)}
              </strong>
              <p className="patient-appointment-callout__note">
                {nextItem.note?.trim() || 'Review the current scheduling note and workflow state.'}
              </p>
            </article>
          ) : null}

          {recentItems.length > 0 ? (
            <div className="patient-appointment-list">
              {recentItems.map((item) => (
                <article key={item.requestId} className="patient-appointment-item">
                  <div>
                    <div className="patient-appointment-item__meta">
                      <Badge variant={workflowVariant(item.workflowStatus)}>
                        {appointmentWorkflowLabel(item.workflowStatus)}
                      </Badge>
                      <Badge variant="neutral">{item.status}</Badge>
                    </div>
                    <strong>{formatDashboardTimeRange(item.startsAt, item.endsAt)}</strong>
                    {item.note ? <p className="patient-appointment-item__note">{item.note}</p> : null}
                  </div>
                  <span className="muted-text" title={formatDashboardDateTime(item.updatedAt ?? item.createdAt)}>
                    Updated {formatDashboardRelativeTime(item.updatedAt ?? item.createdAt)}
                  </span>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
