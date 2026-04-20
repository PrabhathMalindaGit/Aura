import { DashboardModuleState } from "../../../../components/dashboard/DashboardModuleState";
import type { DashboardCapacityRailVm } from "../../../adapters/dashboard";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Disclosure } from "../../../primitives/Disclosure";
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
  const showAgendaDisclosure = rail.timelineBlocks.length > 0;
  const supportLine =
    rail.timelineBlocks.length > 0
      ? rail.visitsSummary
      : rail.pendingRequestCount > 0 || rail.availableSlotsCount > 0
        ? rail.note
        : null;

  return (
    <DashboardV2Surface
      className="v2-dashboard-schedule"
      tone="elevated"
      data-testid="v2-dashboard-schedule-section"
    >
      <header className="v2-dashboard-schedule__header">
        <div className="v2-dashboard-schedule__header-copy">
          <DashboardV2Text tone="label">Schedule status</DashboardV2Text>
          <DashboardV2Text tone="caption">{rail.capacityStateLabel}</DashboardV2Text>
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
          title="Loading schedule status"
          lines={2}
        />
      ) : error ? (
        <DashboardModuleState
          mode="error"
          title="Unable to load schedule status"
          description="Refresh to restore visible schedule context."
          onRetry={onRefresh}
          retrying={isRefreshing}
        />
      ) : (
        <>
          <div className={`v2-dashboard-schedule__summary v2-dashboard-schedule__summary--${tone}`}>
            <strong className="v2-dashboard-schedule__summary-value">
              {rail.nextOpenSlotValue}
            </strong>
            <DashboardV2Text tone="muted">{rail.capacityStateLabel}</DashboardV2Text>
            {supportLine ? (
              <DashboardV2Text tone="muted" className="v2-dashboard-schedule__note">
                {supportLine}
              </DashboardV2Text>
            ) : null}
            {(rail.pendingRequestCount > 0 || rail.availableSlotsCount > 0) ? (
              <div className="v2-dashboard-schedule__micro-metrics">
                <span className="v2-dashboard-schedule__micro-token">
                  <span
                    className="v2-dashboard-schedule__capacity-dot v2-dashboard-schedule__capacity-dot--pending"
                    aria-hidden="true"
                  />
                  <span>Pending {rail.pendingRequestCount}</span>
                </span>
                <span className="v2-dashboard-schedule__micro-token">
                  <span
                    className="v2-dashboard-schedule__capacity-dot v2-dashboard-schedule__capacity-dot--available"
                    aria-hidden="true"
                  />
                  <span>Open {rail.availableSlotsCount}</span>
                </span>
              </div>
            ) : null}
          </div>

          {showAgendaDisclosure ? (
            <DashboardV2Disclosure
              title="Visible agenda"
              summary={rail.visitsSummary}
              defaultExpanded={false}
              className="v2-dashboard-schedule__agenda-disclosure"
            >
              <div className="v2-dashboard-schedule__timeline-shell">
                <div className="v2-dashboard-schedule__timeline-scale" aria-hidden="true">
                  <span>08:00</span>
                  <span>12:00</span>
                  <span>16:00</span>
                  <span>20:00</span>
                </div>
                <div className="v2-dashboard-schedule__timeline" aria-label="Today timeline">
                  {rail.timelineBlocks.map((block) => (
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
                  ))}
                </div>
              </div>
            </DashboardV2Disclosure>
          ) : null}
        </>
      )}
    </DashboardV2Surface>
  );
}
