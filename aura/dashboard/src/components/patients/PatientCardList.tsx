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
import { Card } from '../ui/Card';
import { buildPatientTriageSupportLine } from './patientRosterSignalUtils';
import { PatientAlertBurdenSignal, PatientPainLevelSignal } from './PatientRosterSignals';
import { PatientStatusBadge } from './PatientStatusBadge';
import { PatientStatusMenu } from './PatientStatusMenu';

interface PatientCardListProps {
  patients: PatientSummary[];
  onOpenPatient: (patientId: string) => void;
  selectedComparePatientIds: string[];
  onToggleComparePatient: (patientId: string) => void;
  compareSelectionLimitReached: boolean;
}

export function PatientCardList({
  patients,
  onOpenPatient,
  selectedComparePatientIds,
  onToggleComparePatient,
  compareSelectionLimitReached,
}: PatientCardListProps): JSX.Element {
  return (
    <div className="patients-card-list" aria-label="Patients card list">
      {patients.map((patient) => {
        const status = getPatientStatus(patient);
        const missedCheckin = isMissedCheckin(patient);
        const displayName = getPatientDisplayName(patient);
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
          <Card
            key={patient.id}
            className={`patients-card-list__card${hasOpenAlertCount ? ' patients-card-list__card--attention' : ''}${
              missedCheckin ? ' patients-card-list__card--missed' : ''
            }`}
            title={
              <span className="patients-card-list__title">
                <span className="patients-card-list__avatar" aria-hidden="true">
                  {initials}
                </span>
                <span className="patients-card-list__title-text">
                  <span className="patients-card-list__name">{displayName}</span>
                  <span className="patients-card-list__support">{rosterSupportLine}</span>
                </span>
              </span>
            }
          >
            <div className="patients-card-list__body">
              <p className="patient-id-text patients-card-list__id">ID: {patient.id}</p>
              <div className="patients-card-list__badges">
                <PatientStatusBadge className="patients-status-badge" status={status} />
                {missedCheckin ? (
                  <Badge className="patients-card-list__missed-badge" variant="warning" icon>
                    Missed check-in
                  </Badge>
                ) : null}
              </div>

              <div className="patients-card-list__metrics">
                <div className="patients-card-list__metric">
                  <span className="patients-card-list__meta-label">Recent activity</span>
                  <time className="patients-card-list__checkin-time" dateTime={patient.lastCheckinAt} title={formatDateTime(patient.lastCheckinAt)}>
                    {formatRelativeDate(patient.lastCheckinAt)}
                  </time>
                  <span className="patients-card-list__metric-support">{formatDateTime(patient.lastCheckinAt)}</span>
                </div>
                <div className="patients-card-list__metric">
                  <span className="patients-card-list__meta-label">Alert burden</span>
                  <PatientAlertBurdenSignal count={openAlertCount} />
                </div>
                <div className="patients-card-list__metric">
                  <span className="patients-card-list__meta-label">Pain level</span>
                  <PatientPainLevelSignal value={patient.lastPain} />
                </div>
              </div>

              <div className="patients-card-list__actions">
                <Button
                  className="patients-card-list__view"
                  variant="secondary"
                  fullWidth
                  onClick={() => onOpenPatient(patient.id)}
                >
                  Open review
                </Button>
                <Button
                  className="patients-card-list__compare"
                  variant={isSelectedForCompare ? 'secondary' : 'ghost'}
                  size="sm"
                  disabled={compareDisabled}
                  onClick={() => onToggleComparePatient(patient.id)}
                  aria-label={`${
                    isSelectedForCompare ? 'Remove' : 'Add'
                  } ${displayName} ${isSelectedForCompare ? 'from' : 'to'} compare`}
                >
                  {isSelectedForCompare ? 'Remove from compare' : 'Add to compare'}
                </Button>
                <PatientStatusMenu currentStatus={status} compact />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
