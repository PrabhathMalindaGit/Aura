import { ArrowUpRight } from "lucide-react";
import { DashboardModuleState } from "../../../../components/dashboard/DashboardModuleState";
import type { DashboardSummaryMetricVm } from "../../../adapters/dashboard";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";
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
    return "Now";
  }

  if (tone === "warning") {
    return "Watch";
  }

  if (tone === "success") {
    return "Clear";
  }

  return "Live";
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
    <DashboardV2Surface
      as="section"
      className="v2-dashboard-summary-strip"
      aria-labelledby="v2-dashboard-summary-strip-title"
      data-testid="v2-dashboard-summary-strip"
    >
      <div className="v2-dashboard-summary-strip__header">
        <div className="v2-dashboard-summary-strip__header-copy">
          <DashboardV2Text tone="label">Overview</DashboardV2Text>
          <DashboardV2Heading as="h2" id="v2-dashboard-summary-strip-title">
            At a glance
          </DashboardV2Heading>
        </div>
      </div>

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
        <div className="v2-dashboard-summary-strip__grid">
          {metrics.map((metric) => (
            <button
              key={metric.key}
              type="button"
              className={`v2-dashboard-summary-card v2-dashboard-summary-card--${metric.tone}`}
              data-testid={`v2-dashboard-metric-${metric.key}`}
              onClick={() => onOpenRoute(metric.path)}
            >
              <div className="v2-dashboard-summary-card__topline">
                <div className="v2-dashboard-summary-card__label-stack">
                  <DashboardV2Text tone="label">{metric.label}</DashboardV2Text>
                  <span className="v2-dashboard-summary-card__state">
                    <span
                      className={`v2-dashboard-summary-card__state-dot v2-dashboard-summary-card__state-dot--${metric.tone}`}
                      aria-hidden="true"
                    />
                    <span>{summaryStateLabel(metric.tone)}</span>
                  </span>
                </div>
                <DashboardDirectionalCue
                  tone={metric.tone}
                  intensity={summaryCueLevel(metric)}
                  label={`${metric.label} directional cue`}
                />
              </div>
              <strong className="v2-dashboard-summary-card__value">
                {metric.value}
              </strong>
              <DashboardV2Text
                tone="muted"
                className="v2-dashboard-summary-card__detail"
              >
                {metric.detail}
              </DashboardV2Text>
              <span className="v2-dashboard-summary-card__action">
                <ArrowUpRight size={14} />
                <span>{summaryActionLabel(metric.path)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </DashboardV2Surface>
  );
}
