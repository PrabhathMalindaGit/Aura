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
    <div className="session-ended-page">
      <Card title="Session ended">
        <div className="page-stack">
          <p>{messageForReason(state.reason)}</p>
          <p className="muted-text">For patient safety, unattended sessions auto-lock.</p>
          <div className="inline-actions">
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
  );
}
