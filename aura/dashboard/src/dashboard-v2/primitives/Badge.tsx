import type { HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';
import { DashboardV2Icon } from './Icon';

type BadgeTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'critical'
  | 'clinician'
  | 'patient'
  | 'device'
  | 'ai'
  | 'unknown';

export interface DashboardV2BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: LucideIcon;
}

export function DashboardV2Badge({
  className,
  children,
  tone = 'neutral',
  icon,
  ...props
}: DashboardV2BadgeProps): JSX.Element {
  return (
    <span className={cn('v2-badge', `v2-badge--${tone}`, className)} {...props}>
      {icon ? <DashboardV2Icon icon={icon} className="v2-badge__icon" size={14} /> : null}
      <span className="v2-badge__label">{children}</span>
    </span>
  );
}
