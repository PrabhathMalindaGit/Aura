import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { DashboardAttentionVm } from "../../../adapters/dashboard";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Badge } from "../../../primitives/Badge";
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
        <DashboardV2Badge
          tone={
            attention.tone === "critical"
              ? "critical"
              : attention.tone === "warning"
                ? "warning"
                : "info"
          }
        >
          Attention now
        </DashboardV2Badge>
        <DashboardV2Heading as="h2">{attention.title}</DashboardV2Heading>
        <DashboardV2Text tone="strong">{attention.copy}</DashboardV2Text>
        <DashboardV2Text tone="muted">{attention.note}</DashboardV2Text>
      </div>

      <div className="v2-dashboard-attention__actions">
        <DashboardV2Button
          onPress={() => onOpenRoute(attention.actionPath)}
          leadingIcon={<ArrowRight size={16} />}
        >
          {attention.actionLabel}
        </DashboardV2Button>
        <span className="v2-dashboard-attention__route-hint">
          <ArrowUpRight size={14} />
          <span>{attention.actionPath}</span>
        </span>
      </div>
    </DashboardV2Surface>
  );
}
