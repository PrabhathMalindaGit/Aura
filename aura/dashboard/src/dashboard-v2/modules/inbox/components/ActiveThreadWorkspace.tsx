import { ArrowLeft, PanelRightOpen, Rows3 } from 'lucide-react';
import type { InboxSupportVm, InboxWorkspaceVm } from '../../../adapters/communication';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2ProvenanceBadge } from '../../../patterns/ProvenanceBadge';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { LocalDraftPanel } from './LocalDraftPanel';
import { ThreadTimeline } from './ThreadTimeline';
import type { ClinicianIdentity } from '../../../../services/clinicianIdentity';
import type { CommunicationAuthoringSnapshot } from '../../../../services/communicationAuthoring';

interface ActiveThreadWorkspaceProps {
  workspace: InboxWorkspaceVm | null;
  support: InboxSupportVm | null;
  clinicianIdentity: ClinicianIdentity;
  authoring: CommunicationAuthoringSnapshot;
  selectedTemplateId: string;
  draftReply: string;
  draftDisabled: boolean;
  loading: boolean;
  statusTitle?: string;
  statusDescription?: string;
  showBackToQueue: boolean;
  showQueueSheetAction: boolean;
  showSupportAction: boolean;
  onBackToQueue: () => void;
  onOpenQueueSheet: () => void;
  onOpenSupport: () => void;
  onTemplateChange: (value: string) => void;
  onDraftChange: (value: string) => void;
  onInsertTemplate: () => void;
  onInsertSignature: () => void;
  onSaveDraft: () => void;
  onOpenAlerts: () => void;
  onOpenPatient: () => void;
  onOpenStructuredCoordination: () => void;
  onRefresh: () => void;
}

function renderIdleState(title: string, description: string): JSX.Element {
  return (
    <DashboardV2Surface className="v2-inbox-workspace__idle" tone="muted">
      <DashboardV2Heading as="h2">{title}</DashboardV2Heading>
      <DashboardV2Text tone="muted">{description}</DashboardV2Text>
    </DashboardV2Surface>
  );
}

