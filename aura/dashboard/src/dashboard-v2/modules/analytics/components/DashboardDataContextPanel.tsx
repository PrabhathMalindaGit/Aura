import type { DashboardDataContextVm } from "../../../adapters/dashboard";
import { DashboardV2Disclosure } from "../../../primitives/Disclosure";
import {
  DashboardV2ClinicianSupportGroup,
  DashboardV2ClinicianSupportRail,
} from "../../../patterns/ClinicianSupportRail";
import { DashboardV2Text } from "../../../primitives/Text";
import { DashboardV2MetadataList } from "../../../patterns/MetadataList";

interface DashboardDataContextPanelProps {
  dataContext: DashboardDataContextVm;
}

export function DashboardDataContextPanel({
  dataContext,
}: DashboardDataContextPanelProps): JSX.Element {
  return (
    <DashboardV2ClinicianSupportRail
      className="v2-dashboard-data-context"
      tone="elevated"
      eyebrow="Freshness"
      title="Freshness & scope"
      data-testid="v2-dashboard-data-context"
    >
      <DashboardV2ClinicianSupportGroup title="Current context" tone="muted">
        <DashboardV2MetadataList items={dataContext.metadata} />
      </DashboardV2ClinicianSupportGroup>

      <DashboardV2ClinicianSupportGroup title="How to read this" tone="base">
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
      </DashboardV2ClinicianSupportGroup>
    </DashboardV2ClinicianSupportRail>
  );
}
