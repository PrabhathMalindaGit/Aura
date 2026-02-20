import { useCallback, useEffect, useMemo, useState } from 'react';
import { asAppError, toUserMessage } from '../utils/errors';
import {
  applyAssignmentToAlert,
  applyAssignments,
  getAssignmentMap,
  getAssignmentStorageKey,
  pruneAssignmentMap,
  removeAssignment,
  replaceAssignmentMap,
  setAssignment,
  type AssignmentMap,
} from '../services/assignmentStore';
import { assignAlert, takeoverAlert, unassignAlert } from '../services/clinicianApi';
import type { AlertItem } from '../types/models';

const ASSIGNMENT_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface UseAssignmentArgs {
  clinicianId: string;
  clinicianName: string;
}

interface AssignmentMutationResult {
  ok: boolean;
  message?: string;
}

export interface UseAssignmentResult {
  assignmentMap: AssignmentMap;
  assignmentError: string | null;
  assignmentBusy: boolean;
  applyAlertAssignments: (alerts: AlertItem[]) => AlertItem[];
  applyAlertAssignment: (alert: AlertItem) => AlertItem;
  isAssignedToMe: (alert: AlertItem) => boolean;
  isUnassigned: (alert: AlertItem) => boolean;
  isAssignedToOther: (alert: AlertItem) => boolean;
  assignToMe: (alert: AlertItem) => Promise<AssignmentMutationResult>;
  unassignFromMe: (alert: AlertItem) => Promise<AssignmentMutationResult>;
  takeOver: (alert: AlertItem, reason?: string) => Promise<AssignmentMutationResult>;
  clearAssignmentError: () => void;
}

function toSnapshot(map: AssignmentMap): AssignmentMap {
  return { ...map };
}

export function useAssignment({
  clinicianId,
  clinicianName,
}: UseAssignmentArgs): UseAssignmentResult {
  const [assignmentMap, setAssignmentMap] = useState<AssignmentMap>(() => getAssignmentMap());
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentBusy, setAssignmentBusy] = useState(false);

  useEffect(() => {
    setAssignmentMap(pruneAssignmentMap());

    if (typeof window === 'undefined') {
      return;
    }

    const storageKey = getAssignmentStorageKey();
    const onStorage = (event: StorageEvent): void => {
      if (event.key === storageKey) {
        setAssignmentMap(getAssignmentMap());
      }
    };

    const pruneInterval = window.setInterval(() => {
      setAssignmentMap(pruneAssignmentMap());
    }, ASSIGNMENT_PRUNE_INTERVAL_MS);

    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(pruneInterval);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const applyAlertAssignments = useCallback(
    (alerts: AlertItem[]): AlertItem[] => applyAssignments(alerts, assignmentMap),
    [assignmentMap],
  );

  const applyAlertAssignment = useCallback(
    (alert: AlertItem): AlertItem => applyAssignmentToAlert(alert, assignmentMap),
    [assignmentMap],
  );

  const isAssignedToMe = useCallback(
    (alert: AlertItem): boolean => {
      const assignedAlert = applyAlertAssignment(alert);
      return Boolean(assignedAlert.assignedTo && assignedAlert.assignedTo === clinicianId);
    },
    [applyAlertAssignment, clinicianId],
  );

  const isUnassigned = useCallback(
    (alert: AlertItem): boolean => {
      const assignedAlert = applyAlertAssignment(alert);
      return !assignedAlert.assignedTo;
    },
    [applyAlertAssignment],
  );

  const isAssignedToOther = useCallback(
    (alert: AlertItem): boolean => {
      const assignedAlert = applyAlertAssignment(alert);
      return Boolean(assignedAlert.assignedTo && assignedAlert.assignedTo !== clinicianId);
    },
    [applyAlertAssignment, clinicianId],
  );

  const assignToMe = useCallback(
    async (alert: AlertItem): Promise<AssignmentMutationResult> => {
      const previous = toSnapshot(assignmentMap);
      const optimistic = setAssignment(alert._id, {
        assignedTo: clinicianId,
        assignedToName: clinicianName,
        assignedAtISO: new Date().toISOString(),
      });

      setAssignmentError(null);
      setAssignmentBusy(true);
      setAssignmentMap(optimistic);

      try {
        const saved = await assignAlert(alert._id, clinicianId, clinicianName);
        const next = setAssignment(alert._id, saved);
        setAssignmentMap(next);
        setAssignmentBusy(false);
        return { ok: true };
      } catch (error) {
        const rolledBack = replaceAssignmentMap(previous);
        setAssignmentMap(rolledBack);
        setAssignmentError(toUserMessage(asAppError(error)));
        setAssignmentBusy(false);
        return { ok: false, message: toUserMessage(asAppError(error)) };
      }
    },
    [assignmentMap, clinicianId, clinicianName],
  );

  const unassignFromMe = useCallback(
    async (alert: AlertItem): Promise<AssignmentMutationResult> => {
      const previous = toSnapshot(assignmentMap);
      const optimistic = removeAssignment(alert._id);

      setAssignmentError(null);
      setAssignmentBusy(true);
      setAssignmentMap(optimistic);

      try {
        await unassignAlert(alert._id);
        setAssignmentMap(removeAssignment(alert._id));
        setAssignmentBusy(false);
        return { ok: true };
      } catch (error) {
        const rolledBack = replaceAssignmentMap(previous);
        setAssignmentMap(rolledBack);
        setAssignmentError(toUserMessage(asAppError(error)));
        setAssignmentBusy(false);
        return { ok: false, message: toUserMessage(asAppError(error)) };
      }
    },
    [assignmentMap],
  );

  const takeOver = useCallback(
    async (alert: AlertItem, reason?: string): Promise<AssignmentMutationResult> => {
      const previous = toSnapshot(assignmentMap);
      const optimistic = setAssignment(alert._id, {
        assignedTo: clinicianId,
        assignedToName: clinicianName,
        assignedAtISO: new Date().toISOString(),
      });

      setAssignmentError(null);
      setAssignmentBusy(true);
      setAssignmentMap(optimistic);

      try {
        const saved = await takeoverAlert(alert._id, clinicianId, clinicianName, reason);
        const next = setAssignment(alert._id, saved);
        setAssignmentMap(next);
        setAssignmentBusy(false);
        return { ok: true };
      } catch (error) {
        const rolledBack = replaceAssignmentMap(previous);
        setAssignmentMap(rolledBack);
        setAssignmentError(toUserMessage(asAppError(error)));
        setAssignmentBusy(false);
        return { ok: false, message: toUserMessage(asAppError(error)) };
      }
    },
    [assignmentMap, clinicianId, clinicianName],
  );

  const result = useMemo<UseAssignmentResult>(
    () => ({
      assignmentMap,
      assignmentError,
      assignmentBusy,
      applyAlertAssignments,
      applyAlertAssignment,
      isAssignedToMe,
      isUnassigned,
      isAssignedToOther,
      assignToMe,
      unassignFromMe,
      takeOver,
      clearAssignmentError: () => setAssignmentError(null),
    }),
    [
      applyAlertAssignment,
      applyAlertAssignments,
      assignToMe,
      assignmentError,
      assignmentBusy,
      assignmentMap,
      isAssignedToMe,
      isAssignedToOther,
      isUnassigned,
      takeOver,
      unassignFromMe,
    ],
  );

  return result;
}
