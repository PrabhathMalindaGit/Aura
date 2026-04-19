import type { ReactNode } from 'react';
import { DashboardV2Drawer } from '../primitives/Drawer';
import { DashboardV2Text } from '../primitives/Text';

interface DashboardV2ExplanationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children?: ReactNode;
}

export function DashboardV2ExplanationDrawer({
  open,
  onOpenChange,
  title = 'Explanation',
  children,
}: DashboardV2ExplanationDrawerProps): JSX.Element {
  return (
    <DashboardV2Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Supporting evidence notes, review boundaries, and cautionary context appear here when the active route needs more explanation."
    >
      {children ?? (
        <DashboardV2Text tone="muted">
          Additional route explanation is available here when a workflow needs more detail than the default operational view should show.
        </DashboardV2Text>
      )}
    </DashboardV2Drawer>
  );
}
