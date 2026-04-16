import { ClinicianTruthChips } from '../clinician/ClinicianTruthChips';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PatientStatusBadge } from '../patients/PatientStatusBadge';
import type { WorklistRecord } from '../../types/models';
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../../utils/dashboard';
import {
  formatExercisesPct,
  getWorklistPrimaryAction,
  getWorklistReviewLabel,
  getWorklistReviewSupport,
  getWorklistTruthChips,
} from '../../utils/worklist';
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
        const truthChips = getWorklistTruthChips(item);
        const primaryAction = getWorklistPrimaryAction(item);
        const secondaryActions: Array<{
          key: string;
          label: string;
          onClick: () => void;
        }> = [];

        if (primaryAction.kind !== 'patient') {
          secondaryActions.push({
            key: 'patient',
            label: 'Open patient',
            onClick: () => onOpenPatient(item.patientId),
          });
        }

        if (hasCommunicationAction && primaryAction.kind !== 'communication') {
          secondaryActions.push({
            key: 'communication',
            label: 'Open communication',
            onClick: () => onOpenCommunication(item.patientId),
          });
        }

        if (item.openAlertsCount > 0 && primaryAction.kind !== 'alerts') {
          secondaryActions.push({
            key: 'alerts',
            label: 'Open alerts',
            onClick: () => onOpenAlerts(item.patientId),
          });
        }

        if (hasAppointment && primaryAction.kind !== 'appointments') {
          secondaryActions.push({
            key: 'appointments',
            label: 'Appointments',
            onClick: () => onOpenAppointments(item.patientId),
          });
        }

        const signalSupportLabel = `${
          item.latestRiskLevel === 'high' ? 'High risk' : 'Lower risk'
        } · ${
          item.communicationNeedsResponse
            ? item.communicationSummary?.responseDelayed ||
              item.communicationSummary?.delayedResponse
              ? `Response delayed (${item.communicationSummary.responseAgeHours ?? '—'}h)`
              : item.communicationSummary?.reviewedAfterLatestInbound
                ? 'Reviewed and awaiting follow-up'
                : item.communicationSummary?.responseDelayHours
                  ? `Response target ${item.communicationSummary.responseDelayHours}h`
                  : 'Response requested'
            : 'No response delay'
        }`;
        const activityMetrics = [
          { key: 'pain', label: 'Pain', value: asPainText(item.lastPainScore) },
          {
            key: 'exercises',
            label: 'Exercises',
            value: formatExercisesPct(item.adherenceSummary.exercisesPct),
          },
          {
            key: 'medication',
            label: 'Medication',
            value:
              typeof item.adherenceSummary.medicationTaken === 'boolean'
                ? item.adherenceSummary.medicationTaken
                  ? 'Taken'
                  : 'Missed'
                : '—',
          },
          ...(item.thresholdSummary
            ? [
                {
                  key: 'threshold',
                  label: 'Pain threshold',
                  value: `${item.thresholdSummary.painHighThreshold}/10`,
                },
              ]
            : []),
        ];
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
                </div>
              </div>

              <div className="worklist-card__reason">
                <strong className="worklist-card__reason-title">{reviewLabel}</strong>
                <p className="worklist-card__reason-support">{reviewSupport}</p>
              </div>

              <div className="worklist-card__signals">
                <div className="worklist-card__signal-group worklist-card__signal-group--primary">
                  <p className={`worklist-card__signal-lead worklist-card__signal-lead--${leadSignal.tone}`}>
                    {leadSignal.label}
                  </p>
                  {truthChips.length > 0 ? (
                    <ClinicianTruthChips
                      className="worklist-card__signal-chips"
                      chips={truthChips}
                    />
                  ) : null}
                </div>
                <div className="worklist-card__signal-meta">
                  <p className="worklist-card__signal-summary">
                    {signalSummary.length > 0
                      ? signalSummary.join(' · ')
                      : followThroughSummary.length > 0
                        ? 'Follow-through still pending.'
                        : 'No linked follow-through right now.'}
                  </p>
                  <p className="worklist-card__signal-support">{signalSupportLabel}</p>
                </div>
              </div>

              <dl className="worklist-card__activity">
                <div className="worklist-card__activity-highlights">
                  <div className="worklist-card__activity-line">
                    <dt>Last check-in</dt>
                    <dd title={formatDashboardDateTime(item.lastCheckinAt)}>
                      {formatDashboardRelativeTime(item.lastCheckinAt)}
                    </dd>
                  </div>
                  <div className="worklist-card__activity-line">
                    <dt>Updated</dt>
                    <dd title={formatDashboardDateTime(item.updatedAt)}>
                      {formatDashboardRelativeTime(item.updatedAt)}
                    </dd>
                  </div>
                </div>
                {hasAppointment ? (
                  <div className="worklist-card__activity-highlights">
                    <div className="worklist-card__activity-line">
                      <dt>Next appointment</dt>
                      <dd title={formatDashboardDateTime(item.nextAppointmentAt)}>
                        {formatDashboardDateTime(item.nextAppointmentAt)}
                      </dd>
                    </div>
                  </div>
                ) : null}
                {activityMetrics.map((metric) => (
                  <div key={metric.key} className="worklist-card__activity-stat">
                    <dt>{metric.label}</dt>
                    <dd>{metric.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="worklist-card__actions">
                <div className="worklist-card__actions-primary">
                  <Button
                    variant="primary"
                    size="sm"
                    fullWidth
                    onClick={() => {
                      if (primaryAction.kind === 'alerts') {
                        onOpenAlerts(item.patientId);
                        return;
                      }

                      if (primaryAction.kind === 'communication') {
                        onOpenCommunication(item.patientId);
                        return;
                      }

                      if (primaryAction.kind === 'appointments') {
                        onOpenAppointments(item.patientId);
                        return;
                      }

                      onOpenPatient(item.patientId);
                    }}
                  >
                    {primaryAction.label}
                  </Button>
                </div>
                <div className="worklist-card__actions-secondary">
                  {secondaryActions.map((action) => (
                    <Button key={action.key} variant="ghost" size="sm" onClick={action.onClick}>
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
