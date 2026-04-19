import type { ReactNode } from 'react';
import { DashboardV2Surface } from '../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../primitives/Text';

interface DashboardV2ClinicianQuietStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
  tone?: 'muted' | 'elevated';
  className?: string;
}

export function DashboardV2ClinicianQuietState({
  title,
  description,
  action,
  eyebrow,
  tone = 'muted',
  className,
}: DashboardV2ClinicianQuietStateProps): JSX.Element {
  return (
    <DashboardV2Surface className={['v2-clinician-quiet-state', className].filter(Boolean).join(' ')} tone={tone}>
      {eyebrow ? <DashboardV2Text tone="label">{eyebrow}</DashboardV2Text> : null}
      <DashboardV2Heading as="h3">{title}</DashboardV2Heading>
      {description ? <DashboardV2Text tone="muted">{description}</DashboardV2Text> : null}
      {action ? <div className="v2-clinician-quiet-state__action">{action}</div> : null}
    </DashboardV2Surface>
  );
}
