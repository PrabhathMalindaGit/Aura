import type { AppointmentRequestItem, AppointmentWorkflowStatus } from "@/src/api/appointments";
import type { MediaCardChip } from "@/src/components/MediaCard";
import type { StatusPillVariant } from "@/src/components/StatusPill";

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function getAppointmentWorkflowStatus(
  item: Pick<AppointmentRequestItem, "workflowStatus" | "status">,
): AppointmentWorkflowStatus | "rejected" | "canceled" {
  if (item.workflowStatus) {
    return item.workflowStatus;
  }

  if (item.status === "approved") {
    return "upcoming";
  }
  if (item.status === "pending") {
    return "awaiting_confirmation";
  }
  return item.status;
}

export function formatAppointmentWorkflowLabel(
  status: ReturnType<typeof getAppointmentWorkflowStatus>,
): string {
  if (status === "upcoming") {
    return "Upcoming";
  }
  if (status === "awaiting_confirmation") {
    return "Awaiting review";
  }
  if (status === "completed") {
    return "Completed";
  }
  if (status === "missed") {
    return "Missed";
  }
  if (status === "reschedule_requested") {
    return "Needs reschedule";
  }
  if (status === "rejected") {
    return "Not approved";
  }
  return "Canceled";
}

export function appointmentWorkflowTone(
  status: ReturnType<typeof getAppointmentWorkflowStatus>,
): StatusPillVariant {
  if (status === "completed") {
    return "success";
  }
  if (status === "missed") {
    return "danger";
  }
  if (status === "reschedule_requested") {
    return "warning";
  }
  if (status === "awaiting_confirmation") {
    return "info";
  }
  if (status === "upcoming") {
    return "success";
  }
  return "neutral";
}

export function formatAppointmentTimeRange(item: Pick<AppointmentRequestItem, "startsAt" | "endsAt">): string {
  const start = parseDate(item.startsAt);
  const end = parseDate(item.endsAt);
  if (!start || !end) {
    return item.startsAt;
  }

  return `${start.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} - ${end.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function formatAppointmentRelativeLabel(
  item: Pick<AppointmentRequestItem, "startsAt">,
  now = new Date(),
): string | undefined {
  const start = parseDate(item.startsAt);
  if (!start) {
    return undefined;
  }

  const diffMs = start.getTime() - now.getTime();
  if (diffMs < 0) {
    return undefined;
  }

  if (isSameDay(start, now)) {
    return `Today ${start.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (isSameDay(start, tomorrow)) {
    return `Tomorrow ${start.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }

  return start.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildAppointmentChips(item: AppointmentRequestItem): MediaCardChip[] {
  const workflowStatus = getAppointmentWorkflowStatus(item);
  const chips: MediaCardChip[] = [
    {
      text: formatAppointmentWorkflowLabel(workflowStatus),
      tone:
        workflowStatus === "missed"
          ? "danger"
          : workflowStatus === "reschedule_requested"
            ? "warning"
            : workflowStatus === "completed"
              ? "success"
              : workflowStatus === "awaiting_confirmation"
                ? "info"
                : "muted",
    },
  ];

  if (item.meetingLink) {
    chips.push({ text: "Video", tone: "info" });
  }
  if (item.reviewedAt) {
    chips.push({ text: "Reviewed", tone: "muted" });
  }

  return chips;
}
