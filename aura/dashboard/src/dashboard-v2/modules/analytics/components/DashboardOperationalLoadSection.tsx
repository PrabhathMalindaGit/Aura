import { ArrowUpRight } from "lucide-react";
import { DashboardModuleState } from "../../../../components/dashboard/DashboardModuleState";
import type { DashboardOperationalLoadRowVm } from "../../../adapters/dashboard";
import { DashboardV2ChartFrame } from "../../../charts/ChartFrame";
import { DashboardV2Text } from "../../../primitives/Text";
import { DashboardDirectionalCue } from "./DashboardDirectionalCue";

interface DashboardOperationalLoadSectionProps {
  rows: DashboardOperationalLoadRowVm[];
  loading: boolean;
  error: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenRoute: (path: string) => void;
}

function operationalActionLabel(path: string): string {
  switch (path) {
    case "/alerts":
      return "Open alerts";
    case "/communication":
      return "Open inbox";
    case "/worklist":
      return "Open queue";
    case "/insights":
      return "Open insights";
    case "/appointments":
      return "Open schedule";
    default:
      return "Open route";
  }
}

function operationalToneLabel(tone: DashboardOperationalLoadRowVm["tone"]): string {
  if (tone === "critical") {
    return "Rising";
  }

  if (tone === "warning") {
    return "Watch";
  }

  if (tone === "success") {
    return "Clear";
  }

  return "Steady";
}

function operationalCueLevel(row: DashboardOperationalLoadRowVm): number {
  if (row.value <= 0) {
    return 1;
  }

  return Math.min(4, Math.max(1, Math.round(row.barPercent / 25)));
}

export function DashboardOperationalLoadSection({
  rows,
  loading,
  error,
  isRefreshing,
  onRefresh,
  onOpenRoute,
}: DashboardOperationalLoadSectionProps): JSX.Element {
  return (
    <DashboardV2ChartFrame
      title="Operational load"
      summary="Leading pressure by lane"
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
            {rows.map((row, index) => (
              <button
                key={row.key}
                type="button"
                className={`v2-dashboard-operational-row v2-dashboard-operational-row--${row.tone}`}
                role="listitem"
                data-testid={`v2-dashboard-load-row-${row.key}`}
                onClick={() => onOpenRoute(row.path)}
              >
                <div className="v2-dashboard-operational-row__lane">
                  <span className="v2-dashboard-operational-row__rank" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span
                    className={`v2-dashboard-operational-row__tone v2-dashboard-operational-row__tone--${row.tone}`}
                    aria-hidden="true"
                  />
                  <div className="v2-dashboard-operational-row__copy">
                    <strong className="v2-dashboard-operational-row__label">
                      {row.label}
                    </strong>
                    {row.detail ? (
                      <DashboardV2Text
                        tone="muted"
                        className="v2-dashboard-operational-row__detail"
                      >
                        {row.detail}
                      </DashboardV2Text>
                    ) : null}
                  </div>
                </div>
                <div className="v2-dashboard-operational-row__summary">
                  <div className="v2-dashboard-operational-row__metric">
                    <strong className="v2-dashboard-operational-row__value">
                      {row.displayValue}
                    </strong>
                    <DashboardDirectionalCue
                      tone={row.tone}
                      intensity={operationalCueLevel(row)}
                      label={`${row.label} directional cue`}
                    />
                  </div>
                  <DashboardV2Text
                    tone="caption"
                    className="v2-dashboard-operational-row__state"
                  >
                    {operationalToneLabel(row.tone)}
                  </DashboardV2Text>
                </div>
                <span className="v2-dashboard-operational-row__action">
                  <ArrowUpRight size={14} />
                  <span>{operationalActionLabel(row.path)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </DashboardV2ChartFrame>
  );
}
