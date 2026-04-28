import { RefreshCcw } from 'lucide-react';
import type { AppointmentRequestFilter, AppointmentsStatusBarVm } from '../../../adapters/appointments';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface AppointmentsStatusBarProps {
  statusBar: AppointmentsStatusBarVm;
  activeRequestStatus: AppointmentRequestFilter;
  isRefreshing: boolean;
  onRefresh: () => void;
  onRequestStatusChange: (status: AppointmentRequestFilter) => void;
}

export function AppointmentsStatusBar({
  statusBar,
  activeRequestStatus,
  isRefreshing,
  onRefresh,
  onRequestStatusChange,
}: AppointmentsStatusBarProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-appointments-status-bar" tone="elevated">
      <div className="v2-appointments-status-bar__copy">
        <DashboardV2Text tone="label">Scheduling review</DashboardV2Text>
        <DashboardV2Heading as="h1">{statusBar.title}</DashboardV2Heading>
        <DashboardV2Text tone="muted">{statusBar.guidanceLine}</DashboardV2Text>
      </div>

      <div className="v2-appointments-status-bar__views" aria-label="Appointment request views">
        {statusBar.requestOptions.map((option) => (
          <DashboardV2Button
            key={option.id}
            tone={option.id === activeRequestStatus ? 'primary' : 'ghost'}
            size="sm"
            onPress={() => onRequestStatusChange(option.id)}
          >
            {option.count === undefined ? option.label : `${option.label} ${option.count}`}
          </DashboardV2Button>
        ))}
      </div>

      <div className="v2-appointments-status-bar__facts">
        {statusBar.facts.map((fact) => (
          <span key={fact.key} className="v2-appointments-status-bar__pill">
            {fact.label} {fact.value}
          </span>
        ))}
      </div>

      <div className="v2-appointments-status-bar__actions">
        <DashboardV2Button
          tone="secondary"
          size="sm"
          onPress={onRefresh}
          leadingIcon={<RefreshCcw size={16} />}
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </DashboardV2Button>
      </div>
    </DashboardV2Surface>
  );
}
