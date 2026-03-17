import type { PatientSummary } from '../../types/models';
import {
  getPatientStatus,
  isMissedCheckin,
  isRecentlyActive,
} from '../../utils/patientFilters';

export type AlertBurdenTone = 'clear' | 'elevated' | 'high';
export type PainLevelTone = 'elevated' | 'moderate' | 'lower' | 'none';

function asPainText(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return value.toFixed(1);
}

export function formatAlertBurdenText(count: number): string {
  return count === 0 ? 'No active alerts' : `${count} active alert${count === 1 ? '' : 's'}`;
}

export function getAlertBurdenTone(count: number): AlertBurdenTone {
  if (count >= 3) {
    return 'high';
  }

  if (count > 0) {
    return 'elevated';
  }

  return 'clear';
}

export function getPainLevelMeta(value: number | undefined): {
  label: string;
  support: string;
  tone: PainLevelTone;
  valueText: string;
} {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return {
      label: 'No recent pain signal',
      support: 'Pain level unavailable in this roster view',
      tone: 'none',
      valueText: '—',
    };
  }

  if (value >= 7) {
    return {
      label: 'Elevated',
      support: 'Last 7-day average',
      tone: 'elevated',
      valueText: asPainText(value),
    };
  }

  if (value >= 4) {
    return {
      label: 'Moderate',
      support: 'Last 7-day average',
      tone: 'moderate',
      valueText: asPainText(value),
    };
  }

  return {
    label: 'Lower',
    support: 'Last 7-day average',
    tone: 'lower',
    valueText: asPainText(value),
  };
}

export function buildPatientTriageSupportLine(
  patient: PatientSummary,
  nowMs: number = Date.now(),
): string {
  const cues: string[] = [];
  const openAlertCount = patient.openAlertCount ?? 0;

  if (openAlertCount > 0) {
    cues.push(`${openAlertCount} active alert${openAlertCount === 1 ? '' : 's'}`);
  }

  if (isMissedCheckin(patient, nowMs)) {
    cues.push('Missed recent check-in');
  }

  if (isRecentlyActive(patient, '7d', nowMs)) {
    cues.push('Recently active this week');
  }

  const status = getPatientStatus(patient);
  const statusFallback =
    status === 'on_hold'
      ? 'On-hold monitoring'
      : status === 'discharged'
        ? 'Discharged from active care'
        : status === 'inactive'
          ? 'Inactive record'
          : 'Active monitoring';

  if (cues.length < 2) {
    cues.push(statusFallback);
  }

  return cues.slice(0, 2).join(' · ');
}
