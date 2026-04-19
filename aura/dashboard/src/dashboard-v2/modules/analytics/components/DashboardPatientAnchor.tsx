interface DashboardPatientAnchorProps {
  patientLabel: string;
  tone?: "critical" | "warning" | "success" | "neutral";
}

function patientInitials(label: string): string {
  const parts = label
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  if (parts.length === 0) {
    return "PT";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function DashboardPatientAnchor({
  patientLabel,
  tone = "neutral",
}: DashboardPatientAnchorProps): JSX.Element {
  return (
    <span
      className={`v2-dashboard-patient-anchor v2-dashboard-patient-anchor--${tone}`}
      aria-hidden="true"
      title={patientLabel}
    >
      {patientInitials(patientLabel)}
    </span>
  );
}
