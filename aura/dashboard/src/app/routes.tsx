import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { DefaultLandingRedirect } from './DefaultLandingRedirect';
import { RequireClinicianAuth } from './RequireClinicianAuth';
import { AppShellFacade } from '../dashboard-v2/config/AppShellFacade';
import {
  AlertsRouteFacade,
  AppointmentsRouteFacade,
  CommunicationRouteFacade,
  DashboardRouteFacade,
  InsightsRouteFacade,
  PatientWorkspaceRouteFacade,
  SettingsRouteFacade,
  WorklistRouteFacade,
} from '../dashboard-v2/config/routeFacades';

function lazyNamedComponent<TModule extends Record<string, unknown>, TKey extends keyof TModule & string>(
  loader: () => Promise<TModule>,
  key: TKey,
): ComponentType {
  return lazy(async () => {
    const module = await loader();
    return {
      default: module[key] as ComponentType,
    };
  });
}

function withRouteSuspense(element: ReactNode): JSX.Element {
  return <Suspense fallback={null}>{element}</Suspense>;
}

const PatientsPage = lazyNamedComponent(() => import('../pages/PatientsPage'), 'PatientsPage');
const PatientComparePage = lazyNamedComponent(() => import('../pages/PatientComparePage'), 'PatientComparePage');
const PatientExercisePlanPage = lazyNamedComponent(() => import('../pages/PatientExercisePlanPage'), 'PatientExercisePlanPage');
const PatientExerciseSessionsPage = lazyNamedComponent(
  () => import('../pages/PatientExerciseSessionsPage'),
  'PatientExerciseSessionsPage',
);
const PatientWeeklyReportPage = lazyNamedComponent(
  () => import('../pages/PatientWeeklyReportPage'),
  'PatientWeeklyReportPage',
);
const ExerciseSessionDetailPage = lazyNamedComponent(
  () => import('../pages/ExerciseSessionDetailPage'),
  'ExerciseSessionDetailPage',
);
const PromDetailPage = lazyNamedComponent(() => import('../pages/PromDetailPage'), 'PromDetailPage');
const SessionEndedPage = lazyNamedComponent(() => import('../pages/SessionEndedPage'), 'SessionEndedPage');
const SmokePage = lazyNamedComponent(() => import('../pages/SmokePage'), 'SmokePage');
const ClinicianLoginPage = lazyNamedComponent(() => import('../pages/ClinicianLoginPage'), 'ClinicianLoginPage');

export const router = createBrowserRouter([
  {
    path: '/session-ended',
    element: withRouteSuspense(<SessionEndedPage />),
  },
  {
    path: '/login',
    element: withRouteSuspense(<ClinicianLoginPage />),
  },
  {
    path: '/',
    element: <RequireClinicianAuth />,
    children: [
      {
        element: <AppShellFacade />,
        children: [
          { index: true, element: <DefaultLandingRedirect /> },
          { path: 'dashboard', element: <DashboardRouteFacade /> },
          { path: 'worklist', element: <WorklistRouteFacade /> },
          { path: 'communication', element: <CommunicationRouteFacade /> },
          { path: 'alerts', element: <AlertsRouteFacade /> },
          { path: 'insights', element: <InsightsRouteFacade /> },
          { path: 'appointments', element: <AppointmentsRouteFacade /> },
          { path: 'patients', element: withRouteSuspense(<PatientsPage />) },
          { path: 'patients/compare', element: withRouteSuspense(<PatientComparePage />) },
          { path: 'patients/:patientId', element: <PatientWorkspaceRouteFacade /> },
          { path: 'patients/:patientId/overview', element: <PatientWorkspaceRouteFacade /> },
          { path: 'patients/:patientId/communications', element: <PatientWorkspaceRouteFacade /> },
          { path: 'patients/:patientId/guidance', element: <PatientWorkspaceRouteFacade /> },
          { path: 'patients/:patientId/history', element: <PatientWorkspaceRouteFacade /> },
          { path: 'patients/:patientId/plan', element: withRouteSuspense(<PatientExercisePlanPage />) },
          { path: 'patients/:patientId/sessions', element: withRouteSuspense(<PatientExerciseSessionsPage />) },
          { path: 'patients/:patientId/sessions/:sessionId', element: withRouteSuspense(<ExerciseSessionDetailPage />) },
          { path: 'patients/:patientId/weekly-report', element: withRouteSuspense(<PatientWeeklyReportPage />) },
          { path: 'proms/:promId', element: withRouteSuspense(<PromDetailPage />) },
          { path: 'smoke', element: withRouteSuspense(<SmokePage />) },
          { path: 'settings', element: <SettingsRouteFacade /> },
          { path: '*', element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);
