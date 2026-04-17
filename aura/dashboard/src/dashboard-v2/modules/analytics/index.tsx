import type { ReactNode } from 'react';
import { DashboardV2GovernancePanel } from '../../patterns/GovernancePanel';
import { DashboardV2ModuleFoundationScaffold } from '../../patterns/ModuleFoundationScaffold';

interface AnalyticsFoundationProps {
  children: ReactNode;
}

export function AnalyticsFoundation({ children }: AnalyticsFoundationProps): JSX.Element {
  return (
    <DashboardV2ModuleFoundationScaffold
      eyebrow="Dashboard v2 foundation"
      title="Service analytics foundation"
      description="Analytics remains distinct from acute review while the v2 shell, tokens, and accessibility primitives are staged."
      rail={<DashboardV2GovernancePanel />}
    >
      {children}
    </DashboardV2ModuleFoundationScaffold>
  );
}
