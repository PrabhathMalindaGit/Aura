import {
  CLINICIAN_COMMUNICATION_AUTHORING_LIMITS,
  getClinicianProfile,
  subscribeClinicianProfile,
  type ClinicianCommunicationAuthoring,
  type ClinicianCommunicationTemplate,
} from './clinicianProfile';

export interface CommunicationAuthoringSnapshot extends ClinicianCommunicationAuthoring {
  hasSignature: boolean;
  templateCount: number;
}

let cachedSnapshot: CommunicationAuthoringSnapshot | null = null;
let cachedSnapshotKey: string | null = null;

function buildSnapshot(
  communicationAuthoring: ClinicianCommunicationAuthoring,
): CommunicationAuthoringSnapshot {
  return {
    ...communicationAuthoring,
    templates: [...communicationAuthoring.templates],
    hasSignature: communicationAuthoring.defaultSignature.length > 0,
    templateCount: communicationAuthoring.templates.length,
  };
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

function normalizeInsertableText(value: string): string {
  return normalizeLineEndings(value)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

function trimDraftEnd(value: string): string {
  return normalizeLineEndings(value)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trimEnd();
}

function joinDraftSections(...sections: string[]): string {
  return sections
    .map((section) => normalizeInsertableText(section))
    .filter(Boolean)
    .join('\n\n');
}

export function getCommunicationAuthoring(): CommunicationAuthoringSnapshot {
  const nextSnapshot = buildSnapshot(getClinicianProfile().communicationAuthoring);
  const snapshotKey = JSON.stringify(nextSnapshot);

  if (cachedSnapshot && cachedSnapshotKey === snapshotKey) {
    return cachedSnapshot;
  }

  cachedSnapshot = nextSnapshot;
  cachedSnapshotKey = snapshotKey;
  return nextSnapshot;
}

export function subscribeCommunicationAuthoring(listener: () => void): () => void {
  return subscribeClinicianProfile(() => {
    getCommunicationAuthoring();
    listener();
  });
}

export function draftEndsWithSignatureBlock(draft: string, signature: string): boolean {
  const normalizedDraft = normalizeInsertableText(draft);
  const normalizedSignature = normalizeInsertableText(signature);

  if (!normalizedDraft || !normalizedSignature) {
    return false;
  }

  return (
    normalizedDraft === normalizedSignature ||
    normalizedDraft.endsWith(`\n\n${normalizedSignature}`)
  );
}

export function insertTemplateIntoDraft(
  draft: string,
  templateBody: string,
  options: {
    signature?: string;
  } = {},
): string {
  const normalizedTemplate = normalizeInsertableText(templateBody);
  const currentDraft = trimDraftEnd(draft);
  const normalizedSignature = normalizeInsertableText(options.signature ?? '');

  if (!normalizedTemplate) {
    return currentDraft;
  }

  if (!normalizeInsertableText(currentDraft)) {
    return normalizedTemplate;
  }

  if (normalizedSignature && normalizeInsertableText(currentDraft) === normalizedSignature) {
    return joinDraftSections(normalizedTemplate, normalizedSignature);
  }

  return joinDraftSections(currentDraft, normalizedTemplate);
}

export function insertSignatureIntoDraft(draft: string, signature: string): string {
  const normalizedSignature = normalizeInsertableText(signature);
  const currentDraft = trimDraftEnd(draft);

  if (!normalizedSignature) {
    return currentDraft;
  }

  if (!normalizeInsertableText(currentDraft)) {
    return normalizedSignature;
  }

  if (draftEndsWithSignatureBlock(currentDraft, normalizedSignature)) {
    return currentDraft;
  }

  return joinDraftSections(currentDraft, normalizedSignature);
}

export function getCommunicationAuthoringTemplateById(
  templateId: string,
): ClinicianCommunicationTemplate | null {
  const normalizedTemplateId = templateId.trim();
  if (!normalizedTemplateId) {
    return null;
  }

  return (
    getCommunicationAuthoring().templates.find((template) => template.id === normalizedTemplateId) ??
    null
  );
}

export { CLINICIAN_COMMUNICATION_AUTHORING_LIMITS };
