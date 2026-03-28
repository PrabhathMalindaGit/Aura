export type NavSectionKey = 'workspace' | 'preferences';
export type NavIconKey =
  | 'dashboard'
  | 'worklist'
  | 'communication'
  | 'alerts'
  | 'patients'
  | 'appointments'
  | 'settings';

export interface DashboardNavItem {
  key: string;
  label: string;
  to: string;
  icon: NavIconKey;
  section: NavSectionKey;
}

export interface NavSectionConfig {
  key: NavSectionKey;
  label: string;
}

export const NAV_SECTIONS: NavSectionConfig[] = [
  { key: 'workspace', label: 'Workspace' },
  { key: 'preferences', label: 'Preferences' },
];

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { key: 'dashboard', label: 'Today', to: '/dashboard', icon: 'dashboard', section: 'workspace' },
  { key: 'worklist', label: 'Queue', to: '/worklist', icon: 'worklist', section: 'workspace' },
  { key: 'patients', label: 'Patients', to: '/patients', icon: 'patients', section: 'workspace' },
  { key: 'appointments', label: 'Schedule', to: '/appointments', icon: 'appointments', section: 'workspace' },
  { key: 'communication', label: 'Inbox', to: '/communication', icon: 'communication', section: 'workspace' },
  { key: 'alerts', label: 'Safety', to: '/alerts', icon: 'alerts', section: 'workspace' },
  { key: 'settings', label: 'Settings', to: '/settings', icon: 'settings', section: 'preferences' },
];
