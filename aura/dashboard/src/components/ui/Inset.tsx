import type { HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

type InsetPadding = 'page' | 'card';

interface InsetProps extends HTMLAttributes<HTMLDivElement> {
  padding?: InsetPadding;
}

export function Inset({
  className,
  padding = 'page',
  children,
  ...props
}: InsetProps): JSX.Element {
  return (
    <div className={cn(`inset--${padding}`, className)} {...props}>
      {children}
    </div>
  );
}
