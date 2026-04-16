import type { KeyboardEvent, MouseEvent } from 'react';
import { ClinicianTruthChips } from '../clinician/ClinicianTruthChips';
import { Button } from '../ui/Button';
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

interface WorklistTableProps {
  items: WorklistRecord[];
  onOpenPatient: (patientId: string) => void;
  onOpenCommunication: (patientId: string) => void;
  onOpenAlerts: (patientId?: string) => void;
  onOpenAppointments: (patientId: string) => void;
}

function moveFocusToRow(
  event: KeyboardEvent<HTMLTableRowElement>,
  direction: 'next' | 'prev',
): void {
  const current = event.currentTarget;
  const index = Number(current.dataset.rowIndex ?? '0');
  const nextIndex = direction === 'next' ? index + 1 : index - 1;
  const tableBody = current.closest('tbody');
  const nextRow = tableBody?.querySelector<HTMLTableRowElement>(`tr[data-row-index="${nextIndex}"]`);

  if (nextRow) {
    event.preventDefault();
    nextRow.focus();
  }
}

export function WorklistTable({
  items,
  onOpenPatient,
  onOpenCommunication,
  onOpenAlerts,
  onOpenAppointments,
}: WorklistTableProps): JSX.Element {
  return (
    <div className="worklist-table-wrap" role="region" aria-label="Worklist table">
      <table className="worklist-table">
        <thead>
          <tr>
            <th scope="col" className="worklist-table__head worklist-table__head--patient">
              Patient
            </th>
            <th scope="col" className="worklist-table__head worklist-table__head--reason">
              Why now
            </th>
            <th scope="col" className="worklist-table__head worklist-table__head--signals">
              Urgency
            </th>
            <th scope="col" className="worklist-table__head worklist-table__head--activity">
              Freshness
            </th>
            <th scope="col" className="worklist-table__head worklist-table__head--actions">
              Next action
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
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
            const rowToneClass =
              item.latestRiskLevel === 'high'
                ? ' worklist-table__row--high-risk'
                : item.communicationNeedsResponse
                  ? ' worklist-table__row--response'
                  : item.openAlertsCount > 0
                    ? ' worklist-table__row--alerts'
                    : item.activeTaskCount > 0 ||
                        item.missedCheckins.flag ||
                        Boolean(promBadgeLabel) ||
                        hasAppointment
                      ? ' worklist-table__row--follow-through'
                      : ' worklist-table__row--monitor';
            return (
              <tr
                key={item.patientId}
                data-row-index={index}
                data-testid={`worklist-row-${item.patientId}`}
                tabIndex={0}
                className={`worklist-table__row${rowToneClass}`}
                onClick={() => onOpenPatient(item.patientId)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    moveFocusToRow(event, 'next');
                    return;
                  }

                  if (event.key === 'ArrowUp') {
                    moveFocusToRow(event, 'prev');
                    return;
                  }

                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpenPatient(item.patientId);
                  }
                }}
                aria-label={`Worklist patient ${patientName}`}
              >
                <td className="worklist-table__cell worklist-table__cell--patient">
                  <div className="worklist-table__patient">
                    <span className="worklist-table__avatar" aria-hidden="true">
                      {getInitials(patientName)}
                    </span>
                    <div className="worklist-table__patient-text">
                      <div className="worklist-table__patient-line">
                        <strong className="worklist-table__patient-name">{patientName}</strong>
                        <PatientStatusBadge className="worklist-table__status" status={item.patientStatus} />
                      </div>
                      <div className="worklist-table__patient-meta">
                        <span className="patient-id-text">ID: {item.patientId}</span>
                        {item.rehabPhase ? <span>{item.rehabPhase}</span> : null}
                      </div>
                    </div>
                  </div>
                </td>

                <td className="worklist-table__cell worklist-table__cell--reason">
                  <div className="worklist-table__reason">
                    <div className="worklist-table__reason-kicker">
                      <WorklistPriorityBadge className="worklist-table__priority" item={item} />
                    </div>
                    <strong className="worklist-table__reason-title">{reviewLabel}</strong>
                    <p className="worklist-table__reason-support">{reviewSupport}</p>
                  </div>
                </td>

                <td className="worklist-table__cell worklist-table__cell--signals">
                  <div className="worklist-table__signals">
                    <div className="worklist-table__signal-group worklist-table__signal-group--primary">
                      <p className={`worklist-table__signal-lead worklist-table__signal-lead--${leadSignal.tone}`}>
                        {leadSignal.label}
                      </p>
                      {truthChips.length > 0 ? (
                        <ClinicianTruthChips
                          className="worklist-table__signal-chips"
                          chips={truthChips}
                        />
                      ) : null}
                    </div>
                    <div className="worklist-table__signal-meta">
                      <p className="worklist-table__signal-summary">
                        {signalSummary.length > 0
                          ? signalSummary.join(' · ')
                          : followThroughSummary.length > 0
                            ? 'Follow-through still pending.'
                            : 'No linked follow-through right now.'}
                      </p>
                      <p className="worklist-table__signal-support">{signalSupportLabel}</p>
                    </div>
                  </div>
                </td>

                <td className="worklist-table__cell worklist-table__cell--activity">
                  <div className="worklist-table__activity">
                    <div className="worklist-table__activity-highlights">
                      <div className="worklist-table__activity-line worklist-table__activity-line--lead">
                        <span className="worklist-table__activity-label">Last check-in</span>
                        <time title={formatDashboardDateTime(item.lastCheckinAt)}>
                          {formatDashboardRelativeTime(item.lastCheckinAt)}
                        </time>
                      </div>
                      <div className="worklist-table__activity-line">
                        <span className="worklist-table__activity-label">Updated</span>
                        <time title={formatDashboardDateTime(item.updatedAt)}>
                          {formatDashboardRelativeTime(item.updatedAt)}
                        </time>
                      </div>
                      {hasAppointment ? (
                        <div className="worklist-table__activity-line">
                          <span className="worklist-table__activity-label">Next appointment</span>
                          <time title={formatDashboardDateTime(item.nextAppointmentAt)}>
                            {formatDashboardDateTime(item.nextAppointmentAt)}
                          </time>
                        </div>
                      ) : null}
                    </div>
                    <div className="worklist-table__activity-metrics">
                      {activityMetrics.map((metric) => (
                        <div key={metric.key} className="worklist-table__activity-stat">
                          <span className="worklist-table__activity-label">{metric.label}</span>
                          <span className="worklist-table__activity-value">{metric.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </td>

                <td className="worklist-table__cell worklist-table__cell--actions">
                  <div
                    className="worklist-table__actions"
                    onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
                  >
                    <div className="worklist-table__actions-primary">
                      <Button
                        className="worklist-table__open"
                        variant="primary"
                        size="sm"
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
                    <div className="worklist-table__actions-secondary">
                      {secondaryActions.map((action) => (
                        <Button
                          key={action.key}
                          variant="ghost"
                          size="sm"
                          onClick={action.onClick}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
