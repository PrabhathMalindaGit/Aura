import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    children,
    variant = 'primary',
    size = 'md',
    fullWidth,
    leftIcon,
    type = 'button',
    ...props
  },
  ref,
): JSX.Element {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('btn', `btn--${variant}`, `btn--${size}`, fullWidth && 'btn--full-width', className)}
      {...props}
    >
      {leftIcon ? <span className="btn__icon">{leftIcon}</span> : null}
      <span>{children}</span>
    </button>
  );
});
