import type { AlertItem } from '../types/models';

export interface AssignmentRecord {
  assignedTo: string;
  assignedToName?: string;
  assignedAtISO: string;
}

export type AssignmentMap = Record<string, AssignmentRecord>;

const ASSIGNMENT_STORAGE_KEY = 'aura_alert_assignments_v1';
const MAX_ASSIGNMENT_ENTRIES = 2000;
const MAX_ASSIGNMENT_AGE_DAYS = 90;
const MAX_ASSIGNMENT_AGE_MS = MAX_ASSIGNMENT_AGE_DAYS * 24 * 60 * 60 * 1000;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isValidAssignmentRecord(value: unknown): value is AssignmentRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<AssignmentRecord>;
  return (
    typeof candidate.assignedTo === 'string' &&
    candidate.assignedTo.trim().length > 0 &&
    typeof candidate.assignedAtISO === 'string' &&
    Number.isFinite(Date.parse(candidate.assignedAtISO))
  );
}

function parseAssignmentMap(raw: string | null): AssignmentMap {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, AssignmentRecord] =>
          typeof entry[0] === 'string' && isValidAssignmentRecord(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

function readAssignmentMap(): AssignmentMap {
  if (!isBrowser()) {
    return {};
  }

  return parseAssignmentMap(window.localStorage.getItem(ASSIGNMENT_STORAGE_KEY));
}

function writeAssignmentMap(map: AssignmentMap): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(ASSIGNMENT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore write failures so the dashboard remains usable.
  }
}

export function replaceAssignmentMap(nextMap: AssignmentMap): AssignmentMap {
  const pruned = pruneMap(nextMap);
  writeAssignmentMap(pruned);
  return pruned;
}

function pruneMap(map: AssignmentMap, nowMs: number = Date.now()): AssignmentMap {
  const cutoff = nowMs - MAX_ASSIGNMENT_AGE_MS;
  const recentEntries = Object.entries(map)
    .filter((entry) => Date.parse(entry[1].assignedAtISO) >= cutoff)
    .sort((left, right) => Date.parse(right[1].assignedAtISO) - Date.parse(left[1].assignedAtISO))
    .slice(0, MAX_ASSIGNMENT_ENTRIES);

  return Object.fromEntries(recentEntries);
}

export function getAssignmentStorageKey(): string {
  return ASSIGNMENT_STORAGE_KEY;
}

export function pruneAssignmentMap(): AssignmentMap {
  const current = readAssignmentMap();
  const pruned = pruneMap(current);
  writeAssignmentMap(pruned);
  return pruned;
}

export function getAssignmentMap(): AssignmentMap {
  return pruneAssignmentMap();
}

export function getAssignment(alertId: string): AssignmentRecord | undefined {
  if (!alertId) {
    return undefined;
  }

  return getAssignmentMap()[alertId];
}

export function setAssignment(alertId: string, assignment: AssignmentRecord): AssignmentMap {
  if (!alertId || !assignment.assignedTo.trim()) {
    return getAssignmentMap();
  }

  const next = readAssignmentMap();
  next[alertId] = assignment;
  return replaceAssignmentMap(next);
}

export function removeAssignment(alertId: string): AssignmentMap {
  if (!alertId) {
    return getAssignmentMap();
  }

  const next = readAssignmentMap();
  if (!next[alertId]) {
    return pruneMap(next);
  }

  delete next[alertId];
  return replaceAssignmentMap(next);
}

export function applyAssignmentToAlert(alert: AlertItem, assignmentMap: AssignmentMap): AlertItem {
  const assignment = assignmentMap[alert._id];
  if (!assignment) {
    return alert;
  }

  return {
    ...alert,
    assignedTo: assignment.assignedTo,
    assignedToName: assignment.assignedToName,
    assignedAt: assignment.assignedAtISO,
    assignmentSource: 'manual',
  };
}

export function applyAssignments(alerts: AlertItem[], assignmentMap: AssignmentMap): AlertItem[] {
  return alerts.map((alert) => applyAssignmentToAlert(alert, assignmentMap));
}

export function clearAssignmentStoreForTests(): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(ASSIGNMENT_STORAGE_KEY);
  } catch {
    // Ignore localStorage errors in test helpers.
  }
}
