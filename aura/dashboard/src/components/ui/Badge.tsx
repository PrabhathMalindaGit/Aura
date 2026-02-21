import type { HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

type BadgeVariant =
  | 'default'
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'new'
  | 'status-open'
  | 'status-ack'
  | 'status-resolved'
  | 'risk-high'
  | 'risk-medium'
  | 'risk-low';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: boolean;
}

export function Badge({
  className,
  children,
  variant = 'default',
  icon = false,
  ...props
}: BadgeProps): JSX.Element {
  return (
    <span className={cn('badge', `badge--${variant}`, className)} {...props}>
      {icon ? <span className="badge__dot" aria-hidden="true" /> : null}
      <span>{children}</span>
    </span>
  );
}
