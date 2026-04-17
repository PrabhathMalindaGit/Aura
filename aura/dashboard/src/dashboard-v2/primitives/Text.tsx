import type { HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'p';
type TextTone = 'default' | 'muted' | 'strong' | 'label' | 'caption';

interface DashboardV2HeadingProps extends HTMLAttributes<HTMLElement> {
  as?: HeadingTag;
  tone?: Exclude<TextTone, 'caption'>;
}

interface DashboardV2TextProps extends HTMLAttributes<HTMLElement> {
  as?: 'p' | 'span' | 'strong' | 'small';
  tone?: TextTone;
}

export function DashboardV2Heading({
  as: Component = 'h2',
  className,
  tone = 'default',
  ...props
}: DashboardV2HeadingProps): JSX.Element {
  return <Component className={cn('v2-heading', `v2-heading--${tone}`, className)} {...props} />;
}

export function DashboardV2Text({
  as: Component = 'p',
  className,
  tone = 'default',
  ...props
}: DashboardV2TextProps): JSX.Element {
  return <Component className={cn('v2-text', `v2-text--${tone}`, className)} {...props} />;
}
