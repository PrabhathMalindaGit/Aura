import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../../styles/breakpoints';
import { cn } from '../../utils/cn';
import { focusFirstElement, trapTabKey } from '../../utils/focus';

interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
  labelledBy?: string;
  describedBy?: string;
  ariaLabel?: string;
  mobileFullscreen?: boolean;
}

export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
  returnFocusRef,
  labelledBy,
  describedBy,
  ariaLabel,
  mobileFullscreen = false,
}: DrawerProps): JSX.Element | null {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const fallbackFocusRef = useRef<HTMLElement | null>(null);
  const isPhone = useMediaQuery(MEDIA_QUERIES.smDown);
  const fullscreenOnPhone = mobileFullscreen && isPhone;

  useEffect(() => {
    if (!open) {
      return;
    }

    const explicitReturnTarget = returnFocusRef?.current ?? null;
    fallbackFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const frame = window.requestAnimationFrame(() => {
      if (panelRef.current) {
        focusFirstElement(panelRef.current, closeButtonRef.current);
      } else {
        closeButtonRef.current?.focus();
      }
    });

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent): void => {
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

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);

      const target = explicitReturnTarget ?? fallbackFocusRef.current;
      if (target && typeof target.focus === 'function') {
        target.focus();
      }
    };
  }, [open, onClose, returnFocusRef]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={cn('drawer', open && 'drawer--open', fullscreenOnPhone && 'drawer--mobile-fullscreen')}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-label={ariaLabel ?? title}
    >
      <button type="button" className="drawer__overlay" onClick={onClose} aria-label="Close panel" />
      <section ref={panelRef} className="drawer__panel">
        <header className="drawer__header">
          <h2 id={labelledBy}>{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-btn"
            aria-label="Close drawer"
            onClick={onClose}
          >
            <span className="icon-btn__glyph" aria-hidden="true">
              ✕
            </span>
          </button>
        </header>
        <div className="drawer__content">{children}</div>
        {footer ? <footer className="drawer__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
