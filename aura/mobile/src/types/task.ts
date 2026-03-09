export type PatientTaskType =
  | "follow_up"
  | "appointment"
  | "safety_review"
  | "adherence_review"
  | "communication"
  | "custom";

export type PatientTaskPriority = "low" | "medium" | "high" | "urgent";
export type PatientTaskStatus = "open" | "in_progress" | "completed" | "cancelled";

export type PatientTaskActionHint = {
  kind: string;
  label?: string;
};

export type PatientTaskItem = {
  id: string;
  title: string;
  description?: string;
  type: PatientTaskType;
  priority: PatientTaskPriority;
  status: PatientTaskStatus;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelledAt?: string;
  sourceLabel?: string;
  linkedAppointmentId?: string;
  linkedMessageId?: string;
  patientCompletable: boolean;
  patientAction?: PatientTaskActionHint;
};
