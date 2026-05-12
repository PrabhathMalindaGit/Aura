import { ArrowLeft, PanelRightOpen, Rows3 } from 'lucide-react';
import type { TriageActionVm, TriageCaseVm } from '../../../adapters/worklist';
import { getLeadSignalTone } from '../../../adapters/worklist';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { DashboardV2StickyPatientSummaryHeader } from '../../../patterns/StickyPatientSummaryHeader';

interface ActiveReviewWorkspaceProps {
  selectedCase: TriageCaseVm | null;
  queueScopeLabel: string;
  onRunAction: (selected: TriageCaseVm, action: TriageActionVm) => void;
  showGovernanceAction: boolean;
  onOpenGovernance: () => void;
  showBackToQueue: boolean;
  onBackToQueue: () => void;
  showQueueSheetAction: boolean;
  onOpenQueueSheet: () => void;
  loading: boolean;
  statusTitle?: string;
  statusDescription?: string;
  onRetry?: () => void;
}

function mapStatusTone(tone: TriageCaseVm['workspace']['statusTone']): React.ComponentProps<typeof DashboardV2Badge>['tone'] {
  if (tone === 'success') {
    return 'success';
  }

  if (tone === 'warning') {
    return 'warning';
  }

  return 'neutral';
}

function renderIdleState(
  title: string,
  description: string,
  action?: JSX.Element,
): JSX.Element {
  return (
    <DashboardV2Surface className="triage-workspace__idle" tone="muted" data-testid="triage-active-workspace">
      <DashboardV2Heading as="h2">{title}</DashboardV2Heading>
      <DashboardV2Text tone="muted">{description}</DashboardV2Text>
      {action}
    </DashboardV2Surface>
  );
}

export function ActiveReviewWorkspace({
  selectedCase,
  queueScopeLabel,
  onRunAction,
  showGovernanceAction,
  onOpenGovernance,
  showBackToQueue,
  onBackToQueue,
  showQueueSheetAction,
  onOpenQueueSheet,
  loading,
  statusTitle,
  statusDescription,
  onRetry,
}: ActiveReviewWorkspaceProps): JSX.Element {
  if (loading) {
    return (
      <DashboardV2Surface className="triage-workspace" tone="elevated">
        <div className="triage-workspace__skeleton">
          <div className="triage-skeleton triage-skeleton--header" />
          <div className="triage-skeleton triage-skeleton--panel" />
          <div className="triage-skeleton triage-skeleton--panel" />
        </div>
      </DashboardV2Surface>
    );
  }

  if (statusTitle) {
    return renderIdleState(
      statusTitle,
      statusDescription ?? 'Review cannot continue until the queue is available again.',
      onRetry ? (
        <DashboardV2Button tone="secondary" size="sm" onPress={onRetry}>
          Retry
        </DashboardV2Button>
      ) : undefined,
    );
  }

  if (!selectedCase) {
    return renderIdleState(
      'Select a patient to begin review',
      'Scan the queue, choose the next case, and the active review workspace will hold your place while you decide the next action.',
    );
  }

  const { workspace } = selectedCase;

  return (
    <div className="triage-workspace" id="triage-active-workspace" data-testid="triage-active-workspace">
      <div className="triage-workspace__header">
        <DashboardV2StickyPatientSummaryHeader
          title={workspace.patientName}
          subtitle={queueScopeLabel}
          facts={
            <div className="triage-workspace__header-facts">
              <DashboardV2Badge tone={mapStatusTone(workspace.statusTone)}>
                {workspace.statusLabel}
              </DashboardV2Badge>
              <DashboardV2Badge tone={workspace.priorityTone}>
                {workspace.priorityLabel}
              </DashboardV2Badge>
              <DashboardV2Badge tone={getLeadSignalTone(workspace.leadSignal)}>
                {workspace.leadSignal.label}
              </DashboardV2Badge>
              {workspace.rehabPhase ? <DashboardV2Badge tone="neutral">{workspace.rehabPhase}</DashboardV2Badge> : null}
            </div>
          }
        />

        <div className="triage-workspace__toolbar">
          <div className="triage-workspace__timeline">
            <span title={workspace.updatedTitle}>Updated {workspace.updatedLabel}</span>
            <span title={workspace.lastCheckinTitle}>Last check-in {workspace.lastCheckinLabel}</span>
            <span>{workspace.patientIdLabel}</span>
          </div>
          <div className="triage-workspace__toolbar-actions">
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
                Governance
              </DashboardV2Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="triage-workspace__body">
        <div className="triage-workspace__brief">
          <DashboardV2Surface className="triage-workspace__section triage-workspace__section--why-now" tone="elevated">
            <DashboardV2Text tone="label">Why this patient is here now</DashboardV2Text>
            <DashboardV2Heading as="h2">{workspace.whyNowTitle}</DashboardV2Heading>
            <DashboardV2Text tone="muted">{workspace.whyNowSupport}</DashboardV2Text>
          </DashboardV2Surface>

          <DashboardV2Surface className="triage-workspace__section triage-workspace__section--actions" tone="base">
            <DashboardV2Text tone="label">Next actions</DashboardV2Text>
            <div className="triage-workspace__actions">
              <DashboardV2Button
                tone="primary"
                onPress={() => onRunAction(selectedCase, workspace.primaryAction)}
              >
                {workspace.primaryAction.label}
              </DashboardV2Button>
              <div className="triage-workspace__secondary-actions">
                {workspace.secondaryActions.map((action) => (
                  <DashboardV2Button
                    key={action.key}
                    tone="ghost"
                    size="sm"
                    onPress={() => onRunAction(selectedCase, action)}
                  >
                    {action.label}
                  </DashboardV2Button>
                ))}
              </div>
            </div>
          </DashboardV2Surface>
        </div>

        <DashboardV2Surface className="triage-workspace__section triage-workspace__section--metrics" tone="base">
          <DashboardV2Text tone="label">What changed</DashboardV2Text>
          <div className="triage-workspace__metrics" role="list" aria-label="Current patient signals">
            {workspace.changeMetrics.map((metric) => (
              <article
                key={metric.label}
                className={`triage-workspace__metric triage-workspace__metric--${metric.tone ?? 'neutral'}`}
                role="listitem"
              >
                <DashboardV2Text tone="label">{metric.label}</DashboardV2Text>
                <DashboardV2Heading as="h3">{metric.value}</DashboardV2Heading>
              </article>
            ))}
          </div>
        </DashboardV2Surface>

        <DashboardV2Surface className="triage-workspace__section triage-workspace__section--signals" tone="muted">
          <DashboardV2Text tone="label">Key supporting signals</DashboardV2Text>
          <div className="triage-workspace__supporting">
            <div className="triage-workspace__truth">
              {workspace.truthChips.map((chip) => (
                <DashboardV2Badge key={`${workspace.patientIdLabel}-${chip.label}`} tone={chip.tone}>
                  {chip.label}
                </DashboardV2Badge>
              ))}
            </div>
            <ul className="triage-workspace__signal-list">
              {workspace.supportingSignals.map((signal) => (
                <li key={signal}>
                  <DashboardV2Text tone="muted">{signal}</DashboardV2Text>
                </li>
              ))}
            </ul>
          </div>
        </DashboardV2Surface>
      </div>
    </div>
  );
}
