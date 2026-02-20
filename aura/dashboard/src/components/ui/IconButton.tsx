import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function IconButton({
  className,
  children,
  type = 'button',
  ...props
}: IconButtonProps): JSX.Element {
  return (
    <button type={type} className={cn('icon-btn', className)} {...props}>
      <span aria-hidden="true" className="icon-btn__glyph">
        {children}
      </span>
    </button>
  );
}
