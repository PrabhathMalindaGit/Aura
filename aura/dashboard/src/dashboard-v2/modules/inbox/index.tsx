import type { ReactNode } from 'react';
import { DashboardV2GovernancePanel } from '../../patterns/GovernancePanel';
import { DashboardV2ModuleFoundationScaffold } from '../../patterns/ModuleFoundationScaffold';

interface InboxFoundationProps {
  children: ReactNode;
}

export function InboxFoundation({ children }: InboxFoundationProps): JSX.Element {
  return (
    <DashboardV2ModuleFoundationScaffold
      eyebrow="Dashboard v2 foundation"
      title="Clinician inbox foundation"
      description="The v2 shell and governance rail are ready while the live inbox workflow remains legacy."
      rail={<DashboardV2GovernancePanel />}
    >
      {children}
    </DashboardV2ModuleFoundationScaffold>
  );
}
