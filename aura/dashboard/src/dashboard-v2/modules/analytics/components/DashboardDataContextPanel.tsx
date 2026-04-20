import type { DashboardDataContextVm } from "../../../adapters/dashboard";
import { DashboardV2Disclosure } from "../../../primitives/Disclosure";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Text } from "../../../primitives/Text";
import { DashboardV2MetadataList } from "../../../patterns/MetadataList";

interface DashboardDataContextPanelProps {
  dataContext: DashboardDataContextVm;
}

export function DashboardDataContextPanel({
  dataContext,
}: DashboardDataContextPanelProps): JSX.Element {
  return (
    <DashboardV2Surface
      className="v2-dashboard-data-context"
      tone="muted"
      data-testid="v2-dashboard-data-context"
    >
      <div className="v2-dashboard-data-context__summary">
        <div className="v2-dashboard-data-context__copy">
          <DashboardV2Text
            tone="caption"
            className="v2-dashboard-data-context__source-note"
          >
            {dataContext.sourceNote}
          </DashboardV2Text>
        </div>
        <DashboardV2MetadataList items={dataContext.metadata} />
      </div>

      <DashboardV2Disclosure
        title="Coverage & trust"
        summary="Included sources and interpretation limits."
        defaultExpanded={false}
        className="v2-dashboard-data-context__disclosure"
      >
        <div className="v2-dashboard-data-context__detail-grid">
          <div className="v2-dashboard-data-context__detail-block">
            <DashboardV2Text tone="label">Coverage</DashboardV2Text>
            <DashboardV2Text tone="muted">{dataContext.coverageSummary}</DashboardV2Text>
            <DashboardV2Text tone="muted">{dataContext.coverageDetail}</DashboardV2Text>
          </div>

          <div className="v2-dashboard-data-context__detail-block">
            <DashboardV2Text tone="label">Trust note</DashboardV2Text>
            <DashboardV2Text tone="muted">{dataContext.trustSummary}</DashboardV2Text>
            <DashboardV2Text tone="muted">{dataContext.trustDetail}</DashboardV2Text>
          </div>
        </div>
      </DashboardV2Disclosure>
    </DashboardV2Surface>
  );
}
