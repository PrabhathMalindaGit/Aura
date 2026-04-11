import Alert from "../models/Alert";
import CareEvent from "../models/CareEvent";

export type SafetyAuditEntry = {
  id: string;
  patientId: string;
  alertId?: string;
  eventType: string;
  summary: string;
  occurredAt: string;
  actor?: {
    clinicianId?: string;
    name?: string;
  };
  notificationStatus?: string;
  meta?: Record<string, unknown>;
};

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toIsoString(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return undefined;
}

function sanitizeMeta(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    if (
      key === "text" ||
      key === "notes" ||
      key === "message" ||
      key === "content"
    ) {
      continue;
    }

    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      sanitized[key] = entry;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function resolveActor(
  payload: Record<string, unknown> | undefined
): SafetyAuditEntry["actor"] | undefined {
  if (!payload) {
    return undefined;
  }

  const clinicianId =
    toTrimmedString(payload.clinicianId) ??
    toTrimmedString(payload.requestedBy) ??
    toTrimmedString(payload.overriddenBy) ??
    toTrimmedString(payload.updatedBy);
  const name =
    toTrimmedString(payload.clinicianName) ??
    toTrimmedString(payload.requestedByName) ??
    toTrimmedString(payload.overriddenByName) ??
    toTrimmedString(payload.updatedByName);

  if (!clinicianId && !name) {
    return undefined;
  }

  return {
    clinicianId,
    name,
  };
}

function humanizeEventType(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildSummary(
  eventType: string,
  payload: Record<string, unknown> | undefined
): string {
  const assignedToName =
    toTrimmedString(payload?.assignedToName) ??
    toTrimmedString(payload?.assignedTo);
  const overrideReason = toTrimmedString(payload?.overrideReason);

  switch (eventType) {
    case "ALERT_CREATED":
      return "Alert created";
    case "ALERT_SEEN":
      return "Alert viewed by clinician";
    case "ALERT_ACKNOWLEDGED":
      return "Alert acknowledged";
    case "ALERT_RESOLVED":
      return "Alert resolved";
    case "ALERT_ASSIGNED":
      if (payload?.action === "takeover") {
        return assignedToName
          ? `Alert reassigned to ${assignedToName}`
          : "Alert reassigned";
      }
      if (payload?.action === "unassign") {
        return "Alert unassigned";
      }
      return assignedToName
        ? `Alert assigned to ${assignedToName}`
        : "Alert assigned";
    case "ALERT_RISK_OVERRIDDEN":
      return overrideReason
        ? `Risk override saved: ${overrideReason}`
        : "Risk override saved";
    case "NOTIFICATION_ATTEMPTED":
      return "Notification attempted";
    case "NOTIFICATION_SENT":
      return "Notification sent";
    case "NOTIFICATION_FAILED":
      return "Notification failed";
    case "NOTIFICATION_SKIPPED":
      return "Notification skipped";
    case "NOTIFICATION_RETRY_REQUESTED":
    case "RETRY_NOTIFICATION_REQUESTED":
      return "Notification retry requested";
    case "NOTIFICATION_RETRY_WEBHOOK_DELIVERED":
      return "Retry webhook delivered";
    case "NOTIFICATION_RETRY_WEBHOOK_FAILED":
      return "Retry webhook failed";
    case "PATIENT_THRESHOLD_UPDATED":
      return "Patient thresholds updated";
    default:
      return humanizeEventType(eventType);
  }
}

function buildAlertSnapshotEntries(
  alert: Record<string, unknown>
): SafetyAuditEntry[] {
  const alertId = toTrimmedString(alert._id) ?? "";
  const patientId = toTrimmedString(alert.patientId) ?? "";
  const notificationRecord =
    alert.notification &&
    typeof alert.notification === "object" &&
    !Array.isArray(alert.notification)
      ? (alert.notification as Record<string, unknown>)
      : undefined;

  const entries: SafetyAuditEntry[] = [];
  const createdAt = toIsoString(alert.createdAt);
  if (createdAt) {
    entries.push({
      id: `${alertId}:ALERT_CREATED:${createdAt}`,
      patientId,
      alertId,
      eventType: "ALERT_CREATED",
      summary: "Alert created",
      occurredAt: createdAt,
    });
  }

  const seenAt = toIsoString(alert.seenAt);
  if (seenAt) {
    entries.push({
      id: `${alertId}:ALERT_SEEN:${seenAt}`,
      patientId,
      alertId,
      eventType: "ALERT_SEEN",
      summary: "Alert viewed by clinician",
      occurredAt: seenAt,
    });
  }

  const assignedAt = toIsoString(alert.assignedAt);
  if (assignedAt) {
    entries.push({
      id: `${alertId}:ALERT_ASSIGNED:${assignedAt}`,
      patientId,
      alertId,
      eventType: "ALERT_ASSIGNED",
      summary: toTrimmedString(alert.assignedToName)
        ? `Alert assigned to ${toTrimmedString(alert.assignedToName)}`
        : "Alert assigned",
      occurredAt: assignedAt,
      actor: {
        clinicianId: toTrimmedString(alert.assignedTo),
        name: toTrimmedString(alert.assignedToName),
      },
    });
  }

  const acknowledgedAt = toIsoString(alert.acknowledgedAt);
  if (acknowledgedAt) {
    entries.push({
      id: `${alertId}:ALERT_ACKNOWLEDGED:${acknowledgedAt}`,
      patientId,
      alertId,
      eventType: "ALERT_ACKNOWLEDGED",
      summary: "Alert acknowledged",
      occurredAt: acknowledgedAt,
    });
  }

  const resolvedAt = toIsoString(alert.resolvedAt);
  if (resolvedAt) {
    entries.push({
      id: `${alertId}:ALERT_RESOLVED:${resolvedAt}`,
      patientId,
      alertId,
      eventType: "ALERT_RESOLVED",
      summary: "Alert resolved",
      occurredAt: resolvedAt,
    });
  }

  const overriddenAt = toIsoString(alert.overriddenAt);
  if (overriddenAt) {
    entries.push({
      id: `${alertId}:ALERT_RISK_OVERRIDDEN:${overriddenAt}`,
      patientId,
      alertId,
      eventType: "ALERT_RISK_OVERRIDDEN",
      summary: buildSummary("ALERT_RISK_OVERRIDDEN", {
        overrideReason: alert.overrideReason,
      }),
      occurredAt: overriddenAt,
      actor: {
        clinicianId: toTrimmedString(alert.overriddenBy),
        name: toTrimmedString(alert.overriddenByName),
      },
    });
  }

  const attemptedAt = toIsoString(notificationRecord?.attemptedAt);
  if (attemptedAt) {
    entries.push({
      id: `${alertId}:NOTIFICATION_ATTEMPTED:${attemptedAt}`,
      patientId,
      alertId,
      eventType: "NOTIFICATION_ATTEMPTED",
      summary: "Notification attempted",
      occurredAt: attemptedAt,
      notificationStatus: toTrimmedString(notificationRecord?.status),
    });
  }

  const sentAt = toIsoString(notificationRecord?.sentAt);
  if (sentAt) {
    entries.push({
      id: `${alertId}:NOTIFICATION_SENT:${sentAt}`,
      patientId,
      alertId,
      eventType: "NOTIFICATION_SENT",
      summary: "Notification sent",
      occurredAt: sentAt,
      notificationStatus: toTrimmedString(notificationRecord?.status),
    });
  }

  const failedAt = toIsoString(notificationRecord?.failedAt);
  if (failedAt) {
    entries.push({
      id: `${alertId}:NOTIFICATION_FAILED:${failedAt}`,
      patientId,
      alertId,
      eventType: "NOTIFICATION_FAILED",
      summary: "Notification failed",
      occurredAt: failedAt,
      notificationStatus: toTrimmedString(notificationRecord?.status),
      meta: sanitizeMeta({
        error: notificationRecord?.error,
        retryCount: notificationRecord?.retryCount,
      }),
    });
  }

  return entries;
}

function mapCareEventToEntry(
  event: Record<string, unknown>
): SafetyAuditEntry {
  const payload =
    event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : undefined;
  const eventType = toTrimmedString(event.type) ?? "UNKNOWN";

  return {
    id: toTrimmedString(event._id) ?? "",
    patientId: toTrimmedString(event.patientId) ?? "",
    alertId: toTrimmedString(event.alertId),
    eventType,
    summary: buildSummary(eventType, payload),
    occurredAt: toIsoString(event.createdAt) ?? new Date(0).toISOString(),
    actor: resolveActor(payload),
    notificationStatus:
      toTrimmedString(payload?.status) ??
      toTrimmedString(payload?.notificationStatus),
    meta: sanitizeMeta(payload),
  };
}

function mergeEntries(entries: SafetyAuditEntry[]): SafetyAuditEntry[] {
  const map = new Map<string, SafetyAuditEntry>();

  for (const entry of entries) {
    const key = `${entry.eventType}:${entry.occurredAt}:${entry.summary}:${entry.alertId ?? ""}`;
    if (!map.has(key)) {
      map.set(key, entry);
    }
  }

  return [...map.values()].sort(
    (left, right) =>
      Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
  );
}

function filterSnapshotEntriesAgainstCareEvents(
  snapshotEntries: SafetyAuditEntry[],
  careEventEntries: SafetyAuditEntry[]
): SafetyAuditEntry[] {
  const recordedEventKeys = new Set(
    careEventEntries.map((entry) => `${entry.alertId ?? ""}:${entry.eventType}`)
  );

  return snapshotEntries.filter(
    (entry) => !recordedEventKeys.has(`${entry.alertId ?? ""}:${entry.eventType}`)
  );
}

export async function listAlertSafetyAuditTrail(
  alertId: string
): Promise<SafetyAuditEntry[]> {
  const [alert, events] = await Promise.all([
    Alert.findById(alertId).lean(),
    CareEvent.find({ alertId }).sort({ createdAt: 1 }).lean(),
  ]);

  const careEventEntries = events.map((event) =>
    mapCareEventToEntry(event as unknown as Record<string, unknown>)
  );
  const snapshotEntries = alert
    ? buildAlertSnapshotEntries(alert as unknown as Record<string, unknown>)
    : [];
  const merged = [
    ...filterSnapshotEntriesAgainstCareEvents(snapshotEntries, careEventEntries),
    ...careEventEntries,
  ];

  return mergeEntries(merged);
}

export async function listPatientSafetyEvents(
  patientId: string,
  limit = 50
): Promise<SafetyAuditEntry[]> {
  const [alerts, events] = await Promise.all([
    Alert.find({ patientId }).sort({ createdAt: -1 }).limit(limit).lean(),
    CareEvent.find({ patientId }).sort({ createdAt: -1 }).limit(limit * 3).lean(),
  ]);

  const careEventEntries = events.map((event) =>
    mapCareEventToEntry(event as unknown as Record<string, unknown>)
  );
  const snapshotEntries = alerts.flatMap((alert) =>
    buildAlertSnapshotEntries(alert as unknown as Record<string, unknown>)
  );
  const merged = [
    ...filterSnapshotEntriesAgainstCareEvents(snapshotEntries, careEventEntries),
    ...careEventEntries,
  ];

  return mergeEntries(merged).slice(-limit).reverse();
}
