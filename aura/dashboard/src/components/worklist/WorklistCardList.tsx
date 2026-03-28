import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PatientStatusBadge } from '../patients/PatientStatusBadge';
import type { WorklistRecord } from '../../types/models';
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../../utils/dashboard';
import {
  formatExercisesPct,
  getWorklistReviewLabel,
  getWorklistReviewSupport,
} from '../../utils/worklist';
import { WorklistPriorityBadge } from './WorklistPriorityBadge';

interface WorklistCardListProps {
  items: WorklistRecord[];
  onOpenPatient: (patientId: string) => void;
  onOpenCommunication: (patientId: string) => void;
  onOpenAlerts: (patientId?: string) => void;
  onOpenAppointments: (patientId: string) => void;
}

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase() ?? '')
      .join('') || 'P'
  );
}

function asPainText(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return value.toFixed(1);
}

function formatPromBadgeLabel(item: WorklistRecord): string | null {
  const dueCount = item.proms?.dueCount ?? 0;
  const overdueCount = item.proms?.overdueCount ?? 0;

  if (dueCount <= 0) {
    return null;
  }

  if (overdueCount > 0) {
    return `${dueCount} PROM${dueCount === 1 ? '' : 's'} due (${overdueCount} overdue)`;
  }

  return `${dueCount} PROM${dueCount === 1 ? '' : 's'} due`;
}

function buildFollowThroughSummary(item: WorklistRecord, promBadgeLabel: string | null): string[] {
  const parts: string[] = [];

  if (item.activeTaskCount > 0) {
    parts.push(`${item.activeTaskCount} ${item.activeTaskCount === 1 ? 'task' : 'tasks'}`);
  }

  if (item.missedCheckins.flag) {
    parts.push(`Missed ${item.missedCheckins.count}`);
  }

  if (promBadgeLabel) {
    parts.push(promBadgeLabel);
  }

  if (item.nextAppointmentAt) {
    parts.push('Appointment scheduled');
  }

  return parts;
}

