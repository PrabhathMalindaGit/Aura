import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { MEDIA_QUERIES } from '../../styles/breakpoints';
import { MOTION_DURATION_MS } from '../../utils/motion';
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
  const closeTimeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const isPhone = useMediaQuery(MEDIA_QUERIES.smDown);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isRendered, setIsRendered] = useState(open);
  const [isVisible, setIsVisible] = useState(open);
  const fullscreenOnPhone = mobileFullscreen && isPhone;

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (open) {
      setIsRendered(true);
      rafRef.current = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return;
    }

    setIsVisible(false);

    if (prefersReducedMotion) {
      setIsRendered(false);
      return;
    }

    closeTimeoutRef.current = window.setTimeout(() => {
      setIsRendered(false);
      closeTimeoutRef.current = null;
    }, MOTION_DURATION_MS.slow);
  }, [open, prefersReducedMotion]);

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

  if (!isRendered) {
    return null;
  }

  return (
    <div
      className={cn(
        'drawer',
        isVisible && 'drawer--open',
        !isVisible && 'drawer--closing',
        fullscreenOnPhone && 'drawer--mobile-fullscreen',
        prefersReducedMotion && 'rm-none',
      )}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-label={ariaLabel ?? title}
    >
      <button
        type="button"
        className={cn('drawer__overlay', 'glass-overlay')}
        onClick={onClose}
        aria-label="Close panel"
      />
      <section ref={panelRef} className={cn('drawer__panel', 'glass-popover')}>
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
