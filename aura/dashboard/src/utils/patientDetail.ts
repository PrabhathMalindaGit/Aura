import type {
  AlertItem,
  AppointmentRequestItem,
  ClinicianTaskItem,
  DashboardCommunicationOverviewItem,
  TrendSummaryMetrics,
  WorklistRecord,
} from '../types/models';
import { sanitizeDashboardPreviewText } from './syntheticRunTags';

export type PatientOperationalTone = 'danger' | 'warning' | 'neutral' | 'success';
export type PatientActionKey =
  | 'alerts'
  | 'communication'
  | 'tasks'
  | 'appointments'
  | 'worklist'
  | 'trends'
  | 'plan';

export interface PatientPriorityItem {
  id: string;
  title: string;
  reason: string;
  tone: PatientOperationalTone;
  timestamp?: string;
  actionKey?: PatientActionKey;
  actionLabel?: string;
}

export interface PatientRecommendedAction {
  id: string;
  title: string;
  description: string;
  tone: PatientOperationalTone;
  actionKey: PatientActionKey;
  actionLabel: string;
}

function alertReasonText(reason: AlertItem['reason']): string {
  if (Array.isArray(reason)) {
    return reason.join(', ');
  }

  return reason;
}

export function appointmentWorkflowLabel(value: AppointmentRequestItem['workflowStatus']): string {
  if (value === 'awaiting_confirmation') {
    return 'Awaiting confirmation';
  }
  if (value === 'reschedule_requested') {
    return 'Reschedule requested';
  }
  if (value === 'completed') {
    return 'Completed';
  }
  if (value === 'missed') {
    return 'Missed';
  }
  return 'Upcoming';
}

export function appointmentWorkflowTone(
  value: AppointmentRequestItem['workflowStatus'],
): PatientOperationalTone {
  if (value === 'missed') {
    return 'danger';
  }
  if (value === 'awaiting_confirmation' || value === 'reschedule_requested') {
    return 'warning';
  }
  if (value === 'completed') {
    return 'success';
  }
  return 'neutral';
}

export function taskPriorityLabel(priority: ClinicianTaskItem['priority']): string {
  if (priority === 'urgent') {
    return 'Urgent';
  }
  if (priority === 'high') {
    return 'High';
  }
  if (priority === 'medium') {
    return 'Medium';
  }
  return 'Low';
}

export function taskPriorityTone(priority: ClinicianTaskItem['priority']): PatientOperationalTone {
  if (priority === 'urgent') {
    return 'danger';
  }
  if (priority === 'high') {
    return 'warning';
  }
  return 'neutral';
}

interface DerivePriorityInput {
  worklistItem?: WorklistRecord | null;
  openAlerts: AlertItem[];
  communicationItems: DashboardCommunicationOverviewItem[];
  activeTasks: ClinicianTaskItem[];
  appointments: AppointmentRequestItem[];
  trendSummary: TrendSummaryMetrics;
}

export function derivePatientCurrentPriorities({
  worklistItem,
  openAlerts,
  communicationItems,
  activeTasks,
  appointments,
  trendSummary,
}: DerivePriorityInput): PatientPriorityItem[] {
  const priorities: PatientPriorityItem[] = [];
  const overdueTask = activeTasks.find((task) => {
    if (!task.dueAt) {
      return false;
    }

    return Date.parse(task.dueAt) < Date.now();
  });
  const latestCommunication = communicationItems[0];
  const appointmentIssue =
    appointments.find(
      (item) => item.workflowStatus === 'missed' || item.workflowStatus === 'reschedule_requested',
    ) ??
    appointments.find((item) => item.workflowStatus === 'awaiting_confirmation') ??
    appointments.find((item) => item.workflowStatus === 'upcoming');

  if (openAlerts.length > 0) {
    priorities.push({
      id: 'open-alert',
      title: 'Open safety alert needs review',
      reason: alertReasonText(openAlerts[0].reason),
      tone: 'danger',
      timestamp: openAlerts[0].createdAt,
      actionKey: 'alerts',
      actionLabel: 'Review alerts',
    });
  }

  if (worklistItem?.missedCheckins.flag) {
    priorities.push({
      id: 'missed-checkin',
      title: 'Missed recent check-in',
      reason: `Missed ${worklistItem.missedCheckins.count} recent check-in${
        worklistItem.missedCheckins.count === 1 ? '' : 's'
      }.`,
      tone: 'warning',
      timestamp: worklistItem.updatedAt,
      actionKey: 'worklist',
      actionLabel: 'Open worklist',
    });
  }

  if (latestCommunication) {
    priorities.push({
      id: 'communication',
      title: latestCommunication.flaggedBySafety
        ? 'Safety-flagged patient message needs review'
        : 'Patient message needs response',
      reason:
        sanitizeDashboardPreviewText(latestCommunication.messagePreview) ||
        'Recent patient communication is waiting for clinician follow-up.',
      tone: latestCommunication.flaggedBySafety ? 'danger' : 'warning',
      timestamp: latestCommunication.messageCreatedAt,
      actionKey: 'communication',
      actionLabel: 'Review communication',
    });
  }

  if (overdueTask) {
    priorities.push({
      id: 'overdue-task',
      title: 'Follow-up task is overdue',
      reason: overdueTask.title,
      tone: taskPriorityTone(overdueTask.priority),
      timestamp: overdueTask.dueAt,
      actionKey: 'tasks',
      actionLabel: 'Review tasks',
    });
  } else if (activeTasks.length > 0) {
    priorities.push({
      id: 'active-task',
      title: 'Open follow-up task',
      reason: activeTasks[0].title,
      tone: taskPriorityTone(activeTasks[0].priority),
      timestamp: activeTasks[0].dueAt ?? activeTasks[0].updatedAt,
      actionKey: 'tasks',
      actionLabel: 'Review tasks',
    });
  }

  if (appointmentIssue) {
    priorities.push({
      id: 'appointment',
      title: `Appointment ${appointmentWorkflowLabel(appointmentIssue.workflowStatus).toLowerCase()}`,
      reason: appointmentIssue.note?.trim() || 'Review appointment status and patient follow-up context.',
      tone: appointmentWorkflowTone(appointmentIssue.workflowStatus),
      timestamp: appointmentIssue.startsAt,
      actionKey: 'appointments',
      actionLabel: 'Review appointments',
    });
  }

  if ((trendSummary.latestPain ?? 0) >= 7) {
    priorities.push({
      id: 'elevated-pain',
      title: 'Pain elevated recently',
      reason: `Latest pain score is ${trendSummary.latestPain} in the current review window.`,
      tone: 'warning',
      timestamp: trendSummary.lastCheckinDate ?? undefined,
      actionKey: 'trends',
      actionLabel: 'Review trends',
    });
  }

  if ((trendSummary.adherence7d ?? 1) < 0.5) {
    priorities.push({
      id: 'low-adherence',
      title: 'Exercise adherence is below target',
      reason: `Average exercise completion is ${Math.round((trendSummary.adherence7d ?? 0) * 100)}% over the last 7 days.`,
      tone: 'warning',
      timestamp: trendSummary.lastCheckinDate ?? undefined,
      actionKey: 'plan',
      actionLabel: 'Open plan',
    });
  }

  return priorities.slice(0, 5);
}