export function ActiveThreadWorkspace({
  workspace,
  support,
  clinicianIdentity,
  authoring,
  selectedTemplateId,
  draftReply,
  draftDisabled,
  loading,
  statusTitle,
  statusDescription,
  showBackToQueue,
  showQueueSheetAction,
  showSupportAction,
  onBackToQueue,
  onOpenQueueSheet,
  onOpenSupport,
  onTemplateChange,
  onDraftChange,
  onInsertTemplate,
  onInsertSignature,
  onSaveDraft,
  onOpenAlerts,
  onOpenPatient,
  onOpenStructuredCoordination,
  onRefresh,
}: ActiveThreadWorkspaceProps): JSX.Element {
  if (loading) {
    return (
      <DashboardV2Surface className="v2-inbox-workspace" tone="elevated">
        <div className="v2-inbox-workspace__skeleton">
          <div className="v2-inbox-skeleton v2-inbox-skeleton--header" />
          <div className="v2-inbox-skeleton v2-inbox-skeleton--panel" />
          <div className="v2-inbox-skeleton v2-inbox-skeleton--panel" />
        </div>
      </DashboardV2Surface>
    );
  }

  if (statusTitle) {
    return renderIdleState(
      statusTitle,
      statusDescription ?? 'Review cannot continue until the inbox is available again.',
    );
  }

  if (!workspace) {
    return renderIdleState(
      'Select a patient thread',
      'Scan the queue, choose the next thread, and the active workspace will hold your place while you review the timeline and draft the next response.',
    );
  }

  return (
    <div className="v2-inbox-workspace" data-testid="v2-inbox-workspace">
      <div className="v2-inbox-workspace__header">
        <DashboardV2Surface
          className="v2-inbox-workspace__summary"
          tone="elevated"
          data-testid="v2-inbox-active-thread"
        >
          <div className="v2-inbox-workspace__summary-topline">
            <div>
              <DashboardV2Text tone="label">Active thread</DashboardV2Text>
              <DashboardV2Heading as="h2">{workspace.patientName}</DashboardV2Heading>
              <DashboardV2Text tone="muted">{workspace.whyNowSummary}</DashboardV2Text>
            </div>

            <div className="v2-inbox-workspace__summary-actions">
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
            </div>
          </div>

          <div className="v2-inbox-workspace__summary-facts">
            <DashboardV2Badge tone={workspace.responseTone}>{workspace.responseLabel}</DashboardV2Badge>
            <DashboardV2Badge tone="neutral">{workspace.patientIdLabel}</DashboardV2Badge>
            {workspace.contextStrip.map((item) => (
              <DashboardV2Badge key={item} tone="neutral">
                {item}
              </DashboardV2Badge>
            ))}
          </div>

          <div className="v2-inbox-workspace__summary-copy">
            <DashboardV2Text tone="strong">{workspace.urgencyLine}</DashboardV2Text>
          </div>

          <div className="v2-inbox-workspace__summary-metadata">
            {workspace.summaryFacts.map((fact) => (
              <div key={fact.label} className="v2-inbox-workspace__summary-metric">
                <DashboardV2Text tone="label">{fact.label}</DashboardV2Text>
                <DashboardV2Text tone="strong" title={fact.title}>
                  {fact.value}
                </DashboardV2Text>
              </div>
            ))}
          </div>

          <div className="v2-inbox-workspace__summary-actions">
            <DashboardV2Button
              tone="primary"
              size="sm"
              onPress={onOpenAlerts}
              isDisabled={!workspace.canOpenAlerts}
            >
              Open alerts
            </DashboardV2Button>
            <DashboardV2Button
              tone="secondary"
              size="sm"
              onPress={onOpenPatient}
              isDisabled={!workspace.canOpenPatient}
            >
              Open patient
            </DashboardV2Button>
            <DashboardV2Button
              tone="secondary"
              size="sm"
              onPress={onOpenStructuredCoordination}
              isDisabled={!workspace.canOpenStructuredCoordination}
            >
              Open structured coordination
            </DashboardV2Button>
            <DashboardV2Button tone="ghost" size="sm" onPress={onRefresh}>
              Refresh
            </DashboardV2Button>
          </div>

          {support ? (
            <div className="v2-inbox-workspace__coordination-summary" aria-label="Compact coordination summary">
              <div className="v2-inbox-workspace__coordination-copy">
                <DashboardV2Text tone="label">Team context</DashboardV2Text>
                <DashboardV2Text tone="strong">{support.sharedCoordination.statusEyebrow}</DashboardV2Text>
                <DashboardV2Text tone="muted">{support.sharedCoordination.summary}</DashboardV2Text>
              </div>
              <div className="v2-inbox-workspace__coordination-facts">
                {support.provenance.map((source) => (
                  <DashboardV2ProvenanceBadge key={source} source={source} />
                ))}
                {support.responseStateNote ? (
                  <DashboardV2Badge tone="delayed" size="sm">{support.responseStateNote}</DashboardV2Badge>
                ) : null}
                {support.workflow.linkedTask.state === 'linked' ? (
                  <DashboardV2Badge tone="support" size="sm">{support.workflow.linkedTask.title}</DashboardV2Badge>
                ) : null}
              </div>
              {showSupportAction ? (
                <DashboardV2Button
                  tone="secondary"
                  size="sm"
                  onPress={onOpenSupport}
                  leadingIcon={<PanelRightOpen size={16} />}
                >
                  Support context
                </DashboardV2Button>
              ) : null}
            </div>
          ) : null}
        </DashboardV2Surface>
      </div>

      <div className="v2-inbox-workspace__body">
        <ThreadTimeline items={workspace.timeline} />
        <LocalDraftPanel
          clinicianIdentity={clinicianIdentity}
          authoring={authoring}
          selectedTemplateId={selectedTemplateId}
          draftReply={draftReply}
          disabled={draftDisabled}
          onTemplateChange={onTemplateChange}
          onDraftChange={onDraftChange}
          onInsertTemplate={onInsertTemplate}
          onInsertSignature={onInsertSignature}
          onSaveDraft={onSaveDraft}
        />
      </div>
    </div>
  );
}
