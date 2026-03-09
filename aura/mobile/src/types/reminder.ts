import type { Href } from "expo-router";

import type { DomainIconKey } from "@/src/components/IconSet";

export type ReminderSourceType =
  | "task"
  | "appointment"
  | "communication"
  | "checkin_followup"
  | "system";

export type ReminderGroup = "attention" | "soon" | "recent";

export type ReminderStatus =
  | "unread"
  | "read"
  | "due"
  | "overdue"
  | "completed"
  | "informational";

export type ReminderTone = "info" | "warning" | "success" | "neutral";

export type ReminderAction = {
  label: string;
  href: Href;
  icon: DomainIconKey;
};

export type ReminderItem = {
  id: string;
  sourceType: ReminderSourceType;
  title: string;
  message: string;
  status: ReminderStatus;
  tone: ReminderTone;
  group: ReminderGroup;
  unread: boolean;
  createdAt: string;
  updatedAt: string;
  dueAt?: string;
  linkedEntityId?: string;
  linkedRoute: Href;
  primaryActionLabel: string;
  primaryActionIcon: DomainIconKey;
  timingLabel?: string;
  statusLabel: string;
  chips: string[];
  completableTaskId?: string;
};

export type ReminderReadState = {
  readById: Record<string, number>;
  updatedAt: number;
};
