import type {
  AppointmentPlannerVm,
  ScheduleView,
} from '../../../adapters/appointments';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface AppointmentsPlannerWorkspaceProps {
  planner: AppointmentPlannerVm;
  onScheduleViewChange: (view: ScheduleView) => void;
  onPreviousRange: () => void;
  onNextRange: () => void;
  onToday: () => void;
}

export function AppointmentsPlannerWorkspace({
  planner,
  onScheduleViewChange,
  onPreviousRange,
  onNextRange,
  onToday,
}: AppointmentsPlannerWorkspaceProps): JSX.Element {
  const plannerHelper =
    'Use the planner to inspect current capacity and only publish more availability when demand truly needs coverage.';

  return (
    <div className="v2-appointments-planner-workspace" data-testid="v2-appointments-planner-workspace">
      <DashboardV2Surface className="v2-appointments-planner-workspace__section" tone="elevated">
        <div className="v2-appointments-planner-workspace__section-header">
          <div>
            <DashboardV2Text tone="label">Planner</DashboardV2Text>
            <DashboardV2Heading as="h3">{planner.rangeLabel}</DashboardV2Heading>
            <DashboardV2Text tone="muted">{planner.rangeCaption}</DashboardV2Text>
            <DashboardV2Text tone="muted">{plannerHelper}</DashboardV2Text>
          </div>
          <div className="v2-appointments-planner-workspace__toolbar">
            <DashboardV2Button
              tone={planner.scheduleView === 'week' ? 'primary' : 'ghost'}
              size="sm"
              onPress={() => onScheduleViewChange('week')}
            >
              Week
            </DashboardV2Button>
            <DashboardV2Button
              tone={planner.scheduleView === 'day' ? 'primary' : 'ghost'}
              size="sm"
              onPress={() => onScheduleViewChange('day')}
            >
              Day
            </DashboardV2Button>
            <DashboardV2Button tone="ghost" size="sm" onPress={onPreviousRange}>
              Previous
            </DashboardV2Button>
            <DashboardV2Button tone="ghost" size="sm" onPress={onToday}>
              Today
            </DashboardV2Button>
            <DashboardV2Button tone="ghost" size="sm" onPress={onNextRange}>
              Next
            </DashboardV2Button>
          </div>
        </div>

        {planner.requestScheduleContext ? (
          <DashboardV2Surface className="v2-appointments-planner-workspace__context" tone="muted">
            <DashboardV2Text tone="strong">{planner.requestScheduleContext.label}</DashboardV2Text>
            <DashboardV2Text tone="muted">{planner.requestScheduleContext.note}</DashboardV2Text>
          </DashboardV2Surface>
        ) : null}

        <div className="v2-appointments-planner-workspace__calendar">
          <div className="v2-appointments-planner-workspace__time-rail" aria-hidden="true">
            <span>All day</span>
            <span>8 AM</span>
            <span>10 AM</span>
            <span>12 PM</span>
            <span>2 PM</span>
            <span>4 PM</span>
          </div>
          <div
            className={`v2-appointments-planner-workspace__days v2-appointments-planner-workspace__days--${planner.scheduleView}`}
            data-testid={`appointments-schedule-${planner.scheduleView}`}
          >
            {planner.dayItems.map((day) => (
              <article
                key={day.dayKey}
                className={[
                  'v2-appointments-planner-workspace__day',
                  day.isToday ? 'v2-appointments-planner-workspace__day--today' : null,
                  day.isSelectedRequestDay ? 'v2-appointments-planner-workspace__day--selected' : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <DashboardV2Text tone="label">{day.label}</DashboardV2Text>
                {day.slots.length > 0 ? (
                  <div className="v2-appointments-planner-workspace__slots">
                    {day.slots.map((slot) => (
                      <div
                        key={slot.slotId}
                        className={`v2-appointments-planner-workspace__slot v2-appointments-planner-workspace__slot--${slot.statusTone}`}
                      >
                        <DashboardV2Text tone="caption">{slot.timeLabel}</DashboardV2Text>
                        <DashboardV2Text tone="strong">{slot.title}</DashboardV2Text>
                        <DashboardV2Text tone="muted">{slot.detailLabel}</DashboardV2Text>
                        <DashboardV2Text tone="label">{slot.modeLabel}</DashboardV2Text>
                        {slot.justPublished ? (
                          <DashboardV2Text tone="label">Just published</DashboardV2Text>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : planner.hasAnyVisibleSlots ? (
                  <DashboardV2Text className="v2-appointments-planner-workspace__day-empty" tone="muted">
                    No visible slots.
                  </DashboardV2Text>
                ) : null}
              </article>
            ))}
          </div>
          {!planner.hasAnyVisibleSlots ? (
            <div className="v2-appointments-planner-workspace__calendar-empty" role="status">
              <DashboardV2Heading as="h4">{planner.emptyTitle}</DashboardV2Heading>
              <DashboardV2Text tone="muted">{planner.emptyDescription}</DashboardV2Text>
            </div>
          ) : null}
        </div>
      </DashboardV2Surface>
    </div>
  );
}
