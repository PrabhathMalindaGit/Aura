import type { LucideIcon, LucideProps } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface DashboardV2IconProps extends Omit<LucideProps, 'ref'> {
  icon: LucideIcon;
  decorative?: boolean;
  label?: string;
}

export function DashboardV2Icon({
  icon: Icon,
  className,
  decorative = true,
  label,
  size = 18,
  strokeWidth = 1.8,
  ...props
}: DashboardV2IconProps): JSX.Element {
  const ariaLabel = decorative ? undefined : label;

  return (
    <Icon
      aria-hidden={decorative}
      aria-label={ariaLabel}
      className={cn('v2-icon', className)}
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}
