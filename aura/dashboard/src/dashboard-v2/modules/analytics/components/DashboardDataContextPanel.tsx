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
          <DashboardV2Text tone="label">Freshness &amp; trust</DashboardV2Text>
          <DashboardV2Text tone="muted">{dataContext.sourceNote}</DashboardV2Text>
        </div>
        <DashboardV2MetadataList items={dataContext.metadata} />
      </div>

      <div className="v2-dashboard-data-context__disclosures">
        <DashboardV2Disclosure
          title="Coverage note"
          summary={dataContext.coverageSummary}
          defaultExpanded={false}
        >
          <DashboardV2Text tone="muted">{dataContext.coverageDetail}</DashboardV2Text>
        </DashboardV2Disclosure>

        <DashboardV2Disclosure
          title="Trust note"
          summary={dataContext.trustSummary}
          defaultExpanded={false}
        >
          <DashboardV2Text tone="muted">{dataContext.trustDetail}</DashboardV2Text>
        </DashboardV2Disclosure>
      </div>
    </DashboardV2Surface>
  );
}
