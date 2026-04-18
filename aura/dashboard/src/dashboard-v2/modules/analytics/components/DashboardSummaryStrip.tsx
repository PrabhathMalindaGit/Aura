import { ArrowUpRight } from "lucide-react";
import { DashboardModuleState } from "../../../../components/dashboard/DashboardModuleState";
import type { DashboardSummaryMetricVm } from "../../../adapters/dashboard";
import { DashboardV2Badge } from "../../../primitives/Badge";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";

interface DashboardSummaryStripProps {
  metrics: DashboardSummaryMetricVm[];
  loading: boolean;
  error: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenRoute: (path: string) => void;
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
    <section
      className="v2-dashboard-summary-strip"
      aria-labelledby="v2-dashboard-summary-strip-title"
      data-testid="v2-dashboard-summary-strip"
    >
      <div className="v2-dashboard-summary-strip__header">
        <DashboardV2Text tone="label">Current service state</DashboardV2Text>
        <DashboardV2Heading as="h2" id="v2-dashboard-summary-strip-title">
          Overview at a glance
        </DashboardV2Heading>
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
                <DashboardV2Text tone="label">{metric.label}</DashboardV2Text>
                <DashboardV2Badge
                  tone={
                    metric.tone === "critical"
                      ? "critical"
                      : metric.tone === "warning"
                        ? "warning"
                        : metric.tone === "success"
                          ? "success"
                          : "neutral"
                  }
                >
                  {metric.tone === "critical"
                    ? "Live"
                    : metric.tone === "warning"
                      ? "Watch"
                      : metric.tone === "success"
                        ? "Steady"
                        : "Route"}
                </DashboardV2Badge>
              </div>
              <strong className="v2-dashboard-summary-card__value">
                {metric.value}
              </strong>
              <DashboardV2Text tone="muted">{metric.detail}</DashboardV2Text>
              <span className="v2-dashboard-summary-card__route">
                <ArrowUpRight size={14} />
                <span>{metric.path}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
