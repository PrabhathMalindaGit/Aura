import type { InsightsGovernanceVm } from '../../../adapters/insights';
import { DashboardV2Drawer } from '../../../primitives/Drawer';
import { InsightGovernanceRail } from './InsightsGovernanceRail';

interface InsightsSupportDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  governance: InsightsGovernanceVm | null;
  placement?: 'right' | 'bottom';
}

export function InsightsSupportDrawer({
  open,
  onOpenChange,
  governance,
  placement = 'right',
}: InsightsSupportDrawerProps): JSX.Element {
  return (
    <DashboardV2Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Insight support context"
      description="Patient and provenance context stays secondary to the active follow-up review."
      placement={placement}
    >
      <InsightGovernanceRail governance={governance} />
    </DashboardV2Drawer>
  );
}
