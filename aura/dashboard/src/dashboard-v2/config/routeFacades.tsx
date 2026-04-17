import type { ComponentType, ReactNode } from 'react';
import { AlertsPage } from '../../pages/AlertsPage';
import { AppointmentsPage } from '../../pages/AppointmentsPage';
import { CommunicationPage } from '../../pages/CommunicationPage';
import { DashboardHomePage } from '../../pages/DashboardHomePage';
import { InsightsQueuePage } from '../../pages/InsightsQueuePage';
import { PatientDetailPage } from '../../pages/PatientDetailPage';
import { SettingsPage } from '../../pages/SettingsPage';
import { WorklistPage } from '../../pages/WorklistPage';
import {
  isDashboardV2RouteEnabled,
  type DashboardV2RouteId,
} from './migrationGates';
import { AnalyticsFoundation } from '../modules/analytics';
import { InboxFoundation } from '../modules/inbox';
import { PatientWorkspaceFoundation } from '../modules/patient-workspace';
import { TasksFollowUpFoundation } from '../modules/tasks-follow-up';
import { WorkspaceSettingsFoundation } from '../modules/settings';
import { TriageQueueFoundation } from '../modules/triage-queue';

interface RouteFacadeProps {
  legacy: ReactNode;
  v2: ReactNode;
  routeId: DashboardV2RouteId;
}

function RouteFacade({ legacy, v2, routeId }: RouteFacadeProps): JSX.Element {
  return isDashboardV2RouteEnabled(routeId) ? <>{v2}</> : <>{legacy}</>;
}

function createRouteFacade(
  routeId: DashboardV2RouteId,
  LegacyComponent: ComponentType,
  V2Component: ComponentType<{ children: ReactNode }>,
): ComponentType {
  return function DashboardV2RouteFacade(): JSX.Element {
    return (
      <RouteFacade
        routeId={routeId}
        legacy={<LegacyComponent />}
        v2={
          <V2Component>
            <LegacyComponent />
          </V2Component>
        }
      />
    );
  };
}

export const DashboardRouteFacade = createRouteFacade(
  'dashboard',
  DashboardHomePage,
  AnalyticsFoundation,
);

export const WorklistRouteFacade = createRouteFacade(
  'worklist',
  WorklistPage,
  TriageQueueFoundation,
);

export const CommunicationRouteFacade = createRouteFacade(
  'communication',
  CommunicationPage,
  InboxFoundation,
);

export const PatientWorkspaceRouteFacade = createRouteFacade(
  'patient-workspace',
  PatientDetailPage,
  PatientWorkspaceFoundation,
);

export function AlertsRouteFacade(): JSX.Element {
  return (
    <RouteFacade
      routeId="alerts"
      legacy={<AlertsPage />}
      v2={
        <TasksFollowUpFoundation
          title="Governance surface foundation"
          description="Alert review remains on the legacy surface while the v2 governance rail and trust scaffolding are prepared."
        >
          <AlertsPage />
        </TasksFollowUpFoundation>
      }
    />
  );
}

export function InsightsRouteFacade(): JSX.Element {
  return (
    <RouteFacade
      routeId="insights"
      legacy={<InsightsQueuePage />}
      v2={
        <TasksFollowUpFoundation
          title="Tasks and follow-up foundation"
          description="Guidance queue semantics remain intact while the v2 follow-up module foundation is staged."
        >
          <InsightsQueuePage />
        </TasksFollowUpFoundation>
      }
    />
  );
}

export function AppointmentsRouteFacade(): JSX.Element {
  return (
    <RouteFacade
      routeId="appointments"
      legacy={<AppointmentsPage />}
      v2={
        <TasksFollowUpFoundation
          title="Follow-up scheduling foundation"
          description="Scheduling workflows remain unchanged while the v2 follow-up shell and patterns are staged."
        >
          <AppointmentsPage />
        </TasksFollowUpFoundation>
      }
    />
  );
}

export const SettingsRouteFacade = createRouteFacade(
  'settings',
  SettingsPage,
  WorkspaceSettingsFoundation,
);
