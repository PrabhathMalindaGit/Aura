import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { DashboardV2Surface } from '../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../primitives/Text';

interface DashboardV2ClinicianSupportRailProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  tone?: 'muted' | 'elevated';
}

interface DashboardV2ClinicianSupportGroupProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  tone?: 'muted' | 'elevated' | 'base';
}

export function DashboardV2ClinicianSupportRail({
  eyebrow,
  title,
  description,
  children,
  className,
  tone = 'muted',
  ...props
}: DashboardV2ClinicianSupportRailProps): JSX.Element {
  return (
    <DashboardV2Surface className={cn('v2-clinician-support-rail', className)} tone={tone} {...props}>
      <header className="v2-clinician-support-rail__header">
        {eyebrow ? <DashboardV2Text tone="label">{eyebrow}</DashboardV2Text> : null}
        <DashboardV2Heading as="h2">{title}</DashboardV2Heading>
        {description ? <DashboardV2Text tone="muted">{description}</DashboardV2Text> : null}
      </header>
      <div className="v2-clinician-support-rail__groups">{children}</div>
    </DashboardV2Surface>
  );
}

export function DashboardV2ClinicianSupportGroup({
  eyebrow,
  title,
  description,
  children,
  className,
  tone = 'base',
  ...props
}: DashboardV2ClinicianSupportGroupProps): JSX.Element {
  return (
    <DashboardV2Surface className={cn('v2-clinician-support-group', className)} tone={tone} {...props}>
      <div className="v2-clinician-support-group__header">
        {eyebrow ? <DashboardV2Text tone="label">{eyebrow}</DashboardV2Text> : null}
        <DashboardV2Heading as="h3">{title}</DashboardV2Heading>
        {description ? <DashboardV2Text tone="muted">{description}</DashboardV2Text> : null}
      </div>
      <div className="v2-clinician-support-group__body">{children}</div>
    </DashboardV2Surface>
  );
}
