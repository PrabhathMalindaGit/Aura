import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface DashboardV2ClinicianQueueRowProps {
  children: ReactNode;
  tone?: 'neutral' | 'warning' | 'critical' | 'success';
  selected?: boolean;
  onPress?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  className?: string;
  testId?: string;
  describedBy?: string;
  rowIndex?: number;
}

export function DashboardV2ClinicianQueueRow({
  children,
  tone = 'neutral',
  selected = false,
  onPress,
  onKeyDown,
  className,
  testId,
  describedBy,
  rowIndex,
}: DashboardV2ClinicianQueueRowProps): JSX.Element {
  return (
    <button
      type="button"
      data-row-index={rowIndex}
      data-testid={testId}
      className={cn(
        'v2-clinician-queue-row',
        `v2-clinician-queue-row--${tone}`,
        selected && 'v2-clinician-queue-row--selected',
        className,
      )}
      onClick={onPress}
      onKeyDown={onKeyDown}
      aria-pressed={selected}
      aria-describedby={describedBy}
    >
      {children}
    </button>
  );
}
