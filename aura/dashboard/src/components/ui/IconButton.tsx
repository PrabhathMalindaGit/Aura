import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
{
  className,
  children,
  type = 'button',
  ...props
},
ref,
): JSX.Element {
  return (
    <button ref={ref} type={type} className={cn('icon-btn', className)} {...props}>
      <span aria-hidden="true" className="icon-btn__glyph">
        {children}
      </span>
    </button>
  );
});
