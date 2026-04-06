import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ClinicianAvatar } from '../ui/ClinicianAvatar';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { useClinicianIdentity } from '../../hooks/useClinicianIdentity';
import { usePatientHandoff } from '../../hooks/usePatientHandoff';
import {
  useAppendPatientCoordinationNote,
  usePatientCoordination,
  useSavePatientCurrentHandoff,
} from '../../services/clinicianApi';
import { getClinicianInitials } from '../../services/clinicianIdentity';
import {
  PATIENT_HANDOFF_LIMITS,
  discardLegacyPatientHandoffRecord,
  getLatestPatientHandoffNote,
} from '../../services/patientHandoffWorkspace';
import type { ClinicianCoordinationNextStep } from '../../types/models';
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../../utils/dashboard';
import { asAppError, toUserMessage } from '../../utils/errors';
import {
  buildClinicianCoordinationFollowUpOwner,
  CLINICIAN_COORDINATION_NEXT_STEP_OPTIONS,
  getClinicianCoordinationActionButtonLabel,
  getClinicianCoordinationFollowUpOwnerLabel,
  getClinicianCoordinationNextStepLabel,
  type ClinicianCoordinationDraftFollowUpOwnerKind,
  type ClinicianCoordinationDraftNextStep,
  toClinicianCoordinationNextStep,
} from '../../utils/clinicianCoordination';

interface PatientHandoffPanelProps {
  patientId: string;
  onOpenNextAction: (action: Exclude<ClinicianCoordinationNextStep, 'monitoring'>) => void;
}

