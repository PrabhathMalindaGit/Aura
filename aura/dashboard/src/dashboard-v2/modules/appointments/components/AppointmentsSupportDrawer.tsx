import type { AppointmentPublishVm, AppointmentsGovernanceVm } from '../../../adapters/appointments';
import { DashboardV2Drawer } from '../../../primitives/Drawer';
import { AppointmentsGovernanceRail } from './AppointmentsGovernanceRail';

interface AppointmentsSupportDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  governance: AppointmentsGovernanceVm | null;
  publishVm: AppointmentPublishVm;
  publishErrorMessage: string | null;
  onStartsAtChange: (value: string) => void;
  onEndsAtChange: (value: string) => void;
  onMeetingLinkChange: (value: string) => void;
  onPublish: () => void;
  placement?: 'right' | 'bottom';
}

export function AppointmentsSupportDrawer({
  open,
  onOpenChange,
  governance,
  publishVm,
  publishErrorMessage,
  onStartsAtChange,
  onEndsAtChange,
  onMeetingLinkChange,
  onPublish,
  placement = 'right',
}: AppointmentsSupportDrawerProps): JSX.Element {
  return (
    <DashboardV2Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Scheduling support context"
      description="Publish controls and supported request context stay secondary to the planner."
      placement={placement}
    >
      <AppointmentsGovernanceRail
        governance={governance}
        publishVm={publishVm}
        publishErrorMessage={publishErrorMessage}
        onStartsAtChange={onStartsAtChange}
        onEndsAtChange={onEndsAtChange}
        onMeetingLinkChange={onMeetingLinkChange}
        onPublish={onPublish}
      />
    </DashboardV2Drawer>
  );
}
