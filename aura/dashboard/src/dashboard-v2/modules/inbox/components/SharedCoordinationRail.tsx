import { AlertTriangle, Bot, ShieldCheck } from 'lucide-react';
import type { DashboardV2MetadataItem } from '../../../patterns/MetadataList';
import { DashboardV2MetadataList } from '../../../patterns/MetadataList';
import { DashboardV2ProvenanceBadge } from '../../../patterns/ProvenanceBadge';
import type { InboxSupportVm } from '../../../adapters/communication';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Textarea } from '../../../primitives/Textarea';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface SharedCoordinationRailProps {
  support: InboxSupportVm;
  coordinationLoading: boolean;
  coordinationError: string | null;
  sharedNoteDraft: string;
  sharedNoteNotice: string | null;
  sharedNoteError: string | null;
  sharedNotePending: boolean;
  onSharedNoteChange: (value: string) => void;
  onSubmitSharedNote: (event?: React.FormEvent<HTMLFormElement>) => void;
  onOpenStructuredCoordination: () => void;
  onOpenExplanation: () => void;
}

interface WorkflowSectionProps {
  support: InboxSupportVm;
}

interface ReferenceSectionProps {
  support: InboxSupportVm;
  onOpenExplanation: () => void;
}

function toMetadataItems(items: DashboardV2MetadataItem[]): DashboardV2MetadataItem[] {
  return items;
}

