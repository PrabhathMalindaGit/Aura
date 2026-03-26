import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ClinicianAvatar } from '../ui/ClinicianAvatar';
import { EmptyState } from '../ui/EmptyState';
import { useClinicianIdentity } from '../../hooks/useClinicianIdentity';
import { usePatientHandoff } from '../../hooks/usePatientHandoff';
import {
  PATIENT_HANDOFF_LIMITS,
  PATIENT_HANDOFF_NEXT_ACTION_OPTIONS,
  addPatientHandoffNote,
  getLatestPatientHandoffNote,
  getPatientHandoffFollowUpOwnerLabel,
  getPatientHandoffNextActionLabel,
  savePatientCurrentHandoff,
  type PatientHandoffAuthorSnapshot,
  type PatientHandoffFollowUpOwner,
  type PatientHandoffNextAction,
} from '../../services/patientHandoffWorkspace';
import {
  buildClinicianSecondaryLine,
  getClinicianInitials,
} from '../../services/clinicianIdentity';
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../../utils/dashboard';

interface PatientHandoffPanelProps {
  patientId: string;
  onOpenNextAction: (action: Exclude<PatientHandoffNextAction, ''>) => void;
}

type FollowUpOwnerDraftKind = 'unassigned' | 'self' | 'custom';

function getAuthorSecondaryLine(author: PatientHandoffAuthorSnapshot): string {
  return buildClinicianSecondaryLine(author.authorRoleTitle, author.authorSpecialty);
}

function getActionButtonLabel(action: Exclude<PatientHandoffNextAction, ''>): string {
  if (action === 'plan') {
    return 'Open plan';
  }

  if (action === 'appointments') {
    return 'Open appointments';
  }

  if (action === 'communication') {
    return 'Open communication';
  }

  if (action === 'alerts') {
    return 'Review alerts';
  }

  return 'Review tasks';
}

