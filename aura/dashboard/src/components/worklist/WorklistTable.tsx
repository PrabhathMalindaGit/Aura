import type { KeyboardEvent, MouseEvent } from 'react';
import { Button } from '../ui/Button';
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
                      <p
                        className="worklist-table__updated"
                        title={formatDashboardDateTime(item.updatedAt)}
                      >
                        Updated {formatDashboardRelativeTime(item.updatedAt)}
                      </p>
                    </div>
                    <strong className="worklist-table__reason-title">{reviewLabel}</strong>
                    <p className="worklist-table__reason-support">{reviewSupport}</p>
                  </div>
                </td>

                <td className="worklist-table__cell worklist-table__cell--signals">
                  <div className="worklist-table__signals">
                    <p className={`worklist-table__signal-lead worklist-table__signal-lead--${leadSignal.tone}`}>
                      {leadSignal.label}
                    </p>
                    {signalSummary.length > 0 ? (
                      <p className="worklist-table__signal-summary">
                        {signalSummary.join(' · ')}
                      </p>
                    ) : followThroughSummary.length > 0 ? (
                      <p className="worklist-table__signal-summary">Follow-through still pending.</p>
                    ) : (
                      <p className="worklist-table__signal-summary">No linked follow-through right now.</p>
                    )}
                    <p className="worklist-table__signal-support">
                      {item.latestRiskLevel === 'high' ? 'High risk' : 'Lower risk'}
                      {' · '}
                      {item.communicationNeedsResponse ? 'Response requested' : 'No response delay'}
                    </p>
                  </div>
                </td>

                <td className="worklist-table__cell worklist-table__cell--activity">
                  <div className="worklist-table__activity">
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
                    <p className="worklist-table__activity-meta">
                      Pain {asPainText(item.lastPainScore)} · Exercises{' '}
                      {formatExercisesPct(item.adherenceSummary.exercisesPct)} · Medication{' '}
                      {typeof item.adherenceSummary.medicationTaken === 'boolean'
                        ? item.adherenceSummary.medicationTaken
                          ? 'Taken'
                          : 'Missed'
                        : '—'}
                    </p>
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
                        onClick={() => onOpenPatient(item.patientId)}
                      >
                        Open patient
                      </Button>
                    </div>
                    {hasCommunicationAction || item.openAlertsCount > 0 || hasAppointment ? (
                      <div className="worklist-table__actions-secondary">
                        {hasCommunicationAction ? (
                          <Button
                            className="worklist-table__communication"
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenCommunication(item.patientId)}
                          >
                            Open communication
                          </Button>
                        ) : null}
                        {item.openAlertsCount > 0 ? (
                          <Button
                            className="worklist-table__alerts"
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenAlerts(item.patientId)}
                          >
                            Open alerts
                          </Button>
                        ) : null}
                        {hasAppointment ? (
                          <Button
                            className="worklist-table__appointments"
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenAppointments(item.patientId)}
                          >
                            Appointments
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
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
