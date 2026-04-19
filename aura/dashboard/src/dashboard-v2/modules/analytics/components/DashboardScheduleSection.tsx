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
import { DashboardV2Text } from "../../../primitives/Text";

interface DashboardScheduleSectionProps {
  timeline: DashboardScheduleTimelineBlockVm[];
  items: DashboardScheduleItemVm[];
  nextOpenSlotValue: string;
  schedulingFootnote: string;
  loading: boolean;
  error: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenSchedule: () => void;
  onOpenPatient: (patientId: string) => void;
}

export function DashboardScheduleSection({
  timeline,
  items,
  nextOpenSlotValue,
  schedulingFootnote,
  loading,
  error,
  isRefreshing,
  onRefresh,
  onOpenSchedule,
  onOpenPatient,
}: DashboardScheduleSectionProps): JSX.Element {
  return (
    <DashboardV2ChartFrame
      title="Today & capacity"
      summary="Where today’s load is concentrated"
      description={`Next visible open slot: ${nextOpenSlotValue}`}
    >
      <section
        className="v2-dashboard-schedule"
        data-testid="v2-dashboard-schedule-section"
      >
        <div className="v2-dashboard-schedule__header">
          <DashboardV2Text tone="muted">
            Visible visits and open capacity for the next route change.
          </DashboardV2Text>
          <DashboardV2Button tone="ghost" size="sm" onPress={onOpenSchedule}>
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
                <DashboardV2Text tone="label">
                  Next visible open slot
                </DashboardV2Text>
                <strong>{nextOpenSlotValue}</strong>
              </div>
              <div className="v2-dashboard-schedule__fact">
                <DashboardV2Text tone="label">Capacity balance</DashboardV2Text>
                <DashboardV2Text tone="strong">
                  {schedulingFootnote}
                </DashboardV2Text>
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
                      No appointments are visible in today’s current agenda.
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
                      <button
                        type="button"
                        className="v2-dashboard-link-button"
                        onClick={() => onOpenPatient(item.patientId)}
                      >
                        {item.patientLabel}
                      </button>
                      <DashboardV2Badge
                        tone={
                          item.statusTone === "critical"
                            ? "critical"
                            : item.statusTone === "warning"
                              ? "warning"
                              : item.statusTone === "success"
                                ? "success"
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
                        tone="ghost"
                        size="sm"
                        onPress={() => onOpenPatient(item.patientId)}
                      >
                        Open patient
                      </DashboardV2Button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="v2-dashboard-schedule__quiet-state">
                  <DashboardV2Text tone="strong">
                    No visits are active today
                  </DashboardV2Text>
                  <DashboardV2Text tone="muted">
                    The schedule can still be used to review request pressure
                    and visible open capacity.
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
