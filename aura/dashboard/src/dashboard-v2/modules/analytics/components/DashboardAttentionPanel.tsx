import { ArrowRight } from "lucide-react";
import type { DashboardAttentionVm } from "../../../adapters/dashboard";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";

interface DashboardAttentionPanelProps {
  attention: DashboardAttentionVm;
  onOpenRoute: (path: string) => void;
}

export function DashboardAttentionPanel({
  attention,
  onOpenRoute,
}: DashboardAttentionPanelProps): JSX.Element {
  return (
    <DashboardV2Surface
      className={`v2-dashboard-attention v2-dashboard-attention--${attention.tone}`}
      tone="elevated"
      data-testid="v2-dashboard-attention-panel"
    >
      <div className="v2-dashboard-attention__copy">
        <DashboardV2Text tone="label">Attention now</DashboardV2Text>
        <DashboardV2Heading as="h2">{attention.title}</DashboardV2Heading>
        <DashboardV2Text tone="strong">{attention.copy}</DashboardV2Text>
      </div>

      <div className="v2-dashboard-attention__actions">
        <DashboardV2Text tone="muted" className="v2-dashboard-attention__note">
          {attention.note}
        </DashboardV2Text>
        <DashboardV2Button
          onPress={() => onOpenRoute(attention.actionPath)}
          leadingIcon={<ArrowRight size={16} />}
        >
          {attention.actionLabel}
        </DashboardV2Button>
      </div>
    </DashboardV2Surface>
  );
}
