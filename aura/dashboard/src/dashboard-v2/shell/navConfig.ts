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
    label: 'Today overview',
    shortLabel: 'Today',
    description: 'Live operational summary',
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
    key: 'patients',
    label: 'Patients roster',
    shortLabel: 'Patients',
    description: 'Search the care roster and open patient workspaces',
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

const DASHBOARD_V2_ROUTE_META: Record<DashboardV2RouteId, { title: string; description: string }> = {
  dashboard: {
    title: 'Today',
    description: 'Live operational summary',
  },
  worklist: {
    title: 'Triage queue',
    description: 'Scan and open active review work',
  },
  communication: {
    title: 'Clinician inbox',
    description: 'Review conversations and follow-up',
  },
  patients: {
    title: 'Patients roster',
    description: 'Search the care roster and open patient workspaces',
  },
  'patient-workspace': {
    title: 'Patient workspace',
    description: 'Single-patient review, coordination, and history context',
  },
  alerts: {
    title: 'Governance',
    description: 'Alert triage and safety governance',
  },
  insights: {
    title: 'Follow-up tasks',
    description: 'Insight review and clinical follow-through',
  },
  appointments: {
    title: 'Scheduling',
    description: 'Appointments and scheduling flow',
  },
  settings: {
    title: 'Workspace settings',
    description: 'Theme, workspace, and preference controls',
  },
};

export function getDashboardV2RouteTitle(routeId: DashboardV2RouteId | null): string {
  return routeId ? DASHBOARD_V2_ROUTE_META[routeId]?.title ?? 'Aura clinician workspace' : 'Aura clinician workspace';
}

export function getDashboardV2RouteDescription(routeId: DashboardV2RouteId | null): string {
  return routeId
    ? DASHBOARD_V2_ROUTE_META[routeId]?.description ?? 'Operational overview'
    : 'Operational overview';
}
