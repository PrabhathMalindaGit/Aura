import { getClinicianIdentity } from './clinicianIdentity';
import { PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY } from '../utils/storageKeys';

const PATIENT_HANDOFF_CHANGE_EVENT = 'aura:patient-handoff-change';
const MAX_PATIENT_HANDOFF_SUMMARY_LENGTH = 280;
const MAX_PATIENT_HANDOFF_NOTE_LENGTH = 400;
const MAX_PATIENT_HANDOFF_OWNER_LABEL_LENGTH = 80;
const MAX_NOTES_PER_PATIENT = 12;
const MAX_PATIENT_HANDOFF_RECORDS = 200;

export type PatientHandoffNextAction =
  | ''
  | 'alerts'
  | 'communication'
  | 'tasks'
  | 'appointments'
  | 'plan';

export interface PatientHandoffAuthorSnapshot {
  clinicianId: string;
  authorDisplayName: string;
  authorRoleTitle?: string;
  authorSpecialty?: string;
}

export type PatientHandoffFollowUpOwner =
  | { kind: 'unassigned' }
  | ({ kind: 'self' } & PatientHandoffAuthorSnapshot)
  | { kind: 'custom'; label: string };

export interface PatientCurrentHandoff {
  summary: string;
  nextAction: PatientHandoffNextAction;
  followUpOwner: PatientHandoffFollowUpOwner;
  updatedAt: string;
  updatedBy: PatientHandoffAuthorSnapshot;
}

export interface PatientInternalNote {
  id: string;
  text: string;
  createdAt: string;
  createdBy: PatientHandoffAuthorSnapshot;
}

export interface PatientHandoffRecord {
  currentHandoff?: PatientCurrentHandoff;
  notes: PatientInternalNote[];
}

export type PatientHandoffWorkspaceMap = Record<string, PatientHandoffRecord>;

export interface SavePatientCurrentHandoffInput {
  summary?: string;
  nextAction?: PatientHandoffNextAction;
  followUpOwner?: PatientHandoffFollowUpOwner;
}

export const PATIENT_HANDOFF_LIMITS = {
  summary: MAX_PATIENT_HANDOFF_SUMMARY_LENGTH,
  note: MAX_PATIENT_HANDOFF_NOTE_LENGTH,
  ownerLabel: MAX_PATIENT_HANDOFF_OWNER_LABEL_LENGTH,
  notesPerPatient: MAX_NOTES_PER_PATIENT,
  patientRecords: MAX_PATIENT_HANDOFF_RECORDS,
} as const;

export const PATIENT_HANDOFF_NEXT_ACTION_OPTIONS: Array<{
  id: PatientHandoffNextAction;
  label: string;
}> = [
  { id: '', label: 'Continue monitoring' },
  { id: 'alerts', label: 'Review alerts' },
  { id: 'communication', label: 'Review communication' },
  { id: 'tasks', label: 'Review tasks' },
  { id: 'appointments', label: 'Review appointments' },
  { id: 'plan', label: 'Open plan' },
];

const VALID_NEXT_ACTIONS = new Set<PatientHandoffNextAction>(
  PATIENT_HANDOFF_NEXT_ACTION_OPTIONS.map((option) => option.id),
);