export function PatientHandoffPanel({
  patientId,
  onOpenNextAction,
}: PatientHandoffPanelProps): JSX.Element {
  const handoffRecord = usePatientHandoff(patientId);
  const clinicianIdentity = useClinicianIdentity();
  const [summary, setSummary] = useState('');
  const [nextAction, setNextAction] = useState<PatientHandoffNextAction>('');
  const [ownerKind, setOwnerKind] = useState<FollowUpOwnerDraftKind>('unassigned');
  const [customOwnerLabel, setCustomOwnerLabel] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [noteNotice, setNoteNotice] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const currentHandoff = handoffRecord?.currentHandoff;
  const notes = handoffRecord?.notes ?? [];
  const latestNote = useMemo(() => getLatestPatientHandoffNote(handoffRecord), [handoffRecord]);

  useEffect(() => {
    setSummary(currentHandoff?.summary ?? '');
    setNextAction(currentHandoff?.nextAction ?? '');
    setOwnerKind(currentHandoff?.followUpOwner.kind ?? 'unassigned');
    setCustomOwnerLabel(
      currentHandoff?.followUpOwner.kind === 'custom' ? currentHandoff.followUpOwner.label : '',
    );
  }, [currentHandoff]);

  const hasAnyHandoffContext = Boolean(currentHandoff || latestNote);

  function buildDraftOwner(): PatientHandoffFollowUpOwner {
    if (ownerKind === 'self') {
      return {
        kind: 'self',
        clinicianId: clinicianIdentity.clinicianId,
        authorDisplayName: clinicianIdentity.displayName,
        authorRoleTitle: clinicianIdentity.roleTitle || undefined,
        authorSpecialty: clinicianIdentity.specialty || undefined,
      };
    }

    if (ownerKind === 'custom') {
      return {
        kind: 'custom',
        label: customOwnerLabel,
      };
    }

    return { kind: 'unassigned' };
  }

  function handleSaveHandoff(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setHandoffNotice(null);
    setHandoffError(null);

    if (ownerKind === 'custom' && customOwnerLabel.trim().length === 0) {
      setHandoffError('Add a custom owner label or switch the follow-up owner to another option.');
      return;
    }

    const savedRecord = savePatientCurrentHandoff(patientId, {
      summary,
      nextAction,
      followUpOwner: buildDraftOwner(),
    });

    if (savedRecord?.currentHandoff) {
      setHandoffNotice('Internal handoff saved in this browser.');
      return;
    }

    setHandoffNotice('Structured handoff cleared for this patient in this browser.');
  }

  function handleAddNote(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setNoteNotice(null);
    setNoteError(null);

    if (noteDraft.trim().length === 0) {
      setNoteError('Add a short internal note before saving.');
      return;
    }

    addPatientHandoffNote(patientId, noteDraft);
    setNoteDraft('');
    setNoteNotice('Internal note saved in this browser.');
  }

  return (
    <Card
      id="patient-handoff-panel"
      className="patient-detail-panel patient-detail-panel--operational patient-handoff-panel"
      title="Internal notes and handoff"
      data-testid="patient-handoff-panel"
    >
      <div className="patient-handoff-panel__body">
        {!hasAnyHandoffContext ? (
          <EmptyState
            title="No internal handoff saved yet"
            description="Capture a concise review summary, next step, or local note for this patient when handoff context would help the next review on this browser."
            tone="neutral"
          />
        ) : null}

        {currentHandoff ? (
          <section
            className="patient-handoff-panel__current"
            aria-label="Saved internal handoff"
            data-testid="patient-handoff-current"
          >
            <div className="patient-handoff-panel__current-copy">
              <div className="patient-handoff-panel__current-meta">
                <Badge variant="neutral">Internal handoff</Badge>
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
                  No summary saved. Use the current handoff fields below when the next reviewer needs more direction.
                </p>
              )}
              <dl className="patient-handoff-panel__current-facts">
                <div>
                  <dt>Next step</dt>
                  <dd>{getPatientHandoffNextActionLabel(currentHandoff.nextAction)}</dd>
                </div>
                <div>
                  <dt>Follow-up owner</dt>
                  <dd>{getPatientHandoffFollowUpOwnerLabel(currentHandoff.followUpOwner)}</dd>
                </div>
              </dl>
            </div>
            <div className="patient-handoff-panel__current-side">
              <div className="patient-handoff-panel__attribution">
                <ClinicianAvatar
                  identity={{
                    displayName: currentHandoff.updatedBy.authorDisplayName,
                    initials: getClinicianInitials(
                      currentHandoff.updatedBy.authorDisplayName,
                      currentHandoff.updatedBy.clinicianId,
                    ),
                    photo: null,
                  }}
                  decorative
                  size="sm"
                />
                <div className="patient-handoff-panel__attribution-copy">
                  <strong>{currentHandoff.updatedBy.authorDisplayName}</strong>
                  {getAuthorSecondaryLine(currentHandoff.updatedBy) ? (
                    <span>{getAuthorSecondaryLine(currentHandoff.updatedBy)}</span>
                  ) : null}
                </div>
              </div>
              {currentHandoff.nextAction ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpenNextAction(currentHandoff.nextAction as Exclude<PatientHandoffNextAction, ''>)}
                >
                  {getActionButtonLabel(currentHandoff.nextAction as Exclude<PatientHandoffNextAction, ''>)}
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="patient-handoff-panel__scope-note" aria-label="Local handoff storage note">
          <div className="patient-handoff-panel__scope-copy">
            <p className="patient-handoff-panel__scope-eyebrow">Browser-local workspace context</p>
            <p className="patient-handoff-panel__scope-text">
              Stored only in this browser for local patient handoff continuity. It is not synced across devices or staff accounts.
            </p>
          </div>
          <div className="patient-handoff-panel__scope-facts" aria-live="polite">
            <span className="patient-handoff-panel__scope-fact">
              {currentHandoff ? 'Structured handoff saved' : 'No current structured handoff'}
            </span>
            <span className="patient-handoff-panel__scope-fact">
              {notes.length} {notes.length === 1 ? 'internal note' : 'internal notes'}
            </span>
          </div>
        </section>

        <form className="patient-handoff-panel__form" onSubmit={handleSaveHandoff}>
          <div className="patient-handoff-panel__form-heading">
            <div>
              <p className="patient-handoff-panel__form-eyebrow">Structured handoff</p>
              <h3 className="patient-handoff-panel__form-title">Current review context</h3>
            </div>
            <span className="muted-text">Keep this short and operational.</span>
          </div>

          <label className="form-field">
            <span>Handoff summary</span>
            <textarea
              name="handoff-summary"
              rows={4}
              maxLength={PATIENT_HANDOFF_LIMITS.summary}
              value={summary}
              onChange={(event) => {
                setSummary(event.target.value);
                setHandoffNotice(null);
                setHandoffError(null);
              }}
              placeholder="Add concise internal review context for the next clinician working in this browser."
            />
          </label>

          <div className="patient-handoff-panel__field-grid">
            <label className="form-field">
              <span>Recommended next step</span>
              <select
                value={nextAction}
                onChange={(event) => {
                  setNextAction(event.target.value as PatientHandoffNextAction);
                  setHandoffNotice(null);
                  setHandoffError(null);
                }}
              >
                {PATIENT_HANDOFF_NEXT_ACTION_OPTIONS.map((option) => (
                  <option key={option.id || 'monitoring'} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Follow-up owner</span>
              <select
                value={ownerKind}
                onChange={(event) => {
                  setOwnerKind(event.target.value as FollowUpOwnerDraftKind);
                  setHandoffNotice(null);
                  setHandoffError(null);
                }}
              >
                <option value="unassigned">Unassigned</option>
                <option value="self">Use clinician identity</option>
                <option value="custom">Custom label</option>
              </select>
            </label>
          </div>

          {ownerKind === 'self' ? (
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
              Leaving summary empty, next step on continue monitoring, and owner unassigned clears only the current structured handoff.
            </p>
            <Button type="submit" variant="primary" size="sm">
              Save handoff
            </Button>
          </div>
        </form>

        <form className="patient-handoff-panel__notes" onSubmit={handleAddNote}>
          <div className="patient-handoff-panel__form-heading">
            <div>
              <p className="patient-handoff-panel__form-eyebrow">Internal notes</p>
              <h3 className="patient-handoff-panel__form-title">Compact review notes</h3>
            </div>
            <span className="muted-text">Plain text only.</span>
          </div>

          <label className="form-field">
            <span>Add internal note</span>
            <textarea
              rows={3}
              maxLength={PATIENT_HANDOFF_LIMITS.note}
              value={noteDraft}
              onChange={(event) => {
                setNoteDraft(event.target.value);
                setNoteNotice(null);
                setNoteError(null);
              }}
              placeholder="Add a short internal review note for this patient."
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
              Notes stay local to this browser and keep the saved author label from when they were added.
            </p>
            <Button type="submit" variant="secondary" size="sm" disabled={noteDraft.trim().length === 0}>
              Add note
            </Button>
          </div>
        </form>

        {notes.length > 0 ? (
          <section className="patient-handoff-panel__notes-list" aria-label="Internal clinician notes">
            <div className="patient-handoff-panel__form-heading">
              <div>
                <p className="patient-handoff-panel__form-eyebrow">Recent notes</p>
                <h3 className="patient-handoff-panel__form-title">Browser-local note history</h3>
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
                        displayName: note.createdBy.authorDisplayName,
                        initials: getClinicianInitials(
                          note.createdBy.authorDisplayName,
                          note.createdBy.clinicianId,
                        ),
                        photo: null,
                      }}
                      decorative
                      size="sm"
                    />
                    <div className="patient-handoff-panel__attribution-copy">
                      <strong>{note.createdBy.authorDisplayName}</strong>
                      {getAuthorSecondaryLine(note.createdBy) ? (
                        <span>{getAuthorSecondaryLine(note.createdBy)}</span>
                      ) : null}
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
