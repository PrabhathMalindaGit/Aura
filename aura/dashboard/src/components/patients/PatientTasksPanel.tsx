import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import type { ClinicianTaskItem } from '../../types/models';
import { formatDashboardDateTime, formatDashboardRelativeTime, humanizeDashboardLabel } from '../../utils/dashboard';
import { taskPriorityLabel, taskPriorityTone } from '../../utils/patientDetail';

interface PatientTasksPanelProps {
  activeTasks: ClinicianTaskItem[];
  recentCompletedTasks: ClinicianTaskItem[];
  isLoading?: boolean;
  error?: string | null;
  completingTaskId?: string | null;
  onRetry: () => void;
  onCompleteTask: (taskId: string) => void;
  onOpenAlerts: () => void;
  onOpenAppointments: () => void;
}

function priorityVariant(priority: ClinicianTaskItem['priority']): 'danger' | 'warning' | 'neutral' {
  return taskPriorityTone(priority) === 'danger'
    ? 'danger'
    : taskPriorityTone(priority) === 'warning'
      ? 'warning'
      : 'neutral';
}

export function PatientTasksPanel({
  activeTasks,
  recentCompletedTasks,
  isLoading = false,
  error,
  completingTaskId,
  onRetry,
  onCompleteTask,
  onOpenAlerts,
  onOpenAppointments,
}: PatientTasksPanelProps): JSX.Element {
  const urgentCount = activeTasks.filter((task) => task.priority === 'urgent').length;

  return (
    <Card
      id="patient-tasks-panel"
      className="patient-detail-panel patient-detail-panel--operational patient-detail-panel--operations-primary patient-detail-panel--workflow-tasks"
      title="Tasks and follow-up"
      action={
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Refresh
        </Button>
      }
      data-testid="patient-tasks-panel"
    >
      {isLoading ? (
        <div className="patient-detail-skeleton-grid" aria-label="Patient tasks loading placeholder">
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
      ) : activeTasks.length === 0 && recentCompletedTasks.length === 0 ? (
        <EmptyState
          title="No open tasks for this patient"
          description="Patient-scoped follow-up tasks will appear here when action is needed."
          tone="success"
        />
      ) : (
        <div className="patient-task-groups">
          <div className="patient-task-groups__overview">
            <div className="patient-task-groups__overview-fact">
              <span>Open now</span>
              <strong>{activeTasks.length}</strong>
            </div>
            <div className="patient-task-groups__overview-fact patient-task-groups__overview-fact--warning">
              <span>Urgent</span>
              <strong>{urgentCount}</strong>
            </div>
            <div className="patient-task-groups__overview-fact">
              <span>Completed</span>
              <strong>{recentCompletedTasks.length}</strong>
            </div>
          </div>

          <div className="patient-task-group">
            <div className="patient-task-group__header">
              <strong>Open now</strong>
              <span className="muted-text">{activeTasks.length}</span>
            </div>
            {activeTasks.length === 0 ? (
              <p className="muted-text">No open or in-progress tasks.</p>
            ) : (
              <div className="patient-task-list">
                {activeTasks.map((task) => (
                  <article
                    key={task.id}
                    className={`patient-task-item patient-task-item--${taskPriorityTone(task.priority)}`}
                  >
                    <div className="patient-task-item__copy">
                      <strong className="patient-task-item__title">{task.title}</strong>
                      <div className="patient-task-item__meta">
                        <Badge variant={priorityVariant(task.priority)}>{taskPriorityLabel(task.priority)}</Badge>
                        <Badge variant="neutral">{humanizeDashboardLabel(task.type)}</Badge>
                        <Badge variant="default">{humanizeDashboardLabel(task.status)}</Badge>
                      </div>
                      {task.description ? <p className="patient-task-item__description">{task.description}</p> : null}
                      <p className="muted-text">
                        Due{' '}
                        <span title={formatDashboardDateTime(task.dueAt)}>
                          {formatDashboardRelativeTime(task.dueAt ?? task.updatedAt)}
                        </span>
                        {task.assignedTo ? ` · Assigned ${task.assignedTo}` : ''}
                      </p>
                    </div>
                    <div className="patient-task-item__actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={completingTaskId === task.id}
                        onClick={() => onCompleteTask(task.id)}
                      >
                        {completingTaskId === task.id ? 'Completing…' : 'Mark complete'}
                      </Button>
                      {task.linkedAlertId ? (
                        <Button variant="ghost" size="sm" onClick={onOpenAlerts}>
                          Alert
                        </Button>
                      ) : null}
                      {task.linkedAppointmentId ? (
                        <Button variant="ghost" size="sm" onClick={onOpenAppointments}>
                          Appointment
                        </Button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {recentCompletedTasks.length > 0 ? (
            <div className="patient-task-group">
              <div className="patient-task-group__header">
                <strong>Recently completed</strong>
                <span className="muted-text">{recentCompletedTasks.length}</span>
              </div>
              <div className="patient-task-list">
                {recentCompletedTasks.map((task) => (
                  <article key={task.id} className="patient-task-item patient-task-item--completed">
                    <div className="patient-task-item__copy">
                      <strong className="patient-task-item__title">{task.title}</strong>
                      <div className="patient-task-item__meta">
                        <Badge variant="success">Completed</Badge>
                        <Badge variant="neutral">{humanizeDashboardLabel(task.type)}</Badge>
                      </div>
                      <p className="muted-text">
                        Completed{' '}
                        <span title={formatDashboardDateTime(task.completedAt ?? task.updatedAt)}>
                          {formatDashboardRelativeTime(task.completedAt ?? task.updatedAt)}
                        </span>
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
