import { CalendarClock } from "lucide-react";
import { DashboardModuleState } from "../../../../components/dashboard/DashboardModuleState";
import type { DashboardCapacityRailVm } from "../../../adapters/dashboard";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Text } from "../../../primitives/Text";

interface DashboardScheduleSectionProps {
  rail: DashboardCapacityRailVm;
  loading: boolean;
  error: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenSchedule: () => void;
  onOpenPatient: (patientId: string) => void;
  guardPatientActions?: boolean;
}

function capacityTone(
  rail: DashboardCapacityRailVm,
): "warning" | "success" | "info" | "neutral" {
  if (
    rail.pendingRequestCount > 0 &&
    rail.pendingRequestCount > rail.availableSlotsCount
  ) {
    return "warning";
  }

  if (rail.pendingRequestCount === 0 && rail.availableSlotsCount === 0) {
    return "success";
  }

  if (rail.availableSlotsCount > 0) {
    return "info";
  }

  return "neutral";
}

export function DashboardScheduleSection({
  rail,
  loading,
  error,
  isRefreshing,
  onRefresh,
  onOpenSchedule,
  onOpenPatient,
  guardPatientActions = false,
}: DashboardScheduleSectionProps): JSX.Element {
  const tone = capacityTone(rail);
  const totalUnits = Math.max(
    rail.pendingRequestCount + rail.availableSlotsCount,
    1,
  );
  const pendingShare =
    rail.pendingRequestCount + rail.availableSlotsCount > 0
      ? (rail.pendingRequestCount / totalUnits) * 100
      : 0;
  const availableShare =
    rail.pendingRequestCount + rail.availableSlotsCount > 0
      ? (rail.availableSlotsCount / totalUnits) * 100
      : 0;

  return (
    <DashboardV2Surface
      className="v2-dashboard-schedule"
      tone="elevated"
      data-testid="v2-dashboard-schedule-section"
    >
      <header className="v2-dashboard-schedule__header">
        <div className="v2-dashboard-schedule__header-copy">
          <DashboardV2Text tone="label">Today &amp; capacity</DashboardV2Text>
          <DashboardV2Text tone="caption">
            Keep schedule pressure in view without leaving the page.
          </DashboardV2Text>
        </div>
        <DashboardV2Button
          tone="quiet"
          size="sm"
          className="v2-dashboard-schedule__open-button"
          onPress={onOpenSchedule}
        >
          Open schedule
        </DashboardV2Button>
      </header>

      {loading ? (
        <DashboardModuleState
          mode="loading"
          title="Loading capacity context"
          lines={4}
        />
      ) : error ? (
        <DashboardModuleState
          mode="error"
          title="Unable to load today and capacity"
          description="Refresh to restore the schedule and visible capacity context."
          onRetry={onRefresh}
          retrying={isRefreshing}
        />
      ) : (
        <>
          <div className="v2-dashboard-schedule__spotlight">
            <DashboardV2Text tone="label">Next visible slot</DashboardV2Text>
            <strong className="v2-dashboard-schedule__spotlight-value">
              {rail.nextOpenSlotValue}
            </strong>
            <DashboardV2Text tone="muted">{rail.visitsSummary}</DashboardV2Text>
          </div>

          <div
            className={`v2-dashboard-schedule__capacity-shell v2-dashboard-schedule__capacity-shell--${tone}`}
          >
            <div className="v2-dashboard-schedule__capacity-topline">
              <div className="v2-dashboard-schedule__capacity-copy">
                <DashboardV2Text tone="label">Visible balance</DashboardV2Text>
                <DashboardV2Text tone="caption">{rail.capacityStateLabel}</DashboardV2Text>
              </div>
              <strong className="v2-dashboard-schedule__capacity-balance">
                {rail.pendingRequestCount}:{rail.availableSlotsCount}
              </strong>
            </div>

            <div
              className={`v2-dashboard-schedule__capacity-gauge ${
                rail.pendingRequestCount === 0 && rail.availableSlotsCount === 0
                  ? "v2-dashboard-schedule__capacity-gauge--empty"
                  : ""
              }`}
              aria-label={rail.capacityStateLabel}
            >
              <span
                className="v2-dashboard-schedule__capacity-fill v2-dashboard-schedule__capacity-fill--pending"
                style={{ width: `${pendingShare}%` }}
              />
              <span
                className="v2-dashboard-schedule__capacity-fill v2-dashboard-schedule__capacity-fill--available"
                style={{
                  left: `${pendingShare}%`,
                  width: `${availableShare}%`,
                }}
              />
            </div>

            <div className="v2-dashboard-schedule__capacity-legend">
              <span className="v2-dashboard-schedule__capacity-token">
                <span
                  className="v2-dashboard-schedule__capacity-dot v2-dashboard-schedule__capacity-dot--pending"
                  aria-hidden="true"
                />
                <span>
                  <strong>{rail.pendingRequestCount}</strong> requests
                </span>
              </span>
              <span className="v2-dashboard-schedule__capacity-token">
                <span
                  className="v2-dashboard-schedule__capacity-dot v2-dashboard-schedule__capacity-dot--available"
                  aria-hidden="true"
                />
                <span>
                  <strong>{rail.availableSlotsCount}</strong> open slots
                </span>
              </span>
            </div>
          </div>

          <div className="v2-dashboard-schedule__timeline-shell">
            <div className="v2-dashboard-schedule__timeline-scale" aria-hidden="true">
              <span>08:00</span>
              <span>12:00</span>
              <span>16:00</span>
              <span>20:00</span>
            </div>
            <div className="v2-dashboard-schedule__timeline" aria-label="Today timeline">
              {rail.timelineBlocks.length > 0 ? (
                rail.timelineBlocks.map((block) => (
                  <button
                    key={block.id}
                    type="button"
                    className={`v2-dashboard-schedule__block v2-dashboard-schedule__block--${block.tone}`}
                    style={{
                      left: `${block.leftPercent}%`,
                      width: `${block.widthPercent}%`,
                    }}
                    title={`${block.label} · ${block.detail}`}
                    disabled={guardPatientActions}
                    onClick={() => onOpenPatient(block.patientId)}
                  >
                    <span className="v2-dashboard-schedule__block-label">{block.label}</span>
                    <span className="v2-dashboard-schedule__block-detail">{block.statusLabel}</span>
                  </button>
                ))
              ) : (
                <div className="v2-dashboard-schedule__empty">
                  <CalendarClock size={16} />
                  <DashboardV2Text tone="muted">
                    No visits are visible in today’s agenda.
                  </DashboardV2Text>
                </div>
              )}
            </div>
          </div>

          <DashboardV2Text tone="muted" className="v2-dashboard-schedule__note">
            {rail.note}
          </DashboardV2Text>
        </>
      )}
    </DashboardV2Surface>
  );
}
