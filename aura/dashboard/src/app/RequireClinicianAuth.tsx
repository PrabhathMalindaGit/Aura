import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getStoredClinicianToken } from '../services/apiClient';

export function RequireClinicianAuth(): JSX.Element {
  const location = useLocation();
  const token = getStoredClinicianToken();

  if (!token) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ reason: 'missing', from }} />;
  }

  return <Outlet />;
}

