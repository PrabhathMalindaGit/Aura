import type { InsightReviewHeaderVm, InsightsBadgeTone } from '../../../adapters/insights';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface InsightReviewHeaderProps {
  header: InsightReviewHeaderVm;
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

function mapBadgeTone(tone: InsightsBadgeTone): React.ComponentProps<typeof DashboardV2Badge>['tone'] {
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

export function InsightReviewHeader({
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
}: InsightReviewHeaderProps): JSX.Element {
  return (
    <header className="v2-insight-review-header">
      <div className="v2-insight-review-header__copy">
        <div className="v2-insight-review-header__topline">
          <DashboardV2Text tone="label">{header.patientId}</DashboardV2Text>
          <DashboardV2Text as="span" tone="caption">
            {header.patientStatusLabel}
          </DashboardV2Text>
        </div>
        <DashboardV2Heading as="h2">{header.title}</DashboardV2Heading>
        <DashboardV2Text tone="muted">{header.patientName}</DashboardV2Text>
      </div>

      <div className="v2-insight-review-header__facts">
        <DashboardV2Badge tone={mapBadgeTone(header.statusTone)}>{header.statusLabel}</DashboardV2Badge>
        <DashboardV2Badge tone={mapBadgeTone(header.priorityTone)}>{header.priorityLabel}</DashboardV2Badge>
        <DashboardV2Badge tone={mapBadgeTone(header.confidenceTone)}>{header.confidenceLabel}</DashboardV2Badge>
        <span className="v2-insight-review-header__pill">{header.categoryLabel}</span>
        <span className="v2-insight-review-header__pill">{header.reviewWindowLabel}</span>
        <span className="v2-insight-review-header__pill" title={header.createdTitle}>
          Created {header.createdLabel}
        </span>
        <span className="v2-insight-review-header__pill">Reviewed {header.reviewedLabel}</span>
      </div>

      <div className="v2-insight-review-header__actions">
        {showBackToQueue ? (
          <DashboardV2Button tone="ghost" size="sm" onPress={onBackToQueue}>
            Back to lane
          </DashboardV2Button>
        ) : null}
        {showQueueSheetAction ? (
          <DashboardV2Button tone="ghost" size="sm" onPress={onOpenQueueSheet}>
            Open lane
          </DashboardV2Button>
        ) : null}
        {showSupportAction ? (
          <DashboardV2Button tone="ghost" size="sm" onPress={onOpenSupport}>
            Open support
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
