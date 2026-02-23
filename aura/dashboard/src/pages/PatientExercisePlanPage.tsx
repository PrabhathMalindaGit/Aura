import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import {
  getExercisePlan,
  putExercisePlan,
  type PutExercisePlanPayload,
} from '../services/clinicianApi';
import type { ExercisePlan } from '../types/models';
import { asAppError, toUserMessage } from '../utils/errors';

const DEMO_TEMPLATE: PutExercisePlanPayload = {
  title: 'Lower limb strengthening',
  daysOfWeek: [1, 3, 5],
  items: [
    {
      key: 'quad-set-1',
      name: 'Quad set',
      instructions: 'Tighten your thigh muscle and hold before relaxing.',
      sets: 3,
      reps: 12,
      holdSeconds: 5,
      restSeconds: 30,
      intensity: 'moderate',
      order: 1,
      videoUrl: 'https://example.com/videos/quad-set',
    },
    {
      key: 'heel-slide-1',
      name: 'Heel slide',
      instructions: 'Slide your heel toward your body while keeping movement smooth.',
      sets: 3,
      reps: 10,
      restSeconds: 30,
      intensity: 'easy',
      order: 2,
    },
  ],
};

function toEditorJson(plan: ExercisePlan | null): string {
  if (!plan) {
    return JSON.stringify(DEMO_TEMPLATE, null, 2);
  }

  const draft: PutExercisePlanPayload = {
    title: plan.title,
    daysOfWeek: plan.daysOfWeek,
    items: plan.items,
  };

  return JSON.stringify(draft, null, 2);
}

function parseEditorJson(value: string): PutExercisePlanPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('JSON parse failed. Please fix syntax and try again.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON must be an object.');
  }

  const record = parsed as Partial<PutExercisePlanPayload>;
  if (typeof record.title !== 'string' || !record.title.trim()) {
    throw new Error('title is required.');
  }
  if (!Array.isArray(record.daysOfWeek) || record.daysOfWeek.length === 0) {
    throw new Error('daysOfWeek must be a non-empty array.');
  }
  if (!Array.isArray(record.items)) {
    throw new Error('items must be an array.');
  }

  return {
    title: record.title.trim(),
    daysOfWeek: record.daysOfWeek,
    items: record.items as PutExercisePlanPayload['items'],
  };
}

export function PatientExercisePlanPage(): JSX.Element {
  const { patientId } = useParams<{ patientId: string }>();
  const [currentPlan, setCurrentPlan] = useState<ExercisePlan | null>(null);
  const [draftJson, setDraftJson] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const resolvedPatientId = patientId?.trim() ?? '';

  useEffect(() => {
    if (!resolvedPatientId) {
      setIsLoading(false);
      setLoadError('Patient ID is missing.');
      return;
    }

    let active = true;
    setIsLoading(true);
    setLoadError(null);
    setNotice(null);

    void (async () => {
      try {
        const plan = await getExercisePlan(resolvedPatientId);
        if (!active) {
          return;
        }
        setCurrentPlan(plan);
        setDraftJson(toEditorJson(plan));
      } catch (error) {
        if (!active) {
          return;
        }
        setLoadError(toUserMessage(asAppError(error)));
        setDraftJson(toEditorJson(null));
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [resolvedPatientId]);

  const summaryText = useMemo(() => {
    if (!currentPlan) {
      return 'No plan assigned yet.';
    }

    const updatedAt = new Date(currentPlan.updatedAt).toLocaleString();
    return `Version ${currentPlan.version} · ${currentPlan.items.length} items · Updated ${updatedAt}`;
  }, [currentPlan]);

  async function handleValidate(): Promise<void> {
    try {
      parseEditorJson(draftJson);
      setEditorError(null);
      setNotice('JSON is valid.');
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Validation failed.');
      setNotice(null);
    }
  }

  async function handleSave(): Promise<void> {
    if (!resolvedPatientId) {
      setEditorError('Patient ID is missing.');
      return;
    }

    setIsSaving(true);
    setEditorError(null);
    setNotice(null);

    try {
      const payload = parseEditorJson(draftJson);
      const saved = await putExercisePlan(resolvedPatientId, payload);
      setCurrentPlan(saved);
      setDraftJson(toEditorJson(saved));
      setNotice('Exercise plan saved.');
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        setEditorError(error.message);
        return;
      }
      setEditorError(toUserMessage(asAppError(error)));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReload(): Promise<void> {
    if (!resolvedPatientId) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setNotice(null);

    try {
      const plan = await getExercisePlan(resolvedPatientId);
      setCurrentPlan(plan);
      setDraftJson(toEditorJson(plan));
    } catch (error) {
      setLoadError(toUserMessage(asAppError(error)));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <Section
        title="Exercise Plan"
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

      {loadError ? (
        <AlertBanner variant="error" title="Unable to load exercise plan">
          {loadError}
        </AlertBanner>
      ) : null}

      {editorError ? (
        <AlertBanner variant="error" title="Plan editor error">
          {editorError}
        </AlertBanner>
      ) : null}

      {notice ? (
        <AlertBanner variant="success" title="Exercise plan">
          {notice}
        </AlertBanner>
      ) : null}

      <Card title="Current plan summary">
        <p className="muted-text">{summaryText}</p>
      </Card>

      <Card
        title="Plan JSON editor"
        action={
          <div className="inline-actions">
            <Button variant="secondary" onClick={handleValidate} disabled={isLoading || isSaving}>
              Validate
            </Button>
            <Button variant="secondary" onClick={handleReload} disabled={isLoading || isSaving}>
              Reload
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDraftJson(JSON.stringify(DEMO_TEMPLATE, null, 2));
                setEditorError(null);
                setNotice('Loaded demo template.');
              }}
              disabled={isSaving}
            >
              Load demo template
            </Button>
            <Button onClick={() => void handleSave()} disabled={isLoading || isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        }
      >
        <div className="form-field">
          <span>Plan JSON</span>
          <textarea
            value={draftJson}
            onChange={(event) => setDraftJson(event.target.value)}
            rows={22}
            spellCheck={false}
            style={{ width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          />
        </div>
      </Card>
    </div>
  );
}
