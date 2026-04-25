import { DashboardV2MetadataList } from '../../../patterns/MetadataList';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { DashboardV2ProvenanceBadge } from '../../../patterns/ProvenanceBadge';
import type { PatientWorkspaceGovernanceVm } from '../../../adapters/patientWorkspace';
import type { DashboardV2MetadataItem } from '../../../patterns/MetadataList';

interface WorkflowSectionProps {
  governance: PatientWorkspaceGovernanceVm;
}

interface GovernanceSectionProps {
  governance: PatientWorkspaceGovernanceVm;
  onOpenExplanation?: () => void;
}

function getMeaningfulFacts(items: DashboardV2MetadataItem[]): DashboardV2MetadataItem[] {
  return items.filter((item) => Boolean(item.value?.trim()));
}

function PatientContextEmptyState({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="v2-patient-support-card__empty">
      <DashboardV2Text tone="muted">{children}</DashboardV2Text>
    </div>
  );
}

export function PatientGovernanceWorkflowSection({
  governance,
}: WorkflowSectionProps): JSX.Element {
  const workflowFacts = getMeaningfulFacts(governance.workflowFacts);

  return (
    <DashboardV2Surface className="v2-patient-support-card v2-patient-support-card--compact" tone="muted">
      <div className="v2-patient-support-card__copy">
        <DashboardV2Text tone="label">Workflow</DashboardV2Text>
        <DashboardV2Heading as="h3">Follow-up links</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Linked tasks and owner details appear here only when Aura has a real workflow reference.
        </DashboardV2Text>
      </div>
      {workflowFacts.length > 0 ? (
        <DashboardV2MetadataList items={workflowFacts} showEmptyItems={false} />
      ) : (
        <PatientContextEmptyState>
          No linked follow-up is active for this patient.
        </PatientContextEmptyState>
      )}
    </DashboardV2Surface>
  );
}

export function PatientGovernanceMetadataSection({
  governance,
  onOpenExplanation,
}: GovernanceSectionProps): JSX.Element {
  const governanceFacts = getMeaningfulFacts(governance.governanceFacts);
  const thresholdFacts = getMeaningfulFacts(governance.thresholdFacts);
  const hasReviewBasis = governanceFacts.length > 0 || thresholdFacts.length > 0;
  const knownProvenance = governance.provenance.filter((source) => source !== 'unknown');
  const visibleProvenance = knownProvenance.length > 0 ? knownProvenance : governance.provenance;

  return (
    <DashboardV2Surface className="v2-patient-support-card v2-patient-support-card--compact" tone="muted">
      <div className="v2-patient-support-card__copy">
        <DashboardV2Text tone="label">Trust</DashboardV2Text>
        <DashboardV2Heading as="h3">Review basis</DashboardV2Heading>
        <DashboardV2Text tone="muted">{governance.explanation}</DashboardV2Text>
      </div>

      {visibleProvenance.length > 0 ? (
        <div className="v2-patient-support-card__section">
          <DashboardV2Text tone="label">Sources</DashboardV2Text>
          <div className="v2-patient-support-card__badges" aria-label="Provenance">
            {visibleProvenance.map((source) => (
              <DashboardV2ProvenanceBadge key={source} source={source} />
            ))}
          </div>
        </div>
      ) : null}

      {hasReviewBasis ? (
        <>
          {governanceFacts.length > 0 ? (
            <div className="v2-patient-support-card__section">
              <DashboardV2Text tone="label">Review signals</DashboardV2Text>
              <DashboardV2MetadataList items={governanceFacts} showEmptyItems={false} />
            </div>
          ) : null}

          {thresholdFacts.length > 0 ? (
            <div className="v2-patient-support-card__section">
              <DashboardV2Text tone="label">Thresholds and adaptation</DashboardV2Text>
              <DashboardV2MetadataList items={thresholdFacts} showEmptyItems={false} />
            </div>
          ) : null}
        </>
      ) : (
        <PatientContextEmptyState>
          No additional review-basis detail is available for this view.
        </PatientContextEmptyState>
      )}

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
