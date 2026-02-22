export type NotificationStatusCallbackStatus =
  | "attempted"
  | "sent"
  | "failed"
  | "skipped";

export type NotificationStatusCallbackBody = {
  alertId: string;
  channel: "telegram";
  status: NotificationStatusCallbackStatus;
  timestamp?: string;
  messageId?: string;
  target?: string;
  error?: string;
  meta?: {
    workflow?: string;
    executionId?: string;
  };
};

export type NotificationStatusSummary = {
  channel: "telegram";
  status: "unknown" | "sent" | "failed" | "skipped";
  attemptedAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  target: string | null;
  messageId: string | null;
  error: string | null;
  retryCount: number;
};