export function PatientHandoffPanel({
  patientId,
  onOpenNextAction,
}: PatientHandoffPanelProps): JSX.Element {
  const clinicianIdentity = useClinicianIdentity();
  const coordinationQuery = usePatientCoordination(patientId);
  const saveCurrentHandoffMutation = useSavePatientCurrentHandoff(patientId);
  const appendNoteMutation = useAppendPatientCoordinationNote(patientId);
  const legacyLocalHandoff = usePatientHandoff(patientId);
  const [summary, setSummary] = useState('');
  const [nextStep, setNextStep] = useState<ClinicianCoordinationDraftNextStep>('monitoring');
  const [ownerKind, setOwnerKind] =
    useState<ClinicianCoordinationDraftFollowUpOwnerKind>('unassigned');
  const [customOwnerLabel, setCustomOwnerLabel] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [noteNotice, setNoteNotice] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const summaryFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const noteFieldRef = useRef<HTMLTextAreaElement | null>(null);

  const coordinationRecord = coordinationQuery.data ?? null;
  const currentHandoff = coordinationRecord?.currentHandoff ?? null;
  const notes = coordinationRecord?.noteHistory ?? [];
  const legacyLatestNote = useMemo(
    () => getLatestPatientHandoffNote(legacyLocalHandoff),
    [legacyLocalHandoff],
  );
  const legacyLocalExcerpt = legacyLocalHandoff?.currentHandoff?.summary ?? legacyLatestNote?.text ?? null;
  const hasLegacyLocalContext = Boolean(
    legacyLocalHandoff?.currentHandoff || (legacyLocalHandoff?.notes.length ?? 0) > 0,
  );
  const handoffSyncKey = useMemo(
    () =>
      JSON.stringify(
        currentHandoff
          ? {
              summary: currentHandoff.summary,
              nextStep: currentHandoff.nextStep,
              followUpOwner: currentHandoff.followUpOwner,
              updatedAt: currentHandoff.updatedAt,
            }
          : null,
      ),
    [currentHandoff],
  );
  const hasAnySharedCoordination = Boolean(currentHandoff || notes.length > 0);
  const isInitialLoading = coordinationQuery.isLoading && coordinationQuery.data === undefined;
  const isInitialError = coordinationQuery.isError && coordinationRecord === null;
  const isEditorDisabled =
    isInitialLoading || isInitialError || saveCurrentHandoffMutation.isPending || appendNoteMutation.isPending;

  useEffect(() => {
    setSummary(currentHandoff?.summary ?? '');
    setNextStep(currentHandoff?.nextStep ?? 'monitoring');
    setOwnerKind(currentHandoff?.followUpOwner.kind ?? 'unassigned');
    setCustomOwnerLabel(
      currentHandoff?.followUpOwner.kind === 'custom' ? currentHandoff.followUpOwner.label : '',
    );
  }, [handoffSyncKey, patientId]);

  function handleSaveHandoff(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setHandoffNotice(null);
    setHandoffError(null);

    if (ownerKind === 'custom' && customOwnerLabel.trim().length === 0) {
      setHandoffError('Add a custom owner label or switch the follow-up owner to another option.');
      return;
    }

    if (
      ownerKind === 'clinician' &&
      (!clinicianIdentity.clinicianId.trim() || !clinicianIdentity.displayName.trim())
    ) {
      setHandoffError('Clinician identity is unavailable for a shared follow-up owner.');
      return;
    }

    saveCurrentHandoffMutation.mutate(
      {
        summary,
        nextStep: toClinicianCoordinationNextStep(nextStep),
        followUpOwner: buildClinicianCoordinationFollowUpOwner({
          kind: ownerKind,
          clinicianId: clinicianIdentity.clinicianId,
          displayName: clinicianIdentity.displayName,
          label: customOwnerLabel,
        }),
      },
      {
        onSuccess: (nextRecord) => {
          setHandoffError(null);
          setHandoffNotice(
            nextRecord?.currentHandoff
              ? 'Shared handoff saved for the care team.'
              : 'Current shared handoff cleared. Shared note history stays available.',
          );
        },
        onError: (error) => {
          setHandoffNotice(null);
          setHandoffError(toUserMessage(asAppError(error)));
        },
      },
    );
  }

  function handleAddNote(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setNoteNotice(null);
    setNoteError(null);

    if (noteDraft.trim().length === 0) {
      setNoteError('Add a short shared coordination note before saving.');
      return;
    }

    appendNoteMutation.mutate(
      {
        text: noteDraft,
      },
      {
        onSuccess: () => {
          setNoteDraft('');
          setNoteError(null);
          setNoteNotice('Shared coordination note added.');
        },
        onError: (error) => {
          setNoteNotice(null);
          setNoteError(toUserMessage(asAppError(error)));
        },
      },
    );
  }

  return (
    <Card
      id="patient-handoff-panel"
      className="patient-detail-panel patient-detail-panel--operational patient-detail-panel--operations-secondary patient-handoff-panel"
      title="Shared coordination and notes"
      data-testid="patient-handoff-panel"
    >
      <div className="patient-handoff-panel__body">
        {isInitialLoading ? (
          <section className="patient-handoff-panel__loading" aria-label="Shared coordination loading">
            <Skeleton height={18} />
            <Skeleton height={48} />
            <Skeleton height={18} />
          </section>
        ) : null}

        {isInitialError ? (
          <section className="communication-page__inline-state" aria-label="Shared coordination load failure">
            <p>{toUserMessage(asAppError(coordinationQuery.error))}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void coordinationQuery.refetch();
              }}
            >
              Retry
            </Button>
          </section>
        ) : null}

        {!isInitialLoading && !isInitialError && !hasAnySharedCoordination ? (
          <EmptyState
            title="No shared coordination yet"
            description="Save a concise team-visible handoff or shared note when the next clinician needs context."
            tone="neutral"
            action={
              <div className="patient-handoff-panel__empty-actions">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    summaryFieldRef.current?.focus();
                  }}
                >
                  Create shared handoff
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    noteFieldRef.current?.focus();
                  }}
                >
                  Add shared note
                </Button>
              </div>
            }
          />
        ) : null}

        {currentHandoff ? (
          <section
            className="patient-handoff-panel__current"
            aria-label="Saved shared handoff"
            data-testid="patient-handoff-current"
          >
            <div className="patient-handoff-panel__current-copy">
              <div className="patient-handoff-panel__current-meta">
                <Badge variant="neutral">Shared handoff</Badge>
                <span
                  className="muted-text"
                  title={formatDashboardDateTime(currentHandoff.updatedAt)}
                >
                  Updated {formatDashboardRelativeTime(currentHandoff.updatedAt)}
                </span>
              </div>
              {currentHandoff.summary ? (
                <p className="patient-handoff-panel__current-summary">{currentHandoff.summary}</p>
              ) : (
                <p className="muted-text patient-handoff-panel__current-summary">
                  No summary saved. Use the shared current handoff fields below when the care team needs more direction.
                </p>
              )}
              <dl className="patient-handoff-panel__current-facts">
                <div>
                  <dt>Next step</dt>
                  <dd>{getClinicianCoordinationNextStepLabel(currentHandoff.nextStep)}</dd>
                </div>
                <div>
                  <dt>Follow-up owner</dt>
                  <dd>{getClinicianCoordinationFollowUpOwnerLabel(currentHandoff.followUpOwner)}</dd>
                </div>
              </dl>
            </div>
            <div className="patient-handoff-panel__current-side">
              <div className="patient-handoff-panel__attribution">
                <ClinicianAvatar
                  identity={{
                    displayName: currentHandoff.updatedBy.displayName,
                    initials: getClinicianInitials(
                      currentHandoff.updatedBy.displayName,
                      currentHandoff.updatedBy.clinicianId,
                    ),
                    photo: null,
                  }}
                  decorative
                  size="sm"
                />
                <div className="patient-handoff-panel__attribution-copy">
                  <strong>{currentHandoff.updatedBy.displayName}</strong>
                  <span>Saved in Aura for the care team.</span>
                </div>
              </div>
              {currentHandoff.nextStep !== 'monitoring' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpenNextAction(currentHandoff.nextStep)}
                >
                  {getClinicianCoordinationActionButtonLabel(currentHandoff.nextStep)}
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="patient-handoff-panel__scope-note" aria-label="Shared coordination scope">
          <div className="patient-handoff-panel__scope-copy">
            <p className="patient-handoff-panel__scope-eyebrow">Shared clinician coordination</p>
            <p className="patient-handoff-panel__scope-text">
              Saved in Aura for team-visible coordination across clinician sessions and devices.
            </p>
          </div>
          <div className="patient-handoff-panel__scope-facts" aria-live="polite">
            <span className="patient-handoff-panel__scope-fact">
              {currentHandoff ? 'Shared handoff saved' : 'No current shared handoff'}
            </span>
            <span className="patient-handoff-panel__scope-fact">
              {notes.length} {notes.length === 1 ? 'shared note' : 'shared notes'}
            </span>
          </div>
        </section>

        {hasLegacyLocalContext ? (
          <section
            className="patient-handoff-panel__scope-note"
            aria-label="Legacy browser-local coordination warning"
            data-testid="patient-handoff-legacy-warning"
          >
            <div className="patient-handoff-panel__scope-copy">
              <p className="patient-handoff-panel__scope-eyebrow">Legacy browser-local coordination</p>
              <p className="patient-handoff-panel__scope-text">
                Found only in this browser profile from an older local workflow. It is not shared in Aura and may be stale or belong to a different clinician.
              </p>
              <p className="muted-text">
                If any detail is still valid, verify it and re-enter it manually into shared coordination below.
              </p>
              {legacyLocalExcerpt ? (
                <p className="patient-handoff-panel__current-summary">{legacyLocalExcerpt}</p>
              ) : null}
            </div>
            <div className="patient-handoff-panel__scope-facts">
              <span className="patient-handoff-panel__scope-fact">
                {legacyLocalHandoff?.currentHandoff ? 'Structured local handoff found' : 'Local note-only artifact'}
              </span>
              <span className="patient-handoff-panel__scope-fact">
                {(legacyLocalHandoff?.notes.length ?? 0)}{' '}
                {(legacyLocalHandoff?.notes.length ?? 0) === 1 ? 'local note' : 'local notes'}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  discardLegacyPatientHandoffRecord(patientId);
                }}
              >
                Discard local copy
              </Button>
            </div>
          </section>
        ) : null}

        <form className="patient-handoff-panel__form" onSubmit={handleSaveHandoff}>
          <div className="patient-handoff-panel__form-heading">
            <div>
              <p className="patient-handoff-panel__form-eyebrow">Shared current handoff</p>
              <h3 className="patient-handoff-panel__form-title">Current review context</h3>
            </div>
            <span className="muted-text">Visible to the care team.</span>
          </div>

          <label className="form-field">
            <span>Handoff summary</span>
            <textarea
              ref={summaryFieldRef}
              name="handoff-summary"
              rows={4}
              maxLength={PATIENT_HANDOFF_LIMITS.summary}
              value={summary}
              disabled={isEditorDisabled}
              onChange={(event) => {
                setSummary(event.target.value);
                setHandoffNotice(null);
                setHandoffError(null);
              }}
              placeholder="Add concise shared review context for the next clinician."
            />
          </label>

          <div className="patient-handoff-panel__field-grid">
            <label className="form-field">
              <span>Recommended next step</span>
              <select
                value={nextStep}
                disabled={isEditorDisabled}
                onChange={(event) => {
                  setNextStep(event.target.value as ClinicianCoordinationDraftNextStep);
                  setHandoffNotice(null);
                  setHandoffError(null);
                }}
              >
                {CLINICIAN_COORDINATION_NEXT_STEP_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Follow-up owner</span>
              <select
                value={ownerKind}
                disabled={isEditorDisabled}
                onChange={(event) => {
                  setOwnerKind(event.target.value as ClinicianCoordinationDraftFollowUpOwnerKind);
                  setHandoffNotice(null);
                  setHandoffError(null);
                }}
              >
                <option value="unassigned">Unassigned</option>
                <option value="clinician">Use clinician identity</option>
                <option value="custom">Custom label</option>
              </select>
            </label>
          </div>

          {ownerKind === 'clinician' ? (
            <div className="patient-handoff-panel__helper" role="note">
              <strong>{clinicianIdentity.displayName}</strong>
              {clinicianIdentity.secondaryLine ? (
                <span>{clinicianIdentity.secondaryLine}</span>
              ) : null}
            </div>
          ) : null}

          {ownerKind === 'custom' ? (
            <label className="form-field">
              <span>Custom owner label</span>
              <input
                type="text"
                value={customOwnerLabel}
                maxLength={PATIENT_HANDOFF_LIMITS.ownerLabel}
                disabled={isEditorDisabled}
                onChange={(event) => {
                  setCustomOwnerLabel(event.target.value);
                  setHandoffNotice(null);
                  setHandoffError(null);
                }}
                placeholder="Examples: Weekend review desk, Coverage clinician"
              />
            </label>
          ) : null}

          {handoffError ? (
            <p className="patient-handoff-panel__feedback patient-handoff-panel__feedback--error" role="alert">
              {handoffError}
            </p>
          ) : null}
          {handoffNotice ? (
            <p className="patient-handoff-panel__feedback patient-handoff-panel__feedback--success" role="status">
              {handoffNotice}
            </p>
          ) : null}

          <div className="patient-handoff-panel__form-footer">
            <p className="muted-text">
              Leaving summary empty, next step on Continue monitoring, and owner unassigned clears only the current shared handoff.
            </p>
            <Button type="submit" variant="primary" size="sm" disabled={isEditorDisabled}>
              {saveCurrentHandoffMutation.isPending ? 'Saving...' : 'Save shared handoff'}
            </Button>
          </div>
        </form>

        <form className="patient-handoff-panel__notes" onSubmit={handleAddNote}>
          <div className="patient-handoff-panel__form-heading">
            <div>
              <p className="patient-handoff-panel__form-eyebrow">Shared coordination notes</p>
              <h3 className="patient-handoff-panel__form-title">Compact review notes</h3>
            </div>
            <span className="muted-text">Plain text only.</span>
          </div>

          <label className="form-field">
            <span>Add shared note</span>
            <textarea
              ref={noteFieldRef}
              rows={3}
              maxLength={PATIENT_HANDOFF_LIMITS.note}
              value={noteDraft}
              disabled={isEditorDisabled}
              onChange={(event) => {
                setNoteDraft(event.target.value);
                setNoteNotice(null);
                setNoteError(null);
              }}
              placeholder="Add a short shared coordination note for this patient."
            />
          </label>

          {noteError ? (
            <p className="patient-handoff-panel__feedback patient-handoff-panel__feedback--error" role="alert">
              {noteError}
            </p>
          ) : null}
          {noteNotice ? (
            <p className="patient-handoff-panel__feedback patient-handoff-panel__feedback--success" role="status">
              {noteNotice}
            </p>
          ) : null}

          <div className="patient-handoff-panel__form-footer">
            <p className="muted-text">
              Notes are shared with the care team and keep original authorship snapshots.
            </p>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={isEditorDisabled || noteDraft.trim().length === 0}
            >
              {appendNoteMutation.isPending ? 'Adding...' : 'Add shared note'}
            </Button>
          </div>
        </form>

        {notes.length > 0 ? (
          <section className="patient-handoff-panel__notes-list" aria-label="Shared coordination note history">
            <div className="patient-handoff-panel__form-heading">
              <div>
                <p className="patient-handoff-panel__form-eyebrow">Recent coordination notes</p>
                <h3 className="patient-handoff-panel__form-title">Shared note history</h3>
              </div>
              <span className="muted-text">
                Showing the {notes.length} most recent {notes.length === 1 ? 'note' : 'notes'}.
              </span>
            </div>
            <div className="patient-handoff-panel__note-list" role="list">
              {notes.map((note) => (
                <article key={note.id} className="patient-handoff-panel__note-item" role="listitem">
                  <div className="patient-handoff-panel__attribution">
                    <ClinicianAvatar
                      identity={{
                        displayName: note.createdBy.displayName,
                        initials: getClinicianInitials(
                          note.createdBy.displayName,
                          note.createdBy.clinicianId,
                        ),
                        photo: null,
                      }}
                      decorative
                      size="sm"
                    />
                    <div className="patient-handoff-panel__attribution-copy">
                      <strong>{note.createdBy.displayName}</strong>
                      <span>Shared coordination note</span>
                    </div>
                  </div>
                  <time
                    className="patient-handoff-panel__note-time"
                    dateTime={note.createdAt}
                    title={formatDashboardDateTime(note.createdAt)}
                  >
                    {formatDashboardRelativeTime(note.createdAt)}
                  </time>
                  <p className="patient-handoff-panel__note-text">{note.text}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </Card>
  );
}
