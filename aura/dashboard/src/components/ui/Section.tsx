import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface SectionProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function Section({
  className,
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
  children,
  ...props
}: SectionProps): JSX.Element {
  return (
    <section className={cn('section', className)} {...props}>
      <header className="section__header">
        <div className="stack stack--1">
          {eyebrow ? <p className="section__eyebrow">{eyebrow}</p> : null}
          <h2 className="section__title">{title}</h2>
          {subtitle ? <p className="section__subtitle">{subtitle}</p> : null}
        </div>
        {actions || meta ? (
          <div className="section__meta">
            {meta ? <p className="section__meta-text">{meta}</p> : null}
            {actions ? <div className="section__actions">{actions}</div> : null}
          </div>
        ) : null}
      </header>
      {children}
    </section>
  );
}
