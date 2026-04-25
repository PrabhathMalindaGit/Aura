import { PenLine, Plus } from "lucide-react";
import { DashboardV2Button } from "../../../primitives/Button";
import { DashboardV2Disclosure } from "../../../primitives/Disclosure";
import { DashboardV2Surface } from "../../../primitives/Surface";
import { DashboardV2Heading, DashboardV2Text } from "../../../primitives/Text";
import {
  CLINICIAN_COMMUNICATION_AUTHORING_LIMITS,
  type SettingsCommunicationSectionVm,
} from "../useSettingsViewModel";

interface SettingsCommunicationSectionProps {
  communicationSection: SettingsCommunicationSectionVm;
  isVeryNarrow: boolean;
}

export function SettingsCommunicationSection({
  communicationSection,
  isVeryNarrow,
}: SettingsCommunicationSectionProps): JSX.Element {
  const templateLimitReached =
    communicationSection.draft.templates.length >=
    CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templates;

  return (
    <DashboardV2Surface
      className="v2-settings-section v2-settings-section--communication"
      tone="elevated"
      data-testid="v2-settings-communication-section"
    >
      <div className="v2-settings-section__header">
        <div className="v2-settings-section__title-copy">
          <DashboardV2Text tone="label">Primary settings</DashboardV2Text>
          <DashboardV2Heading as="h2">Communication authoring</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            Signature and reply starters stay saved on this device.
          </DashboardV2Text>
        </div>
      </div>

      <div className="v2-settings-chip-row" aria-live="polite">
        {communicationSection.summaryFacts.map((fact) => (
          <span key={fact} className="v2-settings-chip">
            {fact}
          </span>
        ))}
      </div>

      <div className="v2-settings-list v2-settings-list--split">
        <label className="v2-settings-row v2-settings-row--textarea" htmlFor="v2-default-signature">
          <span className="v2-settings-row__copy">
            <span className="v2-settings-row__label">Signature</span>
            <span className="v2-settings-row__helper">
              Plain text only.
            </span>
          </span>
          <textarea
            id="v2-default-signature"
            aria-label="Default signature"
            value={communicationSection.draft.defaultSignature}
            maxLength={CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.signature}
            onChange={(event) =>
              communicationSection.onSignatureChange(event.target.value)
            }
          />
        </label>

        <label className="v2-settings-row v2-settings-row--toggle" htmlFor="v2-auto-append-signature">
          <span className="v2-settings-row__copy">
            <span className="v2-settings-row__label">
              Auto-append signature on fresh Communication drafts
            </span>
            <span className="v2-settings-row__helper">
              Applies only when a thread opens with an empty draft.
            </span>
          </span>
          <input
            id="v2-auto-append-signature"
            type="checkbox"
            checked={communicationSection.draft.autoAppendSignature}
            onChange={(event) =>
              communicationSection.onAutoAppendChange(event.target.checked)
            }
          />
        </label>
      </div>

      <div className="v2-settings-subsection">
        <div className="v2-settings-subsection__header v2-settings-subsection__header--actions">
          <div>
            <DashboardV2Text as="strong" tone="strong">
              Saved templates
            </DashboardV2Text>
            <DashboardV2Text tone="muted">
              Keep only the reply starters you actually reuse.
            </DashboardV2Text>
          </div>
          <DashboardV2Button
            tone="secondary"
            size="sm"
            leadingIcon={<Plus size={16} />}
            onPress={communicationSection.onAddTemplate}
            isDisabled={templateLimitReached}
          >
            Add template
          </DashboardV2Button>
        </div>

        {communicationSection.draft.templates.length === 0 ? (
          <DashboardV2Text tone="muted">
            No saved templates yet. Add only the reply starters you actually
            reuse here.
          </DashboardV2Text>
        ) : (
          <div className="v2-settings-template-list" aria-label="Communication templates">
            {communicationSection.draft.templates.map((template, index) => {
              const titleId = `v2-template-title-${template.id}`;
              const bodyId = `v2-template-body-${template.id}`;
              const templateValidation =
                communicationSection.templateValidation?.[index];
              const summary =
                template.title.trim() || `Template ${index + 1}`;

              const editor = (
                <div
                  className="v2-settings-template-editor"
                  data-testid={`v2-settings-template-${template.id}`}
                >
                  <div className="v2-settings-template-editor__toolbar">
                    <div>
                      <DashboardV2Text tone="label">{`Template ${index + 1}`}</DashboardV2Text>
                      <DashboardV2Text tone="muted">{summary}</DashboardV2Text>
                    </div>
                    <DashboardV2Button
                      tone="ghost"
                      size="sm"
                      onPress={() =>
                        communicationSection.onRemoveTemplate(template.id)
                      }
                    >
                      Remove template
                    </DashboardV2Button>
                  </div>

                  <label className="v2-settings-template-editor__field" htmlFor={titleId}>
                    <span>
                      <strong>Title</strong>
                      <small>
                        {templateValidation?.title ?? "Short internal label."}
                      </small>
                    </span>
                    <input
                      id={titleId}
                      type="text"
                      aria-label={`Template ${index + 1} title`}
                      value={template.title}
                      maxLength={CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templateTitle}
                      onChange={(event) =>
                        communicationSection.onTemplateFieldChange(
                          template.id,
                          "title",
                          event.target.value,
                        )
                      }
                    />
                  </label>

                  <label className="v2-settings-template-editor__field" htmlFor={bodyId}>
                    <span>
                      <strong>Body</strong>
                      <small>
                        {templateValidation?.body ??
                          "Short reply starter for this browser only."}
                      </small>
                    </span>
                    <textarea
                      id={bodyId}
                      aria-label={`Template ${index + 1} body`}
                      value={template.body}
                      maxLength={CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templateBody}
                      onChange={(event) =>
                        communicationSection.onTemplateFieldChange(
                          template.id,
                          "body",
                          event.target.value,
                        )
                      }
                    />
                  </label>
                </div>
              );

              if (isVeryNarrow) {
                return (
                  <DashboardV2Disclosure
                    key={template.id}
                    title={`Template ${index + 1}`}
                    summary={summary}
                    defaultExpanded={index === 0}
                    className="v2-settings-template-disclosure"
                  >
                    {editor}
                  </DashboardV2Disclosure>
                );
              }

              return (
                <article key={template.id} className="v2-settings-template-card">
                  {editor}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="v2-settings-section__footer">
        <DashboardV2Text tone="muted">
          Signature and saved templates remain saved on this device.
        </DashboardV2Text>
        <DashboardV2Button
          onPress={communicationSection.onSave}
          isDisabled={!communicationSection.dirty}
          leadingIcon={<PenLine size={16} />}
        >
          Save communication settings
        </DashboardV2Button>
      </div>

      {communicationSection.error ? (
        <DashboardV2Text
          className="v2-settings-notice v2-settings-notice--error"
          role="alert"
        >
          {communicationSection.error}
        </DashboardV2Text>
      ) : null}

      {communicationSection.notice ? (
        <DashboardV2Text className="v2-settings-notice" role="status">
          {communicationSection.notice}
        </DashboardV2Text>
      ) : null}
    </DashboardV2Surface>
  );
}
