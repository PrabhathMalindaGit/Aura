import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { cn } from '../../utils/cn';

type StackGap = '1' | '2' | '3' | '4' | '6' | '8';

interface StackProps<T extends ElementType = 'div'> {
  as?: T;
  gap?: StackGap;
  className?: string;
  children: ReactNode;
}

export function Stack<T extends ElementType = 'div'>({
  as,
  gap = '4',
  className,
  children,
  ...props
}: StackProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof StackProps<T>>): JSX.Element {
  const Component = (as ?? 'div') as ElementType;

  return (
    <Component className={cn('stack', `stack--${gap}`, className)} {...props}>
      {children}
    </Component>
  );
}