interface DeriveActionsInput {
  worklistItem?: WorklistRecord | null;
  openAlerts: AlertItem[];
  communicationItems: DashboardCommunicationOverviewItem[];
  activeTasks: ClinicianTaskItem[];
  appointments: AppointmentRequestItem[];
  trendSummary: TrendSummaryMetrics;
}

export function derivePatientRecommendedActions({
  worklistItem,
  openAlerts,
  communicationItems,
  activeTasks,
  appointments,
  trendSummary,
}: DeriveActionsInput): PatientRecommendedAction[] {
  const actions: PatientRecommendedAction[] = [];

  if (openAlerts.length > 0) {
    actions.push({
      id: 'review-alerts',
      title: 'Review latest alert',
      description: 'Use the alert context section to acknowledge or resolve the patient’s active safety items.',
      tone: 'danger',
      actionKey: 'alerts',
      actionLabel: 'Review alerts',
    });
  }

  if (communicationItems.length > 0) {
    actions.push({
      id: 'review-communication',
      title: 'Check patient communication',
      description: 'A recent patient message still needs clinician review or follow-up.',
      tone: communicationItems[0].flaggedBySafety ? 'danger' : 'warning',
      actionKey: 'communication',
      actionLabel: 'Open communication',
    });
  }

  if (activeTasks.length > 0) {
    actions.push({
      id: 'review-tasks',
      title: 'Work the follow-up tasks',
      description: `${activeTasks.length} active task${activeTasks.length === 1 ? '' : 's'} are linked to this patient.`,
      tone: activeTasks.some((task) => task.priority === 'urgent') ? 'danger' : 'warning',
      actionKey: 'tasks',
      actionLabel: 'Open tasks',
    });
  }

  if (appointments.length > 0) {
    actions.push({
      id: 'review-appointments',
      title: 'Review appointment status',
      description: 'Check the patient’s next or most recent tele-rehab scheduling item.',
      tone: appointments.some((item) => item.workflowStatus === 'missed') ? 'danger' : 'neutral',
      actionKey: 'appointments',
      actionLabel: 'Open appointments',
    });
  }

  if (worklistItem) {
    actions.push({
      id: 'open-worklist',
      title: 'Open worklist context',
      description:
        worklistItem.reviewReason?.trim() ||
        'See how this patient is currently represented in the operational roster.',
      tone: 'neutral',
      actionKey: 'worklist',
      actionLabel: 'Open worklist',
    });
  }

  if ((trendSummary.adherence7d ?? 1) < 0.5) {
    actions.push({
      id: 'open-plan',
      title: 'Review exercise plan',
      description: 'Low recent adherence suggests checking whether the current rehab plan still fits.',
      tone: 'warning',
      actionKey: 'plan',
      actionLabel: 'Open plan',
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: 'review-trends',
      title: 'Review recovery trends',
      description: 'No urgent operational flags are active. Confirm the patient remains stable in the trend view.',
      tone: 'success',
      actionKey: 'trends',
      actionLabel: 'Open trends',
    });
  }

  return actions.slice(0, 4);
}
