import type { WorklistRecord } from '../../types/models';

export type QueueSignalTone = 'high-risk' | 'response' | 'alerts' | 'follow-through' | 'monitor';

export interface QueueLeadSignal {
  label: string;
  tone: QueueSignalTone;
}

export function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase() ?? '')
      .join('') || 'P'
  );
}

export function asPainText(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return value.toFixed(1);
}

export function formatPromBadgeLabel(item: WorklistRecord): string | null {
  const dueCount = item.proms?.dueCount ?? 0;
  const overdueCount = item.proms?.overdueCount ?? 0;

  if (dueCount <= 0) {
    return null;
  }

  if (overdueCount > 0) {
    return `${dueCount} PROM${dueCount === 1 ? '' : 's'} due (${overdueCount} overdue)`;
  }

  return `${dueCount} PROM${dueCount === 1 ? '' : 's'} due`;
}

export function buildFollowThroughSummary(
  item: WorklistRecord,
  promBadgeLabel: string | null,
): string[] {
  const parts: string[] = [];

  if (item.openAlertsCount > 0) {
    parts.push(`${item.openAlertsCount} ${item.openAlertsCount === 1 ? 'alert' : 'alerts'}`);
  }

  if (item.activeTaskCount > 0) {
    parts.push(`${item.activeTaskCount} ${item.activeTaskCount === 1 ? 'task' : 'tasks'}`);
  }

  if (item.missedCheckins.flag) {
    parts.push(`Missed ${item.missedCheckins.count} ${item.missedCheckins.count === 1 ? 'check-in' : 'check-ins'}`);
  }

  if (promBadgeLabel) {
    parts.push(promBadgeLabel);
  }

  if (item.nextAppointmentAt) {
    parts.push('Appointment scheduled');
  }

  return parts;
}

export function getQueueLeadSignal(
  item: WorklistRecord,
  promBadgeLabel: string | null,
): QueueLeadSignal {
  if (item.communicationNeedsResponse) {
    return {
      label: 'Needs response',
      tone: 'response',
    };
  }

  if (item.latestRiskLevel === 'high') {
    return {
      label: 'High risk',
      tone: 'high-risk',
    };
  }

  if (item.openAlertsCount > 0) {
    return {
      label: `${item.openAlertsCount} ${item.openAlertsCount === 1 ? 'alert' : 'alerts'}`,
      tone: 'alerts',
    };
  }

  if (promBadgeLabel) {
    return {
      label: promBadgeLabel,
      tone: 'follow-through',
    };
  }

  if (item.missedCheckins.flag) {
    return {
      label: `Missed ${item.missedCheckins.count} ${item.missedCheckins.count === 1 ? 'check-in' : 'check-ins'}`,
      tone: 'follow-through',
    };
  }

  if (item.activeTaskCount > 0) {
    return {
      label: `${item.activeTaskCount} ${item.activeTaskCount === 1 ? 'task' : 'tasks'}`,
      tone: 'follow-through',
    };
  }

  if (item.nextAppointmentAt) {
    return {
      label: 'Appointment scheduled',
      tone: 'follow-through',
    };
  }

  return {
    label: 'Monitor',
    tone: 'monitor',
  };
}
