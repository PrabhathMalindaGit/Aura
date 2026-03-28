import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

type IconButtonSize = 'sm' | 'md' | 'lg';
type IconButtonTone = 'default' | 'danger';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  tone?: IconButtonTone;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
{
  className,
  children,
  size = 'md',
  tone = 'default',
  type = 'button',
  ...props
},
ref,
): JSX.Element {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('icon-btn', className)}
      data-icon-button="true"
      data-size={size}
      data-tone={tone}
      {...props}
    >
      <span aria-hidden="true" className="icon-btn__glyph">
        {children}
      </span>
    </button>
  );
});
