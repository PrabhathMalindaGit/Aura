import type { DashboardDataContextVm } from "../../../adapters/dashboard";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Disclosure } from "../../../primitives/Disclosure";
import { DashboardV2Text } from "../../../primitives/Text";

interface DashboardDataContextPanelProps {
  dataContext: DashboardDataContextVm;
  scheduleStatus?: string | null;
  scheduleDetail?: string | null;
  onOpenSchedule?: () => void;
}

export function DashboardDataContextPanel({
  dataContext,
  scheduleStatus = null,
  scheduleDetail = null,
  onOpenSchedule,
}: DashboardDataContextPanelProps): JSX.Element {
  const updatedValue =
    dataContext.metadata.find((item) => item.label === "Updated")?.value ?? "Unknown";
  const reviewWindowValue =
    dataContext.metadata.find((item) => item.label === "Review window")?.value ??
    "Unknown";
  const dataSourceValue =
    dataContext.metadata.find((item) => item.label === "Data source")?.value ?? null;
  const scheduleLineParts = [scheduleStatus, scheduleDetail].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  const scheduleLine =
    scheduleLineParts.length > 0
      ? `Schedule status: ${scheduleLineParts.join(" · ")}`
      : null;

  return (
    <footer
      className="v2-dashboard-data-context"
      data-testid="v2-dashboard-data-context"
    >
      <div className="v2-dashboard-data-context__summary">
        <div className="v2-dashboard-data-context__inline">
          <DashboardV2Text
            tone="caption"
            className="v2-dashboard-data-context__inline-item"
          >
            Updated <strong>{updatedValue}</strong>
          </DashboardV2Text>
          <DashboardV2Text
            tone="caption"
            className="v2-dashboard-data-context__inline-item"
          >
            Review window <strong>{reviewWindowValue}</strong>
          </DashboardV2Text>
          <DashboardV2Text
            tone="caption"
            className="v2-dashboard-data-context__inline-item v2-dashboard-data-context__inline-item--note"
          >
            {dataContext.sourceNote}
          </DashboardV2Text>
          {dataSourceValue ? (
            <DashboardV2Text
              tone="caption"
              className="v2-dashboard-data-context__inline-item"
            >
              Data source <strong>{dataSourceValue}</strong>
            </DashboardV2Text>
          ) : null}
          {scheduleLine ? (
            <DashboardV2Text
              tone="caption"
              className="v2-dashboard-data-context__inline-item"
            >
              {scheduleLine}
            </DashboardV2Text>
          ) : null}
        </div>

        <div className="v2-dashboard-data-context__actions">
          {onOpenSchedule ? (
            <DashboardV2Button
              tone="quiet"
              size="sm"
              className="v2-dashboard-data-context__schedule-button"
              onPress={onOpenSchedule}
            >
              Open schedule
            </DashboardV2Button>
          ) : null}

          <DashboardV2Disclosure
            title="About this data"
            summary="Coverage and interpretation limits."
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
        </div>
      </div>
    </footer>
  );
}
