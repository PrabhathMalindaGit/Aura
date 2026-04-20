import { ArrowUpRight } from "lucide-react";
import { DashboardModuleState } from "../../../../components/dashboard/DashboardModuleState";
import type { DashboardSummaryMetricVm } from "../../../adapters/dashboard";
import { DashboardV2Badge } from "../../../primitives/Badge";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";

interface DashboardSummaryStripProps {
  metrics: DashboardSummaryMetricVm[];
  loading: boolean;
  error: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenRoute: (path: string) => void;
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

function summaryBadgeTone(
  tone: DashboardSummaryMetricVm["tone"],
): "critical" | "warning" | "clear" | "neutral" | "info" {
  if (tone === "critical") {
    return "critical";
  }

  if (tone === "warning") {
    return "warning";
  }

  if (tone === "success") {
    return "clear";
  }

  if (tone === "info") {
    return "info";
  }

  return "neutral";
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
      className="v2-dashboard-summary-strip"
      tone="elevated"
      data-testid="v2-dashboard-summary-strip"
    >
      <header className="v2-dashboard-summary-strip__header">
        <div className="v2-dashboard-summary-strip__header-copy">
          <DashboardV2Text tone="label">Operational summary</DashboardV2Text>
          <DashboardV2Heading as="h2">Lane pressure at a glance</DashboardV2Heading>
        </div>
      </header>

      {loading ? (
        <DashboardModuleState
          mode="loading"
          title="Loading operational summary"
          lines={4}
        />
      ) : error ? (
        <DashboardModuleState
          mode="error"
          title="Unable to load operational summary"
          description="Refresh to restore the current lane counts."
          onRetry={onRefresh}
          retrying={isRefreshing}
        />
      ) : (
        <div className="v2-dashboard-summary-strip__grid" role="list">
          {metrics.map((metric) => (
            <article
              key={metric.key}
              className={`v2-dashboard-summary-card v2-dashboard-summary-card--${metric.tone}`}
              role="listitem"
              data-testid={`v2-dashboard-metric-${metric.key}`}
            >
              <div className="v2-dashboard-summary-card__topline">
                <DashboardV2Text tone="label">{metric.label}</DashboardV2Text>
                <DashboardV2Badge tone={summaryBadgeTone(metric.tone)} size="sm">
                  {metric.stateLabel}
                </DashboardV2Badge>
              </div>

              <strong className="v2-dashboard-summary-card__value">{metric.value}</strong>

              {metric.context ? (
                <DashboardV2Text tone="caption" className="v2-dashboard-summary-card__detail">
                  {metric.context}
                </DashboardV2Text>
              ) : (
                <span className="v2-dashboard-summary-card__detail-spacer" aria-hidden="true" />
              )}

              <DashboardV2Button
                tone="quiet"
                size="sm"
                className="v2-dashboard-summary-card__cta"
                trailingIcon={<ArrowUpRight size={14} />}
                onPress={() => onOpenRoute(metric.path)}
              >
                {summaryActionLabel(metric.path)}
              </DashboardV2Button>
            </article>
          ))}
        </div>
      )}
    </DashboardV2Surface>
  );
}
