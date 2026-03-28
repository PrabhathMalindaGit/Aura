import { NavLink } from 'react-router-dom';
import { cn } from '../../utils/cn';
import type { DashboardNavItem, NavIconKey } from './NavConfig';

interface SidebarItemProps {
  item: DashboardNavItem;
  iconOnly: boolean;
  onNavigate?: () => void;
}

interface NavIconProps {
  icon: NavIconKey;
}

function NavIcon({ icon }: NavIconProps): JSX.Element {
  if (icon === 'dashboard') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4.5 4h6.25a1.5 1.5 0 0 1 1.5 1.5v4.75a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 10.25V5.5A1.5 1.5 0 0 1 4.5 4Zm8.75 0h6.25A1.5 1.5 0 0 1 21 5.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-6.25a1.5 1.5 0 0 1-1.5-1.5V5.5A1.5 1.5 0 0 1 13.25 4ZM4.5 13.25h6.25a1.5 1.5 0 0 1 1.5 1.5v4.75a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 19.5v-4.75a1.5 1.5 0 0 1 1.5-1.5Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (icon === 'worklist') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6 5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5v13A1.5 1.5 0 0 1 16.5 20h-9A1.5 1.5 0 0 1 6 18.5v-13Zm3 2.25a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 0-1.5H9Zm0 4a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 0-1.5H9Zm0 4a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5H9ZM4.75 8a.75.75 0 1 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5Zm0 4a.75.75 0 1 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5Zm0 4a.75.75 0 1 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (icon === 'alerts') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3.5a6 6 0 0 0-6 6V12l-1.8 3.2a1 1 0 0 0 .87 1.48h13.86a1 1 0 0 0 .87-1.48L18 12V9.5a6 6 0 0 0-6-6Zm0 18a2.5 2.5 0 0 1-2.29-1.5h4.58A2.5 2.5 0 0 1 12 21.5Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (icon === 'patients') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M8 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm8 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM2.5 19a4.5 4.5 0 0 1 9 0v.5H2.5V19Zm10 0a3.5 3.5 0 0 1 7 0v.5h-7V19Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (icon === 'appointments') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2.5 2.5 0 0 1 2.5 2.5v12A2.5 2.5 0 0 1 19 21H5a2.5 2.5 0 0 1-2.5-2.5v-12A2.5 2.5 0 0 1 5 4h1V3a1 1 0 0 1 1-1Zm12.5 8H4.5v8.5c0 .28.22.5.5.5h14c.28 0 .5-.22.5-.5V10ZM5 6a.5.5 0 0 0-.5.5V8h15V6.5a.5.5 0 0 0-.5-.5H18v1a1 1 0 1 1-2 0V6H8v1a1 1 0 1 1-2 0V6H5Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (icon === 'communication') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6.5 5.5A3.5 3.5 0 0 0 3 9v6a3.5 3.5 0 0 0 3.5 3.5h2.2l2.57 2.14a1 1 0 0 0 1.63-.77V18.5h4.6A3.5 3.5 0 0 0 21 15V9a3.5 3.5 0 0 0-3.5-3.5h-11Zm1.25 4a1 1 0 1 0 0 2h8.5a1 1 0 1 0 0-2h-8.5Zm0 3.75a1 1 0 1 0 0 2h5.5a1 1 0 1 0 0-2h-5.5Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.2 3.5-.98-.56.98-.56a1 1 0 0 0 .36-1.37l-1-1.73a1 1 0 0 0-1.34-.4l-1 .58v-1.15a1 1 0 0 0-.8-.98l-2-.35a1 1 0 0 0-1.13.73l-.33 1.1-.9-.51a1 1 0 0 0-1 0l-.9.51-.33-1.1a1 1 0 0 0-1.13-.73l-2 .35a1 1 0 0 0-.8.98v1.15l-1-.58a1 1 0 0 0-1.34.4l-1 1.73a1 1 0 0 0 .36 1.37l.98.56-.98.56A1 1 0 0 0 2.2 13.9l1 1.73a1 1 0 0 0 1.34.4l1-.58v1.15a1 1 0 0 0 .8.98l2 .35a1 1 0 0 0 1.13-.73l.33-1.1.9.51a1 1 0 0 0 1 0l.9-.51.33 1.1a1 1 0 0 0 1.13.73l2-.35a1 1 0 0 0 .8-.98v-1.15l1 .58a1 1 0 0 0 1.34-.4l1-1.73a1 1 0 0 0-.36-1.37Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SidebarItem({ item, iconOnly, onNavigate }: SidebarItemProps): JSX.Element {
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={iconOnly ? item.label : undefined}
      aria-label={iconOnly ? item.label : undefined}
      className={({ isActive }) =>
        cn('sidebar-item', iconOnly && 'sidebar-item--icon-only', isActive && 'sidebar-item--active')
      }
    >
      <span className="sidebar-item__rail" aria-hidden="true" />
      <span className="sidebar-item__icon" aria-hidden="true">
        <NavIcon icon={item.icon} />
      </span>
      {iconOnly ? (
        <span className="visually-hidden">{item.label}</span>
      ) : (
        <span className="sidebar-item__label">{item.label}</span>
      )}
    </NavLink>
  );
}
