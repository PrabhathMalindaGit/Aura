import { PanelRightOpen } from 'lucide-react';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import type { PatientWorkspaceGovernanceVm } from '../../../adapters/patientWorkspace';

interface PatientContextSummaryProps {
  governance: PatientWorkspaceGovernanceVm;
  mode: 'overview' | 'communications';
  presentation?: 'surface' | 'inline';
  onOpenContext: () => void;
}

function factValue(governance: PatientWorkspaceGovernanceVm, label: string): string | null {
  const fact = [...governance.workflowFacts, ...governance.governanceFacts].find(
    (item) => item.label === label,
  );
  const value = fact?.value?.trim();

  return value ? value : null;
}

function hasUsefulCommunicationContext(governance: PatientWorkspaceGovernanceVm): boolean {
  return Boolean(
    factValue(governance, 'Follow-up owner') ||
      factValue(governance, 'Linked task') ||
      factValue(governance, 'Next step') ||
      factValue(governance, 'Latest response state'),
  );
}

export function PatientContextSummary({
  governance,
  mode,
  presentation = 'surface',
  onOpenContext,
}: PatientContextSummaryProps): JSX.Element {
  if (mode === 'communications' && !hasUsefulCommunicationContext(governance)) {
    return <></>;
  }

  const updatedAt = factValue(governance, 'Shared handoff updated');
  const owner = factValue(governance, 'Follow-up owner');
  const nextStep = factValue(governance, 'Next step');
  const linkedTask = factValue(governance, 'Linked task');
  const responseState = factValue(governance, 'Latest response state');
  const isCommunications = mode === 'communications';
  const title = isCommunications ? 'Coordination support' : 'Shared handoff';
  const summary =
    updatedAt || owner || nextStep || linkedTask
      ? 'Care-team context is available without crowding this workspace.'
      : 'No current shared handoff is saved yet.';
  const items = isCommunications
    ? [
        { label: 'Response', value: responseState },
        { label: 'Owner', value: owner },
        { label: 'Linked task', value: linkedTask },
      ]
    : [
        { label: 'Updated', value: updatedAt },
        { label: 'Owner', value: owner },
        { label: 'Next step', value: nextStep },
      ];
  const className = `v2-patient-context-summary v2-patient-context-summary--${mode} v2-patient-context-summary--${presentation}`;
  const content = (
    <>
      <div className="v2-patient-context-summary__copy">
        <DashboardV2Text tone="label">{isCommunications ? 'Linked context' : 'Coordination'}</DashboardV2Text>
        <DashboardV2Heading as="h3">{title}</DashboardV2Heading>
        <DashboardV2Text tone="muted">{summary}</DashboardV2Text>
      </div>
      <div className="v2-patient-context-summary__facts" aria-label={`${title} summary`}>
        {items.map((item) => (
          <div key={item.label} className="v2-patient-context-summary__fact">
            <DashboardV2Text tone="label">{item.label}</DashboardV2Text>
            <DashboardV2Text as="strong" tone={item.value ? 'strong' : 'muted'}>
              {item.value ?? 'Not set'}
            </DashboardV2Text>
          </div>
        ))}
      </div>
      <DashboardV2Button
        tone="secondary"
        size="sm"
        onPress={onOpenContext}
        leadingIcon={<PanelRightOpen size={16} />}
      >
        Open context
      </DashboardV2Button>
    </>
  );

  if (presentation === 'inline') {
    return <div className={className}>{content}</div>;
  }

  return (
    <DashboardV2Surface className={className} tone="muted">
      {content}
    </DashboardV2Surface>
  );
}
