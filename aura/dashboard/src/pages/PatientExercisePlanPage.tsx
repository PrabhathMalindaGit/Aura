import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import {
  getExercisePlan,
  getExercisePlanHistory,
  putExercisePlan,
  type PutExercisePlanPayload,
} from '../services/clinicianApi';
import type { ExercisePlan, ExercisePlanIntensity, ExercisePlanRevision } from '../types/models';
import { asAppError, toUserMessage } from '../utils/errors';

type ExercisePlanDraftItem = PutExercisePlanPayload['items'][number];

const DAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
] as const;

const INTENSITY_OPTIONS: Array<{ value: ExercisePlanIntensity; label: string }> = [
  { value: 'easy', label: 'Easy' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'hard', label: 'Hard' },
];

const DEMO_TEMPLATE: PutExercisePlanPayload = {
  title: 'Lower limb strengthening',
  timezone: 'Asia/Colombo',
  daysOfWeek: [1, 3, 5],
  items: [
    {
      key: 'quad-set-1',
      name: 'Quad set',
      instructions: 'Tighten your thigh muscle, hold, then release slowly.',
      sets: 3,
      reps: 12,
      holdSeconds: 5,
      restSeconds: 30,
      intensity: 'moderate',
      order: 1,
      videoUrl: 'https://example.com/videos/quad-set',
      contraindications: ['Stop if swelling or pain increases sharply'],
    },
    {
      key: 'heel-slide-1',
      name: 'Heel slide',
      instructions: 'Slide your heel toward your body while keeping movement smooth and controlled.',
      sets: 3,
      reps: 10,
      restSeconds: 30,
      intensity: 'easy',
      order: 2,
    },
  ],
};

function createEmptyDraftItem(order: number): ExercisePlanDraftItem {
  return {
    key: `exercise-${order}`,
    name: '',
    instructions: '',
    order,
  };
}

function normalizeItemNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeContraindications(value: string): string[] | undefined {
  const values = value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function serializeContraindications(values: string[] | undefined): string {
  return values?.join('\n') ?? '';
}

function toDraftPayload(plan: ExercisePlan | null): PutExercisePlanPayload {
  if (!plan) {
    return {
      title: '',
      timezone: '',
      daysOfWeek: [],
      items: [createEmptyDraftItem(1)],
    };
  }

  return {
    title: plan.title,
    timezone: plan.timezone ?? '',
    daysOfWeek: [...plan.daysOfWeek],
    items:
      plan.items.length > 0
        ? plan.items.map((item, index) => ({
            ...item,
            order: index + 1,
          }))
        : [createEmptyDraftItem(1)],
  };
}

function sortDraftItems(items: ExercisePlanDraftItem[]): ExercisePlanDraftItem[] {
  return items.map((item, index) => ({
    ...item,
    key: item.key.trim() || `exercise-${index + 1}`,
    name: item.name.trim(),
    instructions: item.instructions.trim(),
    videoUrl: item.videoUrl?.trim() || undefined,
    contraindications: item.contraindications?.filter(Boolean),
    order: index + 1,
  }));
}

function validateDraft(payload: PutExercisePlanPayload): string | null {
  if (!payload.title.trim()) {
    return 'Plan title is required.';
  }
  if (payload.daysOfWeek.length === 0) {
    return 'Select at least one day for this plan.';
  }

  const uniqueKeys = new Set<string>();
  for (const item of payload.items) {
    if (!item.name.trim()) {
      return 'Each exercise needs a name.';
    }
    if (!item.instructions.trim()) {
      return 'Each exercise needs clear instructions.';
    }
    if (!item.key.trim()) {
      return 'Each exercise needs a stable key.';
    }
    if (uniqueKeys.has(item.key.trim())) {
      return 'Exercise keys must be unique.';
    }
    uniqueKeys.add(item.key.trim());
  }

  return null;
}

export function PatientExercisePlanPage(): JSX.Element {
  const { patientId } = useParams<{ patientId: string }>();
  const resolvedPatientId = patientId?.trim() ?? '';
  const [currentPlan, setCurrentPlan] = useState<ExercisePlan | null>(null);
  const [history, setHistory] = useState<ExercisePlanRevision[]>([]);
  const [draft, setDraft] = useState<PutExercisePlanPayload>(() => toDraftPayload(null));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
        const [plan, revisions] = await Promise.all([
          getExercisePlan(resolvedPatientId),
          getExercisePlanHistory(resolvedPatientId),
        ]);

        if (!active) {
          return;
        }

        setCurrentPlan(plan);
        setHistory(revisions);
        setDraft(toDraftPayload(plan));
      } catch (error) {
        if (!active) {
          return;
        }
        setLoadError(toUserMessage(asAppError(error)));
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

  const sortedItems = useMemo(() => sortDraftItems(draft.items), [draft.items]);
  const summaryText = useMemo(() => {
    if (!currentPlan) {
      return 'No plan assigned yet. Build the first structured plan below.';
    }

    return `Version ${currentPlan.version} · ${currentPlan.items.length} exercises · Updated ${new Date(
      currentPlan.updatedAt,
    ).toLocaleString()}`;
  }, [currentPlan]);

  function updateDraft(nextDraft: PutExercisePlanPayload): void {
    setDraft(nextDraft);
    setEditorError(null);
    setNotice(null);
  }

  function handleToggleDay(day: number): void {
    const selected = new Set(draft.daysOfWeek);
    if (selected.has(day)) {
      selected.delete(day);
    } else {
      selected.add(day);
    }

    updateDraft({
      ...draft,
      daysOfWeek: [...selected].sort((left, right) => left - right),
    });
  }

  function handleItemChange(
    index: number,
    updater: (current: ExercisePlanDraftItem) => ExercisePlanDraftItem,
  ): void {
    updateDraft({
      ...draft,
      items: draft.items.map((item, itemIndex) =>
        itemIndex === index ? updater(item) : item,
      ),
    });
  }

  function handleAddExercise(): void {
    updateDraft({
      ...draft,
      items: [...draft.items, createEmptyDraftItem(draft.items.length + 1)],
    });
  }

  function handleRemoveExercise(index: number): void {
    updateDraft({
      ...draft,
      items:
        draft.items.length === 1
          ? [createEmptyDraftItem(1)]
          : draft.items.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function handleLoadTemplate(): void {
    updateDraft({
      ...DEMO_TEMPLATE,
      items: DEMO_TEMPLATE.items.map((item, index) => ({ ...item, order: index + 1 })),
    });
    setNotice('Template loaded into the structured editor.');
  }

  async function handleReload(): Promise<void> {
    if (!resolvedPatientId) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setNotice(null);

    try {
      const [plan, revisions] = await Promise.all([
        getExercisePlan(resolvedPatientId),
        getExercisePlanHistory(resolvedPatientId),
      ]);
      setCurrentPlan(plan);
      setHistory(revisions);
      setDraft(toDraftPayload(plan));
    } catch (error) {
      setLoadError(toUserMessage(asAppError(error)));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave(): Promise<void> {
    if (!resolvedPatientId) {
      setEditorError('Patient ID is missing.');
      return;
    }

    const payload: PutExercisePlanPayload = {
      title: draft.title.trim(),
      timezone: draft.timezone?.trim() || undefined,
      daysOfWeek: [...draft.daysOfWeek].sort((left, right) => left - right),
      expectedVersion: currentPlan?.version,
      items: sortedItems,
    };
    const validationMessage = validateDraft(payload);
    if (validationMessage) {
      setEditorError(validationMessage);
      setNotice(null);
      return;
    }

    setIsSaving(true);
    setEditorError(null);
    setNotice(null);

    try {
      const saved = await putExercisePlan(resolvedPatientId, payload);
      const revisions = await getExercisePlanHistory(resolvedPatientId);
      setCurrentPlan(saved);
      setHistory(revisions);
      setDraft(toDraftPayload(saved));
      setNotice('Exercise plan saved with a new revision.');
    } catch (error) {
      const appError = asAppError(error);
      if (appError.kind === 'HTTP' && appError.status === 409) {
        setEditorError(
          'Another clinician saved a newer plan version. Reload to review the latest version before saving again.',
        );
      } else {
        setEditorError(toUserMessage(appError));
      }
    } finally {
      setIsSaving(false);
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
        <AlertBanner variant="error" title="Plan editor needs attention">
          {editorError}
        </AlertBanner>
      ) : null}

      {notice ? (
        <AlertBanner variant="success" title="Exercise plan">
          {notice}
        </AlertBanner>
      ) : null}

      <div className="patient-detail-overview-grid">
        <Card
          title="Current plan summary"
          action={
            <div className="inline-actions">
              <Button variant="secondary" onClick={() => void handleReload()} disabled={isLoading || isSaving}>
                Reload
              </Button>
              <Button variant="secondary" onClick={handleLoadTemplate} disabled={isSaving}>
                Load template
              </Button>
              <Button onClick={() => void handleSave()} disabled={isLoading || isSaving}>
                {isSaving ? 'Saving...' : 'Save plan'}
              </Button>
            </div>
          }
        >
          <p className="muted-text">{summaryText}</p>
          {currentPlan?.updatedBy ? (
            <p className="muted-text">
              Last saved by {currentPlan.updatedBy.name ?? currentPlan.updatedBy.clinicianId}
            </p>
          ) : null}
          <div className="patient-detail-digest-list">
            <article className="patient-detail-digest-item">
              <div className="patient-detail-digest-item__meta">
                <span className="patient-detail-digest-item__label">Schedule</span>
                <strong className="patient-detail-digest-item__value">
                  {draft.daysOfWeek.length > 0
                    ? DAY_OPTIONS.filter((option) => draft.daysOfWeek.includes(option.value))
                        .map((option) => option.label)
                        .join(', ')
                    : 'No days selected'}
                </strong>
              </div>
              <p className="patient-detail-digest-item__text">
                Timezone {draft.timezone?.trim() || 'not set'} · {sortedItems.length} ordered exercise
                {sortedItems.length === 1 ? '' : 's'} in the current draft.
              </p>
            </article>
          </div>
        </Card>

        <Card title="Revision history">
          {history.length === 0 ? (
            <p className="muted-text">No saved revisions yet.</p>
          ) : (
            <div className="patient-detail-digest-list">
              {history.map((revision) => (
                <article key={revision.id} className="patient-detail-digest-item">
                  <div className="patient-detail-digest-item__meta">
                    <span className="patient-detail-digest-item__label">Version {revision.version}</span>
                    <strong className="patient-detail-digest-item__value">
                      {revision.savedBy?.name ?? revision.savedBy?.clinicianId ?? 'Clinician'}
                    </strong>
                  </div>
                  <p className="patient-detail-digest-item__text">
                    {new Date(revision.savedAt).toLocaleString()}
                    {revision.snapshot
                      ? ` · ${revision.snapshot.items.length} exercise${
                          revision.snapshot.items.length === 1 ? '' : 's'
                        }`
                      : ''}
                  </p>
                </article>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Plan details">
        <div className="form-field">
          <span>Plan title</span>
          <input
            value={draft.title}
            onChange={(event) => updateDraft({ ...draft, title: event.target.value })}
            placeholder="Enter a plan title"
          />
        </div>

        <div className="form-field">
          <span>Timezone</span>
          <input
            value={draft.timezone ?? ''}
            onChange={(event) => updateDraft({ ...draft, timezone: event.target.value })}
            placeholder="e.g. Asia/Colombo"
          />
        </div>

        <div className="form-field">
          <span>Plan days</span>
          <div className="inline-actions">
            {DAY_OPTIONS.map((day) => (
              <Button
                key={day.value}
                type="button"
                size="sm"
                variant={draft.daysOfWeek.includes(day.value) ? 'primary' : 'secondary'}
                onClick={() => handleToggleDay(day.value)}
              >
                {day.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Card
        title="Exercises"
        action={
          <Button variant="secondary" onClick={handleAddExercise} disabled={isSaving}>
            Add exercise
          </Button>
        }
      >
        <div className="patient-detail-digest-list">
          {sortedItems.map((item, index) => (
            <article key={`${item.key}-${index}`} className="patient-detail-digest-item">
              <div className="patient-detail-digest-item__meta">
                <span className="patient-detail-digest-item__label">Exercise {index + 1}</span>
                <div className="inline-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveExercise(index)}
                    disabled={isSaving}
                  >
                    Remove
                  </Button>
                </div>
              </div>

              <div className="form-field">
                <span>Stable key</span>
                <input
                  value={item.key}
                  onChange={(event) =>
                    handleItemChange(index, (current) => ({ ...current, key: event.target.value }))
                  }
                  placeholder="exercise-key"
                />
              </div>

              <div className="form-field">
                <span>Name</span>
                <input
                  value={item.name}
                  onChange={(event) =>
                    handleItemChange(index, (current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Exercise name"
                />
              </div>

              <div className="form-field">
                <span>Instructions</span>
                <textarea
                  rows={3}
                  value={item.instructions}
                  onChange={(event) =>
                    handleItemChange(index, (current) => ({
                      ...current,
                      instructions: event.target.value,
                    }))
                  }
                  placeholder="Step-by-step guidance for the patient"
                />
              </div>

              <div className="patient-detail-overview-grid">
                <div className="form-field">
                  <span>Sets</span>
                  <input
                    value={item.sets ?? ''}
                    onChange={(event) =>
                      handleItemChange(index, (current) => ({
                        ...current,
                        sets: normalizeItemNumber(event.target.value),
                      }))
                    }
                    inputMode="numeric"
                  />
                </div>
                <div className="form-field">
                  <span>Reps</span>
                  <input
                    value={item.reps ?? ''}
                    onChange={(event) =>
                      handleItemChange(index, (current) => ({
                        ...current,
                        reps: normalizeItemNumber(event.target.value),
                      }))
                    }
                    inputMode="numeric"
                  />
                </div>
                <div className="form-field">
                  <span>Hold (seconds)</span>
                  <input
                    value={item.holdSeconds ?? ''}
                    onChange={(event) =>
                      handleItemChange(index, (current) => ({
                        ...current,
                        holdSeconds: normalizeItemNumber(event.target.value),
                      }))
                    }
                    inputMode="numeric"
                  />
                </div>
                <div className="form-field">
                  <span>Rest (seconds)</span>
                  <input
                    value={item.restSeconds ?? ''}
                    onChange={(event) =>
                      handleItemChange(index, (current) => ({
                        ...current,
                        restSeconds: normalizeItemNumber(event.target.value),
                      }))
                    }
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="patient-detail-overview-grid">
                <label className="form-field">
                  <span>Intensity</span>
                  <select
                    value={item.intensity ?? ''}
                    onChange={(event) =>
                      handleItemChange(index, (current) => ({
                        ...current,
                        intensity:
                          event.target.value === ''
                            ? undefined
                            : (event.target.value as ExercisePlanIntensity),
                      }))
                    }
                  >
                    <option value="">Not set</option>
                    {INTENSITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-field">
                  <span>Guide or video URL</span>
                  <input
                    value={item.videoUrl ?? ''}
                    onChange={(event) =>
                      handleItemChange(index, (current) => ({
                        ...current,
                        videoUrl: event.target.value,
                      }))
                    }
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="form-field">
                <span>Contraindications</span>
                <textarea
                  rows={3}
                  value={serializeContraindications(item.contraindications)}
                  onChange={(event) =>
                    handleItemChange(index, (current) => ({
                      ...current,
                      contraindications: normalizeContraindications(event.target.value),
                    }))
                  }
                  placeholder="One caution or contraindication per line"
                />
              </div>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
