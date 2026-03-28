import { IconButton } from '../ui/IconButton';
import { DASHBOARD_NAV_ITEMS, NAV_SECTIONS } from './NavConfig';
import { SidebarItem } from './SidebarItem';
import { SidebarSeparator } from './SidebarSeparator';
import type { SidebarMode } from '../../hooks/useSidebarMode';
import { cn } from '../../utils/cn';

interface SidebarProps {
  mode: SidebarMode;
  onToggleMode: () => void;
}

function CollapseIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.78 6.72a1 1 0 0 1 0 1.41L10.91 12l3.87 3.87a1 1 0 1 1-1.41 1.41l-4.58-4.58a1 1 0 0 1 0-1.41l4.58-4.58a1 1 0 0 1 1.41 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ExpandIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9.22 17.28a1 1 0 0 1 0-1.41L13.09 12 9.22 8.13a1 1 0 1 1 1.41-1.41l4.58 4.58a1 1 0 0 1 0 1.41l-4.58 4.58a1 1 0 0 1-1.41 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Sidebar({ mode, onToggleMode }: SidebarProps): JSX.Element {
  const iconOnly = mode === 'icon';
  const sectionItems = NAV_SECTIONS.map((section) => ({
    ...section,
    items: DASHBOARD_NAV_ITEMS.filter((item) => item.section === section.key),
  })).filter((section) => section.items.length > 0);

  return (
    <aside
      className={cn('sidebar', iconOnly ? 'sidebar--icon' : 'sidebar--expanded')}
      aria-label="Primary navigation"
      data-mode={mode}
    >
      <header className="sidebar__header">
        <div className="sidebar__brand">
          <span className="sidebar__brand-mark" aria-hidden="true">
            <span className="sidebar__brand-mark-core">A</span>
          </span>
          {iconOnly ? null : (
            <span className="sidebar__brand-copy">
              <span className="sidebar__brand-text">Aura Clinician</span>
              <span className="sidebar__brand-subtitle">Clinical command center</span>
            </span>
          )}
        </div>
        <IconButton
          className="sidebar__toggle"
          onClick={onToggleMode}
          aria-label={iconOnly ? 'Expand sidebar' : 'Collapse sidebar'}
          title={iconOnly ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {iconOnly ? <ExpandIcon /> : <CollapseIcon />}
        </IconButton>
      </header>

      <nav className="sidebar__sections" aria-label="Primary workspace navigation">
        {sectionItems.map((section, index) => (
          <div key={section.key} className="sidebar__section">
            {iconOnly ? (
              <span className="visually-hidden">{section.label}</span>
            ) : (
              <p className="sidebar__section-label">{section.label}</p>
            )}
            <div className="sidebar__list">
              {section.items.map((item) => (
                <SidebarItem key={item.key} item={item} iconOnly={iconOnly} />
              ))}
            </div>
            {index < sectionItems.length - 1 ? <SidebarSeparator /> : null}
          </div>
        ))}
      </nav>
    </aside>
  );
}
