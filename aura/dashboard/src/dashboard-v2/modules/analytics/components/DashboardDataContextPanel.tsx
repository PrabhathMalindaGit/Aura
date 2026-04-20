import type { DashboardDataContextVm } from "../../../adapters/dashboard";
import { DashboardV2Disclosure } from "../../../primitives/Disclosure";
import { DashboardV2Text } from "../../../primitives/Text";

interface DashboardDataContextPanelProps {
  dataContext: DashboardDataContextVm;
}

export function DashboardDataContextPanel({
  dataContext,
}: DashboardDataContextPanelProps): JSX.Element {
  return (
    <footer
      className="v2-dashboard-data-context"
      data-testid="v2-dashboard-data-context"
    >
      <div className="v2-dashboard-data-context__summary">
        <DashboardV2Text
          tone="caption"
          className="v2-dashboard-data-context__source-note"
        >
          {dataContext.sourceNote}
        </DashboardV2Text>

        <dl className="v2-dashboard-data-context__metadata">
          {dataContext.metadata.map((item) => (
            <div key={item.label} className="v2-dashboard-data-context__metadata-item">
              <dt>{item.label}</dt>
              <dd>{item.value?.trim() ? item.value : "Unknown"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <DashboardV2Disclosure
        title="Coverage & trust"
        summary="Sources and interpretation limits."
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
    </footer>
  );
}
