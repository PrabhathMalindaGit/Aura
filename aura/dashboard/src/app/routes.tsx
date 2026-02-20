import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import { AlertsPage } from '../pages/AlertsPage';
import { PatientsPage } from '../pages/PatientsPage';
import { PatientDetailPage } from '../pages/PatientDetailPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SessionEndedPage } from '../pages/SessionEndedPage';

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
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/alerts" replace /> },
    ],
  },
]);