let cachedWorkspaceSnapshot: PatientHandoffWorkspaceMap | null = null;
let cachedWorkspaceSnapshotKey: string | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizePatientId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSingleLine(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeMultilineText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, maxLength);
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toSortValue(timestamp: string | undefined | null): number {
  if (!timestamp) {
    return 0;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createAuthorSnapshot(): PatientHandoffAuthorSnapshot {
  const identity = getClinicianIdentity();

  return {
    clinicianId: identity.clinicianId,
    authorDisplayName: identity.displayName,
    authorRoleTitle: identity.roleTitle.trim() || undefined,
    authorSpecialty: identity.specialty.trim() || undefined,
  };
}

function normalizeAuthorSnapshot(value: unknown): PatientHandoffAuthorSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<PatientHandoffAuthorSnapshot>;
  const clinicianId = normalizeSingleLine(candidate.clinicianId, 48);
  const authorDisplayName = normalizeSingleLine(candidate.authorDisplayName, 80);

  if (!clinicianId || !authorDisplayName) {
    return null;
  }

  return {
    clinicianId,
    authorDisplayName,
    authorRoleTitle: normalizeSingleLine(candidate.authorRoleTitle, 80) || undefined,
    authorSpecialty: normalizeSingleLine(candidate.authorSpecialty, 80) || undefined,
  };
}

function normalizeNextAction(value: unknown): PatientHandoffNextAction {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return VALID_NEXT_ACTIONS.has(normalized as PatientHandoffNextAction)
    ? (normalized as PatientHandoffNextAction)
    : '';
}

function createUnassignedFollowUpOwner(): PatientHandoffFollowUpOwner {
  return { kind: 'unassigned' };
}

function normalizeFollowUpOwner(value: unknown): PatientHandoffFollowUpOwner {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createUnassignedFollowUpOwner();
  }

  const candidate = value as Partial<PatientHandoffFollowUpOwner> & {
    clinicianId?: unknown;
    authorDisplayName?: unknown;
    authorRoleTitle?: unknown;
    authorSpecialty?: unknown;
    label?: unknown;
  };

  if (candidate.kind === 'custom') {
    const label = normalizeSingleLine(candidate.label, MAX_PATIENT_HANDOFF_OWNER_LABEL_LENGTH);
    return label ? { kind: 'custom', label } : createUnassignedFollowUpOwner();
  }

  if (candidate.kind === 'self') {
    const snapshot = normalizeAuthorSnapshot(candidate);
    return snapshot ? { kind: 'self', ...snapshot } : createUnassignedFollowUpOwner();
  }

  return createUnassignedFollowUpOwner();
}

function isBlankStructuredHandoff(
  input: Pick<PatientCurrentHandoff, 'summary' | 'nextAction' | 'followUpOwner'>,
): boolean {
  return (
    input.summary.length === 0 &&
    input.nextAction === '' &&
    input.followUpOwner.kind === 'unassigned'
  );
}

function normalizeCurrentHandoff(value: unknown): PatientCurrentHandoff | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Partial<PatientCurrentHandoff>;
  const summary = normalizeMultilineText(candidate.summary, MAX_PATIENT_HANDOFF_SUMMARY_LENGTH);
  const nextAction = normalizeNextAction(candidate.nextAction);
  const followUpOwner = normalizeFollowUpOwner(candidate.followUpOwner);
  const updatedAt = normalizeTimestamp(candidate.updatedAt);
  const updatedBy = normalizeAuthorSnapshot(candidate.updatedBy);

  if (!updatedAt || !updatedBy) {
    return undefined;
  }

  if (isBlankStructuredHandoff({ summary, nextAction, followUpOwner })) {
    return undefined;
  }

  return {
    summary,
    nextAction,
    followUpOwner,
    updatedAt,
    updatedBy,
  };
}

function normalizeNote(value: unknown, index: number): PatientInternalNote | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<PatientInternalNote>;
  const text = normalizeMultilineText(candidate.text, MAX_PATIENT_HANDOFF_NOTE_LENGTH);
  const createdAt = normalizeTimestamp(candidate.createdAt);
  const createdBy = normalizeAuthorSnapshot(candidate.createdBy);

  if (!text || !createdAt || !createdBy) {
    return null;
  }

  return {
    id: normalizeSingleLine(candidate.id, 120) || `handoff-note-${index + 1}-${createdAt}`,
    text,
    createdAt,
    createdBy,
  };
}

function normalizeRecord(value: unknown): PatientHandoffRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<PatientHandoffRecord>;
  const currentHandoff = normalizeCurrentHandoff(candidate.currentHandoff);
  const notes = Array.isArray(candidate.notes)
    ? candidate.notes
        .map((note, index) => normalizeNote(note, index))
        .filter((note): note is PatientInternalNote => Boolean(note))
        .sort((left, right) => toSortValue(right.createdAt) - toSortValue(left.createdAt))
        .slice(0, MAX_NOTES_PER_PATIENT)
    : [];

  if (!currentHandoff && notes.length === 0) {
    return null;
  }

  return {
    currentHandoff,
    notes,
  };
}

