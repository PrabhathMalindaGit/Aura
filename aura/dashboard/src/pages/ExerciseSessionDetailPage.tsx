import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import { getExerciseSessionById } from '../services/clinicianApi';
import type { ExerciseSessionDetail } from '../types/models';
import { asAppError, toUserMessage } from '../utils/errors';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export function ExerciseSessionDetailPage(): JSX.Element {
  const { patientId, sessionId } = useParams<{ patientId: string; sessionId: string }>();
  const [session, setSession] = useState<ExerciseSessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedPatientId = patientId?.trim() ?? '';
  const resolvedSessionId = sessionId?.trim() ?? '';

  const loadDetail = async (): Promise<void> => {
    if (!resolvedSessionId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getExerciseSessionById(resolvedSessionId);
      setSession(response);
    } catch (error) {
      setErrorMessage(toUserMessage(asAppError(error)));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
  }, [resolvedSessionId]);

  return (
    <div className="page-stack">
      <Section
        title="Exercise Session Detail"
        subtitle={
          resolvedPatientId ? (
            <>
              <Link to={`/patients/${resolvedPatientId}/sessions`}>Back to sessions</Link>
              {' · '}
              Patient ID: <strong>{resolvedPatientId}</strong>
            </>
          ) : (
            'Patient not specified.'
          )
        }
      />

      {errorMessage ? (
        <AlertBanner variant="error" title="Unable to load session detail">
          {errorMessage}
        </AlertBanner>
      ) : null}

      <Card
        title="Session snapshot"
        action={
          <Button variant="secondary" onClick={() => void loadDetail()} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      >
        {isLoading ? (
          <p className="muted-text">Loading session...</p>
        ) : !session ? (
          <p className="muted-text">Session not found.</p>
        ) : (
          <div className="session-detail-grid">
            <p className="muted-text">Started: {new Date(session.startedAt).toLocaleString()}</p>
            <p className="muted-text">Ended: {new Date(session.endedAt).toLocaleString()}</p>
            <p className="muted-text">Duration: {formatDuration(session.durationSeconds)}</p>
            <p className="muted-text">
              Completed: {session.completedCount}/{session.exerciseCount}
            </p>
            <p className="muted-text">Status: {session.status}</p>
            <p className="muted-text">
              Avg pain: {typeof session.avgPainDuring === 'number' ? `${session.avgPainDuring}/5` : '—'}
            </p>
          </div>
        )}
      </Card>

      {session ? (
        <Card title="Exercise feedback">
          <div className="session-detail-exercises">
            {session.exercises.map((exercise) => (
              <div key={`${exercise.itemKey}-${exercise.order}`} className="session-detail-item">
                <strong>{exercise.nameSnapshot}</strong>
                <p className="muted-text">
                  {exercise.completed ? 'Completed' : 'Not completed'}
                  {exercise.difficulty ? ` · Difficulty: ${exercise.difficulty}` : ''}
                  {typeof exercise.painDuring === 'number' ? ` · Pain: ${exercise.painDuring}/5` : ''}
                </p>
                {exercise.note ? <p className="muted-text">Note: {exercise.note}</p> : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
