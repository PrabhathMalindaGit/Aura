import { Bot, Info } from 'lucide-react';
import type { TriageGovernanceVm } from '../../../adapters/worklist';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Disclosure } from '../../../primitives/Disclosure';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { DashboardV2MetadataList } from '../../../patterns/MetadataList';
import { DashboardV2ProvenanceBadge } from '../../../patterns/ProvenanceBadge';

interface TriageGovernanceRailProps {
  governance: TriageGovernanceVm | null;
  queueScopeLabel: string;
  onOpenExplanation: () => void;
}

export function TriageGovernanceRail({
  governance,
  queueScopeLabel,
  onOpenExplanation,
}: TriageGovernanceRailProps): JSX.Element {
  if (!governance) {
    return (
      <DashboardV2Surface className="triage-governance-rail" tone="muted">
        <DashboardV2Text tone="label">Governance</DashboardV2Text>
        <DashboardV2Heading as="h2">Context appears with the active case</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Select a patient to review provenance, audit context, response targets, and the current queue-priority basis.
        </DashboardV2Text>
      </DashboardV2Surface>
    );
  }

  return (
    <DashboardV2Surface className="triage-governance-rail" tone="muted">
      <header className="triage-governance-rail__header">
        <div>
          <DashboardV2Text tone="label">Governance and provenance</DashboardV2Text>
          <DashboardV2Heading as="h2">Supporting context</DashboardV2Heading>
        </div>
        <DashboardV2Badge tone="info" icon={Info}>
          {governance.queuePrioritySource}
        </DashboardV2Badge>
      </header>

      <div className="triage-governance-rail__badges" aria-label="Provenance sources">
        {governance.provenance.map((source) => (
          <DashboardV2ProvenanceBadge key={source} source={source} />
        ))}
      </div>

      <DashboardV2MetadataList
        items={[
          { label: 'Last reviewed by', value: governance.lastReviewedBy },
          { label: 'Last reviewed at', value: governance.lastReviewedAt },
          { label: 'Response target', value: governance.responseTarget },
          { label: 'Queue scope', value: queueScopeLabel },
          { label: 'Threshold context', value: governance.thresholdContext },
        ]}
      />

      <DashboardV2Disclosure
        title="Why this case is prioritized"
        summary={governance.queuePriorityBasis[0] ?? 'Server-calculated from current queue signals'}
        defaultExpanded
      >
        <ul className="triage-governance-rail__list">
          {governance.queuePriorityBasis.map((item) => (
            <li key={item}>
              <DashboardV2Text tone="muted">{item}</DashboardV2Text>
            </li>
          ))}
        </ul>
      </DashboardV2Disclosure>

      <DashboardV2Disclosure
        title="Supporting evidence"
        summary={governance.evidenceSummary[0] ?? 'Current worklist evidence'}
      >
        <ul className="triage-governance-rail__list">
          {governance.evidenceSummary.map((item) => (
            <li key={item}>
              <DashboardV2Text tone="muted">{item}</DashboardV2Text>
            </li>
          ))}
        </ul>
      </DashboardV2Disclosure>

      <div className="triage-governance-rail__footer">
        <DashboardV2Badge tone="unknown">
          AI-supported prioritization is not exposed on this route.
        </DashboardV2Badge>
        <DashboardV2Button
          tone="secondary"
          size="sm"
          onPress={onOpenExplanation}
          leadingIcon={<Bot size={16} />}
        >
          Open explanation
        </DashboardV2Button>
      </div>
    </DashboardV2Surface>
  );
}
