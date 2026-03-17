import type { KeyboardEvent, MouseEvent } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { PatientStatusBadge } from '../patients/PatientStatusBadge';
import type { WorklistRecord } from '../../types/models';
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../../utils/dashboard';
import {
  formatExercisesPct,
  getWorklistReviewLabel,
  getWorklistReviewSupport,
} from '../../utils/worklist';
import { WorklistPriorityBadge } from './WorklistPriorityBadge';

interface WorklistTableProps {
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
              Review focus
            </th>
            <th scope="col" className="worklist-table__head worklist-table__head--signals">
              Signals
            </th>
            <th scope="col" className="worklist-table__head worklist-table__head--activity">
              Recent review
            </th>
            <th scope="col" className="worklist-table__head worklist-table__head--actions">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const hasAppointment = Boolean(item.nextAppointmentAt);
            const patientName = item.patientName?.trim() || item.patientId;
            const hasCommunicationAction =
              item.communicationNeedsResponse && item.patientId.trim().length > 0;
            return (
              <tr
                key={item.patientId}
                data-row-index={index}
                data-testid={`worklist-row-${item.patientId}`}
                tabIndex={0}
                className={`worklist-table__row${item.latestRiskLevel === 'high' ? ' worklist-table__row--high-risk' : ''}${item.communicationNeedsResponse ? ' worklist-table__row--response' : ''}`}
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
                    <div className="worklist-table__reason-top">
                      <WorklistPriorityBadge item={item} />
                    </div>
                    <strong className="worklist-table__reason-title">{getWorklistReviewLabel(item)}</strong>
                    <p className="worklist-table__reason-support">{getWorklistReviewSupport(item)}</p>
                  </div>
                </td>

                <td className="worklist-table__cell worklist-table__cell--signals">
                  <div className="worklist-table__signals">
                    <Badge variant={item.latestRiskLevel === 'high' ? 'risk-high' : 'risk-low'}>
                      {item.latestRiskLevel === 'high' ? 'High risk' : 'Low risk'}
                    </Badge>
                    {item.openAlertsCount > 0 ? <Badge variant="danger">{item.openAlertsCount} alerts</Badge> : null}
                    {item.communicationNeedsResponse ? <Badge variant="warning">Needs response</Badge> : null}
                    {item.activeTaskCount > 0 ? <Badge variant="neutral">{item.activeTaskCount} tasks</Badge> : null}
                    {item.missedCheckins.flag ? (
                      <Badge variant="warning">Missed {item.missedCheckins.count}</Badge>
                    ) : null}
                    {hasAppointment ? <Badge variant="default">Appointment</Badge> : null}
                  </div>
                </td>

                <td className="worklist-table__cell worklist-table__cell--activity">
                  <div className="worklist-table__activity">
                    <div className="worklist-table__activity-line">
                      <span className="worklist-table__activity-label">Last check-in</span>
                      <time title={formatDashboardDateTime(item.lastCheckinAt)}>{formatDashboardRelativeTime(item.lastCheckinAt)}</time>
                    </div>
                    <div className="worklist-table__activity-line">
                      <span className="worklist-table__activity-label">Pain</span>
                      <span>{asPainText(item.lastPainScore)}</span>
                    </div>
                    <div className="worklist-table__activity-line">
                      <span className="worklist-table__activity-label">Exercises</span>
                      <span>{formatExercisesPct(item.adherenceSummary.exercisesPct)}</span>
                    </div>
                    <div className="worklist-table__activity-line">
                      <span className="worklist-table__activity-label">Medication</span>
                      <span>
                        {typeof item.adherenceSummary.medicationTaken === 'boolean'
                          ? item.adherenceSummary.medicationTaken
                            ? 'Taken'
                            : 'Missed'
                          : '—'}
                      </span>
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
