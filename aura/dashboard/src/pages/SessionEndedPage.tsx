import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import type { SessionTimeoutReason } from '../services/sessionTimeout';

interface SessionEndedLocationState {
  reason?: SessionTimeoutReason;
}

function messageForReason(reason: SessionTimeoutReason | undefined): string {
  if (reason === 'absolute') {
    return 'Session ended after reaching the maximum allowed duration.';
  }

  return 'Session ended due to inactivity.';
}

export function SessionEndedPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as SessionEndedLocationState;

  return (
    <div className="auth-entry-page session-ended-page">
      <div className="auth-entry-shell">
        <section className="auth-entry-intro" aria-label="Clinician session ended">
          <p className="auth-entry-intro__eyebrow">Aura platform</p>
          <h1 className="auth-entry-intro__title">Session ended</h1>
          <p className="auth-entry-intro__subtitle">
            For patient safety, unattended clinician sessions are automatically locked.
          </p>
        </section>

        <Card className="auth-surface-card session-ended-card" title="Sign in required">
          <div className="page-stack">
            <p className="session-ended-card__message">{messageForReason(state.reason)}</p>
            <p className="muted-text session-ended-card__note">
              Your dashboard context is protected until you authenticate again.
            </p>
            <div className="inline-actions session-ended-card__actions">
              <Button
                onClick={() => {
                  navigate('/login', { replace: true, state: { reason: 'expired' } });
                }}
              >
                Sign in again
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
