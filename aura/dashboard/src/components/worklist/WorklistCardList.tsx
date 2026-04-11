import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PatientStatusBadge } from '../patients/PatientStatusBadge';
import type { WorklistRecord } from '../../types/models';
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../../utils/dashboard';
import { formatExercisesPct, getWorklistReviewLabel, getWorklistReviewSupport } from '../../utils/worklist';
import { WorklistPriorityBadge } from './WorklistPriorityBadge';
import {
  asPainText,
  buildFollowThroughSummary,
  formatPromBadgeLabel,
  getInitials,
  getQueueLeadSignal,
} from './presentation';

interface WorklistCardListProps {
  items: WorklistRecord[];
  onOpenPatient: (patientId: string) => void;
  onOpenCommunication: (patientId: string) => void;
  onOpenAlerts: (patientId?: string) => void;
  onOpenAppointments: (patientId: string) => void;
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
        const leadSignal = getQueueLeadSignal(item, promBadgeLabel);
        const signalSummary =
          followThroughSummary[0] === leadSignal.label
            ? followThroughSummary.slice(1)
            : followThroughSummary;
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
                <p className={`worklist-card__signal-lead worklist-card__signal-lead--${leadSignal.tone}`}>
                  {leadSignal.label}
                </p>
                <p className="worklist-card__signal-summary">
                  {signalSummary.length > 0
                    ? signalSummary.join(' · ')
                    : followThroughSummary.length > 0
                      ? 'Follow-through still pending.'
                      : 'No linked follow-through right now.'}
                </p>
                <p className="worklist-card__signal-support">
                  {item.latestRiskLevel === 'high' ? 'High risk' : 'Lower risk'}
                  {' · '}
                  {item.communicationNeedsResponse
                    ? item.communicationSummary?.delayedResponse
                      ? `Response delayed (${item.communicationSummary.responseAgeHours ?? '—'}h)`
                      : item.communicationSummary?.responseDelayHours
                        ? `Response target ${item.communicationSummary.responseDelayHours}h`
                        : 'Response requested'
                    : 'No response delay'}
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
                {item.thresholdSummary ? (
                  <div className="worklist-card__activity-stat">
                    <dt>Pain threshold</dt>
                    <dd>{item.thresholdSummary.painHighThreshold}/10</dd>
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
