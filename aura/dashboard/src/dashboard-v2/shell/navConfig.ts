import type { LucideIcon } from 'lucide-react';
import {
  BellRing,
  CalendarClock,
  ClipboardList,
  HeartPulse,
  LayoutDashboard,
  MessageSquareMore,
  Settings2,
  UsersRound,
} from 'lucide-react';
import type { DashboardV2RouteId } from '../config/migrationGates';

export interface DashboardV2NavItem {
  key: DashboardV2RouteId;
  label: string;
  shortLabel: string;
  description: string;
  to: string;
  icon: LucideIcon;
}

export const DASHBOARD_V2_NAV_ITEMS: DashboardV2NavItem[] = [
  {
    key: 'dashboard',
    label: 'Service analytics',
    shortLabel: 'Analytics',
    description: 'Operational metrics and service trends',
    to: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    key: 'worklist',
    label: 'Triage queue',
    shortLabel: 'Queue',
    description: 'Scan and open active review work',
    to: '/worklist',
    icon: ClipboardList,
  },
  {
    key: 'communication',
    label: 'Clinician inbox',
    shortLabel: 'Inbox',
    description: 'Review conversations and follow-up',
    to: '/communication',
    icon: MessageSquareMore,
  },
  {
    key: 'patient-workspace',
    label: 'Patient workspace',
    shortLabel: 'Patients',
    description: 'Open patient workspaces and summaries',
    to: '/patients',
    icon: UsersRound,
  },
  {
    key: 'alerts',
    label: 'Governance',
    shortLabel: 'Governance',
    description: 'Alert triage and safety governance',
    to: '/alerts',
    icon: BellRing,
  },
  {
    key: 'insights',
    label: 'Follow-up tasks',
    shortLabel: 'Follow-up',
    description: 'Insight review and clinical follow-through',
    to: '/insights',
    icon: HeartPulse,
  },
  {
    key: 'appointments',
    label: 'Scheduling',
    shortLabel: 'Schedule',
    description: 'Appointments and scheduling flow',
    to: '/appointments',
    icon: CalendarClock,
  },
  {
    key: 'settings',
    label: 'Workspace settings',
    shortLabel: 'Settings',
    description: 'Theme, workspace, and preference controls',
    to: '/settings',
    icon: Settings2,
  },
];

export function getDashboardV2RouteTitle(routeId: DashboardV2RouteId | null): string {
  return DASHBOARD_V2_NAV_ITEMS.find((item) => item.key === routeId)?.label ?? 'Aura clinician workbench';
}

export function getDashboardV2RouteDescription(routeId: DashboardV2RouteId | null): string {
  return DASHBOARD_V2_NAV_ITEMS.find((item) => item.key === routeId)?.description ?? 'Clinical review foundation';
}
