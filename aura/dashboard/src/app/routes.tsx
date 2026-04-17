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
import { PatientsPage } from '../pages/PatientsPage';
import { PatientComparePage } from '../pages/PatientComparePage';
import { PatientExercisePlanPage } from '../pages/PatientExercisePlanPage';
import { PatientExerciseSessionsPage } from '../pages/PatientExerciseSessionsPage';
import { PatientWeeklyReportPage } from '../pages/PatientWeeklyReportPage';
import { ExerciseSessionDetailPage } from '../pages/ExerciseSessionDetailPage';
import { PromDetailPage } from '../pages/PromDetailPage';
import { SessionEndedPage } from '../pages/SessionEndedPage';
import { SmokePage } from '../pages/SmokePage';
import { ClinicianLoginPage } from '../pages/ClinicianLoginPage';

export const router = createBrowserRouter([
  {
    path: '/session-ended',
    element: <SessionEndedPage />,
  },
  {
    path: '/login',
    element: <ClinicianLoginPage />,
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
          { path: 'patients', element: <PatientsPage /> },
          { path: 'patients/compare', element: <PatientComparePage /> },
          { path: 'patients/:patientId', element: <PatientWorkspaceRouteFacade /> },
          { path: 'patients/:patientId/overview', element: <PatientWorkspaceRouteFacade /> },
          { path: 'patients/:patientId/communications', element: <PatientWorkspaceRouteFacade /> },
          { path: 'patients/:patientId/guidance', element: <PatientWorkspaceRouteFacade /> },
          { path: 'patients/:patientId/history', element: <PatientWorkspaceRouteFacade /> },
          { path: 'patients/:patientId/plan', element: <PatientExercisePlanPage /> },
          { path: 'patients/:patientId/sessions', element: <PatientExerciseSessionsPage /> },
          { path: 'patients/:patientId/sessions/:sessionId', element: <ExerciseSessionDetailPage /> },
          { path: 'patients/:patientId/weekly-report', element: <PatientWeeklyReportPage /> },
          { path: 'proms/:promId', element: <PromDetailPage /> },
          { path: 'smoke', element: <SmokePage /> },
          { path: 'settings', element: <SettingsRouteFacade /> },
          { path: '*', element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);
