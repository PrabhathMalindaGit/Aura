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

function formatOpenAlertsText(count: number): string {
  return count === 0 ? 'No active alerts' : `${count} active alert${count === 1 ? '' : 's'}`;
}

function alertBurdenTone(count: number): 'clear' | 'elevated' | 'high' {
  if (count >= 3) {
    return 'high';
  }

  if (count > 0) {
    return 'elevated';
  }

  return 'clear';
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
        const alertsTone = alertBurdenTone(openAlertCount);
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
                  <span className="patients-card-list__support">{rosterReason}</span>
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
                <Badge
                  className={`patients-card-list__alerts-badge${hasOpenAlertCount ? ' patients-card-list__alerts-badge--active' : ''} patients-card-list__alerts-badge--${alertsTone}`}
                  variant={hasOpenAlertCount ? 'danger' : 'default'}
                >
                  {openAlertCount} open alerts
                </Badge>
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
                  <span className="patients-card-list__metric-value">{formatOpenAlertsText(openAlertCount)}</span>
                  <span className="patients-card-list__metric-support">
                    {hasOpenAlertCount ? 'Needs closer review' : 'No alert activity'}
                  </span>
                </div>
                <div className="patients-card-list__metric">
                  <span className="patients-card-list__meta-label">Pain trend</span>
                  <span className={`patients-card-list__pain-value patients-card-list__pain-value--${painSeverity}`}>
                    {asPainText(patient.lastPain)}
                  </span>
                  <span className="patients-card-list__metric-support">
                    {typeof patient.lastPain === 'number' && !Number.isNaN(patient.lastPain)
                      ? 'Last 7-day average'
                      : 'No pain trend yet'}
                  </span>
                </div>
              </div>

              <div className="patients-card-list__actions">
                <Button className="patients-card-list__view" variant="secondary" fullWidth onClick={() => onOpenPatient(patient.id)}>
                  Open review
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
