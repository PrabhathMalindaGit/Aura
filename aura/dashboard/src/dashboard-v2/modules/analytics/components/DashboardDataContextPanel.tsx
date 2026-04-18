import type { DashboardDataContextVm } from "../../../adapters/dashboard";
import { DashboardV2Disclosure } from "../../../primitives/Disclosure";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";
import { DashboardV2MetadataList } from "../../../patterns/MetadataList";

interface DashboardDataContextPanelProps {
  dataContext: DashboardDataContextVm;
  priorityQueuePressureNote: string;
  isVeryNarrow: boolean;
}

export function DashboardDataContextPanel({
  dataContext,
  priorityQueuePressureNote,
  isVeryNarrow,
}: DashboardDataContextPanelProps): JSX.Element {
  return (
    <DashboardV2Surface
      className="v2-dashboard-data-context"
      tone="elevated"
      data-testid="v2-dashboard-data-context"
    >
      <header className="v2-dashboard-data-context__header">
        <DashboardV2Text tone="label">Data context</DashboardV2Text>
        <DashboardV2Heading as="h2">
          Freshness and trust boundaries
        </DashboardV2Heading>
        <DashboardV2Text tone="muted">
          {priorityQueuePressureNote}
        </DashboardV2Text>
      </header>

      <DashboardV2MetadataList items={dataContext.metadata} />

      <DashboardV2Disclosure
        title="Coverage note"
        summary={dataContext.coverageSummary}
        defaultExpanded={!isVeryNarrow}
      >
        <DashboardV2Text tone="muted">
          {dataContext.coverageSummary}
        </DashboardV2Text>
      </DashboardV2Disclosure>

      <DashboardV2Disclosure
        title="Trust note"
        summary={dataContext.trustSummary}
        defaultExpanded={!isVeryNarrow}
      >
        <DashboardV2Text tone="muted">
          {dataContext.trustSummary}
        </DashboardV2Text>
      </DashboardV2Disclosure>
    </DashboardV2Surface>
  );
}
