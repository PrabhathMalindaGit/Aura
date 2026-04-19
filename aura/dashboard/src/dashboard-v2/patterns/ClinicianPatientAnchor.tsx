import type { CSSProperties } from 'react';

interface DashboardV2ClinicianPatientAnchorProps {
  patientLabel: string;
  tone?: 'critical' | 'warning' | 'success' | 'neutral';
}

function patientInitials(label: string): string {
  const parts = label
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);

  if (parts.length === 0) {
    return 'PT';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function patientAnchorHue(label: string): number {
  const palette = [206, 192, 174, 228, 158, 244];
  const hash = [...label].reduce((value, character) => value + character.charCodeAt(0), 0);

  return palette[hash % palette.length] ?? palette[0];
}

export function DashboardV2ClinicianPatientAnchor({
  patientLabel,
  tone = 'neutral',
}: DashboardV2ClinicianPatientAnchorProps): JSX.Element {
  return (
    <span
      className={`v2-clinician-patient-anchor v2-clinician-patient-anchor--${tone}`}
      aria-hidden="true"
      title={patientLabel}
      style={
        {
          '--v2-clinician-patient-anchor-hue': String(patientAnchorHue(patientLabel)),
        } as CSSProperties
      }
    >
      {patientInitials(patientLabel)}
    </span>
  );
}
