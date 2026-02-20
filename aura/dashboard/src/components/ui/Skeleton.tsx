import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  height?: number;
  width?: string;
}

export function Skeleton({
  className,
  height = 16,
  width = '100%',
  style,
  ...props
}: SkeletonProps): JSX.Element {
  const skeletonStyle: CSSProperties = {
    height,
    width,
    ...style,
  };

  return <div className={cn('skeleton', className)} style={skeletonStyle} {...props} aria-hidden="true" />;
}
