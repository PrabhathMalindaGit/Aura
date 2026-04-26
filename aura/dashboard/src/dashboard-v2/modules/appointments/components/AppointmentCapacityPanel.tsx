import type { AppointmentCapacityVm, AppointmentSlotFilter } from '../../../adapters/appointments';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface AppointmentCapacityPanelProps {
  capacity: AppointmentCapacityVm;
  onSlotStatusChange: (status: AppointmentSlotFilter) => void;
}

export function AppointmentCapacityPanel({
  capacity,
  onSlotStatusChange,
}: AppointmentCapacityPanelProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-appointment-capacity-panel" tone="elevated">
      <div className="v2-appointment-capacity-panel__header">
        <div>
          <DashboardV2Text tone="label">Capacity detail</DashboardV2Text>
          <DashboardV2Heading as="h3">{capacity.title}</DashboardV2Heading>
          <DashboardV2Text tone="muted">{capacity.note}</DashboardV2Text>
        </div>
        <div className="v2-appointment-capacity-panel__actions">
          <DashboardV2Button
            tone={capacity.slotStatus === 'available' ? 'primary' : 'ghost'}
            size="sm"
            onPress={() => onSlotStatusChange('available')}
          >
            Open capacity
          </DashboardV2Button>
          <DashboardV2Button
            tone={capacity.slotStatus === 'closed' ? 'primary' : 'ghost'}
            size="sm"
            onPress={() => onSlotStatusChange('closed')}
          >
            Closed capacity
          </DashboardV2Button>
        </div>
      </div>

      {capacity.items.length === 0 ? (
        <DashboardV2Surface className="v2-appointment-capacity-panel__empty" tone="muted">
          <DashboardV2Heading as="h4">{capacity.emptyTitle}</DashboardV2Heading>
          <DashboardV2Text tone="muted">{capacity.emptyDescription}</DashboardV2Text>
        </DashboardV2Surface>
      ) : (
        <div className="v2-appointment-capacity-panel__list">
          {capacity.items.map((item) => (
            <article key={item.slotId} className="v2-appointment-capacity-panel__item">
              <div className="v2-appointment-capacity-panel__item-copy">
                <DashboardV2Text tone="label">{item.detailLabel}</DashboardV2Text>
                <DashboardV2Text tone="strong">{item.timeLabel}</DashboardV2Text>
              </div>
              <DashboardV2Text tone="muted">{item.title}</DashboardV2Text>
              <DashboardV2Text tone="muted">{item.modeLabel}</DashboardV2Text>
              <div className="v2-appointment-capacity-panel__item-badges">
                <DashboardV2Badge tone={item.statusTone === 'success' ? 'success' : 'unknown'}>
                  {item.statusLabel}
                </DashboardV2Badge>
                {item.justPublished ? (
                  <DashboardV2Badge tone="info">Just published</DashboardV2Badge>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </DashboardV2Surface>
  );
}
