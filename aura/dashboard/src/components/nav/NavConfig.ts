export type NavSectionKey = 'clinical' | 'admin';
export type NavIconKey = 'dashboard' | 'alerts' | 'insights' | 'patients' | 'appointments' | 'settings';

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
  { key: 'dashboard', label: 'Dashboard', to: '/dashboard', icon: 'dashboard', section: 'clinical' },
  { key: 'alerts', label: 'Alerts', to: '/alerts', icon: 'alerts', section: 'clinical' },
  { key: 'insights', label: 'Insights', to: '/insights', icon: 'insights', section: 'clinical' },
  { key: 'appointments', label: 'Appointments', to: '/appointments', icon: 'appointments', section: 'clinical' },
  { key: 'patients', label: 'Patients', to: '/patients', icon: 'patients', section: 'clinical' },
  { key: 'settings', label: 'Settings', to: '/settings', icon: 'settings', section: 'admin' },
];
