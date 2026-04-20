import { ArrowRight } from "lucide-react";
import { DashboardModuleState } from "../../../../components/dashboard/DashboardModuleState";
import type { DashboardAttentionVm } from "../../../adapters/dashboard";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";

interface DashboardAttentionPanelProps {
  attention: DashboardAttentionVm;
  loading: boolean;
  error: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenRoute: (path: string) => void;
}

export function DashboardAttentionPanel({
  attention,
  loading,
  error,
  isRefreshing,
  onRefresh,
  onOpenRoute,
}: DashboardAttentionPanelProps): JSX.Element {
  return (
    <DashboardV2Surface
      className={`v2-dashboard-attention v2-dashboard-attention--${attention.tone}`}
      tone="elevated"
      data-testid="v2-dashboard-attention-panel"
    >
      {loading ? (
        <DashboardModuleState
          mode="loading"
          title="Loading shift brief"
          lines={3}
        />
      ) : error ? (
        <DashboardModuleState
          mode="error"
          title="Unable to load the shift brief"
          description="Refresh to restore the current lead pressure."
          onRetry={onRefresh}
          retrying={isRefreshing}
        />
      ) : (
        <>
          <div className="v2-dashboard-attention__copy">
            <DashboardV2Text tone="label">Shift brief</DashboardV2Text>
            <DashboardV2Heading as="h2">{attention.title}</DashboardV2Heading>
            <DashboardV2Text tone="strong">{attention.copy}</DashboardV2Text>
            {attention.note ? (
              <DashboardV2Text
                tone="muted"
                className="v2-dashboard-attention__note"
              >
                {attention.note}
              </DashboardV2Text>
            ) : null}
          </div>

          <div className="v2-dashboard-attention__actions">
            <DashboardV2Button
              className="v2-dashboard-attention__cta"
              onPress={() => onOpenRoute(attention.actionPath)}
              leadingIcon={<ArrowRight size={16} />}
            >
              {attention.actionLabel}
            </DashboardV2Button>
          </div>
        </>
      )}
    </DashboardV2Surface>
  );
}
