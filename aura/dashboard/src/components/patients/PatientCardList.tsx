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
        const reviewCueLabel = hasOpenAlertCount
          ? `Alert burden ${openAlertCount}`
          : missedCheckin
            ? 'Missed recent check-in'
            : status === 'on_hold'
              ? 'Paused follow-up'
              : status === 'discharged'
                ? 'Discharged reference'
                : 'Stable review';
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
            }${isSelectedForCompare ? ' patients-card-list__card--selected' : ''}`}
            title={
              <span className="patients-card-list__title">
                <span className="patients-card-list__avatar" aria-hidden="true">
                  {initials}
                </span>
                <span className="patients-card-list__title-text">
                  <span className="patients-card-list__headline">
                    <span className="patients-card-list__name">{displayName}</span>
                    <span
                      className={`patients-card-list__review-cue${
                        hasOpenAlertCount || missedCheckin ? ' patients-card-list__review-cue--attention' : ''
                      }`}
                    >
                      {reviewCueLabel}
                    </span>
                  </span>
                </span>
              </span>
            }
          >
            <div className="patients-card-list__body">
              <div className="patients-card-list__summary">
                <div className="patients-card-list__badges">
                  <PatientStatusBadge className="patients-status-badge" status={status} />
                  {missedCheckin ? (
                    <Badge className="patients-card-list__missed-badge" variant="warning" icon>
                      Missed check-in
                    </Badge>
                  ) : null}
                </div>
                <p className="patient-id-text patients-card-list__id">ID: {patient.id}</p>
                <p className="patients-card-list__support">{rosterSupportLine}</p>
              </div>

              <div className="patients-card-list__metrics">
                <div className="patients-card-list__metric patients-card-list__metric--activity">
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
                <div className="patients-card-list__actions-secondary">
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
                </div>
                <div className="patients-card-list__actions-primary">
                  <span className="patients-card-list__action-note">
                    {hasOpenAlertCount || missedCheckin
                      ? 'Open review now'
                      : status === 'discharged'
                        ? 'Open summary'
                        : 'Open patient context'}
                  </span>
                  <Button
                    className="patients-card-list__view"
                    variant="secondary"
                    fullWidth
                    onClick={() => onOpenPatient(patient.id)}
                  >
                    Open review
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
