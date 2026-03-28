import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface SectionProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  surface?: 'base' | 'emphasized' | 'critical';
}

export function Section({
  className,
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
  surface = 'base',
  children,
  ...props
}: SectionProps): JSX.Element {
  const hasMetaContent = Boolean(actions || meta);

  return (
    <section className={cn('section', className)} data-surface={surface} {...props}>
      <header className={cn('section__header', hasMetaContent && 'section__header--with-meta')}>
        <div className="section__title-group stack stack--1">
          {eyebrow ? <p className="section__eyebrow">{eyebrow}</p> : null}
          <h2 className="section__title">{title}</h2>
          {subtitle ? <p className="section__subtitle">{subtitle}</p> : null}
        </div>
        {hasMetaContent ? (
          <div className={cn('section__meta', actions && 'section__meta--with-actions')}>
            {meta ? <div className="section__meta-text">{meta}</div> : null}
            {actions ? <div className="section__actions">{actions}</div> : null}
          </div>
        ) : null}
      </header>
      {children}
    </section>
  );
}
