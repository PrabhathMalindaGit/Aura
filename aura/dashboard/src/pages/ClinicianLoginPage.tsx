import { useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { setClinicianIdentity } from '../services/clinicianIdentity';
import { getApiBaseUrl, setStoredClinicianToken } from '../services/apiClient';

const DEMO_EMAIL = 'clinician1@example.com';
const DEMO_PASSWORD = 'devpass123';

type LoginReason = 'missing' | 'expired' | 'signedOut';

interface LoginLocationState {
  from?: string;
  reason?: LoginReason;
}

interface ClinicianLoginResponse {
  ok?: boolean;
  token?: string;
  error?: string;
  retryAfterSeconds?: number;
  clinician?: {
    id?: string;
    name?: string | null;
  };
}

function reasonMessage(reason: LoginReason | undefined): string {
  if (reason === 'expired') {
    return 'Your clinician session expired. Sign in again to continue.';
  }

  if (reason === 'signedOut') {
    return 'You signed out of the dashboard.';
  }

  return 'Sign in with your clinician account to access alerts and patient data.';
}

function toSafeRedirectPath(candidate: string | undefined): string {
  if (!candidate || !candidate.startsWith('/')) {
    return '/alerts';
  }

  if (candidate.startsWith('/login')) {
    return '/alerts';
  }

  return candidate;
}

export function ClinicianLoginPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LoginLocationState;
  const redirectTo = useMemo(() => toSafeRedirectPath(state.from), [state.from]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      setError('Enter your clinician email and password.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/clinician/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password: normalizedPassword,
        }),
      });

      let payload: ClinicianLoginResponse = {};
      try {
        payload = (await response.json()) as ClinicianLoginResponse;
      } catch {
        payload = {};
      }

      if (!response.ok || !payload.ok || typeof payload.token !== 'string' || !payload.token.trim()) {
        if (response.status === 401) {
          setError('Invalid clinician email or password.');
          return;
        }

        if (response.status === 429) {
          const retryAfter =
            typeof payload.retryAfterSeconds === 'number' ? `${payload.retryAfterSeconds}s` : 'a short wait';
          setError(`Too many login attempts. Retry after ${retryAfter}.`);
          return;
        }

        if (response.status === 403) {
          setError('This account is not allowed to access the clinician dashboard.');
          return;
        }

        setError('Sign-in failed. Verify backend availability and try again.');
        return;
      }

      setStoredClinicianToken(payload.token);

      const clinicianId = typeof payload.clinician?.id === 'string' ? payload.clinician.id : 'clinician-1';
      const clinicianName =
        typeof payload.clinician?.name === 'string' && payload.clinician.name.trim()
          ? payload.clinician.name.trim()
          : 'Clinician';
      setClinicianIdentity(clinicianId, clinicianName);

      navigate(redirectTo, { replace: true });
    } catch {
      setError('Unable to reach the server. Check connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <Card className="login-card" title="Clinician sign in">
        <div className="page-stack">
          <p className="muted-text">{reasonMessage(state.reason)}</p>

          {error ? (
            <AlertBanner variant="error" title="Sign-in failed">
              {error}
            </AlertBanner>
          ) : null}

          <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="login-field" htmlFor="login-email">
              <span>Email</span>
              <input
                id="login-email"
                type="email"
                value={email}
                autoComplete="username"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="clinician@example.com"
                required
              />
            </label>

            <label className="login-field" htmlFor="login-password">
              <span>Password</span>
              <input
                id="login-password"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
            </label>

            <div className="inline-actions">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEmail(DEMO_EMAIL);
                  setPassword(DEMO_PASSWORD);
                }}
              >
                Use demo credentials
              </Button>
            </div>
          </form>

          <p className="muted-text">Backend login endpoint: POST /auth/clinician/login</p>
        </div>
      </Card>
    </div>
  );
}