function getRecordUpdatedAt(record: PatientHandoffRecord): string | null {
  const latestNote = record.notes[0]?.createdAt ?? null;
  const latestHandoff = record.currentHandoff?.updatedAt ?? null;
  return toSortValue(latestHandoff) >= toSortValue(latestNote) ? latestHandoff : latestNote;
}

function pruneWorkspaceMap(map: PatientHandoffWorkspaceMap): PatientHandoffWorkspaceMap {
  const recentEntries = Object.entries(map)
    .filter((entry): entry is [string, PatientHandoffRecord] => Boolean(entry[1]))
    .filter((entry) => Boolean(getRecordUpdatedAt(entry[1])))
    .sort((left, right) => toSortValue(getRecordUpdatedAt(right[1])) - toSortValue(getRecordUpdatedAt(left[1])))
    .slice(0, MAX_PATIENT_HANDOFF_RECORDS);

  return Object.fromEntries(recentEntries);
}

function normalizeWorkspaceMap(value: unknown): PatientHandoffWorkspaceMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const next: PatientHandoffWorkspaceMap = {};

  for (const [rawPatientId, rawRecord] of Object.entries(value)) {
    const patientId = normalizePatientId(rawPatientId);
    const record = normalizeRecord(rawRecord);

    if (!patientId || !record) {
      continue;
    }

    next[patientId] = record;
  }

  return pruneWorkspaceMap(next);
}

