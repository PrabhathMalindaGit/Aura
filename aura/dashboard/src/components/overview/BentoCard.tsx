import type { ReactNode } from 'react';
import { Card } from '../ui/Card';
import { cn } from '../../utils/cn';

type BentoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type BentoGradient = 'none' | 'primary' | 'risk-high' | 'warning' | 'success';

interface BentoCardProps {
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  colSpan?: 1 | 2 | 3 | 4 | 5 | 6;
  rowSpan?: 1 | 2 | 3;
  size?: BentoSize;
  gradient?: BentoGradient;
  children: ReactNode;
}

export function BentoCard({
  title,
  action,
  className,
  colSpan = 1,
  rowSpan = 1,
  size = 'md',
  gradient = 'none',
  children,
}: BentoCardProps): JSX.Element {
  return (
    <Card
      title={title}
      action={action}
      className={cn(
        'bento-card',
        'cq',
        `bento-card--${size}`,
        `bento-card--col-${colSpan}`,
        `bento-card--row-${rowSpan}`,
        gradient !== 'none' && `bento-card--gradient-${gradient}`,
        className,
      )}
    >
      {children}
    </Card>
  );
}
