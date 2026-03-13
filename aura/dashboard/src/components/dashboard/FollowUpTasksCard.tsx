import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { DashboardModuleState } from './DashboardModuleState';
import type { DashboardFollowUpTaskItem } from '../../types/models';
import {
  formatDashboardDateTime,
  formatDashboardRelativeTime,
  humanizeDashboardLabel,
} from '../../utils/dashboard';

interface FollowUpTasksCardProps {
  items: DashboardFollowUpTaskItem[];
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
  retrying?: boolean;
  resolvePatientLabel: (patientId: string) => string;
  onOpenTaskItem: (item: DashboardFollowUpTaskItem) => void;
  onOpenPatients: () => void;
}

function priorityVariant(priority: DashboardFollowUpTaskItem['priority']): 'neutral' | 'warning' | 'risk-high' {
  if (priority === 'urgent' || priority === 'high') {
    return 'risk-high';
  }

  if (priority === 'medium') {
    return 'warning';
  }

  return 'neutral';
}

function actionLabel(item: DashboardFollowUpTaskItem): string {
  if (item.linkedAlertId) {
    return 'Open alert';
  }

  if (item.linkedAppointmentId) {
    return 'Open appointments';
  }

  return 'Open patient';
}

export function FollowUpTasksCard({
  items,
  loading,
  hasError,
  onRetry,
  retrying = false,
  resolvePatientLabel,
  onOpenTaskItem,
  onOpenPatients,
}: FollowUpTasksCardProps): JSX.Element {
  const urgentCount = items.filter((item) => item.priority === 'urgent' || item.priority === 'high').length;
  const dueTodayCount = items.filter((item) => {
    if (!item.dueAt) {
      return false;
    }

    const due = new Date(item.dueAt);
    const now = new Date();

    return (
      due.getFullYear() === now.getFullYear() &&
      due.getMonth() === now.getMonth() &&
      due.getDate() === now.getDate()
    );
  }).length;

  return (
    <Card
      className="dashboard-module-card dashboard-tasks-card"
      title={
        <span className="dashboard-widget-heading dashboard-widget-heading--tasks">
          <span className="dashboard-widget-heading__eyebrow">Follow-through</span>
          <span className="dashboard-module-card__title-row">
            <span className="dashboard-module-card__title">
              Follow-up tasks
              <span className="dashboard-module-card__count">{items.length}</span>
            </span>
          </span>
          <span className="dashboard-widget-heading__copy">
            Open task work across safety, adherence, and appointments.
          </span>
        </span>
      }
      action={
        <div className="dashboard-module-card__action-shell">
          <Button variant="ghost" size="sm" onClick={onOpenPatients}>
            Open worklist
          </Button>
        </div>
      }
    >
      {loading && items.length === 0 ? (
        <DashboardModuleState mode="loading" lines={3} />
      ) : hasError && items.length === 0 ? (
        <DashboardModuleState
          mode="error"
          title="Unable to load follow-up tasks"
          description="The open clinician task list could not be loaded."
          onRetry={onRetry}
          retrying={retrying}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No follow-up tasks"
          description="Open safety review, appointment, communication, and adherence follow-up items will appear here."
          tone="success"
        />
      ) : (
        <div className="dashboard-tasks-card__content">
          <div className="dashboard-widget-bar dashboard-widget-bar--tasks" aria-label="Follow-up task summary">
            <span className="dashboard-widget-bar__item">
              <strong>{urgentCount}</strong>
              <span>urgent or high</span>
            </span>
            <span className="dashboard-widget-bar__item">
              <strong>{dueTodayCount}</strong>
              <span>due today</span>
            </span>
          </div>

          <div className="dashboard-list dashboard-list--tasks" role="list">
            {items.map((item) => (
              <article key={item.id} className="dashboard-list-item dashboard-list-item--tasks" role="listitem">
                <div className="dashboard-list-item__content">
                  <div className="dashboard-list-item__eyebrow">
                    <span className="dashboard-list-item__patient">{resolvePatientLabel(item.patientId)}</span>
                    <span
                      className="dashboard-list-item__timestamp"
                      title={item.dueAt ? formatDashboardDateTime(item.dueAt) : formatDashboardDateTime(item.updatedAt)}
                    >
                      {item.dueAt ? `Due ${formatDashboardRelativeTime(item.dueAt)}` : `Updated ${formatDashboardRelativeTime(item.updatedAt)}`}
                    </span>
                  </div>
                  <div className="dashboard-list-item__title-row">
                    <h3 className="dashboard-list-item__title">{item.title}</h3>
                    <Badge variant={priorityVariant(item.priority)}>{humanizeDashboardLabel(item.priority)}</Badge>
                  </div>
                  <div className="dashboard-list-item__footer dashboard-list-item__footer--rail">
                    <div className="dashboard-list-item__meta dashboard-list-item__meta--supporting dashboard-list-item__meta--rail">
                      <span>{humanizeDashboardLabel(item.type)}</span>
                      <span>{humanizeDashboardLabel(item.status)}</span>
                      {item.dueAt ? <span>Due {formatDashboardDateTime(item.dueAt)}</span> : <span>Updated {formatDashboardDateTime(item.updatedAt)}</span>}
                    </div>
                    <div className="dashboard-list-item__action">
                      <Button variant="secondary" size="sm" onClick={() => onOpenTaskItem(item)}>
                        {actionLabel(item)}
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
