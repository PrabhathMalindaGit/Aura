import type { ReactNode } from 'react';
import { DashboardV2GovernancePanel } from '../../patterns/GovernancePanel';
import { DashboardV2ModuleFoundationScaffold } from '../../patterns/ModuleFoundationScaffold';

interface TasksFollowUpFoundationProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function TasksFollowUpFoundation({
  title,
  description,
  children,
}: TasksFollowUpFoundationProps): JSX.Element {
  return (
    <DashboardV2ModuleFoundationScaffold
      eyebrow="Dashboard v2 foundation"
      title={title}
      description={description}
      rail={<DashboardV2GovernancePanel />}
    >
      {children}
    </DashboardV2ModuleFoundationScaffold>
  );
}
