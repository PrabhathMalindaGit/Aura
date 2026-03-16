export const SAFE_PATIENT_ENTRY_RETURN_PATHS = [
  '/worklist',
  '/alerts',
  '/patients',
  '/insights',
  '/appointments',
] as const;

const PATIENT_ENTRY_SOURCES = ['worklist', 'alerts', 'patients', 'insights', 'appointments'] as const;
const PATIENT_ENTRY_FOCI = ['workflow', 'alerts', 'roster', 'insights', 'appointments'] as const;

const ALERTS_RETURN_QUERY_KEYS = new Set(['search', 'patientId']);
const PATIENTS_RETURN_QUERY_KEYS = new Set(['search']);

type SafePatientEntryReturnPath = (typeof SAFE_PATIENT_ENTRY_RETURN_PATHS)[number];

export type PatientEntrySource = (typeof PATIENT_ENTRY_SOURCES)[number];
export type PatientEntryFocus = (typeof PATIENT_ENTRY_FOCI)[number];

export interface PatientEntryContext {
  patientId: string;
  source: PatientEntrySource;
  subtype?: string;
  hint?: string;
  focus: PatientEntryFocus;
  returnTo: string;
}

export interface PatientEntryLocationState {
  patientEntryContext?: PatientEntryContext;
}

function normalizeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function isPatientEntrySource(value: unknown): value is PatientEntrySource {
  return typeof value === 'string' && PATIENT_ENTRY_SOURCES.includes(value as PatientEntrySource);
}

function isPatientEntryFocus(value: unknown): value is PatientEntryFocus {
  return typeof value === 'string' && PATIENT_ENTRY_FOCI.includes(value as PatientEntryFocus);
}

function hasOnlyAllowedQueryKeys(
  searchParams: URLSearchParams,
  allowedKeys: Set<string>,
): boolean {
  for (const key of searchParams.keys()) {
    if (!allowedKeys.has(key)) {
      return false;
    }
  }

  return true;
}

export function normalizePatientEntryReturnTo(value: unknown): string {
  if (typeof value !== 'string') {
    return '/patients';
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith('/')) {
    return '/patients';
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, 'https://aura.local');
  } catch {
    return '/patients';
  }

  if (parsed.hash) {
    return '/patients';
  }

  if (!SAFE_PATIENT_ENTRY_RETURN_PATHS.includes(parsed.pathname as SafePatientEntryReturnPath)) {
    return '/patients';
  }

  if (!parsed.search) {
    return parsed.pathname;
  }

  if (parsed.pathname === '/alerts') {
    return hasOnlyAllowedQueryKeys(parsed.searchParams, ALERTS_RETURN_QUERY_KEYS)
      ? `${parsed.pathname}${parsed.search}`
      : '/patients';
  }

  if (parsed.pathname === '/patients') {
    return hasOnlyAllowedQueryKeys(parsed.searchParams, PATIENTS_RETURN_QUERY_KEYS)
      ? `${parsed.pathname}${parsed.search}`
      : '/patients';
  }

  return '/patients';
}

export function buildPatientEntryReturnTo(pathname: string, search: string = ''): string {
  return normalizePatientEntryReturnTo(`${pathname}${search}`);
}

export function createPatientEntryState(
  context: PatientEntryContext,
): PatientEntryLocationState {
  const normalizedPatientId = context.patientId.trim();

  return {
    patientEntryContext: {
      patientId: normalizedPatientId,
      source: context.source,
      subtype: normalizeText(context.subtype, 48),
      hint: normalizeText(context.hint, 64),
      focus: context.focus,
      returnTo: normalizePatientEntryReturnTo(context.returnTo),
    },
  };
}

export function readPatientEntryContextFromState(
  state: unknown,
  patientId: string | undefined,
): PatientEntryContext | null {
  const normalizedPatientId = typeof patientId === 'string' ? patientId.trim() : '';

  if (!normalizedPatientId || !state || typeof state !== 'object' || Array.isArray(state)) {
    return null;
  }

  const candidate = (state as PatientEntryLocationState).patientEntryContext;

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }

  const raw = candidate as Partial<PatientEntryContext>;
  const rawPatientId = typeof raw.patientId === 'string' ? raw.patientId.trim() : '';

  if (rawPatientId !== normalizedPatientId) {
    return null;
  }

  if (!isPatientEntrySource(raw.source) || !isPatientEntryFocus(raw.focus)) {
    return null;
  }

  return {
    patientId: rawPatientId,
    source: raw.source,
    subtype: normalizeText(raw.subtype, 48),
    hint: normalizeText(raw.hint, 96),
    focus: raw.focus,
    returnTo: normalizePatientEntryReturnTo(raw.returnTo),
  };
}

export function formatPatientEntrySourceCue(source: PatientEntrySource): string {
  if (source === 'alerts') {
    return 'Opened from Alerts';
  }

  if (source === 'patients') {
    return 'Opened from Patients roster';
  }

  if (source === 'insights') {
    return 'Opened from Insights review';
  }

  if (source === 'appointments') {
    return 'Opened from Appointments';
  }

  return 'Opened from Worklist';
}

export function formatPatientEntryReturnLabel(source: PatientEntrySource): string {
  if (source === 'alerts') {
    return 'Return to Alerts';
  }

  if (source === 'patients') {
    return 'Return to Patients';
  }

  if (source === 'insights') {
    return 'Return to Insights';
  }

  if (source === 'appointments') {
    return 'Return to Appointments';
  }

  return 'Return to Worklist';
}

export function formatPatientEntryReviewHint(source: PatientEntrySource): string {
  if (source === 'alerts') {
    return 'Alert follow-through.';
  }

  if (source === 'patients') {
    return 'Roster review.';
  }

  if (source === 'insights') {
    return 'Guidance follow-through.';
  }

  if (source === 'appointments') {
    return 'Scheduling follow-up.';
  }

  return 'Queue handoff.';
}
