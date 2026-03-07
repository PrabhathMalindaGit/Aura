import type { PatientSummary } from '../../types/models';
import { getPatientDisplayName, getPatientStatus, hasOpenAlerts, isMissedCheckin } from '../../utils/patientFilters';
import { formatDateTime, formatRelativeDate } from '../../utils/date';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PatientStatusBadge } from './PatientStatusBadge';
import { PatientStatusMenu } from './PatientStatusMenu';

interface PatientCardListProps {
  patients: PatientSummary[];
  onOpenPatient: (patientId: string) => void;
}

function asPainText(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return value.toFixed(1);
}

export function PatientCardList({ patients, onOpenPatient }: PatientCardListProps): JSX.Element {
  return (
    <div className="patients-card-list" aria-label="Patients card list">
      {patients.map((patient) => {
        const status = getPatientStatus(patient);
        const missedCheckin = isMissedCheckin(patient);
        const displayName = getPatientDisplayName(patient);
        const openAlertCount = patient.openAlertCount ?? 0;
        const hasOpenAlertCount = hasOpenAlerts(patient);
        const initials = displayName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() ?? '')
          .join('') || 'P';

        return (
          <Card
            key={patient.id}
            className={hasOpenAlertCount ? 'patients-card-list__card patients-card-list__card--attention' : 'patients-card-list__card'}
            title={
              <span className="patients-card-list__title">
                <span className="patients-card-list__avatar" aria-hidden="true">
                  {initials}
                </span>
                <span>{displayName}</span>
              </span>
            }
          >
            <div className="patients-card-list__body">
              <p className="patient-id-text">ID: {patient.id}</p>
              <div className="patients-card-list__badges">
                <PatientStatusBadge status={status} />
                {missedCheckin ? (
                  <Badge variant="warning" icon>
                    Missed check-in
                  </Badge>
                ) : null}
                <Badge variant={hasOpenAlertCount ? 'danger' : 'default'}>
                  {openAlertCount} open alerts
                </Badge>
              </div>

              <p>
                <strong>Last check-in:</strong>{' '}
                <time dateTime={patient.lastCheckinAt} title={formatDateTime(patient.lastCheckinAt)}>
                  {formatRelativeDate(patient.lastCheckinAt)}
                </time>
              </p>
              <p>
                <strong>Last 7d pain:</strong> {asPainText(patient.lastPain)}
              </p>

              <div className="patients-card-list__actions">
                <Button variant="secondary" fullWidth onClick={() => onOpenPatient(patient.id)}>
                  View
                </Button>
                <PatientStatusMenu currentStatus={status} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
