import { CalendarClock } from "lucide-react";
import { DashboardModuleState } from "../../../../components/dashboard/DashboardModuleState";
import type {
  DashboardScheduleItemVm,
  DashboardScheduleTimelineBlockVm,
} from "../../../adapters/dashboard";
import { DashboardV2ChartFrame } from "../../../charts/ChartFrame";
import { DashboardV2Badge } from "../../../primitives/Badge";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Disclosure } from "../../../primitives/Disclosure";
import { DashboardV2ClinicianPatientAnchor } from "../../../patterns/ClinicianPatientAnchor";
import { DashboardV2Text } from "../../../primitives/Text";

interface DashboardScheduleSectionProps {
  timeline: DashboardScheduleTimelineBlockVm[];
  items: DashboardScheduleItemVm[];
  nextOpenSlotValue: string;
  schedulingFootnote: string;
  pendingRequestCount: number;
  availableSlotsCount: number;
  loading: boolean;
  error: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenSchedule: () => void;
  onOpenPatient: (patientId: string) => void;
  guardPatientActions?: boolean;
}

export function DashboardScheduleSection({
  timeline,
  items,
  nextOpenSlotValue,
  schedulingFootnote,
  pendingRequestCount,
  availableSlotsCount,
  loading,
  error,
  isRefreshing,
  onRefresh,
  onOpenSchedule,
  onOpenPatient,
  guardPatientActions = false,
}: DashboardScheduleSectionProps): JSX.Element {
  const totalCapacityUnits = Math.max(
    pendingRequestCount + availableSlotsCount,
    1,
  );
  const pendingShare =
    pendingRequestCount + availableSlotsCount > 0
      ? (pendingRequestCount / totalCapacityUnits) * 100
      : 0;
  const availableShare =
    pendingRequestCount + availableSlotsCount > 0
      ? (availableSlotsCount / totalCapacityUnits) * 100
      : 0;
  const capacityStateLabel =
    pendingRequestCount === 0 && availableSlotsCount === 0
      ? "No active scheduling pressure"
      : pendingRequestCount > availableSlotsCount
        ? "Requests are ahead of visible capacity"
        : availableSlotsCount > 0
          ? "Visible capacity is covering demand"
          : "Published capacity has not opened yet";
  const capacityTone =
    pendingRequestCount === 0 && availableSlotsCount === 0
      ? "success"
      : pendingRequestCount > availableSlotsCount
        ? "warning"
        : availableSlotsCount > 0
          ? "info"
          : "neutral";

  return (
    <DashboardV2ChartFrame
      title="Today & capacity"
      summary="Schedule shape and open capacity"
    >
      <section
        className="v2-dashboard-schedule"
        data-testid="v2-dashboard-schedule-section"
      >
        <div className="v2-dashboard-schedule__header">
          <DashboardV2Text tone="caption">
            Next visible slot {nextOpenSlotValue}
          </DashboardV2Text>
          <DashboardV2Button tone="secondary" size="sm" onPress={onOpenSchedule}>
            Open schedule
          </DashboardV2Button>
        </div>

        {loading ? (
          <DashboardModuleState
            mode="loading"
            title="Loading today’s schedule"
            lines={4}
          />
        ) : error ? (
          <DashboardModuleState
            mode="error"
            title="Unable to load scheduling context"
            description="Refresh to restore today’s agenda and visible capacity."
            onRetry={onRefresh}
            retrying={isRefreshing}
          />
        ) : (
          <>
            <div className="v2-dashboard-schedule__facts">
              <div className="v2-dashboard-schedule__fact">
                <DashboardV2Text tone="label">Open slot</DashboardV2Text>
                <strong>{nextOpenSlotValue}</strong>
              </div>
              <div className="v2-dashboard-schedule__fact">
                <DashboardV2Text tone="label">Capacity read</DashboardV2Text>
                <DashboardV2Text
                  tone="strong"
                  className="v2-dashboard-schedule__fact-value"
                >
                  {schedulingFootnote}
                </DashboardV2Text>
              </div>
            </div>

            <div
              className={`v2-dashboard-schedule__capacity-shell v2-dashboard-schedule__capacity-shell--${capacityTone}`}
            >
              <div className="v2-dashboard-schedule__capacity-topline">
                <div className="v2-dashboard-schedule__capacity-copy">
                  <DashboardV2Text tone="label">Visible balance</DashboardV2Text>
                  <DashboardV2Text tone="caption">
                    {capacityStateLabel}
                  </DashboardV2Text>
                </div>
                <strong className="v2-dashboard-schedule__capacity-balance">
                  {pendingRequestCount}:{availableSlotsCount}
                </strong>
              </div>
              <div
                className={`v2-dashboard-schedule__capacity-gauge ${
                  pendingRequestCount === 0 && availableSlotsCount === 0
                    ? "v2-dashboard-schedule__capacity-gauge--empty"
                    : ""
                }`}
                aria-label={capacityStateLabel}
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
                    <strong>{pendingRequestCount}</strong> requests
                  </span>
                </span>
                <span className="v2-dashboard-schedule__capacity-token">
                  <span
                    className="v2-dashboard-schedule__capacity-dot v2-dashboard-schedule__capacity-dot--available"
                    aria-hidden="true"
                  />
                  <span>
                    <strong>{availableSlotsCount}</strong> open slots
                  </span>
                </span>
              </div>
            </div>

            <div className="v2-dashboard-schedule__timeline-shell">
              <div
                className="v2-dashboard-schedule__timeline-scale"
                aria-hidden="true"
              >
                <span>08:00</span>
                <span>12:00</span>
                <span>16:00</span>
                <span>20:00</span>
              </div>
              <div
                className="v2-dashboard-schedule__timeline"
                aria-label="Today timeline"
              >
                {timeline.length > 0 ? (
                  timeline.map((block) => (
                    <button
                      key={block.id}
                      type="button"
                      className={`v2-dashboard-schedule__block v2-dashboard-schedule__block--${block.tone}`}
                      style={{
                        left: `${block.leftPercent}%`,
                        width: `${block.widthPercent}%`,
                      }}
                      title={block.detail}
                      disabled={guardPatientActions}
                      onClick={() => onOpenPatient(block.patientId)}
                    >
                      <span className="v2-dashboard-schedule__block-label">
                        {block.label}
                      </span>
                      <span className="v2-dashboard-schedule__block-detail">
                        {block.statusLabel}
                      </span>
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

            <div className="v2-dashboard-schedule__list" role="list">
              {items.length > 0 ? (
                items.map((item) => (
                  <article
                    key={item.id}
                    className="v2-dashboard-schedule__item"
                    role="listitem"
                    data-testid={`v2-dashboard-schedule-item-${item.id}`}
                  >
                    <div className="v2-dashboard-schedule__item-topline">
                      <div className="v2-dashboard-schedule__patient">
                        <DashboardV2ClinicianPatientAnchor
                          patientLabel={item.patientLabel}
                          tone={
                            item.statusTone === "critical"
                              ? "critical"
                              : item.statusTone === "warning"
                                ? "warning"
                                : item.statusTone === "success"
                                  ? "success"
                                  : "neutral"
                          }
                        />
                        <button
                          type="button"
                          className={`v2-dashboard-link-button${
                            guardPatientActions
                              ? " v2-dashboard-link-button--guarded"
                              : ""
                          }`}
                          disabled={guardPatientActions}
                          title={
                            guardPatientActions
                              ? "Synthetic demo patient. Downstream patient view is guarded in demo mode."
                              : undefined
                          }
                          onClick={() => onOpenPatient(item.patientId)}
                        >
                          {item.patientLabel}
                        </button>
                      </div>
                      <DashboardV2Badge
                        tone={
                          item.statusTone === "critical"
                            ? "delayed"
                            : item.statusTone === "warning"
                              ? "priority"
                              : item.statusTone === "success"
                                ? "clear"
                                : "neutral"
                        }
                      >
                        {item.statusLabel}
                      </DashboardV2Badge>
                    </div>
                    <DashboardV2Text tone="strong">
                      {item.timeRangeLabel}
                    </DashboardV2Text>
                    <DashboardV2Text tone="muted">{item.note}</DashboardV2Text>
                    <div className="v2-dashboard-schedule__item-footer">
                      <DashboardV2Text tone="caption">
                        {item.updatedLabel}
                      </DashboardV2Text>
                      <DashboardV2Button
                        tone="secondary"
                        size="sm"
                        className="v2-dashboard-row-button"
                        isDisabled={guardPatientActions}
                        onPress={() => onOpenPatient(item.patientId)}
                      >
                        {guardPatientActions ? "Demo only" : "Open patient"}
                      </DashboardV2Button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="v2-dashboard-schedule__quiet-state">
                  <DashboardV2Text tone="strong">
                    All caught up for today
                  </DashboardV2Text>
                </div>
              )}
            </div>

            <DashboardV2Disclosure
              title="How to read capacity"
              summary={schedulingFootnote}
              defaultExpanded={false}
              className="v2-dashboard-schedule__disclosure"
            >
              <DashboardV2Text tone="muted">
                This overview reflects visible requests and open slots in the
                next 7 days. It does not imply confirmed booking or guaranteed
                coverage.
              </DashboardV2Text>
            </DashboardV2Disclosure>
          </>
        )}
      </section>
    </DashboardV2ChartFrame>
  );
}
