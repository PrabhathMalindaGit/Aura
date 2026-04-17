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
  title = 'AI explanation drawer',
  children,
}: DashboardV2ExplanationDrawerProps): JSX.Element {
  return (
    <DashboardV2Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Evidence summaries, logic notes, and cautionary metadata will appear here as routes migrate into v2."
    >
      {children ?? (
        <DashboardV2Text tone="muted">
          Phase 1 provides the drawer scaffold only. Route-level explanation content remains unchanged until the operational surfaces migrate.
        </DashboardV2Text>
      )}
    </DashboardV2Drawer>
  );
}
