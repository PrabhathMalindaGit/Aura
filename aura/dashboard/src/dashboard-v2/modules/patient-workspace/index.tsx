import type { ReactNode } from 'react';
import { DashboardV2GovernancePanel } from '../../patterns/GovernancePanel';
import { DashboardV2ModuleFoundationScaffold } from '../../patterns/ModuleFoundationScaffold';

interface PatientWorkspaceFoundationProps {
  children: ReactNode;
}

export function PatientWorkspaceFoundation({
  children,
}: PatientWorkspaceFoundationProps): JSX.Element {
  return (
    <DashboardV2ModuleFoundationScaffold
      eyebrow="Dashboard v2 foundation"
      title="Patient workspace foundation"
      description="Sticky summary headers, decision surfaces, and the right-side governance rail are staged without changing patient route contracts."
      rail={<DashboardV2GovernancePanel />}
    >
      {children}
    </DashboardV2ModuleFoundationScaffold>
  );
}
