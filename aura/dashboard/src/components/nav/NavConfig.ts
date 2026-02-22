export type NavSectionKey = 'clinical' | 'admin';
export type NavIconKey = 'alerts' | 'patients' | 'settings';

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
  { key: 'clinical', label: 'Clinical' },
  { key: 'admin', label: 'Admin' },
];

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { key: 'alerts', label: 'Alerts', to: '/alerts', icon: 'alerts', section: 'clinical' },
  { key: 'patients', label: 'Patients', to: '/patients', icon: 'patients', section: 'clinical' },
  { key: 'settings', label: 'Settings', to: '/settings', icon: 'settings', section: 'admin' },
];

