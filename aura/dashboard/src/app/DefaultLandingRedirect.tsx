import { Navigate } from 'react-router-dom';
import { getPreferredDashboardLandingPath } from '../services/clinicianWorkspacePreferences';

export function DefaultLandingRedirect(): JSX.Element {
  return <Navigate to={getPreferredDashboardLandingPath()} replace />;
}
