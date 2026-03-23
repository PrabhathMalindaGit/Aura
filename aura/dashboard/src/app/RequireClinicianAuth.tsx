import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { setClinicianIdentity } from '../services/clinicianIdentity';
import { getStoredClinicianToken } from '../services/apiClient';
import { getClinicianSession } from '../services/clinicianSession';
import { isAppError } from '../utils/errors';

type BootstrapStatus = 'checking' | 'ready' | 'unauthorized' | 'error';

export function RequireClinicianAuth(): JSX.Element {
  const location = useLocation();
  const token = getStoredClinicianToken();
  const from = `${location.pathname}${location.search}${location.hash}`;
  const [status, setStatus] = useState<BootstrapStatus>(token ? 'checking' : 'unauthorized');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('unauthorized');
      setErrorMessage(null);
      return;
    }

    let cancelled = false;

    setStatus('checking');
    setErrorMessage(null);

    void getClinicianSession()
      .then((response) => {
        if (cancelled) {
          return;
        }

        const clinicianName =
          typeof response.clinician.name === 'string' && response.clinician.name.trim()
            ? response.clinician.name.trim()
            : 'Clinician';

        setClinicianIdentity(response.clinician.id, clinicianName);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        if (isAppError(error) && (error.status === 401 || error.status === 403)) {
          setStatus('unauthorized');
          return;
        }

        setErrorMessage('Unable to verify your clinician session right now.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return <Navigate to="/login" replace state={{ reason: 'missing', from }} />;
  }

  if (status === 'unauthorized' || !getStoredClinicianToken()) {
    return <Navigate to="/login" replace state={{ reason: 'expired', from }} />;
  }

  if (status === 'checking') {
    return <div className="route-guard-status">Checking clinician session…</div>;
  }

  if (status === 'error') {
    return (
      <div className="route-guard-status" role="alert">
        {errorMessage}
      </div>
    );
  }

  return <Outlet />;
}
