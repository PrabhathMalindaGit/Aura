import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface SectionProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  surface?: 'base' | 'emphasized' | 'critical';
  titleAs?: 'h1' | 'h2' | 'h3' | 'h4' | 'p';
}

export function Section({
  className,
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
  surface = 'base',
  titleAs,
  children,
  ...props
}: SectionProps): JSX.Element {
  const hasMetaContent = Boolean(actions || meta);
  const isPageHeader = className?.split(' ').includes('dashboard-page-header') ?? false;
  const TitleTag = titleAs ?? (isPageHeader ? 'h1' : 'h2');

  return (
    <section
      className={cn('section', isPageHeader && 'section--page-header', className)}
      data-section-role={isPageHeader ? 'page-header' : 'section'}
      data-surface={surface}
      {...props}
    >
      <header className={cn('section__header', hasMetaContent && 'section__header--with-meta')}>
        <div className="section__title-group stack stack--1">
          {eyebrow ? <p className="section__eyebrow">{eyebrow}</p> : null}
          <TitleTag className="section__title">{title}</TitleTag>
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
