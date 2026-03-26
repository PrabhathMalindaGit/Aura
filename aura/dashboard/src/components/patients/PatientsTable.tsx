import type { KeyboardEvent, MouseEvent } from 'react';
import type { PatientSummary } from '../../types/models';
import {
  getPatientDisplayName,
  getPatientStatus,
  hasOpenAlerts,
  isMissedCheckin,
} from '../../utils/patientFilters';
import { formatDateTime, formatRelativeDate } from '../../utils/date';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { buildPatientTriageSupportLine } from './patientRosterSignalUtils';
import { PatientAlertBurdenSignal, PatientPainLevelSignal } from './PatientRosterSignals';
import { PatientStatusBadge } from './PatientStatusBadge';
import { PatientStatusMenu } from './PatientStatusMenu';

interface PatientsTableProps {
  patients: PatientSummary[];
  onOpenPatient: (patientId: string) => void;
  selectedComparePatientIds: string[];
  onToggleComparePatient: (patientId: string) => void;
  compareSelectionLimitReached: boolean;
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

export function PatientsTable({
  patients,
  onOpenPatient,
  selectedComparePatientIds,
  onToggleComparePatient,
  compareSelectionLimitReached,
}: PatientsTableProps): JSX.Element {
  return (
    <div className="patients-table-wrap" role="region" aria-label="Patients table">
      <table className="patients-table">
        <thead>
          <tr>
            <th scope="col" className="patients-table__head patients-table__head--compare">
              Compare
            </th>
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
              Pain level
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
            const rosterSupportLine = buildPatientTriageSupportLine(patient);
            const isSelectedForCompare = selectedComparePatientIds.includes(patient.id);
            const compareDisabled = !isSelectedForCompare && compareSelectionLimitReached;
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
                <td className="patients-table__cell patients-table__cell--compare">
                  <label
                    className="patients-table__compare"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelectedForCompare}
                      disabled={compareDisabled}
                      aria-label={`Select ${displayName} for compare`}
                      onChange={() => onToggleComparePatient(patient.id)}
                    />
                  </label>
                </td>
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
                      <span className="patients-table__patient-support">{rosterSupportLine}</span>
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
                    <PatientAlertBurdenSignal count={openAlertCount} />
                  </div>
                </td>
                <td className="patients-table__cell patients-table__cell--pain">
                  <div className="patients-table__metric patients-table__metric--pain">
                    <PatientPainLevelSignal value={patient.lastPain} />
                  </div>
                </td>
                <td className="patients-table__cell patients-table__cell--actions">
                  <div
                    className="patients-table__actions"
                    onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
                  >
                    <div className="patients-table__actions-primary">
                      <Button
                        className="patients-table__view"
                        variant="secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenPatient(patient.id);
                        }}
                      >
                        Open review
                      </Button>
                    </div>
                    <div className="patients-table__actions-secondary">
                      <PatientStatusMenu currentStatus={status} compact />
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
