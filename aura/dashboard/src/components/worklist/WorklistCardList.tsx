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

export function WorklistCardList({
  items,
  onOpenPatient,
  onOpenAlerts,
  onOpenAppointments,
}: WorklistCardListProps): JSX.Element {
  return (
    <div className="worklist-card-list" aria-label="Worklist card list">
      {items.map((item) => {
        const hasAppointment = Boolean(item.nextAppointmentAt);
        const patientName = item.patientName?.trim() || item.patientId;
        return (
          <Card
            key={item.patientId}
            className={`worklist-card${item.latestRiskLevel === 'high' ? ' worklist-card--high-risk' : ''}${item.communicationNeedsResponse ? ' worklist-card--response' : ''}`}
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
                <WorklistPriorityBadge item={item} />
              </div>

              <div className="worklist-card__reason">
                <strong className="worklist-card__reason-title">{getWorklistReviewLabel(item)}</strong>
                <p className="worklist-card__reason-support">{getWorklistReviewSupport(item)}</p>
              </div>

              <div className="worklist-card__signals">
                <Badge variant={item.latestRiskLevel === 'high' ? 'risk-high' : 'risk-low'}>
                  {item.latestRiskLevel === 'high' ? 'High risk' : 'Low risk'}
                </Badge>
                {item.openAlertsCount > 0 ? <Badge variant="danger">{item.openAlertsCount} alerts</Badge> : null}
                {item.communicationNeedsResponse ? <Badge variant="warning">Needs response</Badge> : null}
                {item.activeTaskCount > 0 ? <Badge variant="neutral">{item.activeTaskCount} tasks</Badge> : null}
                {item.missedCheckins.flag ? <Badge variant="warning">Missed {item.missedCheckins.count}</Badge> : null}
                {hasAppointment ? <Badge variant="default">Appointment</Badge> : null}
              </div>

              <dl className="worklist-card__activity">
                <div>
                  <dt>Last check-in</dt>
                  <dd title={formatDashboardDateTime(item.lastCheckinAt)}>
                    {formatDashboardRelativeTime(item.lastCheckinAt)}
                  </dd>
                </div>
                <div>
                  <dt>Pain</dt>
                  <dd>{asPainText(item.lastPainScore)}</dd>
                </div>
                <div>
                  <dt>Exercises</dt>
                  <dd>{formatExercisesPct(item.adherenceSummary.exercisesPct)}</dd>
                </div>
                <div>
                  <dt>Medication</dt>
                  <dd>
                    {typeof item.adherenceSummary.medicationTaken === 'boolean'
                      ? item.adherenceSummary.medicationTaken
                        ? 'Taken'
                        : 'Missed'
                      : '—'}
                  </dd>
                </div>
                {hasAppointment ? (
                  <div>
                    <dt>Next appointment</dt>
                    <dd title={formatDashboardDateTime(item.nextAppointmentAt)}>
                      {formatDashboardDateTime(item.nextAppointmentAt)}
                    </dd>
                  </div>
                ) : null}
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
                {item.openAlertsCount > 0 || hasAppointment ? (
                  <div className="worklist-card__actions-secondary">
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
