import type {
  ClinicianCoordinationAuthorSnapshot,
  ClinicianCoordinationFollowUpOwner,
  ClinicianCoordinationNextStep,
  ClinicianCoordinationNoteItem,
  ClinicianCoordinationRecord,
} from '../types/models';
import { parseIsoToMs } from './date';

export type ClinicianCoordinationDraftNextStep = ClinicianCoordinationNextStep | '';
export type ClinicianCoordinationDraftFollowUpOwnerKind =
  | 'unassigned'
  | 'clinician'
  | 'custom';

export type ClinicianCoordinationLatestActivityKind = 'handoff' | 'note';

export interface ClinicianCoordinationLatestActivity {
  kind: ClinicianCoordinationLatestActivityKind;
  label: string;
  author: ClinicianCoordinationAuthorSnapshot;
  timestamp: string;
  text: string;
}

export const CLINICIAN_COORDINATION_NEXT_STEP_OPTIONS: Array<{
  id: ClinicianCoordinationNextStep;
  label: string;
}> = [
  { id: 'monitoring', label: 'Continue monitoring' },
  { id: 'alerts', label: 'Review alerts' },
  { id: 'communication', label: 'Review communication' },
  { id: 'tasks', label: 'Review tasks' },
  { id: 'appointments', label: 'Review appointments' },
  { id: 'plan', label: 'Open plan' },
];

export function toClinicianCoordinationNextStep(
  value: ClinicianCoordinationDraftNextStep,
): ClinicianCoordinationNextStep {
  return value === '' ? 'monitoring' : value;
}

export function buildClinicianCoordinationFollowUpOwner(input: {
  kind: ClinicianCoordinationDraftFollowUpOwnerKind;
  clinicianId?: string;
  displayName?: string;
  label?: string;
}): ClinicianCoordinationFollowUpOwner {
  if (input.kind === 'clinician') {
    const clinicianId = input.clinicianId?.trim() ?? '';
    const displayName = input.displayName?.trim() ?? '';

    if (clinicianId && displayName) {
      return {
        kind: 'clinician',
        clinicianId,
        displayName,
      };
    }
  }

  if (input.kind === 'custom') {
    const label = input.label?.trim() ?? '';
    if (label) {
      return {
        kind: 'custom',
        label,
      };
    }
  }

  return { kind: 'unassigned' };
}

export function getClinicianCoordinationNextStepLabel(
  nextStep: ClinicianCoordinationNextStep | null | undefined,
): string {
  return (
    CLINICIAN_COORDINATION_NEXT_STEP_OPTIONS.find((option) => option.id === nextStep)?.label ??
    CLINICIAN_COORDINATION_NEXT_STEP_OPTIONS[0].label
  );
}

export function getClinicianCoordinationActionButtonLabel(
  nextStep: Exclude<ClinicianCoordinationNextStep, 'monitoring'>,
): string {
  if (nextStep === 'plan') {
    return 'Open plan';
  }

  if (nextStep === 'appointments') {
    return 'Open appointments';
  }

  if (nextStep === 'communication') {
    return 'Open communication';
  }

  if (nextStep === 'alerts') {
    return 'Review alerts';
  }

  return 'Review tasks';
}

export function getClinicianCoordinationFollowUpOwnerLabel(
  owner: ClinicianCoordinationFollowUpOwner | null | undefined,
): string {
  if (!owner || owner.kind === 'unassigned') {
    return 'Unassigned';
  }

  if (owner.kind === 'custom') {
    return owner.label;
  }

  return owner.displayName || owner.clinicianId;
}

export function getLatestClinicianCoordinationNote(
  record: ClinicianCoordinationRecord | null | undefined,
): ClinicianCoordinationNoteItem | null {
  return record?.noteHistory[0] ?? null;
}

export function getClinicianCoordinationLatestActivity(
  record: ClinicianCoordinationRecord | null | undefined,
): ClinicianCoordinationLatestActivity | null {
  const currentHandoff = record?.currentHandoff ?? null;
  const latestNote = getLatestClinicianCoordinationNote(record);
  const handoffTimestamp = parseIsoToMs(currentHandoff?.updatedAt);
  const latestNoteTimestamp = parseIsoToMs(latestNote?.createdAt);

  if (currentHandoff && handoffTimestamp !== null) {
    if (latestNoteTimestamp === null || handoffTimestamp >= latestNoteTimestamp) {
      return {
        kind: 'handoff',
        label: 'Current shared handoff updated',
        author: currentHandoff.updatedBy,
        timestamp: currentHandoff.updatedAt,
        text: currentHandoff.summary,
      };
    }
  }

  if (latestNote && latestNoteTimestamp !== null) {
    return {
      kind: 'note',
      label: 'Shared coordination note added',
      author: latestNote.createdBy,
      timestamp: latestNote.createdAt,
      text: latestNote.text,
    };
  }

  if (!currentHandoff) {
    return null;
  }

  return {
    kind: 'handoff',
    label: 'Current shared handoff updated',
    author: currentHandoff.updatedBy,
    timestamp: currentHandoff.updatedAt,
    text: currentHandoff.summary,
  };
}
