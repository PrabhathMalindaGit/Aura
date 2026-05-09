import type { ReactNode } from 'react';
import { DashboardV2Surface } from '../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../primitives/Text';

interface DashboardV2StickyPatientSummaryHeaderProps {
  title: string;
  subtitle?: string;
  facts?: ReactNode;
}

export function DashboardV2StickyPatientSummaryHeader({
  title,
  subtitle,
  facts,
}: DashboardV2StickyPatientSummaryHeaderProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-sticky-patient-header" tone="elevated">
      <div className="v2-sticky-patient-header__copy">
        <DashboardV2Heading as="h2">{title}</DashboardV2Heading>
        {subtitle ? <DashboardV2Text tone="muted">{subtitle}</DashboardV2Text> : null}
      </div>
      {facts ? <div className="v2-sticky-patient-header__facts">{facts}</div> : null}
    </DashboardV2Surface>
  );
}
