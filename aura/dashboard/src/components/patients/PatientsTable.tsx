import type { KeyboardEvent, MouseEvent } from 'react';
import type { PatientSummary } from '../../types/models';
import { getPatientDisplayName, getPatientStatus, hasOpenAlerts, isMissedCheckin } from '../../utils/patientFilters';
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
            <th scope="col">Patient</th>
            <th scope="col">Status</th>
            <th scope="col">Last check-in</th>
            <th scope="col">Open alerts</th>
            <th scope="col">Last 7d pain</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((patient, index) => {
            const displayName = getPatientDisplayName(patient);
            const showIdSubline = Boolean(patient.displayName && patient.displayName.trim().length > 0);
            const status = getPatientStatus(patient);
            const missedCheckin = isMissedCheckin(patient);

            return (
              <tr
                key={patient.id}
                data-row-index={index}
                tabIndex={0}
                className="patients-table__row"
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
                <td>
                  <div className="patients-table__patient">
                    <strong>{displayName}</strong>
                    {showIdSubline ? <span className="muted-text">ID: {patient.id}</span> : null}
                  </div>
                </td>
                <td>
                  <PatientStatusBadge status={status} />
                </td>
                <td>
                  <div className="patients-table__checkin">
                    <time dateTime={patient.lastCheckinAt} title={formatDateTime(patient.lastCheckinAt)}>
                      {formatRelativeDate(patient.lastCheckinAt)}
                    </time>
                    {missedCheckin ? (
                      <Badge variant="warning" icon>
                        Missed check-in
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td>
                  <Badge variant={hasOpenAlerts(patient) ? 'danger' : 'default'}>
                    {patient.openAlertCount ?? 0}
                  </Badge>
                </td>
                <td>{asPainText(patient.lastPain)}</td>
                <td>
                  <div
                    className="patients-table__actions"
                    onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenPatient(patient.id);
                      }}
                    >
                      View
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