export function InboxSharedCoordinationSection({
  support,
  coordinationLoading,
  coordinationError,
  sharedNoteDraft,
  sharedNoteNotice,
  sharedNoteError,
  sharedNotePending,
  onSharedNoteChange,
  onSubmitSharedNote,
  onOpenStructuredCoordination,
  onOpenExplanation,
}: SharedCoordinationRailProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-inbox-support-card" tone="base">
      <div className="v2-inbox-section-heading">
        <DashboardV2Text tone="label">Shared coordination</DashboardV2Text>
        <DashboardV2Heading as="h3">Team-visible context</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Shared coordination stays separate from the patient timeline and your local draft.
        </DashboardV2Text>
      </div>

      <div className="v2-inbox-support-card__badges" aria-label="Provenance sources">
        {support.provenance.map((source) => (
          <DashboardV2ProvenanceBadge key={source} source={source} />
        ))}
      </div>

      <DashboardV2MetadataList items={toMetadataItems(support.governanceFacts)} />

      {support.responseStateNote ? (
        <DashboardV2Badge tone="warning">{support.responseStateNote}</DashboardV2Badge>
      ) : null}
      {support.thresholdContext ? (
        <DashboardV2Badge tone="neutral">{support.thresholdContext}</DashboardV2Badge>
      ) : null}

      <div className="v2-inbox-support-card__actions">
        <DashboardV2Badge tone="info" icon={ShieldCheck}>
          Explicit responsibility boundaries
        </DashboardV2Badge>
        <DashboardV2Button
          tone="secondary"
          size="sm"
          onPress={onOpenExplanation}
          leadingIcon={<Bot size={16} />}
        >
          Open explanation
        </DashboardV2Button>
      </div>

      <div className="v2-inbox-support-snapshot">
        <DashboardV2Text tone="label">{support.sharedCoordination.statusEyebrow}</DashboardV2Text>
        <DashboardV2Text tone="strong">{support.sharedCoordination.summary}</DashboardV2Text>
        <DashboardV2Text tone="muted">{support.sharedCoordination.note}</DashboardV2Text>
        {support.sharedCoordination.facts.length > 0 ? (
          <DashboardV2MetadataList items={toMetadataItems(support.sharedCoordination.facts)} />
        ) : null}
      </div>

      <div className="v2-inbox-support-card__actions">
        <DashboardV2Button tone="secondary" size="sm" onPress={onOpenStructuredCoordination}>
          Open structured coordination
        </DashboardV2Button>
      </div>

      {coordinationLoading ? (
        <div className="v2-inbox-support-card__loading" aria-label="Shared coordination loading">
          <div className="v2-inbox-skeleton v2-inbox-skeleton--panel" />
        </div>
      ) : coordinationError ? (
        <DashboardV2Surface className="v2-inbox-support-card__error" tone="muted">
          <AlertTriangle size={16} />
          <DashboardV2Text tone="muted">{coordinationError}</DashboardV2Text>
          <DashboardV2Text tone="muted">
            Personal reply drafts stay local to this browser while shared coordination reloads.
          </DashboardV2Text>
        </DashboardV2Surface>
      ) : null}

      <form
        className="v2-inbox-shared-note-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitSharedNote(event);
        }}
      >
        <DashboardV2Textarea
          label="Add shared coordination note"
          rows={3}
          placeholder="Add a short shared coordination note for the care team."
          value={sharedNoteDraft}
          onChange={(event) => onSharedNoteChange(event.currentTarget.value)}
          isDisabled={sharedNotePending}
        />
        {sharedNoteError ? (
          <DashboardV2Text tone="muted" role="alert">
            {sharedNoteError}
          </DashboardV2Text>
        ) : null}
        {sharedNoteNotice ? (
          <DashboardV2Text tone="muted" role="status">
            {sharedNoteNotice}
          </DashboardV2Text>
        ) : null}
        <div className="v2-inbox-shared-note-form__footer">
          <DashboardV2Text tone="muted">
            Adds to shared coordination history in Aura. It does not send a patient message or change your personal reply draft.
          </DashboardV2Text>
          <DashboardV2Button
            tone="primary"
            size="sm"
            type="submit"
            isDisabled={sharedNotePending || sharedNoteDraft.trim().length === 0}
          >
            {sharedNotePending ? 'Adding...' : 'Add shared note'}
          </DashboardV2Button>
        </div>
      </form>

      {support.sharedCoordination.notes.length > 0 ? (
        <div className="v2-inbox-shared-note-history">
          <DashboardV2Text tone="label">Recent shared note history</DashboardV2Text>
          <div className="v2-inbox-shared-note-history__list" role="list" aria-label="Recent shared coordination notes">
            {support.sharedCoordination.notes.map((note) => (
              <article key={note.id} className="v2-inbox-shared-note-history__item" role="listitem">
                <div className="v2-inbox-shared-note-history__meta">
                  <DashboardV2Text tone="strong">{note.authorLabel}</DashboardV2Text>
                  <DashboardV2Text tone="muted" title={note.timestampTitle}>
                    {note.timestampLabel}
                  </DashboardV2Text>
                </div>
                <DashboardV2Text>{note.text}</DashboardV2Text>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </DashboardV2Surface>
  );
}

export function InboxWorkflowSection({ support }: WorkflowSectionProps): JSX.Element {
  const { linkedTask, latestActivity } = support.workflow;

  return (
    <DashboardV2Surface className="v2-inbox-support-card" tone="base">
      <div className="v2-inbox-section-heading">
        <DashboardV2Text tone="label">Workflow context</DashboardV2Text>
        <DashboardV2Heading as="h3">Linked workflow</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Read-only workflow references stay visible here without changing your local draft.
        </DashboardV2Text>
      </div>

      <div className="v2-inbox-support-snapshot">
        <DashboardV2Text tone="strong">{linkedTask.title}</DashboardV2Text>
        <DashboardV2Text tone="muted">{linkedTask.subtitle}</DashboardV2Text>
        {linkedTask.facts.length > 0 ? (
          <DashboardV2MetadataList items={toMetadataItems(linkedTask.facts)} />
        ) : null}
      </div>

      <div className="v2-inbox-support-snapshot">
        <DashboardV2Text tone="label">Latest shared activity</DashboardV2Text>
        {latestActivity ? (
          <>
            <DashboardV2Text tone="strong">{latestActivity.title}</DashboardV2Text>
            <DashboardV2Text tone="muted">{latestActivity.subtitle}</DashboardV2Text>
            <DashboardV2Text tone="muted" title={latestActivity.timestampTitle}>
              {latestActivity.timestampLabel}
            </DashboardV2Text>
            <DashboardV2Text>{latestActivity.text}</DashboardV2Text>
          </>
        ) : (
          <>
            <DashboardV2Text tone="strong">No shared activity yet.</DashboardV2Text>
            <DashboardV2Text tone="muted">
              Shared activity appears here after the care team saves a handoff or appends a note.
            </DashboardV2Text>
          </>
        )}
      </div>
    </DashboardV2Surface>
  );
}

export function InboxReferenceSection({
  support,
  onOpenExplanation,
}: ReferenceSectionProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-inbox-support-card" tone="muted">
      <div className="v2-inbox-section-heading">
        <DashboardV2Text tone="label">Reference / help</DashboardV2Text>
        <DashboardV2Heading as="h3">Thread boundaries</DashboardV2Heading>
      </div>
      <DashboardV2Text>{support.reference.summary}</DashboardV2Text>
      <DashboardV2Text tone="muted">{support.reference.note}</DashboardV2Text>
      <DashboardV2Text tone="muted">{support.reference.caution}</DashboardV2Text>
      <div className="v2-inbox-support-card__actions">
        <DashboardV2Button tone="secondary" size="sm" onPress={onOpenExplanation}>
          Review explanation
        </DashboardV2Button>
      </div>
    </DashboardV2Surface>
  );
}

export function SharedCoordinationRail(
  props: SharedCoordinationRailProps,
): JSX.Element {
  return (
    <div className="v2-inbox-support-rail" data-testid="v2-inbox-support-rail">
      <InboxSharedCoordinationSection {...props} />
      <InboxWorkflowSection support={props.support} />
      <InboxReferenceSection support={props.support} onOpenExplanation={props.onOpenExplanation} />
    </div>
  );
}
