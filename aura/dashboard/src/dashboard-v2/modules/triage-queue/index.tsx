import type { ReactNode } from 'react';
import { DashboardV2GovernancePanel } from '../../patterns/GovernancePanel';
import { DashboardV2ModuleFoundationScaffold } from '../../patterns/ModuleFoundationScaffold';

interface TriageQueueFoundationProps {
  children: ReactNode;
}

export function TriageQueueFoundation({
  children,
}: TriageQueueFoundationProps): JSX.Element {
  return (
    <DashboardV2ModuleFoundationScaffold
      eyebrow="Dashboard v2 foundation"
      title="Triage queue foundation"
      description="Queue-to-workspace layout scaffolding is active while the working queue surface remains legacy."
      rail={<DashboardV2GovernancePanel />}
    >
      {children}
    </DashboardV2ModuleFoundationScaffold>
  );
}
