import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import { getPromInstanceById } from '../services/clinicianApi';
import type { PromInstanceDetail } from '../types/models';
import { asAppError, toUserMessage } from '../utils/errors';

function toDateTime(value: string | null | undefined): string {
  if (!value) {
    return '--';
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return '--';
  }

  return parsed.toLocaleString();
}

export function PromDetailPage(): JSX.Element {
  const { promId } = useParams<{ promId: string }>();
  const [detail, setDetail] = useState<PromInstanceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedPromId = promId?.trim() ?? '';

  const loadDetail = useCallback(async (): Promise<void> => {
    if (!resolvedPromId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getPromInstanceById(resolvedPromId);
      setDetail(response);
    } catch (error) {
      setErrorMessage(toUserMessage(asAppError(error)));
    } finally {
      setIsLoading(false);
    }
  }, [resolvedPromId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  return (
    <div className="page-stack">
      <Section
        title="PROM Detail"
        subtitle={
          detail?.patientId ? (
            <>
              <Link to={`/patients/${detail.patientId}`}>Back to patient</Link>
              {' · '}
              PROM ID: <strong>{resolvedPromId}</strong>
            </>
          ) : (
            <>
              <Link to="/patients">Back to patients</Link>
              {' · '}
              PROM ID: <strong>{resolvedPromId || '--'}</strong>
            </>
          )
        }
      />

      {errorMessage ? (
        <AlertBanner variant="error" title="Unable to load PROM detail">
          {errorMessage}
        </AlertBanner>
      ) : null}

      <Card
        title="Questionnaire status"
        action={
          <Button variant="secondary" onClick={() => void loadDetail()} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      >
        {isLoading ? (
          <p className="muted-text">Loading PROM detail...</p>
        ) : !detail ? (
          <p className="muted-text">PROM not found.</p>
        ) : (
          <div className="stack stack--2">
            <p className="muted-text">Title: {detail.title}</p>
            <p className="muted-text">Status: {detail.status}</p>
            <p className="muted-text">Due: {toDateTime(detail.dueAt)}</p>
            <p className="muted-text">Completed: {toDateTime(detail.completedAt)}</p>
            <p className="muted-text">
              Score:{' '}
              {detail.score
                ? `${detail.score.normalized} (${detail.score.bandLabel})`
                : 'Not submitted'}
            </p>
          </div>
        )}
      </Card>

      {detail ? (
        <Card title="Responses">
          <div className="stack stack--2">
            {detail.questions.map((question) => {
              const answer = detail.answers.find((entry) => entry.questionId === question.id);
              return (
                <div key={question.id} className="stack stack--1">
                  <strong>{question.text}</strong>
                  <p className="muted-text">
                    Answer: {typeof answer?.value === 'number' ? answer.value : '—'}
                    {' · '}Range: {question.min}-{question.max}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
