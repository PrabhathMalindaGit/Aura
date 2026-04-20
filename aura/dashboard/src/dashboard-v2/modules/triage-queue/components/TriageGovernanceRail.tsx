import { Bot, Info } from 'lucide-react';
import type { TriageGovernanceVm } from '../../../adapters/worklist';
import {
  DashboardV2ClinicianSupportGroup,
  DashboardV2ClinicianSupportRail,
} from '../../../patterns/ClinicianSupportRail';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Disclosure } from '../../../primitives/Disclosure';
import { DashboardV2Text } from '../../../primitives/Text';
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
      <DashboardV2ClinicianSupportRail className="triage-governance-rail" tone="muted" eyebrow="Governance" title="Context appears with the active case">
        <DashboardV2Text tone="muted">
          Select a patient to review provenance, audit context, response targets, and the current queue-priority basis.
        </DashboardV2Text>
      </DashboardV2ClinicianSupportRail>
    );
  }

  return (
    <DashboardV2ClinicianSupportRail
      className="triage-governance-rail"
      tone="muted"
      eyebrow="Governance and provenance"
      title="Supporting context"
    >
      <header className="triage-governance-rail__header">
        <DashboardV2Badge tone="info" icon={Info}>
          {governance.queuePrioritySource}
        </DashboardV2Badge>
      </header>

      <DashboardV2ClinicianSupportGroup title="Current context" tone="base">
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
      </DashboardV2ClinicianSupportGroup>

      <DashboardV2ClinicianSupportGroup title="Why this case is prioritized" tone="muted">
        <DashboardV2Disclosure
          title="Queue basis"
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
      </DashboardV2ClinicianSupportGroup>

      <div className="triage-governance-rail__footer">
        <DashboardV2Text tone="muted">
          AI-supported prioritization is not exposed on this route.
        </DashboardV2Text>
        <DashboardV2Button
          tone="secondary"
          size="sm"
          onPress={onOpenExplanation}
          leadingIcon={<Bot size={16} />}
        >
          Open explanation
        </DashboardV2Button>
      </div>
    </DashboardV2ClinicianSupportRail>
  );
}
