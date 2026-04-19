import { ArrowUpRight } from "lucide-react";
import { DashboardModuleState } from "../../../../components/dashboard/DashboardModuleState";
import type { DashboardSummaryMetricVm } from "../../../adapters/dashboard";
import { DashboardV2Button } from "../../../primitives/Button";
import {
  DashboardV2ClinicianSummaryMetric,
  DashboardV2ClinicianSummaryStrip,
} from "../../../patterns/ClinicianSummaryStrip";
import { DashboardDirectionalCue } from "./DashboardDirectionalCue";

interface DashboardSummaryStripProps {
  metrics: DashboardSummaryMetricVm[];
  loading: boolean;
  error: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenRoute: (path: string) => void;
}

function summaryStateLabel(tone: DashboardSummaryMetricVm["tone"]): string {
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

function summaryActionLabel(path: string): string {
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

function summaryCueLevel(metric: DashboardSummaryMetricVm): number {
  const numericValue = Number(metric.value);
  if (!Number.isFinite(numericValue)) {
    return 2;
  }

  if (numericValue <= 0) {
    return 1;
  }

  if (metric.tone === "critical") {
    return 4;
  }

  if (metric.tone === "warning") {
    return 3;
  }

  if (metric.tone === "success") {
    return 1;
  }

  return Math.min(3, Math.max(2, numericValue));
}

export function DashboardSummaryStrip({
  metrics,
  loading,
  error,
  isRefreshing,
  onRefresh,
  onOpenRoute,
}: DashboardSummaryStripProps): JSX.Element {
  return (
    <DashboardV2ClinicianSummaryStrip
      eyebrow="Overview"
      title="At a glance"
      className="v2-dashboard-summary-strip"
      data-testid="v2-dashboard-summary-strip"
    >
      {loading ? (
        <DashboardModuleState
          mode="loading"
          title="Loading service state"
          lines={5}
        />
      ) : error ? (
        <DashboardModuleState
          mode="error"
          title="Unable to load the current service state"
          description="Refresh to restore the current overview counts."
          onRetry={onRefresh}
          retrying={isRefreshing}
        />
      ) : (
        <>
          {metrics.map((metric) => (
            <DashboardV2ClinicianSummaryMetric
              key={metric.key}
              className={`v2-dashboard-summary-card v2-dashboard-summary-card--${metric.tone}`}
              label={metric.label}
              value={metric.value}
              detail={metric.detail}
              tone={metric.tone === "critical" ? "critical" : metric.tone === "warning" ? "warning" : metric.tone === "success" ? "success" : "neutral"}
              state={
                <span className="v2-dashboard-summary-card__state">
                  <span
                    className={`v2-dashboard-summary-card__state-dot v2-dashboard-summary-card__state-dot--${metric.tone}`}
                    aria-hidden="true"
                  />
                  <span>{summaryStateLabel(metric.tone)}</span>
                </span>
              }
              cue={
                <DashboardDirectionalCue
                  tone={metric.tone}
                  intensity={summaryCueLevel(metric)}
                  label={`${metric.label} directional cue`}
                  className="v2-dashboard-summary-card__cue"
                />
              }
              action={
                <DashboardV2Button
                  tone="row"
                  size="sm"
                  trailingIcon={<ArrowUpRight size={14} />}
                  onPress={() => onOpenRoute(metric.path)}
                >
                  {summaryActionLabel(metric.path)}
                </DashboardV2Button>
              }
              data-testid={`v2-dashboard-metric-${metric.key}`}
            />
          ))}
        </>
      )}
    </DashboardV2ClinicianSummaryStrip>
  );
}
