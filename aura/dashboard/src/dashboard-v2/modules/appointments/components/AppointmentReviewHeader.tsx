import type { AppointmentReviewHeaderVm } from '../../../adapters/appointments';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface AppointmentReviewHeaderProps {
  header: AppointmentReviewHeaderVm;
  pending: boolean;
  mutationPending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onOpenPatient: () => void;
  onOpenSupport: () => void;
  showSupportAction: boolean;
  showBackToQueue: boolean;
  onBackToQueue: () => void;
  showQueueSheetAction: boolean;
  onOpenQueueSheet: () => void;
}

export function AppointmentReviewHeader({
  header,
  pending,
  mutationPending,
  onApprove,
  onReject,
  onOpenPatient,
  onOpenSupport,
  showSupportAction,
  showBackToQueue,
  onBackToQueue,
  showQueueSheetAction,
  onOpenQueueSheet,
}: AppointmentReviewHeaderProps): JSX.Element {
  return (
    <header className="v2-appointment-review-header">
      <div className="v2-appointment-review-header__copy">
        <div className="v2-appointment-review-header__topline">
          <DashboardV2Text tone="label">{header.patientId}</DashboardV2Text>
          <DashboardV2Text as="span" tone="caption">
            {header.patientStatusLabel}
          </DashboardV2Text>
        </div>
        <DashboardV2Heading as="h2">{header.patientName}</DashboardV2Heading>
        <DashboardV2Text tone="muted">{header.scheduleLabel}</DashboardV2Text>
      </div>

      <div className="v2-appointment-review-header__facts">
        <DashboardV2Badge tone={header.requestStatusTone === 'warning' ? 'warning' : header.requestStatusTone === 'success' ? 'success' : 'unknown'}>
          {header.requestStatusLabel}
        </DashboardV2Badge>
        <DashboardV2Badge tone={header.workflowTone === 'warning' ? 'warning' : header.workflowTone === 'success' ? 'success' : header.workflowTone === 'critical' ? 'critical' : 'unknown'}>
          {header.workflowLabel}
        </DashboardV2Badge>
        <span className="v2-appointment-review-header__pill">{header.modalityLabel}</span>
        <span className="v2-appointment-review-header__pill">{header.requestAgeLabel}</span>
        <span className="v2-appointment-review-header__pill">Reviewed {header.reviewLabel}</span>
      </div>

      <div className="v2-appointment-review-header__actions">
        {showBackToQueue ? (
          <DashboardV2Button tone="ghost" size="sm" onPress={onBackToQueue}>
            Back to requests
          </DashboardV2Button>
        ) : null}
        {showQueueSheetAction ? (
          <DashboardV2Button tone="ghost" size="sm" onPress={onOpenQueueSheet}>
            Open requests
          </DashboardV2Button>
        ) : null}
        {showSupportAction ? (
          <DashboardV2Button tone="ghost" size="sm" onPress={onOpenSupport}>
            Open publishing
          </DashboardV2Button>
        ) : null}
        <DashboardV2Button tone="secondary" size="sm" onPress={onOpenPatient}>
          Open patient
        </DashboardV2Button>
        {pending ? (
          <>
            <DashboardV2Button tone="ghost" size="sm" onPress={onReject} isDisabled={mutationPending}>
              Reject
            </DashboardV2Button>
            <DashboardV2Button tone="primary" size="sm" onPress={onApprove} isDisabled={mutationPending}>
              {mutationPending ? 'Saving...' : 'Approve'}
            </DashboardV2Button>
          </>
        ) : null}
      </div>
    </header>
  );
}
