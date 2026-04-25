import { DashboardV2MetadataList } from '../../../patterns/MetadataList';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { DashboardV2ProvenanceBadge } from '../../../patterns/ProvenanceBadge';
import type { PatientWorkspaceGovernanceVm } from '../../../adapters/patientWorkspace';

interface WorkflowSectionProps {
  governance: PatientWorkspaceGovernanceVm;
}

interface GovernanceSectionProps {
  governance: PatientWorkspaceGovernanceVm;
  onOpenExplanation?: () => void;
}

export function PatientGovernanceWorkflowSection({
  governance,
}: WorkflowSectionProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-patient-support-card" tone="muted">
      <div className="v2-patient-support-card__copy">
        <DashboardV2Text tone="label">Workflow</DashboardV2Text>
        <DashboardV2Heading as="h3">Linked workflow context</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Shared follow-up ownership and linked task context remain separate from patient-facing communication.
        </DashboardV2Text>
      </div>
      <DashboardV2MetadataList items={governance.workflowFacts} />
    </DashboardV2Surface>
  );
}

export function PatientGovernanceMetadataSection({
  governance,
  onOpenExplanation,
}: GovernanceSectionProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-patient-support-card" tone="muted">
      <div className="v2-patient-support-card__copy">
        <DashboardV2Text tone="label">Governance</DashboardV2Text>
        <DashboardV2Heading as="h3">Trust and explanation context</DashboardV2Heading>
        <DashboardV2Text tone="muted">{governance.explanation}</DashboardV2Text>
      </div>

      <div className="v2-patient-support-card__badges" aria-label="Provenance">
        {governance.provenance.map((source) => (
          <DashboardV2ProvenanceBadge key={source} source={source} />
        ))}
      </div>

      <DashboardV2MetadataList items={governance.governanceFacts} />
      <DashboardV2MetadataList items={governance.thresholdFacts} />

      {onOpenExplanation ? (
        <div className="v2-patient-support-card__actions">
          <DashboardV2Button tone="ghost" size="sm" onPress={onOpenExplanation}>
            Open explanation
          </DashboardV2Button>
        </div>
      ) : null}
    </DashboardV2Surface>
  );
}
