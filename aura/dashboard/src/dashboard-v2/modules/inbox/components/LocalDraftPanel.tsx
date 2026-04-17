import type { ClinicianIdentity } from '../../../../services/clinicianIdentity';
import type { CommunicationAuthoringSnapshot } from '../../../../services/communicationAuthoring';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Select } from '../../../primitives/Select';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Textarea } from '../../../primitives/Textarea';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface LocalDraftPanelProps {
  clinicianIdentity: ClinicianIdentity;
  authoring: CommunicationAuthoringSnapshot;
  selectedTemplateId: string;
  draftReply: string;
  disabled: boolean;
  onTemplateChange: (value: string) => void;
  onDraftChange: (value: string) => void;
  onInsertTemplate: () => void;
  onInsertSignature: () => void;
  onSaveDraft: () => void;
}

export function LocalDraftPanel({
  clinicianIdentity,
  authoring,
  selectedTemplateId,
  draftReply,
  disabled,
  onTemplateChange,
  onDraftChange,
  onInsertTemplate,
  onInsertSignature,
  onSaveDraft,
}: LocalDraftPanelProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-inbox-draft-panel" tone="elevated">
      <div className="v2-inbox-section-heading">
        <DashboardV2Text tone="label">Primary authoring surface</DashboardV2Text>
        <DashboardV2Heading as="h3">Local private draft</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Private to this browser only. Saving here does not send a patient message or update shared coordination.
        </DashboardV2Text>
      </div>

      <div className="v2-inbox-draft-panel__identity">
        <div>
          <DashboardV2Text tone="label">Local clinician identity</DashboardV2Text>
          <DashboardV2Text tone="strong">{clinicianIdentity.displayName}</DashboardV2Text>
          {clinicianIdentity.secondaryLine ? (
            <DashboardV2Text tone="muted">{clinicianIdentity.secondaryLine}</DashboardV2Text>
          ) : null}
        </div>
        <DashboardV2Badge tone="neutral">Local draft</DashboardV2Badge>
      </div>

      <div className="v2-inbox-draft-panel__toolbar">
        <DashboardV2Select
          label="Quick reply template"
          options={authoring.templates.map((template) => ({
            id: template.id,
            label: template.title,
          }))}
          placeholder={authoring.templates.length === 0 ? 'No saved templates in Settings' : 'Select a template'}
          selectedKey={selectedTemplateId || null}
          onSelectionChange={onTemplateChange}
          isDisabled={authoring.templates.length === 0}
        />
        <div className="v2-inbox-draft-panel__toolbar-actions">
          <DashboardV2Button
            tone="secondary"
            size="sm"
            onPress={onInsertTemplate}
            isDisabled={authoring.templates.length === 0 || !selectedTemplateId}
          >
            Insert template
          </DashboardV2Button>
          <DashboardV2Button
            tone="ghost"
            size="sm"
            onPress={onInsertSignature}
            isDisabled={!authoring.hasSignature}
          >
            Insert signature
          </DashboardV2Button>
        </div>
      </div>

      <DashboardV2Textarea
        label="Personal reply draft"
        rows={4}
        placeholder="Add a calm clinician follow-up note for this patient thread."
        value={draftReply}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        isDisabled={disabled}
      />

      <div className="v2-inbox-draft-panel__actions">
        <DashboardV2Button
          tone="primary"
          onPress={onSaveDraft}
          isDisabled={disabled || draftReply.trim().length === 0}
        >
          Save local reply
        </DashboardV2Button>
      </div>
    </DashboardV2Surface>
  );
}
