import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface SectionProps extends HTMLAttributes<HTMLElement> {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function Section({
  className,
  title,
  subtitle,
  actions,
  children,
  ...props
}: SectionProps): JSX.Element {
  return (
    <section className={cn('section', className)} {...props}>
      <header className="section__header">
        <div className="stack stack--1">
          <h2 className="section__title">{title}</h2>
          {subtitle ? <p className="section__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
