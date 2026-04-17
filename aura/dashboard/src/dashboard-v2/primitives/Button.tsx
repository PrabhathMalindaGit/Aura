import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from 'react-aria-components';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

export interface DashboardV2ButtonProps extends AriaButtonProps {
  tone?: ButtonTone;
  size?: ButtonSize;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
}

export function DashboardV2Button({
  className,
  children,
  tone = 'primary',
  size = 'md',
  fullWidth = false,
  leadingIcon,
  ...props
}: DashboardV2ButtonProps): JSX.Element {
  return (
    <AriaButton
      className={cn(
        'v2-button',
        `v2-button--${tone}`,
        `v2-button--${size}`,
        fullWidth && 'v2-button--full-width',
        className,
      )}
      {...props}
    >
      {leadingIcon ? <span className="v2-button__icon">{leadingIcon}</span> : null}
      <span className="v2-button__label">{children}</span>
    </AriaButton>
  );
}
