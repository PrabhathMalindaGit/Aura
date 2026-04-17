import type { HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

type SurfaceTone = 'base' | 'muted' | 'elevated' | 'critical';

interface DashboardV2SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'article' | 'div' | 'aside';
  tone?: SurfaceTone;
}

export function DashboardV2Surface({
  as: Component = 'section',
  className,
  tone = 'base',
  ...props
}: DashboardV2SurfaceProps): JSX.Element {
  return <Component className={cn('v2-surface', `v2-surface--${tone}`, className)} {...props} />;
}
