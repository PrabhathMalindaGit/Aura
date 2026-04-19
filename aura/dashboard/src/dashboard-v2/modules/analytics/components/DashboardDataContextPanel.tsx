import type { DashboardDataContextVm } from "../../../adapters/dashboard";
import { DashboardV2Disclosure } from "../../../primitives/Disclosure";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";
import { DashboardV2MetadataList } from "../../../patterns/MetadataList";

interface DashboardDataContextPanelProps {
  dataContext: DashboardDataContextVm;
  priorityQueuePressureNote: string;
}

export function DashboardDataContextPanel({
  dataContext,
  priorityQueuePressureNote,
}: DashboardDataContextPanelProps): JSX.Element {
  return (
    <DashboardV2Surface
      className="v2-dashboard-data-context"
      tone="elevated"
      data-testid="v2-dashboard-data-context"
    >
      <header className="v2-dashboard-data-context__header">
        <DashboardV2Text tone="label">Freshness &amp; scope</DashboardV2Text>
        <DashboardV2Heading as="h2">What this overview reflects</DashboardV2Heading>
        <DashboardV2Text tone="caption">
          {priorityQueuePressureNote}
        </DashboardV2Text>
      </header>

      <DashboardV2MetadataList items={dataContext.metadata} />

      <DashboardV2Disclosure
        title="Current scope"
        summary={dataContext.coverageSummary}
        defaultExpanded={false}
      >
        <DashboardV2Text tone="muted">
          {dataContext.coverageSummary}
        </DashboardV2Text>
      </DashboardV2Disclosure>

      <DashboardV2Disclosure
        title="What stays in destination routes"
        summary={dataContext.trustSummary}
        defaultExpanded={false}
      >
        <DashboardV2Text tone="muted">
          {dataContext.trustSummary}
        </DashboardV2Text>
      </DashboardV2Disclosure>
    </DashboardV2Surface>
  );
}
