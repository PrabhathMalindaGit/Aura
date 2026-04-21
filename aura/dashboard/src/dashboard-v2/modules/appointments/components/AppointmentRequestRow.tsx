import type { AppointmentRequestRowVm, AppointmentsBadgeTone } from '../../../adapters/appointments';
import { DashboardV2ClinicianPatientAnchor } from '../../../patterns/ClinicianPatientAnchor';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Text } from '../../../primitives/Text';

interface AppointmentRequestRowProps {
  row: AppointmentRequestRowVm;
  selected: boolean;
  isVeryNarrow: boolean;
  onSelect: () => void;
}

function mapBadgeTone(tone: AppointmentsBadgeTone): React.ComponentProps<typeof DashboardV2Badge>['tone'] {
  if (tone === 'critical') {
    return 'critical';
  }
  if (tone === 'warning') {
    return 'warning';
  }
  if (tone === 'success') {
    return 'success';
  }
  if (tone === 'info') {
    return 'info';
  }
  return 'unknown';
}

export function AppointmentRequestRow({
  row,
  selected,
  isVeryNarrow,
  onSelect,
}: AppointmentRequestRowProps): JSX.Element {
  return (
    <button
      type="button"
      className={[
        'v2-appointment-request-row',
        selected ? 'v2-appointment-request-row--selected' : null,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={`v2-appointment-request-row-${row.requestId}`}
    >
      <div className="v2-appointment-request-row__topline">
        <div className="v2-appointment-request-row__identity">
          <DashboardV2Text tone="label">{row.patientId}</DashboardV2Text>
          <DashboardV2Text as="span" tone="caption">
            {row.timingLabel}
          </DashboardV2Text>
        </div>
        <div className="v2-appointment-request-row__meta">
          <DashboardV2Badge tone={mapBadgeTone(row.statusTone)}>{row.statusLabel}</DashboardV2Badge>
          <DashboardV2Badge tone={mapBadgeTone(row.workflowTone)}>{row.workflowLabel}</DashboardV2Badge>
        </div>
      </div>

      <div className="v2-appointment-request-row__body">
        <DashboardV2ClinicianPatientAnchor patientLabel={row.patientName} tone="neutral" />
        <div className="v2-appointment-request-row__copy">
          <strong className="v2-appointment-request-row__name">{row.patientName}</strong>
          <span className="v2-appointment-request-row__schedule">{row.scheduleLabel}</span>
          <DashboardV2Text tone="muted">{row.supportLine}</DashboardV2Text>
        </div>

        {!isVeryNarrow ? (
          <div className="v2-appointment-request-row__timing">
            <DashboardV2Text tone="label">Timing</DashboardV2Text>
            <strong>{row.timingLabel}</strong>
          </div>
        ) : null}
      </div>
    </button>
  );
}