function readRawWorkspaceMap(): PatientHandoffWorkspaceMap {
  if (!isBrowser()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    return normalizeWorkspaceMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function getWorkspaceSnapshot(): PatientHandoffWorkspaceMap {
  const nextSnapshot = readRawWorkspaceMap();
  const snapshotKey = JSON.stringify(nextSnapshot);

  if (cachedWorkspaceSnapshot && cachedWorkspaceSnapshotKey === snapshotKey) {
    return cachedWorkspaceSnapshot;
  }

  cachedWorkspaceSnapshot = nextSnapshot;
  cachedWorkspaceSnapshotKey = snapshotKey;
  return nextSnapshot;
}

function emitWorkspaceChange(patientId?: string): void {
  cachedWorkspaceSnapshot = null;
  cachedWorkspaceSnapshotKey = null;

  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<{ patientId?: string }>(PATIENT_HANDOFF_CHANGE_EVENT, {
      detail: patientId ? { patientId } : undefined,
    }),
  );
}

function writeWorkspaceMap(nextMap: PatientHandoffWorkspaceMap, patientId?: string): PatientHandoffWorkspaceMap {
  const pruned = pruneWorkspaceMap(nextMap);

  if (isBrowser()) {
    try {
      window.localStorage.setItem(PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY, JSON.stringify(pruned));
    } catch {
      // Ignore storage failures so patient review remains usable.
    }
  }

  emitWorkspaceChange(patientId);
  return getWorkspaceSnapshot();
}

function upsertRecord(
  patientId: string,
  nextRecord: PatientHandoffRecord | null,
): PatientHandoffWorkspaceMap {
  const normalizedPatientId = normalizePatientId(patientId);
  if (!normalizedPatientId) {
    return getWorkspaceSnapshot();
  }

  const currentMap = getWorkspaceSnapshot();
  const nextMap: PatientHandoffWorkspaceMap = { ...currentMap };

  if (!nextRecord || (!nextRecord.currentHandoff && nextRecord.notes.length === 0)) {
    delete nextMap[normalizedPatientId];
    return writeWorkspaceMap(nextMap, normalizedPatientId);
  }

  nextMap[normalizedPatientId] = nextRecord;
  return writeWorkspaceMap(nextMap, normalizedPatientId);
}

function buildNoteId(patientId: string, createdAt: string): string {
  return `handoff-note-${patientId}-${createdAt}`;
}

export function getPatientHandoffWorkspaceStorageKey(): string {
  return PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY;
}

export function getPatientHandoffWorkspace(): PatientHandoffWorkspaceMap {
  return getWorkspaceSnapshot();
}

export function getPatientHandoffRecord(patientId: string): PatientHandoffRecord | null {
  const normalizedPatientId = normalizePatientId(patientId);
  if (!normalizedPatientId) {
    return null;
  }

  return getWorkspaceSnapshot()[normalizedPatientId] ?? null;
}

export function getLatestPatientHandoffNote(
  record: PatientHandoffRecord | null | undefined,
): PatientInternalNote | null {
  return record?.notes[0] ?? null;
}

export function getPatientHandoffNextActionLabel(action: PatientHandoffNextAction): string {
  return (
    PATIENT_HANDOFF_NEXT_ACTION_OPTIONS.find((option) => option.id === action)?.label ??
    PATIENT_HANDOFF_NEXT_ACTION_OPTIONS[0].label
  );
}

export function getPatientHandoffFollowUpOwnerLabel(
  owner: PatientHandoffFollowUpOwner | null | undefined,
): string {
  if (!owner || owner.kind === 'unassigned') {
    return 'Unassigned';
  }

  if (owner.kind === 'custom') {
    return owner.label;
  }

  return owner.authorDisplayName || owner.clinicianId;
}

export function savePatientCurrentHandoff(
  patientId: string,
  input: SavePatientCurrentHandoffInput,
): PatientHandoffRecord | null {
  const normalizedPatientId = normalizePatientId(patientId);
  if (!normalizedPatientId) {
    return null;
  }

  const existingRecord = getPatientHandoffRecord(normalizedPatientId) ?? { notes: [] };
  const summary = normalizeMultilineText(input.summary, MAX_PATIENT_HANDOFF_SUMMARY_LENGTH);
  const nextAction = normalizeNextAction(input.nextAction);
  const followUpOwner =
    input.followUpOwner?.kind === 'self'
      ? ({
          kind: 'self',
          ...createAuthorSnapshot(),
        } satisfies PatientHandoffFollowUpOwner)
      : normalizeFollowUpOwner(input.followUpOwner);
  const shouldClearCurrentHandoff = isBlankStructuredHandoff({
    summary,
    nextAction,
    followUpOwner,
  });

  const nextRecord: PatientHandoffRecord = {
    notes: existingRecord.notes,
    currentHandoff: shouldClearCurrentHandoff
      ? undefined
      : {
          summary,
          nextAction,
          followUpOwner,
          updatedAt: new Date().toISOString(),
          updatedBy: createAuthorSnapshot(),
        },
  };

  return upsertRecord(normalizedPatientId, nextRecord)[normalizedPatientId] ?? null;
}

export function addPatientHandoffNote(
  patientId: string,
  text: string,
): PatientHandoffRecord | null {
  const normalizedPatientId = normalizePatientId(patientId);
  const normalizedText = normalizeMultilineText(text, MAX_PATIENT_HANDOFF_NOTE_LENGTH);

  if (!normalizedPatientId || !normalizedText) {
    return getPatientHandoffRecord(normalizedPatientId);
  }

  const existingRecord = getPatientHandoffRecord(normalizedPatientId) ?? { notes: [] };
  const createdAt = new Date().toISOString();
  const nextNotes = [
    {
      id: buildNoteId(normalizedPatientId, createdAt),
      text: normalizedText,
      createdAt,
      createdBy: createAuthorSnapshot(),
    },
    ...existingRecord.notes,
  ].slice(0, MAX_NOTES_PER_PATIENT);

  const nextRecord: PatientHandoffRecord = {
    currentHandoff: existingRecord.currentHandoff,
    notes: nextNotes,
  };

  return upsertRecord(normalizedPatientId, nextRecord)[normalizedPatientId] ?? null;
}

export function subscribePatientHandoff(listener: () => void): () => void {
  if (!isBrowser()) {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent): void => {
    if (event.key === PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY) {
      listener();
    }
  };

  const onCustomEvent = (): void => {
    listener();
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(PATIENT_HANDOFF_CHANGE_EVENT, onCustomEvent);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(PATIENT_HANDOFF_CHANGE_EVENT, onCustomEvent);
  };
}

export function clearPatientHandoffWorkspaceForTests(): void {
  cachedWorkspaceSnapshot = null;
  cachedWorkspaceSnapshotKey = null;

  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY);
  } catch {
    // Ignore localStorage failures in test helpers.
  }
}
