import type { HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

export function DashboardV2ClinicianActionBar({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('v2-clinician-action-bar', className)} {...props} />;
}
