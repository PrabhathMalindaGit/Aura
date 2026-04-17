import {
  Bot,
  ClipboardPenLine,
  HeartPulse,
  UserRound,
} from 'lucide-react';
import type { ProvenanceSource } from '../adapters/viewModels';
import { DashboardV2Badge } from '../primitives/Badge';

interface DashboardV2ProvenanceBadgeProps {
  source: ProvenanceSource;
}

const PROVENANCE_CONFIG: Record<
  ProvenanceSource,
  {
    label: string;
    tone: React.ComponentProps<typeof DashboardV2Badge>['tone'];
    icon: typeof ClipboardPenLine;
  }
> = {
  'clinician-entered': {
    label: 'Clinician-entered',
    tone: 'clinician',
    icon: ClipboardPenLine,
  },
  'patient-reported': {
    label: 'Patient-reported',
    tone: 'patient',
    icon: UserRound,
  },
  'device-captured': {
    label: 'Device-captured',
    tone: 'device',
    icon: HeartPulse,
  },
  'ai-suggested': {
    label: 'AI-suggested',
    tone: 'ai',
    icon: Bot,
  },
  unknown: {
    label: 'Unknown',
    tone: 'unknown',
    icon: UserRound,
  },
};

export function DashboardV2ProvenanceBadge({
  source,
}: DashboardV2ProvenanceBadgeProps): JSX.Element {
  const config = PROVENANCE_CONFIG[source];

  return (
    <DashboardV2Badge icon={config.icon} tone={config.tone}>
      {config.label}
    </DashboardV2Badge>
  );
}
