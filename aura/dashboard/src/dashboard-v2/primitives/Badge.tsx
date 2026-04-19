import type { HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';
import { DashboardV2Icon } from './Icon';

type BadgeTone =
  | 'neutral'
  | 'info'
  | 'priority'
  | 'delayed'
  | 'safety'
  | 'clear'
  | 'private'
  | 'shared'
  | 'support'
  | 'success'
  | 'warning'
  | 'critical'
  | 'clinician'
  | 'patient'
  | 'device'
  | 'ai'
  | 'unknown';

type BadgeSize = 'sm' | 'md';

export interface DashboardV2BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: LucideIcon;
  size?: BadgeSize;
}

export function DashboardV2Badge({
  className,
  children,
  tone = 'neutral',
  icon,
  size = 'md',
  ...props
}: DashboardV2BadgeProps): JSX.Element {
  return (
    <span className={cn('v2-badge', `v2-badge--${tone}`, `v2-badge--${size}`, className)} {...props}>
      {icon ? <DashboardV2Icon icon={icon} className="v2-badge__icon" size={14} /> : null}
      <span className="v2-badge__label">{children}</span>
    </span>
  );
}
