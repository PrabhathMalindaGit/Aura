import { ArrowUpRight } from "lucide-react";
import { DashboardModuleState } from "../../../../components/dashboard/DashboardModuleState";
import type { DashboardOperationalLoadRowVm } from "../../../adapters/dashboard";
import { DashboardV2ChartFrame } from "../../../charts/ChartFrame";
import { DashboardV2Badge } from "../../../primitives/Badge";
import { DashboardV2Text } from "../../../primitives/Text";

interface DashboardOperationalLoadSectionProps {
  rows: DashboardOperationalLoadRowVm[];
  note: string;
  loading: boolean;
  error: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenRoute: (path: string) => void;
}

export function DashboardOperationalLoadSection({
  rows,
  note,
  loading,
  error,
  isRefreshing,
  onRefresh,
  onOpenRoute,
}: DashboardOperationalLoadSectionProps): JSX.Element {
  return (
    <DashboardV2ChartFrame
      title="Operational load"
      summary="Where demand is building right now"
      description={note}
    >
      <section
        className="v2-dashboard-operational-load"
        data-testid="v2-dashboard-operational-load"
      >
        {loading ? (
          <DashboardModuleState
            mode="loading"
            title="Loading operational load"
            lines={5}
          />
        ) : error ? (
          <DashboardModuleState
            mode="error"
            title="Unable to load operational routing pressure"
            description="Refresh to restore the current cross-route overview."
            onRetry={onRefresh}
            retrying={isRefreshing}
          />
        ) : (
          <div className="v2-dashboard-operational-load__rows" role="list">
            {rows.map((row) => (
              <button
                key={row.key}
                type="button"
                className="v2-dashboard-operational-row"
                role="listitem"
                data-testid={`v2-dashboard-load-row-${row.key}`}
                onClick={() => onOpenRoute(row.path)}
              >
                <div className="v2-dashboard-operational-row__copy">
                  <div className="v2-dashboard-operational-row__topline">
                    <div>
                      <strong className="v2-dashboard-operational-row__label">
                        {row.label}
                      </strong>
                      <DashboardV2Text tone="muted">
                        {row.detail}
                      </DashboardV2Text>
                    </div>
                    <DashboardV2Badge
                      tone={
                        row.tone === "critical"
                          ? "critical"
                          : row.tone === "warning"
                            ? "warning"
                            : row.tone === "success"
                              ? "success"
                              : "neutral"
                      }
                    >
                      {row.displayValue}
                    </DashboardV2Badge>
                  </div>
                  <div
                    className="v2-dashboard-operational-row__bar"
                    aria-hidden="true"
                  >
                    <span
                      className={`v2-dashboard-operational-row__bar-fill v2-dashboard-operational-row__bar-fill--${row.tone}`}
                      style={{ width: `${row.barPercent}%` }}
                    />
                  </div>
                </div>
                <span className="v2-dashboard-operational-row__route">
                  <ArrowUpRight size={14} />
                  <span>{row.path}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </DashboardV2ChartFrame>
  );
}
