import type { DashboardDataContextVm } from "../../../adapters/dashboard";
import { DashboardV2Disclosure } from "../../../primitives/Disclosure";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";
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
      tone="elevated"
      data-testid="v2-dashboard-data-context"
    >
      <header className="v2-dashboard-data-context__header">
        <DashboardV2Heading as="h2">Freshness &amp; scope</DashboardV2Heading>
      </header>

      <DashboardV2MetadataList items={dataContext.metadata} />

      <DashboardV2Disclosure
        title="What’s included"
        summary={dataContext.coverageSummary}
        defaultExpanded={false}
      >
        <DashboardV2Text tone="muted">
          {dataContext.coverageDetail}
        </DashboardV2Text>
      </DashboardV2Disclosure>

      <DashboardV2Disclosure
        title="Trust & provenance"
        summary={dataContext.trustSummary}
        defaultExpanded={false}
      >
        <DashboardV2Text tone="muted">
          {dataContext.trustDetail}
        </DashboardV2Text>
      </DashboardV2Disclosure>
    </DashboardV2Surface>
  );
}
