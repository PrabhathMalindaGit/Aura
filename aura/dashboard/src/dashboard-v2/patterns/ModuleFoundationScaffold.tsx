import type { ReactNode } from 'react';
import { DashboardV2Surface } from '../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../primitives/Text';
import { DashboardV2QueueWorkspaceLayout } from './QueueWorkspaceLayout';

interface DashboardV2ModuleFoundationScaffoldProps {
  title: string;
  description: string;
  eyebrow: string;
  children: ReactNode;
  rail: ReactNode;
}

export function DashboardV2ModuleFoundationScaffold({
  title,
  description,
  eyebrow,
  children,
  rail,
}: DashboardV2ModuleFoundationScaffoldProps): JSX.Element {
  return (
    <DashboardV2QueueWorkspaceLayout
      header={
        <DashboardV2Surface tone="muted" className="v2-foundation-stage">
          <DashboardV2Text tone="label">{eyebrow}</DashboardV2Text>
          <DashboardV2Heading as="h1">{title}</DashboardV2Heading>
          <DashboardV2Text tone="muted">{description}</DashboardV2Text>
        </DashboardV2Surface>
      }
      main={<div className="v2-foundation-stage__legacy">{children}</div>}
      rail={rail}
    />
  );
}
