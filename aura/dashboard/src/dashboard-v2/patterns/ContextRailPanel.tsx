import type { ReactNode } from 'react';
import { DashboardV2Surface } from '../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../primitives/Text';

interface DashboardV2ContextRailPanelProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function DashboardV2ContextRailPanel({
  title,
  description,
  children,
}: DashboardV2ContextRailPanelProps): JSX.Element {
  return (
    <DashboardV2Surface as="section" tone="elevated" className="v2-context-rail-panel">
      <header className="v2-context-rail-panel__header">
        <DashboardV2Heading as="h2">{title}</DashboardV2Heading>
        {description ? <DashboardV2Text tone="muted">{description}</DashboardV2Text> : null}
      </header>
      <div className="v2-context-rail-panel__body">{children}</div>
    </DashboardV2Surface>
  );
}