export function WorklistCardList({
  items,
  onOpenPatient,
  onOpenCommunication,
  onOpenAlerts,
  onOpenAppointments,
}: WorklistCardListProps): JSX.Element {
  return (
    <div className="worklist-card-list" aria-label="Worklist card list">
      {items.map((item) => {
        const hasAppointment = Boolean(item.nextAppointmentAt);
        const patientName = item.patientName?.trim() || item.patientId;
        const hasCommunicationAction =
          item.communicationNeedsResponse && item.patientId.trim().length > 0;
        const promBadgeLabel = formatPromBadgeLabel(item);
        const followThroughSummary = buildFollowThroughSummary(item, promBadgeLabel);
        const reviewLabel = getWorklistReviewLabel(item);
        const reviewSupport = getWorklistReviewSupport(item);
        const cardToneClass =
          item.latestRiskLevel === 'high'
            ? ' worklist-card--high-risk'
            : item.communicationNeedsResponse
              ? ' worklist-card--response'
              : item.openAlertsCount > 0
                ? ' worklist-card--alerts'
                : item.activeTaskCount > 0 ||
                    item.missedCheckins.flag ||
                    Boolean(promBadgeLabel) ||
                    hasAppointment
                  ? ' worklist-card--follow-through'
                  : ' worklist-card--monitor';
        return (
          <Card
            key={item.patientId}
            className={`worklist-card${cardToneClass}`}
            title={null}
            data-testid={`worklist-card-${item.patientId}`}
            aria-label={`Worklist patient ${patientName}`}
          >
            <div className="worklist-card__body">
              <div className="worklist-card__header">
                <div className="worklist-card__patient">
                  <span className="worklist-card__avatar" aria-hidden="true">
                    {getInitials(patientName)}
                  </span>
                  <div className="worklist-card__patient-copy">
                    <div className="worklist-card__patient-line">
                      <strong className="worklist-card__patient-name">{patientName}</strong>
                      <PatientStatusBadge className="worklist-card__status" status={item.patientStatus} />
                    </div>
                    <div className="worklist-card__patient-meta">
                      <span className="patient-id-text">ID: {item.patientId}</span>
                      {item.rehabPhase ? <span>{item.rehabPhase}</span> : null}
                    </div>
                  </div>
                </div>
                <div className="worklist-card__header-side">
                  <WorklistPriorityBadge className="worklist-card__priority" item={item} />
                  <p
                    className="worklist-card__updated"
                    title={formatDashboardDateTime(item.updatedAt)}
                  >
                    Updated {formatDashboardRelativeTime(item.updatedAt)}
                  </p>
                </div>
              </div>

              <div className="worklist-card__reason">
                <strong className="worklist-card__reason-title">{reviewLabel}</strong>
                <p className="worklist-card__reason-support">{reviewSupport}</p>
              </div>

              <div className="worklist-card__signals">
                <div className="worklist-card__signal-group">
                  <Badge variant={item.latestRiskLevel === 'high' ? 'risk-high' : 'risk-low'}>
                    {item.latestRiskLevel === 'high' ? 'High risk' : 'Low risk'}
                  </Badge>
                  {item.communicationNeedsResponse ? <Badge variant="warning">Needs response</Badge> : null}
                  {item.openAlertsCount > 0 ? <Badge variant="danger">{item.openAlertsCount} alerts</Badge> : null}
                </div>
                <p className="worklist-card__signal-summary">
                  {followThroughSummary.length > 0
                    ? followThroughSummary.join(' · ')
                    : 'No linked follow-through right now.'}
                </p>
              </div>

              <dl className="worklist-card__activity">
                <div className="worklist-card__activity-highlights">
                  <dt>Last check-in</dt>
                  <dd title={formatDashboardDateTime(item.lastCheckinAt)}>
                    {formatDashboardRelativeTime(item.lastCheckinAt)}
                  </dd>
                </div>
                {hasAppointment ? (
                  <div className="worklist-card__activity-highlights">
                    <dt>Next appointment</dt>
                    <dd title={formatDashboardDateTime(item.nextAppointmentAt)}>
                      {formatDashboardDateTime(item.nextAppointmentAt)}
                    </dd>
                  </div>
                ) : null}
                <div className="worklist-card__activity-stat">
                  <dt>Pain</dt>
                  <dd>{asPainText(item.lastPainScore)}</dd>
                </div>
                <div className="worklist-card__activity-stat">
                  <dt>Exercises</dt>
                  <dd>{formatExercisesPct(item.adherenceSummary.exercisesPct)}</dd>
                </div>
                <div className="worklist-card__activity-stat">
                  <dt>Medication</dt>
                  <dd>
                    {typeof item.adherenceSummary.medicationTaken === 'boolean'
                      ? item.adherenceSummary.medicationTaken
                        ? 'Taken'
                        : 'Missed'
                      : '—'}
                  </dd>
                </div>
              </dl>

              <div className="worklist-card__actions">
                <div className="worklist-card__actions-primary">
                  <Button
                    variant="primary"
                    size="sm"
                    fullWidth
                    onClick={() => onOpenPatient(item.patientId)}
                  >
                    Open patient
                  </Button>
                </div>
                {hasCommunicationAction || item.openAlertsCount > 0 || hasAppointment ? (
                  <div className="worklist-card__actions-secondary">
                    {hasCommunicationAction ? (
                      <Button variant="ghost" size="sm" onClick={() => onOpenCommunication(item.patientId)}>
                        Open communication
                      </Button>
                    ) : null}
                    {item.openAlertsCount > 0 ? (
                      <Button variant="ghost" size="sm" onClick={() => onOpenAlerts(item.patientId)}>
                        Open alerts
                      </Button>
                    ) : null}
                    {hasAppointment ? (
                      <Button variant="ghost" size="sm" onClick={() => onOpenAppointments(item.patientId)}>
                        Appointments
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
