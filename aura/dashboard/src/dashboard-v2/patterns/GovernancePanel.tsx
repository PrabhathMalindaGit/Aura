import { Bot, ShieldCheck } from 'lucide-react';
import type { ProvenanceSource } from '../adapters/viewModels';
import { DashboardV2Badge } from '../primitives/Badge';
import { DashboardV2Button } from '../primitives/Button';
import { DashboardV2Disclosure } from '../primitives/Disclosure';
import { DashboardV2Heading, DashboardV2Text } from '../primitives/Text';
import { DashboardV2MetadataList } from './MetadataList';
import { DashboardV2ProvenanceBadge } from './ProvenanceBadge';

interface DashboardV2GovernancePanelProps {
  title?: string;
  description?: string;
  provenance?: ProvenanceSource[];
  lastReviewedBy?: string | null;
  lastReviewedAt?: string | null;
  explanationLabel?: string;
  onOpenExplanation?: () => void;
}

export function DashboardV2GovernancePanel({
  title = 'Governance and provenance',
  description = 'Audit context, provenance labels, explanation controls, and responsibility boundaries stay visible here without competing with the active workflow.',
  provenance = ['clinician-entered', 'patient-reported', 'device-captured', 'ai-suggested'],
  lastReviewedBy = null,
  lastReviewedAt = null,
  explanationLabel = 'Open explanation drawer',
  onOpenExplanation,
}: DashboardV2GovernancePanelProps): JSX.Element {
  return (
    <div className="v2-governance-panel">
      <header className="v2-governance-panel__header">
        <DashboardV2Heading as="h2">{title}</DashboardV2Heading>
        <DashboardV2Text tone="muted">{description}</DashboardV2Text>
      </header>

      <div className="v2-governance-panel__badges" aria-label="Provenance sources">
        {provenance.map((source) => (
          <DashboardV2ProvenanceBadge key={source} source={source} />
        ))}
      </div>

      <DashboardV2MetadataList
        items={[
          { label: 'Last reviewed by', value: lastReviewedBy },
          { label: 'Last reviewed at', value: lastReviewedAt },
          { label: 'AI validation context', value: null },
        ]}
      />

      <div className="v2-governance-panel__actions">
        <DashboardV2Badge icon={ShieldCheck} tone="info">
          Explicit responsibility boundaries
        </DashboardV2Badge>
        <DashboardV2Button
          tone="secondary"
          onPress={() => {
            onOpenExplanation?.();
          }}
          leadingIcon={<Bot size={16} />}
        >
          {explanationLabel}
        </DashboardV2Button>
      </div>

      <DashboardV2Disclosure
        title="Caution zone"
        summary="AI-assisted outputs remain advisory unless the active route explicitly shows supported evidence."
      >
        <DashboardV2Text tone="muted">
          Source, evidence summary, limitations, update date, and validation context stay visible on actionable AI-assisted surfaces before they are treated as review support.
        </DashboardV2Text>
      </DashboardV2Disclosure>
    </div>
  );
}
