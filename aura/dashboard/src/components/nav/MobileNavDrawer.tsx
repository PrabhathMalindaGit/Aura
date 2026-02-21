import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { focusFirstElement, trapTabKey } from '../../utils/focus';
import { cn } from '../../utils/cn';
import { IconButton } from '../ui/IconButton';

interface MobileNavDrawerProps {
  open: boolean;
  fullScreen: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

export function MobileNavDrawer({
  open,
  fullScreen,
  title = 'Menu',
  onClose,
  children,
}: MobileNavDrawerProps): JSX.Element | null {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const frame = window.requestAnimationFrame(() => {
      if (panelRef.current) {
        focusFirstElement(panelRef.current, closeButtonRef.current);
      } else {
        closeButtonRef.current?.focus();
      }
    });

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (!panelRef.current) {
        return;
      }

      trapTabKey(event, panelRef.current);
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="mobile-nav mobile-nav--open" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="mobile-nav__overlay"
        aria-label="Close navigation menu"
        onClick={onClose}
      />
      <aside className={cn('mobile-nav__panel', fullScreen && 'mobile-nav__panel--fullscreen')} ref={panelRef}>
        <div className="mobile-nav__header">
          <h2 className="mobile-nav__title">{title}</h2>
          <IconButton ref={closeButtonRef} aria-label="Close navigation menu" onClick={onClose}>
            ✕
          </IconButton>
        </div>
        <nav className="mobile-nav__list">{children}</nav>
      </aside>
    </div>
  );
}
