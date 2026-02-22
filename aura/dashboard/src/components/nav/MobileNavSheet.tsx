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
      <button type="button" className="mobile-nav-sheet__overlay glass-overlay" aria-label="Close navigation menu" onClick={onClose} />

      <aside ref={panelRef} className="mobile-nav-sheet__panel glass-popover">
        <header className="mobile-nav-sheet__header">
          <h2 className="mobile-nav-sheet__title">Navigation</h2>
          <IconButton ref={closeButtonRef} aria-label="Close navigation menu" onClick={onClose}>
            ✕
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

