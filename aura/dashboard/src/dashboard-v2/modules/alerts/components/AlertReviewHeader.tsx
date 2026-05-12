import { useState } from 'react';
import { ArrowLeft, PanelRightOpen, Rows3, UserRound } from 'lucide-react';
import type { AlertItem } from '../../../../types/models';
import type { AlertReviewHeaderVm, AlertsBadgeTone } from '../../../adapters/alerts';
import { DashboardV2ClinicianPatientAnchor } from '../../../patterns/ClinicianPatientAnchor';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { AssignmentActions } from '../../../../components/alerts/AssignmentActions';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';

interface AlertReviewHeaderProps {
  alert: AlertItem;
  header: AlertReviewHeaderVm;
  clinicianId: string;
  mutationPending: boolean;
  assignmentPending: boolean;
  onOpenPatient: () => void;
  onAcknowledge: () => void | Promise<void>;
  onResolve: () => void | Promise<void>;
  onAssignToMe: () => void | Promise<void>;
  onTakeOver: () => void | Promise<void>;
  onUnassign: () => void | Promise<void>;
  showGovernanceAction: boolean;
  onOpenGovernance: () => void;
  showBackToQueue: boolean;
  onBackToQueue: () => void;
  showQueueSheetAction: boolean;
  onOpenQueueSheet: () => void;
}

function mapBadgeTone(tone: AlertsBadgeTone): React.ComponentProps<typeof DashboardV2Badge>['tone'] {
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

export function AlertReviewHeader({
  alert,
  header,
  clinicianId,
  mutationPending,
  assignmentPending,
  onOpenPatient,
  onAcknowledge,
  onResolve,
  onAssignToMe,
  onTakeOver,
  onUnassign,
  showGovernanceAction,
  onOpenGovernance,
  showBackToQueue,
  onBackToQueue,
  showQueueSheetAction,
  onOpenQueueSheet,
}: AlertReviewHeaderProps): JSX.Element {
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);

  const assignmentBlocked = Boolean(alert.assignedTo && alert.assignedTo !== clinicianId);
  const acknowledgeDisabled = alert.status !== 'open' || mutationPending || assignmentBlocked;
  const resolveDisabled = alert.status === 'resolved' || mutationPending || assignmentBlocked;

  return (
    <>
      <header className="v2-alert-review-header">
        <div className="v2-alert-review-header__identity">
          <DashboardV2ClinicianPatientAnchor
            patientLabel={header.patientName}
            tone={
              header.severityTone === 'critical'
                ? 'critical'
                : header.severityTone === 'warning'
                  ? 'warning'
                  : header.severityTone === 'success'
                    ? 'success'
                    : 'neutral'
            }
            size="md"
          />
          <div className="v2-alert-review-header__copy">
            <DashboardV2Heading as="h2">{header.patientName}</DashboardV2Heading>
            <DashboardV2Text tone="strong">{header.reason}</DashboardV2Text>
            <div className="v2-alert-review-header__meta">
              <span title={header.freshnessTitle}>Age {header.freshnessLabel}</span>
              <span>{header.sourceLabel}</span>
              <span>{header.patientId}</span>
              <span>{header.referenceLabel}</span>
            </div>
          </div>
        </div>

        <div className="v2-alert-review-header__facts">
          <DashboardV2Badge tone={mapBadgeTone(header.statusTone)}>{header.statusLabel}</DashboardV2Badge>
          <DashboardV2Badge tone={mapBadgeTone(header.severityTone)}>{header.severityLabel}</DashboardV2Badge>
          <DashboardV2Badge tone={mapBadgeTone(header.seenTone)}>{header.seenLabel}</DashboardV2Badge>
          <DashboardV2Badge tone="neutral">{header.assignmentLabel}</DashboardV2Badge>
          <DashboardV2Badge tone="neutral">{header.patientStatusLabel}</DashboardV2Badge>
        </div>

        <div className="v2-alert-review-header__actions" aria-label="Selected alert actions">
          <div className="v2-alert-review-header__action-panel">
            <div className="v2-alert-review-header__action-group" aria-label="Support and navigation actions">
              <div className="v2-alert-review-header__route-actions">
                {showBackToQueue ? (
                  <DashboardV2Button
                    tone="ghost"
                    size="sm"
                    onPress={onBackToQueue}
                    leadingIcon={<ArrowLeft size={16} />}
                  >
                    Back to queue
                  </DashboardV2Button>
                ) : null}
                {showQueueSheetAction ? (
                  <DashboardV2Button
                    tone="secondary"
                    size="sm"
                    onPress={onOpenQueueSheet}
                    leadingIcon={<Rows3 size={16} />}
                  >
                    Review queue
                  </DashboardV2Button>
                ) : null}
                {showGovernanceAction ? (
                  <DashboardV2Button
                    tone="secondary"
                    size="sm"
                    onPress={onOpenGovernance}
                    leadingIcon={<PanelRightOpen size={16} />}
                  >
                    Context
                  </DashboardV2Button>
                ) : null}
                <DashboardV2Button
                  tone="ghost"
                  size="sm"
                  onPress={onOpenPatient}
                  leadingIcon={<UserRound size={16} />}
                >
                  Open patient
                </DashboardV2Button>
              </div>
            </div>

            <div className="v2-alert-review-header__action-group" aria-label="Decision actions">
              <div className="v2-alert-review-header__decision-actions">
                <DashboardV2Button
                  tone="secondary"
                  size="sm"
                  onPress={onAcknowledge}
                  isDisabled={acknowledgeDisabled}
                >
                  {mutationPending && alert.status === 'open' ? 'Updating...' : 'Acknowledge'}
                </DashboardV2Button>
                <DashboardV2Button
                  tone="primary"
                  size="sm"
                  onPress={() => {
                    if (alert.status === 'open') {
                      setShowResolveConfirm(true);
                      return;
                    }

                    void onResolve();
                  }}
                  isDisabled={resolveDisabled}
                >
                  {mutationPending ? 'Updating...' : 'Resolve'}
                </DashboardV2Button>
              </div>
            </div>

            <div className="v2-alert-review-header__action-group" aria-label="Ownership actions">
              <div className="v2-alert-review-header__ownership-actions">
                <AssignmentActions
                  alert={alert}
                  clinicianId={clinicianId}
                  busy={assignmentPending}
                  allowUnassign
                  size="sm"
                  onAssignToMe={() => onAssignToMe()}
                  onTakeOver={() => onTakeOver()}
                  onUnassign={() => onUnassign()}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <ConfirmDialog
        open={showResolveConfirm}
        title="Resolve this alert?"
        description="Resolving will move the alert out of the open governance queue."
        confirmLabel="Resolve alert"
        confirmVariant="primary"
        onCancel={() => setShowResolveConfirm(false)}
        onConfirm={() => {
          setShowResolveConfirm(false);
          void onResolve();
        }}
      />
    </>
  );
}
