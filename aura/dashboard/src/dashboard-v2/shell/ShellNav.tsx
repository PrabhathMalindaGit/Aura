import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { DashboardV2Button } from '../primitives/Button';
import { DashboardV2Icon } from '../primitives/Icon';
import { DashboardV2Text } from '../primitives/Text';
import { DASHBOARD_V2_NAV_ITEMS } from './navConfig';

interface DashboardV2ShellNavProps {
  collapsed: boolean;
  compact?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}

export function DashboardV2ShellNav({
  collapsed,
  compact = false,
  onToggleCollapse,
  onNavigate,
}: DashboardV2ShellNavProps): JSX.Element {
  return (
    <div className={cn('dashboard-v2-shell__nav', collapsed && 'dashboard-v2-shell__nav--collapsed')}>
      <div className="dashboard-v2-shell__brand">
        <div className="dashboard-v2-shell__brand-mark" aria-hidden="true">
          <span className="dashboard-v2-shell__brand-cross" />
        </div>
        {!collapsed ? (
          <div className="dashboard-v2-shell__brand-copy">
            <strong className="dashboard-v2-shell__brand-title">Aura</strong>
            <DashboardV2Text as="span" tone="muted">
              Clinician workspace
            </DashboardV2Text>
          </div>
        ) : null}
      </div>

      {!compact && onToggleCollapse ? (
        <DashboardV2Button
          className="dashboard-v2-shell__nav-toggle"
          tone="ghost"
          size="sm"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onPress={onToggleCollapse}
          leadingIcon={<DashboardV2Icon icon={collapsed ? PanelLeftOpen : PanelLeftClose} size={16} />}
        >
          {!collapsed ? 'Collapse' : 'Expand'}
        </DashboardV2Button>
      ) : null}

      <nav aria-label="Primary v2 navigation" className="dashboard-v2-shell__nav-list">
        {DASHBOARD_V2_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.key}
            to={item.to}
            aria-label={item.accessibleLabel}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn('dashboard-v2-shell__nav-link', isActive && 'dashboard-v2-shell__nav-link--active')
            }
            onClick={onNavigate}
          >
            <DashboardV2Icon icon={item.icon} size={17} />
            {!collapsed ? (
              <span className="dashboard-v2-shell__nav-copy" aria-hidden="true">
                <span className="dashboard-v2-shell__nav-label">{item.shortLabel}</span>
                <span className="dashboard-v2-shell__nav-description">{item.description}</span>
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
