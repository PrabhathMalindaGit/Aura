import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import { AlertsPage } from '../pages/AlertsPage';
import { PatientsPage } from '../pages/PatientsPage';
import { PatientDetailPage } from '../pages/PatientDetailPage';
import { PatientExercisePlanPage } from '../pages/PatientExercisePlanPage';
import { PatientExerciseSessionsPage } from '../pages/PatientExerciseSessionsPage';
import { PatientWeeklyReportPage } from '../pages/PatientWeeklyReportPage';
import { ExerciseSessionDetailPage } from '../pages/ExerciseSessionDetailPage';
import { PromDetailPage } from '../pages/PromDetailPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SessionEndedPage } from '../pages/SessionEndedPage';
import { SmokePage } from '../pages/SmokePage';

export const router = createBrowserRouter([
  {
    path: '/session-ended',
    element: <SessionEndedPage />,
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/alerts" replace /> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: 'patients', element: <PatientsPage /> },
      { path: 'patients/:patientId', element: <PatientDetailPage /> },
      { path: 'patients/:patientId/plan', element: <PatientExercisePlanPage /> },
      { path: 'patients/:patientId/sessions', element: <PatientExerciseSessionsPage /> },
      { path: 'patients/:patientId/sessions/:sessionId', element: <ExerciseSessionDetailPage /> },
      { path: 'patients/:patientId/weekly-report', element: <PatientWeeklyReportPage /> },
      { path: 'proms/:promId', element: <PromDetailPage /> },
      { path: 'smoke', element: <SmokePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/alerts" replace /> },
    ],
  },
]);
