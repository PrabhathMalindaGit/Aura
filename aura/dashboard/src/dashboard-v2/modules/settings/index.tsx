import type { ReactNode } from 'react';
import { DashboardV2GovernancePanel } from '../../patterns/GovernancePanel';
import { DashboardV2ModuleFoundationScaffold } from '../../patterns/ModuleFoundationScaffold';

interface WorkspaceSettingsFoundationProps {
  children: ReactNode;
}

export function WorkspaceSettingsFoundation({
  children,
}: WorkspaceSettingsFoundationProps): JSX.Element {
  return (
    <DashboardV2ModuleFoundationScaffold
      eyebrow="Dashboard v2 foundation"
      title="Workspace preferences foundation"
      description="Theme, accessibility, and clinician workspace preferences stay on the current settings workflow while the v2 foundation is staged."
      rail={<DashboardV2GovernancePanel />}
    >
      {children}
    </DashboardV2ModuleFoundationScaffold>
  );
}
