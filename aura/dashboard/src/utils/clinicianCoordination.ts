import type {
  ClinicianCoordinationFollowUpOwner,
  ClinicianCoordinationNextStep,
  ClinicianCoordinationNoteItem,
  ClinicianCoordinationRecord,
} from '../types/models';

export type ClinicianCoordinationDraftNextStep = ClinicianCoordinationNextStep | '';
export type ClinicianCoordinationDraftFollowUpOwnerKind =
  | 'unassigned'
  | 'clinician'
  | 'custom';

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
