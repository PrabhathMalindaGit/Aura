import type { AppointmentRequestRowVm, AppointmentsBadgeTone } from '../../../adapters/appointments';
import { DashboardV2ClinicianPatientAnchor } from '../../../patterns/ClinicianPatientAnchor';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import type { AppointmentRequestRailContext } from './AppointmentsRequestPane';

interface AppointmentRequestRowProps {
  row: AppointmentRequestRowVm;
  selected: boolean;
  isVeryNarrow: boolean;
  onSelect: () => void;
  selectedContext: AppointmentRequestRailContext | null;
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
  selectedContext,
}: AppointmentRequestRowProps): JSX.Element {
  const header = selectedContext?.header;
  const request = selectedContext?.request;
  const governance = selectedContext?.governance;
  const pending = request?.status === 'pending';

  return (
    <article
      className={[
        'v2-appointment-request-row',
        selected ? 'v2-appointment-request-row--selected' : null,
      ]
        .filter(Boolean)
        .join(' ')}
      role="listitem"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
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
          <DashboardV2Heading className="v2-appointment-request-row__name" as="h3">
            {row.patientName}
          </DashboardV2Heading>
          <span className="v2-appointment-request-row__schedule">{row.workflowLabel}</span>
          <DashboardV2Text tone="caption">{row.detailLine}</DashboardV2Text>
          <DashboardV2Text tone="muted">{row.supportLine}</DashboardV2Text>
        </div>

        {!isVeryNarrow ? (
          <div className="v2-appointment-request-row__timing">
            <DashboardV2Text tone="label">Timing</DashboardV2Text>
            <strong>{row.waitLabel}</strong>
          </div>
        ) : null}
      </div>

      {selectedContext && header ? (
        <div className="v2-appointment-request-row__selected-context">
          <div className="v2-appointment-request-row__badges">
            <DashboardV2Badge tone={mapBadgeTone(header.requestStatusTone)}>{header.requestStatusLabel}</DashboardV2Badge>
            <DashboardV2Badge tone={mapBadgeTone(header.workflowTone)}>{header.workflowLabel}</DashboardV2Badge>
            <span className="v2-appointment-request-row__pill">{header.modalityLabel}</span>
            <span className="v2-appointment-request-row__pill">{header.requestAgeLabel}</span>
          </div>

          {governance ? (
            <div className="v2-appointment-request-row__context-grid">
              <div>
                <DashboardV2Text tone="label">Reason</DashboardV2Text>
                <DashboardV2Text tone="muted">{governance.requestReason}</DashboardV2Text>
              </div>
              <div>
                <DashboardV2Text tone="label">Constraints</DashboardV2Text>
                <DashboardV2Text tone="muted">{governance.constraints}</DashboardV2Text>
              </div>
              <DashboardV2Surface className="v2-appointment-request-row__recommended" tone="muted">
                <DashboardV2Text tone="label">Recommended slot</DashboardV2Text>
                <DashboardV2Text tone="strong">{governance.recommendedSlot}</DashboardV2Text>
              </DashboardV2Surface>
            </div>
          ) : null}

          <div className="v2-appointment-request-row__actions">
            {selectedContext.patientWorkspaceUnavailableReason ? (
              <DashboardV2Button
                tone="secondary"
                size="sm"
                isDisabled
                aria-label={`Presentation only. ${selectedContext.patientWorkspaceUnavailableReason}`}
              >
                Presentation only
              </DashboardV2Button>
            ) : (
              <DashboardV2Button tone="secondary" size="sm" onPress={selectedContext.onOpenPatient}>
                Open patient
              </DashboardV2Button>
            )}
            {pending ? (
              <>
                <DashboardV2Button tone="ghost" size="sm" onPress={selectedContext.onReject} isDisabled={selectedContext.mutationPending}>
                  Reject
                </DashboardV2Button>
                <DashboardV2Button tone="primary" size="sm" onPress={selectedContext.onApprove} isDisabled={selectedContext.mutationPending}>
                  {selectedContext.mutationPending ? 'Saving...' : 'Approve'}
                </DashboardV2Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
