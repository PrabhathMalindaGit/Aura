import { Suspense, lazy, type ComponentType, type ReactNode } from "react";
import {
  isDashboardV2RouteEnabled,
  type DashboardV2RouteId,
} from "./migrationGates";
import { DashboardRoute } from "../modules/analytics";
import { AlertsRoute } from "../modules/alerts";
import { AppointmentsRoute } from "../modules/appointments";
import { InsightsRoute } from "../modules/insights";
import { PatientsRoute } from "../modules/patients";
import { PatientWorkspaceRoute } from "../modules/patient-workspace";
import { SettingsRoute } from "../modules/settings";

function lazyNamedComponent<
  TModule extends Record<string, unknown>,
  TKey extends keyof TModule & string,
>(loader: () => Promise<TModule>, key: TKey): ComponentType {
  return lazy(async () => {
    const module = await loader();
    return {
      default: module[key] as ComponentType,
    };
  });
}

const AlertsPage = lazyNamedComponent(
  () => import("../../pages/AlertsPage"),
  "AlertsPage",
);
const AppointmentsPage = lazyNamedComponent(
  () => import("../../pages/AppointmentsPage"),
  "AppointmentsPage",
);
const CommunicationPage = lazyNamedComponent(
  () => import("../../pages/CommunicationPage"),
  "CommunicationPage",
);
const DashboardHomePage = lazyNamedComponent(
  () => import("../../pages/DashboardHomePage"),
  "DashboardHomePage",
);
const InsightsQueuePage = lazyNamedComponent(
  () => import("../../pages/InsightsQueuePage"),
  "InsightsQueuePage",
);
const InboxRoute = lazyNamedComponent(
  () => import("../modules/inbox"),
  "InboxRoute",
);
const PatientDetailPage = lazyNamedComponent(
  () => import("../../pages/PatientDetailPage"),
  "PatientDetailPage",
);
const PatientsPage = lazyNamedComponent(
  () => import("../../pages/PatientsPage"),
  "PatientsPage",
);
const SettingsPage = lazyNamedComponent(
  () => import("../../pages/SettingsPage"),
  "SettingsPage",
);
const WorklistPage = lazyNamedComponent(
  () => import("../../pages/WorklistPage"),
  "WorklistPage",
);
const TriageQueueRoute = lazyNamedComponent(
  () => import("../modules/triage-queue"),
  "TriageQueueRoute",
);

interface RouteFacadeProps {
  legacy: ReactNode;
  v2: ReactNode;
  routeId: DashboardV2RouteId;
}

function RouteFacade({ legacy, v2, routeId }: RouteFacadeProps): JSX.Element {
  return (
    <Suspense fallback={null}>
      {isDashboardV2RouteEnabled(routeId) ? <>{v2}</> : <>{legacy}</>}
    </Suspense>
  );
}

export function DashboardRouteFacade(): JSX.Element {
  return (
    <RouteFacade
      routeId="dashboard"
      legacy={<DashboardHomePage />}
      v2={<DashboardRoute />}
    />
  );
}

export function WorklistRouteFacade(): JSX.Element {
  return (
    <RouteFacade
      routeId="worklist"
      legacy={<WorklistPage />}
      v2={<TriageQueueRoute />}
    />
  );
}

export function CommunicationRouteFacade(): JSX.Element {
  return (
    <RouteFacade
      routeId="communication"
      legacy={<CommunicationPage />}
      v2={<InboxRoute />}
    />
  );
}

export function PatientWorkspaceRouteFacade(): JSX.Element {
  return (
    <RouteFacade
      routeId="patient-workspace"
      legacy={<PatientDetailPage />}
      v2={<PatientWorkspaceRoute />}
    />
  );
}

export function PatientsRouteFacade(): JSX.Element {
  return (
    <RouteFacade
      routeId="patients"
      legacy={<PatientsPage />}
      v2={<PatientsRoute />}
    />
  );
}

export function AlertsRouteFacade(): JSX.Element {
  return (
    <RouteFacade
      routeId="alerts"
      legacy={<AlertsPage />}
      v2={<AlertsRoute />}
    />
  );
}

export function InsightsRouteFacade(): JSX.Element {
  return (
    <RouteFacade
      routeId="insights"
      legacy={<InsightsQueuePage />}
      v2={<InsightsRoute />}
    />
  );
}

export function AppointmentsRouteFacade(): JSX.Element {
  return (
    <RouteFacade
      routeId="appointments"
      legacy={<AppointmentsPage />}
      v2={<AppointmentsRoute />}
    />
  );
}

export function SettingsRouteFacade(): JSX.Element {
  return (
    <RouteFacade
      routeId="settings"
      legacy={<SettingsPage />}
      v2={<SettingsRoute />}
    />
  );
}
