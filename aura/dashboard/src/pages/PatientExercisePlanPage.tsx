import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import { ClinicianConflictBanner } from '../components/clinician/ClinicianConflictBanner';
import { ClinicianSummaryStrip } from '../components/clinician/ClinicianSummaryStrip';
import {
  getExercisePlan,
  getExercisePlanHistory,
  putExercisePlan,
  type PutExercisePlanPayload,
} from '../services/clinicianApi';
import type { ExercisePlan, ExercisePlanIntensity, ExercisePlanRevision } from '../types/models';
import { asAppError, toUserMessage } from '../utils/errors';

type ExercisePlanDraftItem = PutExercisePlanPayload['items'][number];

interface ExercisePlanItemValidationState {
  key?: string;
  name?: string;
  instructions?: string;
}

interface ExercisePlanValidationState {
  summary: string | null;
  title?: string;
  daysOfWeek?: string;
  items: ExercisePlanItemValidationState[];
  focusFieldId?: string;
}

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

function duplicateDraftItem(item: ExercisePlanDraftItem, order: number): ExercisePlanDraftItem {
  const keyRoot = item.key.trim() || `exercise-${order}`;
  return {
    ...item,
    key: `${keyRoot}-copy-${order}`,
    order,
  };
}

function moveDraftItem(
  items: ExercisePlanDraftItem[],
  fromIndex: number,
  toIndex: number,
): ExercisePlanDraftItem[] {
  if (toIndex < 0 || toIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((item, index) => ({ ...item, order: index + 1 }));
}

function buildComparablePayload(payload: PutExercisePlanPayload): PutExercisePlanPayload {
  return {
    title: payload.title.trim(),
    timezone: payload.timezone?.trim() || undefined,
    daysOfWeek: [...payload.daysOfWeek].sort((left, right) => left - right),
    items: sortDraftItems(payload.items),
  };
}

function plansEquivalent(left: PutExercisePlanPayload, right: PutExercisePlanPayload): boolean {
  return JSON.stringify(buildComparablePayload(left)) === JSON.stringify(buildComparablePayload(right));
}

function validateDraft(payload: PutExercisePlanPayload): ExercisePlanValidationState {
  const next: ExercisePlanValidationState = {
    summary: null,
    items: payload.items.map(() => ({})),
  };

  if (!payload.title.trim()) {
    next.title = 'Plan title is required.';
    next.summary = 'Plan title is required.';
    next.focusFieldId = 'plan-title';
    return next;
  }
  if (payload.daysOfWeek.length === 0) {
    next.daysOfWeek = 'Select at least one day for this plan.';
    next.summary = 'Select at least one day for this plan.';
    next.focusFieldId = 'plan-days';
    return next;
  }

  const uniqueKeys = new Set<string>();
  for (const item of payload.items) {
    const index = payload.items.indexOf(item);
    if (!item.name.trim()) {
      next.items[index] = {
        ...next.items[index],
        name: 'Each exercise needs a name.',
      };
      next.summary = 'Each exercise needs a name.';
      next.focusFieldId = `exercise-${index}-name`;
      return next;
    }
    if (!item.instructions.trim()) {
      next.items[index] = {
        ...next.items[index],
        instructions: 'Each exercise needs clear instructions.',
      };
      next.summary = 'Each exercise needs clear instructions.';
      next.focusFieldId = `exercise-${index}-instructions`;
      return next;
    }
    if (!item.key.trim()) {
      next.items[index] = {
        ...next.items[index],
        key: 'Each exercise needs a stable key.',
      };
      next.summary = 'Each exercise needs a stable key.';
      next.focusFieldId = `exercise-${index}-key`;
      return next;
    }
    if (uniqueKeys.has(item.key.trim())) {
      next.items[index] = {
        ...next.items[index],
        key: 'Exercise keys must be unique.',
      };
      next.summary = 'Exercise keys must be unique.';
      next.focusFieldId = `exercise-${index}-key`;
      return next;
    }
    uniqueKeys.add(item.key.trim());
  }

  return next;
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
  const [conflictDetected, setConflictDetected] = useState(false);
  const [selectedCompareRevisionId, setSelectedCompareRevisionId] = useState<string | null>(null);
  const [expandedExerciseKeys, setExpandedExerciseKeys] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>({});

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
        setConflictDetected(false);
        setSelectedCompareRevisionId(revisions[0]?.id ?? null);
        setExpandedExerciseKeys(
          Object.fromEntries(
            toDraftPayload(plan).items.map((item, index) => [item.key, index === 0]),
          ),
        );
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
  const comparableDraft = useMemo(
    () => ({
      title: draft.title,
      timezone: draft.timezone,
      daysOfWeek: draft.daysOfWeek,
      items: sortedItems,
    }),
    [draft.daysOfWeek, draft.timezone, draft.title, sortedItems],
  );
  const validationState = useMemo(() => validateDraft(comparableDraft), [comparableDraft]);
  const isDirty = useMemo(
    () => !plansEquivalent(comparableDraft, toDraftPayload(currentPlan)),
    [comparableDraft, currentPlan],
  );
  const selectedCompareRevision = useMemo(
    () =>
      history.find((revision) => revision.id === selectedCompareRevisionId) ??
      history[0] ??
      null,
    [history, selectedCompareRevisionId],
  );
  const summaryText = useMemo(() => {
    if (!currentPlan) {
      return 'No plan assigned yet. Build the first structured plan below.';
    }

    return `Version ${currentPlan.version} · ${currentPlan.items.length} exercises · Updated ${new Date(
      currentPlan.updatedAt,
    ).toLocaleString()}`;
  }, [currentPlan]);
  const statusSummaryItems = [
    {
      label: 'Draft state',
      value: isDirty ? 'Unsaved changes' : 'Saved',
      note: isDirty ? 'Current draft differs from latest saved version' : 'Draft matches saved plan',
      tone: isDirty ? 'warning' : 'success',
    },
    {
      label: 'Validation',
      value: validationState.summary ? 'Needs attention' : 'Ready',
      note: validationState.summary ?? 'Required plan fields are complete',
      tone: validationState.summary ? 'danger' : 'success',
    },
    {
      label: 'Save state',
      value: isSaving ? 'Saving...' : 'Idle',
      note: isSaving ? 'Writing a new revision now' : 'Save remains available while you edit',
      tone: isSaving ? 'warning' : 'neutral',
    },
    {
      label: 'Conflict state',
      value: conflictDetected ? 'Compare before reload' : 'No conflict',
      note: conflictDetected
        ? 'A newer plan was saved elsewhere; your local draft is preserved'
        : 'Optimistic version check is clear',
      tone: conflictDetected ? 'danger' : 'neutral',
    },
  ] as const;

  useEffect(() => {
    setExpandedExerciseKeys((current) => {
      const next = Object.fromEntries(
        draft.items.map((item, index) => [item.key, current[item.key] ?? index === 0]),
      );
      return next;
    });
  }, [draft.items]);

  function updateDraft(nextDraft: PutExercisePlanPayload): void {
    setDraft(nextDraft);
    setEditorError(null);
    setNotice(null);
  }

  function registerFieldRef(fieldId: string) {
    return (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null): void => {
      fieldRefs.current[fieldId] = element;
    };
  }

  function focusField(fieldId: string | undefined): void {
    if (!fieldId) {
      return;
    }

    const field = fieldRefs.current[fieldId];
    if (field) {
      field.focus();
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (typeof document !== 'undefined') {
      const anchor = document.querySelector<HTMLElement>(`[data-plan-field="${fieldId}"]`);
      anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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
    const nextItem = createEmptyDraftItem(draft.items.length + 1);
    updateDraft({
      ...draft,
      items: [...draft.items, nextItem],
    });
    setExpandedExerciseKeys((current) => ({
      ...current,
      [nextItem.key]: true,
    }));
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

  function handleDuplicateExercise(index: number): void {
    const duplicated = duplicateDraftItem(draft.items[index], draft.items.length + 1);
    updateDraft({
      ...draft,
      items: [...draft.items, duplicated],
    });
    setExpandedExerciseKeys((current) => ({
      ...current,
      [duplicated.key]: true,
    }));
  }

  function handleMoveExercise(index: number, direction: -1 | 1): void {
    updateDraft({
      ...draft,
      items: moveDraftItem(draft.items, index, index + direction),
    });
  }

  function handleToggleExerciseExpanded(itemKey: string): void {
    setExpandedExerciseKeys((current) => ({
      ...current,
      [itemKey]: !current[itemKey],
    }));
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
      setConflictDetected(false);
      setSelectedCompareRevisionId(revisions[0]?.id ?? null);
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
    const validation = validateDraft(payload);
    if (validation.summary) {
      setEditorError(validation.summary);
      setNotice(null);
      focusField(validation.focusFieldId);
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
      setConflictDetected(false);
      setSelectedCompareRevisionId(revisions[0]?.id ?? null);
      setNotice('Exercise plan saved with a new revision.');
    } catch (error) {
      const appError = asAppError(error);
      if (appError.kind === 'HTTP' && appError.status === 409) {
        try {
          const [latestPlan, revisions] = await Promise.all([
            getExercisePlan(resolvedPatientId),
            getExercisePlanHistory(resolvedPatientId),
          ]);
          setCurrentPlan(latestPlan);
          setHistory(revisions);
          setSelectedCompareRevisionId(revisions[0]?.id ?? null);
          setConflictDetected(true);
        } catch {
          // Keep the local draft intact even if the reload path cannot complete.
        }
        setEditorError(
          'Another clinician saved a newer plan version. Compare the latest revision, then reload when you are ready to discard or merge your local draft.',
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

      <div className="exercise-plan-status-bar">
        <ClinicianSummaryStrip items={statusSummaryItems} />
        <div className="inline-actions">
          <Button
            variant="ghost"
            onClick={() => focusField(validationState.focusFieldId)}
            disabled={!validationState.focusFieldId}
          >
            Jump to required
          </Button>
          <Button variant="secondary" onClick={() => void handleReload()} disabled={isLoading || isSaving}>
            Reload
          </Button>
          <Button variant="secondary" onClick={handleLoadTemplate} disabled={isSaving}>
            Load template
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={isLoading || isSaving || (!isDirty && !conflictDetected)}
          >
            {isSaving ? 'Saving...' : 'Save plan'}
          </Button>
        </div>
      </div>

      {conflictDetected ? (
        <ClinicianConflictBanner
          title="A newer plan revision is available"
          body="Your local draft is still preserved in this browser. Compare against the latest saved revision, then reload when you are ready to discard or rebuild from it."
          compareAction={{
            label: 'Compare latest saved',
            onClick: () => setSelectedCompareRevisionId(history[0]?.id ?? null),
          }}
          reloadAction={{
            label: 'Reload latest saved',
            onClick: () => {
              void handleReload();
            },
          }}
        />
      ) : null}

      <div className="patient-detail-overview-grid">
        <Card title="Current plan summary">
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
                    <div className="inline-actions">
                      <strong className="patient-detail-digest-item__value">
                        {revision.savedBy?.name ?? revision.savedBy?.clinicianId ?? 'Clinician'}
                      </strong>
                      <Button
                        size="sm"
                        variant={selectedCompareRevision?.id === revision.id ? 'primary' : 'secondary'}
                        onClick={() => setSelectedCompareRevisionId(revision.id)}
                      >
                        {selectedCompareRevision?.id === revision.id ? 'Comparing' : 'Compare'}
                      </Button>
                    </div>
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

      {selectedCompareRevision?.snapshot ? (
        <Card title="Draft vs saved revision">
          <div className="patient-detail-overview-grid">
            <div className="patient-detail-digest-list">
              <article className="patient-detail-digest-item">
                <div className="patient-detail-digest-item__meta">
                  <span className="patient-detail-digest-item__label">Current draft</span>
                  <strong className="patient-detail-digest-item__value">
                    {draft.title.trim() || 'Untitled plan'}
                  </strong>
                </div>
                <p className="patient-detail-digest-item__text">
                  {draft.daysOfWeek.length > 0
                    ? DAY_OPTIONS.filter((option) => draft.daysOfWeek.includes(option.value))
                        .map((option) => option.label)
                        .join(', ')
                    : 'No scheduled days'}
                  {' · '}
                  {sortedItems.length} exercise{sortedItems.length === 1 ? '' : 's'}
                </p>
              </article>
              {sortedItems.map((item, index) => (
                <article key={`${item.key}-${index}`} className="patient-detail-digest-item">
                  <div className="patient-detail-digest-item__meta">
                    <span className="patient-detail-digest-item__label">Draft item {index + 1}</span>
                    <strong className="patient-detail-digest-item__value">
                      {item.name.trim() || 'Untitled exercise'}
                    </strong>
                  </div>
                  <p className="patient-detail-digest-item__text">
                    {item.instructions.trim() || 'No instructions yet.'}
                  </p>
                </article>
              ))}
            </div>

            <div className="patient-detail-digest-list">
              <article className="patient-detail-digest-item">
                <div className="patient-detail-digest-item__meta">
                  <span className="patient-detail-digest-item__label">
                    Saved version {selectedCompareRevision.version}
                  </span>
                  <strong className="patient-detail-digest-item__value">
                    {selectedCompareRevision.snapshot.title}
                  </strong>
                </div>
                <p className="patient-detail-digest-item__text">
                  {selectedCompareRevision.snapshot.daysOfWeek.length > 0
                    ? DAY_OPTIONS.filter((option) =>
                        selectedCompareRevision.snapshot?.daysOfWeek.includes(option.value),
                      )
                        .map((option) => option.label)
                        .join(', ')
                    : 'No scheduled days'}
                  {' · '}
                  {selectedCompareRevision.snapshot.items.length} exercise
                  {selectedCompareRevision.snapshot.items.length === 1 ? '' : 's'}
                </p>
              </article>
              {selectedCompareRevision.snapshot.items.map((item, index) => (
                <article key={`${selectedCompareRevision.id}-${item.key}-${index}`} className="patient-detail-digest-item">
                  <div className="patient-detail-digest-item__meta">
                    <span className="patient-detail-digest-item__label">Saved item {index + 1}</span>
                    <strong className="patient-detail-digest-item__value">{item.name}</strong>
                  </div>
                  <p className="patient-detail-digest-item__text">
                    {item.instructions || 'No instructions saved.'}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      <Card title="Plan details">
        <div className="form-field">
          <span>Plan title</span>
          <input
            ref={registerFieldRef('plan-title')}
            data-plan-field="plan-title"
            value={draft.title}
            onChange={(event) => updateDraft({ ...draft, title: event.target.value })}
            placeholder="Enter a plan title"
          />
          {validationState.title ? <p className="validation-text">{validationState.title}</p> : null}
        </div>

        <div className="form-field">
          <span>Timezone</span>
          <input
            ref={registerFieldRef('plan-timezone')}
            value={draft.timezone ?? ''}
            onChange={(event) => updateDraft({ ...draft, timezone: event.target.value })}
            placeholder="e.g. Asia/Colombo"
          />
        </div>

        <div className="form-field">
          <span>Plan days</span>
          <div className="inline-actions" data-plan-field="plan-days">
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
          {validationState.daysOfWeek ? (
            <p className="validation-text">{validationState.daysOfWeek}</p>
          ) : null}
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
                <div>
                  <span className="patient-detail-digest-item__label">Exercise {index + 1}</span>
                  <strong className="patient-detail-digest-item__value">
                    {item.name.trim() || 'Untitled exercise'}
                  </strong>
                </div>
                <div className="inline-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleExerciseExpanded(item.key)}
                  >
                    {expandedExerciseKeys[item.key] ? 'Collapse' : 'Expand'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMoveExercise(index, -1)}
                    disabled={isSaving || index === 0}
                  >
                    Move up
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMoveExercise(index, 1)}
                    disabled={isSaving || index === sortedItems.length - 1}
                  >
                    Move down
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDuplicateExercise(index)}
                    disabled={isSaving}
                  >
                    Duplicate
                  </Button>
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
              {expandedExerciseKeys[item.key] ? (
                <>
                  <div className="form-field">
                    <span>Stable key</span>
                    <input
                      ref={registerFieldRef(`exercise-${index}-key`)}
                      value={item.key}
                      onChange={(event) =>
                        handleItemChange(index, (current) => ({ ...current, key: event.target.value }))
                      }
                      placeholder="exercise-key"
                    />
                    {validationState.items[index]?.key ? (
                      <p className="validation-text">{validationState.items[index]?.key}</p>
                    ) : null}
                  </div>

                  <div className="form-field">
                    <span>Name</span>
                    <input
                      ref={registerFieldRef(`exercise-${index}-name`)}
                      value={item.name}
                      onChange={(event) =>
                        handleItemChange(index, (current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="Exercise name"
                    />
                    {validationState.items[index]?.name ? (
                      <p className="validation-text">{validationState.items[index]?.name}</p>
                    ) : null}
                  </div>

                  <div className="form-field">
                    <span>Instructions</span>
                    <textarea
                      ref={registerFieldRef(`exercise-${index}-instructions`)}
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
                    {validationState.items[index]?.instructions ? (
                      <p className="validation-text">{validationState.items[index]?.instructions}</p>
                    ) : null}
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
                </>
              ) : (
                <p className="muted-text">
                  {item.instructions.trim() || 'Expand to review instructions and structured fields.'}
                </p>
              )}
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
