import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { DashboardV2Surface } from '../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../primitives/Text';

interface DashboardV2ClinicianSummaryStripProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: string;
  title: string;
  children: ReactNode;
}

interface DashboardV2ClinicianSummaryMetricProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  state?: ReactNode;
  cue?: ReactNode;
  action?: ReactNode;
  tone?: 'neutral' | 'warning' | 'critical' | 'success';
}

export function DashboardV2ClinicianSummaryStrip({
  eyebrow,
  title,
  children,
  className,
  ...props
}: DashboardV2ClinicianSummaryStripProps): JSX.Element {
  return (
    <DashboardV2Surface className={cn('v2-clinician-summary-strip', className)} {...props}>
      <header className="v2-clinician-summary-strip__header">
        {eyebrow ? <DashboardV2Text tone="label">{eyebrow}</DashboardV2Text> : null}
        <DashboardV2Heading as="h2">{title}</DashboardV2Heading>
      </header>
      <div className="v2-clinician-summary-strip__grid">{children}</div>
    </DashboardV2Surface>
  );
}

export function DashboardV2ClinicianSummaryMetric({
  label,
  value,
  detail,
  state,
  cue,
  action,
  tone = 'neutral',
  className,
  ...props
}: DashboardV2ClinicianSummaryMetricProps): JSX.Element {
  return (
    <div
      className={cn('v2-clinician-summary-metric', `v2-clinician-summary-metric--${tone}`, className)}
      {...props}
    >
      <div className="v2-clinician-summary-metric__topline">
        <div className="v2-clinician-summary-metric__label-stack">
          <DashboardV2Text tone="label">{label}</DashboardV2Text>
          {state ? <div className="v2-clinician-summary-metric__state">{state}</div> : null}
        </div>
        {cue ? <div className="v2-clinician-summary-metric__cue">{cue}</div> : null}
      </div>
      <strong className="v2-clinician-summary-metric__value">{value}</strong>
      {detail ? (
        <DashboardV2Text tone="muted" className="v2-clinician-summary-metric__detail">
          {detail}
        </DashboardV2Text>
      ) : null}
      {action ? <div className="v2-clinician-summary-metric__action">{action}</div> : null}
    </div>
  );
}
