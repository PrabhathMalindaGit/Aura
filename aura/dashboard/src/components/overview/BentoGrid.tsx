import type { HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

export type BentoGridProps = HTMLAttributes<HTMLDivElement>;

export function BentoGrid({ className, children, ...props }: BentoGridProps): JSX.Element {
  return (
    <div className={cn('bento-grid', className)} {...props}>
      {children}
    </div>
  );
}
