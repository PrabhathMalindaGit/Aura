import { useEffect, useRef } from 'react';
import { DASHBOARD_NAV_ITEMS, NAV_SECTIONS } from './NavConfig';
import { SidebarItem } from './SidebarItem';
import { SidebarSeparator } from './SidebarSeparator';
import { IconButton } from '../ui/IconButton';
import { focusFirstElement, trapTabKey } from '../../utils/focus';

interface MobileNavSheetProps {
  open: boolean;
  onClose: () => void;
}

function CloseIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.97 5.56a1 1 0 0 1 1.41 0L12 9.17l3.62-3.61a1 1 0 1 1 1.41 1.41L13.41 10.6l3.62 3.62a1 1 0 1 1-1.41 1.41L12 12.01l-3.62 3.62a1 1 0 1 1-1.41-1.41l3.62-3.62-3.62-3.63a1 1 0 0 1 0-1.41Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function MobileNavSheet({ open, onClose }: MobileNavSheetProps): JSX.Element | null {
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

  const sectionItems = NAV_SECTIONS.map((section) => ({
    ...section,
    items: DASHBOARD_NAV_ITEMS.filter((item) => item.section === section.key),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="mobile-nav-sheet mobile-nav-sheet--open" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <button type="button" className="mobile-nav-sheet__overlay" aria-label="Close navigation menu" onClick={onClose} />

      <aside ref={panelRef} className="mobile-nav-sheet__panel">
        <header className="mobile-nav-sheet__header">
          <div className="mobile-nav-sheet__header-copy">
            <p className="mobile-nav-sheet__section-label">Clinical command center</p>
            <h2 className="mobile-nav-sheet__title">Aura Clinician</h2>
          </div>
          <IconButton ref={closeButtonRef} aria-label="Close navigation menu" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </header>

        <nav className="mobile-nav-sheet__nav" aria-label="Mobile navigation">
          {sectionItems.map((section, index) => (
            <div key={section.key} className="mobile-nav-sheet__section">
              <p className="mobile-nav-sheet__section-label">{section.label}</p>
              <div className="mobile-nav-sheet__list">
                {section.items.map((item) => (
                  <SidebarItem key={item.key} item={item} iconOnly={false} onNavigate={onClose} />
                ))}
              </div>
              {index < sectionItems.length - 1 ? <SidebarSeparator /> : null}
            </div>
          ))}
        </nav>
      </aside>
    </div>
  );
}
