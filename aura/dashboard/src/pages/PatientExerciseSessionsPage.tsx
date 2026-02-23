import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import { getPatientExerciseSessions } from '../services/clinicianApi';
import type { ExerciseSessionListItem } from '../types/models';
import { asAppError, toUserMessage } from '../utils/errors';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export function PatientExerciseSessionsPage(): JSX.Element {
  const navigate = useNavigate();
  const { patientId } = useParams<{ patientId: string }>();
  const [sessions, setSessions] = useState<ExerciseSessionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedPatientId = patientId?.trim() ?? '';

  const loadSessions = async (): Promise<void> => {
    if (!resolvedPatientId) {
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getPatientExerciseSessions(resolvedPatientId, 50);
      setSessions(response);
    } catch (error) {
      setErrorMessage(toUserMessage(asAppError(error)));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSessions();
  }, [resolvedPatientId]);

  const summary = useMemo(() => {
    if (sessions.length === 0) {
      return 'No recorded sessions yet.';
    }
    return `${sessions.length} sessions found.`;
  }, [sessions.length]);

  return (
    <div className="page-stack">
      <Section
        title="Exercise Sessions"
        subtitle={
          resolvedPatientId ? (
            <>
              <Link to={`/patients/${resolvedPatientId}`}>Back to patient detail</Link>
              {' · '}
              Patient ID: <strong>{resolvedPatientId}</strong>
            </>
          ) : (
            'Patient not specified.'
          )
        }
      />

      {errorMessage ? (
        <AlertBanner variant="error" title="Unable to load sessions">
          {errorMessage}
        </AlertBanner>
      ) : null}

      <Card
        title="Recent exercise sessions"
        action={
          <Button variant="secondary" onClick={() => void loadSessions()} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      >
        <p className="muted-text">{summary}</p>
        {isLoading ? (
          <p className="muted-text">Loading sessions...</p>
        ) : sessions.length === 0 ? (
          <p className="muted-text">
            No sessions recorded yet. Record one from the mobile Plan screen.
          </p>
        ) : (
          <div className="patient-sessions-list">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className="unstyled-button patient-sessions-item"
                onClick={() => navigate(`/patients/${resolvedPatientId}/sessions/${session.id}`)}
              >
                <div>
                  <strong>{new Date(session.startedAt).toLocaleString()}</strong>
                  <p className="muted-text">
                    {session.planTitle ?? 'Exercise session'} · {formatDuration(session.durationSeconds)}
                  </p>
                </div>
                <div className="patient-sessions-metrics">
                  <span>
                    {session.completedCount}/{session.exerciseCount} complete
                  </span>
                  <span>
                    Avg pain:{' '}
                    {typeof session.avgPainDuring === 'number' ? `${session.avgPainDuring}/5` : '—'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
