import type { KeyboardEvent, MouseEvent } from 'react';
import type { PatientSummary } from '../../types/models';
import {
  getPatientDisplayName,
  getPatientRosterReason,
  getPatientStatus,
  hasOpenAlerts,
  isMissedCheckin,
} from '../../utils/patientFilters';
import { formatDateTime, formatRelativeDate } from '../../utils/date';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { PatientStatusBadge } from './PatientStatusBadge';
import { PatientStatusMenu } from './PatientStatusMenu';

interface PatientsTableProps {
  patients: PatientSummary[];
  onOpenPatient: (patientId: string) => void;
}

function asPainText(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return value.toFixed(1);
}

function formatOpenAlertsText(count: number): string {
  return count === 0 ? 'No active alerts' : `${count} active alert${count === 1 ? '' : 's'}`;
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

export function PatientsTable({ patients, onOpenPatient }: PatientsTableProps): JSX.Element {
  return (
    <div className="patients-table-wrap" role="region" aria-label="Patients table">
      <table className="patients-table">
        <thead>
          <tr>
            <th scope="col" className="patients-table__head patients-table__head--patient">
              Patient
            </th>
            <th scope="col" className="patients-table__head patients-table__head--status">
              Care state
            </th>
            <th scope="col" className="patients-table__head patients-table__head--checkin">
              Recent activity
            </th>
            <th scope="col" className="patients-table__head patients-table__head--alerts">
              Alert burden
            </th>
            <th scope="col" className="patients-table__head patients-table__head--pain">
              Pain trend
            </th>
            <th scope="col" className="patients-table__head patients-table__head--actions">
              Next step
            </th>
          </tr>
        </thead>
        <tbody>
          {patients.map((patient, index) => {
            const displayName = getPatientDisplayName(patient);
            const showIdSubline = Boolean(patient.displayName && patient.displayName.trim().length > 0);
            const status = getPatientStatus(patient);
            const missedCheckin = isMissedCheckin(patient);
            const openAlertCount = patient.openAlertCount ?? 0;
            const hasOpenAlertCount = hasOpenAlerts(patient);
            const rosterReason = getPatientRosterReason(patient);
            const painSeverity =
              typeof patient.lastPain === 'number' && !Number.isNaN(patient.lastPain)
                ? patient.lastPain >= 7
                  ? 'high'
                  : patient.lastPain >= 4
                    ? 'mid'
                    : 'low'
                : 'none';
            const initials = displayName
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase() ?? '')
              .join('') || 'P';

            return (
              <tr
                key={patient.id}
                data-row-index={index}
                tabIndex={0}
                className={`patients-table__row${hasOpenAlertCount ? ' patients-table__row--attention' : ''}${missedCheckin ? ' patients-table__row--missed' : ''}`}
                onClick={() => onOpenPatient(patient.id)}
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
                    onOpenPatient(patient.id);
                  }
                }}
                aria-label={`Patient ${displayName}`}
              >
                <td className="patients-table__cell patients-table__cell--patient">
                  <div className="patients-table__patient">
                    <span className="patients-table__avatar" aria-hidden="true">
                      {initials}
                    </span>
                    <div className="patients-table__patient-text">
                      <strong className={showIdSubline ? 'patients-table__patient-name' : 'patient-id-text patients-table__patient-name'}>
                        {displayName}
                      </strong>
                      {showIdSubline ? <span className="patient-id-text patients-table__patient-id">ID: {patient.id}</span> : null}
                      <span className="patients-table__patient-support">{rosterReason}</span>
                    </div>
                  </div>
                </td>
                <td className="patients-table__cell patients-table__cell--status">
                  <div className="patients-table__metric">
                    <PatientStatusBadge className="patients-status-badge" status={status} />
                    <p className="patients-table__support">
                      {status === 'active'
                        ? 'Currently in active care'
                        : status === 'on_hold'
                          ? 'Temporarily paused'
                          : status === 'discharged'
                            ? 'Completed care cycle'
                            : 'Not currently active'}
                    </p>
                  </div>
                </td>
                <td className="patients-table__cell patients-table__cell--checkin">
                  <div className="patients-table__checkin">
                    <time
                      className="patients-table__checkin-time"
                      dateTime={patient.lastCheckinAt}
                      title={formatDateTime(patient.lastCheckinAt)}
                    >
                      {formatRelativeDate(patient.lastCheckinAt)}
                    </time>
                    <span className="patients-table__checkin-detail">{formatDateTime(patient.lastCheckinAt)}</span>
                    {missedCheckin ? (
                      <Badge className="patients-table__missed-badge" variant="warning" icon>
                        Missed check-in
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="patients-table__cell patients-table__cell--alerts">
                  <div className="patients-table__metric patients-table__metric--alerts">
                    <Badge
                      className={`patients-table__alerts-badge${hasOpenAlertCount ? ' patients-table__alerts-badge--active' : ''}`}
                      variant={hasOpenAlertCount ? 'danger' : 'default'}
                    >
                      {hasOpenAlertCount ? `${openAlertCount} open` : 'Clear'}
                    </Badge>
                    <p className="patients-table__support">{formatOpenAlertsText(openAlertCount)}</p>
                  </div>
                </td>
                <td className="patients-table__cell patients-table__cell--pain">
                  <div className="patients-table__metric patients-table__metric--pain">
                    <span className={`patients-table__pain-value patients-table__pain-value--${painSeverity}`}>
                      {asPainText(patient.lastPain)}
                    </span>
                    <p className="patients-table__support">
                      {typeof patient.lastPain === 'number' && !Number.isNaN(patient.lastPain)
                        ? 'Last 7-day average'
                        : 'No pain trend yet'}
                    </p>
                  </div>
                </td>
                <td className="patients-table__cell patients-table__cell--actions">
                  <div
                    className="patients-table__actions"
                    onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
                  >
                    <Button
                      className="patients-table__view"
                      variant="secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenPatient(patient.id);
                      }}
                    >
                      Open
                    </Button>
                    <PatientStatusMenu currentStatus={status} compact />
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
