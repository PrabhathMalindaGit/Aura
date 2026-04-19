import type {
  AppointmentRequestItem,
  AppointmentSlot,
  DashboardCommunicationOverview,
  DashboardFollowUpTaskItem,
  DashboardPriorityQueueItem,
  DashboardSafetyEvent,
  DashboardSummary,
  DashboardTodayAppointmentItem,
  InsightItem,
  PatientSummary,
} from "../../../../types/models";

export type DashboardDemoScenarioId =
  | "urgentSafetyDay"
  | "communicationBacklogDay"
  | "followupHeavyDay"
  | "quietOperationsDay"
  | "constrainedCapacityDay"
  | "balancedOperationsDay";

export interface DashboardDemoScenarioDataset {
  summary: DashboardSummary;
  priorityQueue: DashboardPriorityQueueItem[];
  safetyEvents: DashboardSafetyEvent[];
  todayAppointments: DashboardTodayAppointmentItem[];
  followUpTasks: DashboardFollowUpTaskItem[];
  communicationOverview: DashboardCommunicationOverview;
  insights: InsightItem[];
  appointmentRequests: AppointmentRequestItem[];
  availableSlots: AppointmentSlot[];
  patients: PatientSummary[];
  updatedAtIso: string;
}

export interface DashboardDemoScenario {
  id: DashboardDemoScenarioId;
  label: string;
  indicatorLabel: string;
  anchorIso: string;
  dataset: DashboardDemoScenarioDataset;
}

const DEMO_ANCHOR_ISO = "2026-04-19T09:30:00.000Z";

const DEMO_PATIENTS: PatientSummary[] = [
  { id: "p-demo-01", displayName: "Patient One", status: "active" },
  { id: "p-demo-02", displayName: "Patient Two", status: "active" },
  { id: "p-demo-03", displayName: "Patient Three", status: "active" },
  { id: "p-demo-04", displayName: "Patient Four", status: "active" },
];

function pickPatients(ids: string[]): PatientSummary[] {
  return DEMO_PATIENTS.filter((patient) => ids.includes(patient.id));
}

function createAppointment(
  id: string,
  patientId: string,
  startsAt: string,
  endsAt: string,
  status: DashboardTodayAppointmentItem["status"],
  note: string,
  updatedAt: string,
): DashboardTodayAppointmentItem {
  return {
    id,
    patientId,
    clinicianId: "clinician-demo",
    startsAt,
    endsAt,
    status,
    requestStatus: "pending",
    modality: "video",
    note,
    updatedAt,
  };
}

function createFollowUpTask(
  id: string,
  patientId: string,
  title: string,
  priority: DashboardFollowUpTaskItem["priority"],
  dueAt: string | undefined,
  updatedAt: string,
  type: string = "follow_up",
): DashboardFollowUpTaskItem {
  return {
    id,
    patientId,
    title,
    priority,
    status: "open",
    dueAt,
    type,
    updatedAt,
  };
}

function createCommunicationItem(input: {
  id: string;
  patientId: string;
  patientName: string;
  createdAt: string;
  preview: string;
  needsResponse?: boolean;
  flaggedBySafety?: boolean;
  followUpRequested?: boolean;
  openAlertCount?: number;
  responseState?: DashboardCommunicationOverview["items"][number]["responseState"];
  responseDelayed?: boolean;
  responseDelayHours?: number;
  reviewedAfterLatestInbound?: boolean;
  lastReviewedAt?: string;
  patientRiskLevel?: DashboardCommunicationOverview["items"][number]["patientRiskLevel"];
}): DashboardCommunicationOverview["items"][number] {
  return {
    id: input.id,
    patientId: input.patientId,
    patientName: input.patientName,
    messageId: `message-${input.id}`,
    needsResponse: input.needsResponse ?? false,
    flaggedBySafety: input.flaggedBySafety ?? false,
    followUpRequested: input.followUpRequested ?? false,
    messageCreatedAt: input.createdAt,
    messagePreview: input.preview,
    openAlertCount: input.openAlertCount,
    responseState: input.responseState,
    responseDelayed: input.responseDelayed,
    responseDelayHours: input.responseDelayHours,
    reviewedAfterLatestInbound: input.reviewedAfterLatestInbound,
    lastReviewedAt: input.lastReviewedAt,
    patientRiskLevel: input.patientRiskLevel,
    lastReviewedBy: input.lastReviewedAt
      ? {
          clinicianId: "clinician-demo",
          displayName: "Clinician One",
        }
      : undefined,
  };
}

function createSlot(
  slotId: string,
  startsAt: string,
  endsAt: string,
): AppointmentSlot {
  return {
    slotId,
    clinicianId: "clinician-demo",
    clinicianName: "Clinician One",
    startsAt,
    endsAt,
    modality: "video",
    status: "available",
    createdAt: "2026-04-19T08:30:00.000Z",
  };
}

function createRequest(
  requestId: string,
  slotId: string,
  patientId: string,
  startsAt: string,
  endsAt: string,
  note: string,
): AppointmentRequestItem {
  return {
    requestId,
    slotId,
    patientId,
    status: "pending",
    workflowStatus: "awaiting_confirmation",
    note,
    startsAt,
    endsAt,
    modality: "video",
    createdAt: "2026-04-19T08:35:00.000Z",
    updatedAt: "2026-04-19T08:45:00.000Z",
  };
}

function createInsight(
  id: string,
  patientId: string,
  title: string,
  message: string,
  priority: number,
  category: InsightItem["category"] = "recovery",
): InsightItem {
  return {
    id,
    patientId,
    patientDisplayName:
      DEMO_PATIENTS.find((patient) => patient.id === patientId)?.displayName ??
      patientId,
    status: "pending",
    title,
    message,
    category,
    confidence: priority >= 75 ? "high" : priority >= 30 ? "medium" : "low",
    priority,
    windowDays: 14,
    createdAt: "2026-04-19T08:40:00.000Z",
  };
}

const URGENT_SAFETY_DAY: DashboardDemoScenario = {
  id: "urgentSafetyDay",
  label: "Urgent safety day",
  indicatorLabel: "Demo mode",
  anchorIso: DEMO_ANCHOR_ISO,
  dataset: {
    summary: {
      openAlertsCount: 4,
      assignedToMeAlertsCount: 2,
      pendingInsightsCount: 2,
      todayAppointmentsCount: 2,
      missedCheckinsCount: 1,
      openFollowUpTasksCount: 3,
      messagesNeedingResponseCount: 2,
    },
    priorityQueue: [
      {
        id: "demo-queue-alert-1",
        itemType: "alert",
        patientId: "p-demo-01",
        title: "Escalating safety concern",
        subtitle: "Pain increase with missed contact",
        priority: "urgent",
        status: "open",
        source: "checkin",
        createdAt: "2026-04-19T09:06:00.000Z",
      },
    ],
    safetyEvents: [
      {
        id: "demo-safety-1",
        type: "ALERT_OPENED",
        patientId: "p-demo-01",
        alertId: "alert-demo-01",
        createdAt: "2026-04-19T09:08:00.000Z",
        summary: "High-risk alert opened after pain spike and follow-up gap.",
        alertStatus: "open",
      },
      {
        id: "demo-safety-2",
        type: "NOTIFICATION_FAILED",
        patientId: "p-demo-02",
        alertId: "alert-demo-02",
        createdAt: "2026-04-19T08:54:00.000Z",
        summary: "Outreach failed on the first attempt and needs review.",
        alertStatus: "open",
        notificationStatus: "failed",
      },
      {
        id: "demo-safety-3",
        type: "NOTIFICATION_SENT",
        patientId: "p-demo-03",
        alertId: "alert-demo-03",
        createdAt: "2026-04-19T08:41:00.000Z",
        summary: "Escalation message sent while the alert remains open.",
        alertStatus: "open",
        notificationStatus: "sent",
      },
    ],
    todayAppointments: [
      createAppointment(
        "demo-appt-1",
        "p-demo-03",
        "2026-04-19T10:30:00.000Z",
        "2026-04-19T11:00:00.000Z",
        "awaiting_confirmation",
        "Hold until alert review is clearer.",
        "2026-04-19T09:04:00.000Z",
      ),
      createAppointment(
        "demo-appt-2",
        "p-demo-04",
        "2026-04-19T13:30:00.000Z",
        "2026-04-19T14:00:00.000Z",
        "upcoming",
        "Routine recovery check-in remains on track.",
        "2026-04-19T08:52:00.000Z",
      ),
    ],
    followUpTasks: [
      createFollowUpTask(
        "demo-task-1",
        "p-demo-01",
        "Review urgent alert",
        "urgent",
        "2026-04-19T11:00:00.000Z",
        "2026-04-19T09:05:00.000Z",
        "safety_review",
      ),
      createFollowUpTask(
        "demo-task-2",
        "p-demo-02",
        "Retry failed outreach",
        "high",
        "2026-04-19T12:00:00.000Z",
        "2026-04-19T08:58:00.000Z",
        "communication",
      ),
      createFollowUpTask(
        "demo-task-3",
        "p-demo-03",
        "Confirm same-day follow-up",
        "medium",
        "2026-04-20T10:00:00.000Z",
        "2026-04-19T08:43:00.000Z",
      ),
    ],
    communicationOverview: {
      counts: {
        needsResponseCount: 2,
        flaggedBySafetyCount: 2,
        followUpRequestedCount: 1,
      },
      items: [
        createCommunicationItem({
          id: "demo-thread-1",
          patientId: "p-demo-01",
          patientName: "Patient One",
          createdAt: "2026-04-19T09:09:00.000Z",
          preview: "Pain is much worse and I could not finish exercises today.",
          needsResponse: true,
          flaggedBySafety: true,
          followUpRequested: true,
          openAlertCount: 1,
          responseState: "delayed",
          responseDelayed: true,
          responseDelayHours: 6,
          patientRiskLevel: "high",
        }),
        createCommunicationItem({
          id: "demo-thread-2",
          patientId: "p-demo-02",
          patientName: "Patient Two",
          createdAt: "2026-04-19T08:56:00.000Z",
          preview: "I missed the call back and still need help with next steps.",
          needsResponse: true,
          flaggedBySafety: true,
          openAlertCount: 1,
          responseState: "delayed",
          responseDelayed: true,
          responseDelayHours: 6,
          patientRiskLevel: "high",
        }),
      ],
    },
    insights: [
      createInsight(
        "demo-insight-1",
        "p-demo-03",
        "Symptoms remain elevated",
        "Signals still suggest additional follow-through.",
        62,
        "safety",
      ),
      createInsight(
        "demo-insight-2",
        "p-demo-04",
        "Routine trend is stable",
        "No major action beyond planned follow-up is visible.",
        18,
      ),
    ],
    appointmentRequests: [
      createRequest(
        "demo-request-1",
        "demo-slot-1",
        "p-demo-01",
        "2026-04-20T10:30:00.000Z",
        "2026-04-20T11:00:00.000Z",
        "Keep a same-day safety option visible if pressure persists.",
      ),
    ],
    availableSlots: [createSlot("demo-slot-1", "2026-04-19T15:00:00.000Z", "2026-04-19T15:30:00.000Z")],
    patients: pickPatients(["p-demo-01", "p-demo-02", "p-demo-03", "p-demo-04"]),
    updatedAtIso: "2026-04-19T09:12:00.000Z",
  },
};

const COMMUNICATION_BACKLOG_DAY: DashboardDemoScenario = {
  id: "communicationBacklogDay",
  label: "Communication backlog day",
  indicatorLabel: "Demo mode",
  anchorIso: DEMO_ANCHOR_ISO,
  dataset: {
    summary: {
      openAlertsCount: 1,
      assignedToMeAlertsCount: 0,
      pendingInsightsCount: 1,
      todayAppointmentsCount: 2,
      missedCheckinsCount: 0,
      openFollowUpTasksCount: 3,
      messagesNeedingResponseCount: 5,
    },
    priorityQueue: [
      {
        id: "demo-queue-communication-1",
        itemType: "communication",
        patientId: "p-demo-01",
        title: "Response queue is building",
        subtitle: "Several threads have crossed the target window",
        priority: "high",
        status: "open",
        source: "chat",
        createdAt: "2026-04-19T09:00:00.000Z",
      },
    ],
    safetyEvents: [
      {
        id: "demo-backlog-safety-1",
        type: "NOTIFICATION_SENT",
        patientId: "p-demo-03",
        alertId: "alert-demo-10",
        createdAt: "2026-04-19T08:20:00.000Z",
        summary: "One recent outreach remains visible but not dominant.",
        alertStatus: "acknowledged",
        notificationStatus: "sent",
      },
    ],
    todayAppointments: [
      createAppointment(
        "demo-appt-10",
        "p-demo-02",
        "2026-04-19T11:30:00.000Z",
        "2026-04-19T12:00:00.000Z",
        "upcoming",
        "A routine follow-up still holds for late morning.",
        "2026-04-19T08:25:00.000Z",
      ),
      createAppointment(
        "demo-appt-11",
        "p-demo-03",
        "2026-04-19T15:30:00.000Z",
        "2026-04-19T16:00:00.000Z",
        "awaiting_confirmation",
        "Afternoon check-in is waiting on confirmation.",
        "2026-04-19T08:30:00.000Z",
      ),
    ],
    followUpTasks: [
      createFollowUpTask(
        "demo-task-10",
        "p-demo-01",
        "Respond to delayed thread",
        "high",
        "2026-04-19T12:30:00.000Z",
        "2026-04-19T09:01:00.000Z",
        "communication",
      ),
      createFollowUpTask(
        "demo-task-11",
        "p-demo-02",
        "Close loop on message follow-up",
        "medium",
        "2026-04-19T14:00:00.000Z",
        "2026-04-19T08:58:00.000Z",
        "communication",
      ),
      createFollowUpTask(
        "demo-task-12",
        "p-demo-03",
        "Review new symptom note",
        "medium",
        "2026-04-20T10:00:00.000Z",
        "2026-04-19T08:44:00.000Z",
      ),
    ],
    communicationOverview: {
      counts: {
        needsResponseCount: 5,
        flaggedBySafetyCount: 2,
        followUpRequestedCount: 3,
      },
      items: [
        createCommunicationItem({
          id: "demo-backlog-thread-1",
          patientId: "p-demo-01",
          patientName: "Patient One",
          createdAt: "2026-04-19T09:04:00.000Z",
          preview: "I still need guidance before I can restart exercises.",
          needsResponse: true,
          followUpRequested: true,
          responseState: "delayed",
          responseDelayed: true,
          responseDelayHours: 14,
          patientRiskLevel: "high",
        }),
        createCommunicationItem({
          id: "demo-backlog-thread-2",
          patientId: "p-demo-02",
          patientName: "Patient Two",
          createdAt: "2026-04-19T08:52:00.000Z",
          preview: "The symptoms are steady, but I have not heard back yet.",
          needsResponse: true,
          flaggedBySafety: true,
          openAlertCount: 1,
          responseState: "delayed",
          responseDelayed: true,
          responseDelayHours: 10,
        }),
        createCommunicationItem({
          id: "demo-backlog-thread-3",
          patientId: "p-demo-03",
          patientName: "Patient Three",
          createdAt: "2026-04-19T08:40:00.000Z",
          preview: "Please confirm whether the afternoon video visit is still on.",
          needsResponse: true,
          followUpRequested: true,
          responseState: "delayed",
          responseDelayed: true,
          responseDelayHours: 8,
        }),
      ],
    },
    insights: [
      createInsight(
        "demo-insight-10",
        "p-demo-04",
        "Communication burden is rising",
        "Several threads are waiting longer than target response time.",
        54,
        "habits",
      ),
    ],
    appointmentRequests: [
      createRequest(
        "demo-request-10",
        "demo-slot-10",
        "p-demo-03",
        "2026-04-20T14:00:00.000Z",
        "2026-04-20T14:30:00.000Z",
        "Keep one afternoon option open for overflow follow-up.",
      ),
    ],
    availableSlots: [
      createSlot("demo-slot-10", "2026-04-20T14:00:00.000Z", "2026-04-20T14:30:00.000Z"),
      createSlot("demo-slot-11", "2026-04-21T11:00:00.000Z", "2026-04-21T11:30:00.000Z"),
    ],
    patients: pickPatients(["p-demo-01", "p-demo-02", "p-demo-03", "p-demo-04"]),
    updatedAtIso: "2026-04-19T09:10:00.000Z",
  },
};

const FOLLOWUP_HEAVY_DAY: DashboardDemoScenario = {
  id: "followupHeavyDay",
  label: "Follow-up heavy day",
  indicatorLabel: "Demo mode",
  anchorIso: DEMO_ANCHOR_ISO,
  dataset: {
    summary: {
      openAlertsCount: 1,
      assignedToMeAlertsCount: 0,
      pendingInsightsCount: 3,
      todayAppointmentsCount: 1,
      missedCheckinsCount: 2,
      openFollowUpTasksCount: 6,
      messagesNeedingResponseCount: 2,
    },
    priorityQueue: [
      {
        id: "demo-followup-queue-1",
        itemType: "task",
        patientId: "p-demo-02",
        title: "Follow-up tasks are leading",
        subtitle: "Due work and missed check-ins need attention",
        priority: "high",
        status: "open",
        source: "workflow",
        createdAt: "2026-04-19T08:55:00.000Z",
      },
    ],
    safetyEvents: [
      {
        id: "demo-followup-safety-1",
        type: "ALERT_ACKNOWLEDGED",
        patientId: "p-demo-03",
        alertId: "alert-demo-20",
        createdAt: "2026-04-19T08:15:00.000Z",
        summary: "Safety signal acknowledged and moved into follow-through.",
        alertStatus: "acknowledged",
      },
    ],
    todayAppointments: [
      createAppointment(
        "demo-appt-20",
        "p-demo-04",
        "2026-04-19T16:00:00.000Z",
        "2026-04-19T16:30:00.000Z",
        "upcoming",
        "Late-day follow-up visit remains visible.",
        "2026-04-19T08:12:00.000Z",
      ),
    ],
    followUpTasks: [
      createFollowUpTask("demo-task-20", "p-demo-01", "Check missed check-in", "high", "2026-04-19T10:30:00.000Z", "2026-04-19T08:59:00.000Z"),
      createFollowUpTask("demo-task-21", "p-demo-02", "Confirm recovery plan", "high", "2026-04-19T11:00:00.000Z", "2026-04-19T08:57:00.000Z"),
      createFollowUpTask("demo-task-22", "p-demo-03", "Review adherence note", "medium", "2026-04-19T13:00:00.000Z", "2026-04-19T08:42:00.000Z"),
      createFollowUpTask("demo-task-23", "p-demo-04", "Schedule follow-up call", "medium", "2026-04-20T09:30:00.000Z", "2026-04-19T08:38:00.000Z"),
      createFollowUpTask("demo-task-24", "p-demo-01", "Close loop on symptom update", "medium", "2026-04-20T10:30:00.000Z", "2026-04-19T08:35:00.000Z"),
      createFollowUpTask("demo-task-25", "p-demo-02", "Document routine outreach", "low", undefined, "2026-04-19T08:20:00.000Z"),
    ],
    communicationOverview: {
      counts: {
        needsResponseCount: 2,
        flaggedBySafetyCount: 0,
        followUpRequestedCount: 2,
      },
      items: [
        createCommunicationItem({
          id: "demo-followup-thread-1",
          patientId: "p-demo-01",
          patientName: "Patient One",
          createdAt: "2026-04-19T08:48:00.000Z",
          preview: "I missed yesterday’s check-in but can update now.",
          needsResponse: true,
          followUpRequested: true,
          responseState: "reviewing",
        }),
        createCommunicationItem({
          id: "demo-followup-thread-2",
          patientId: "p-demo-02",
          patientName: "Patient Two",
          createdAt: "2026-04-19T08:36:00.000Z",
          preview: "Can someone confirm the exercise adjustment from last week?",
          needsResponse: true,
          followUpRequested: true,
          responseState: "delayed",
          responseDelayed: true,
          responseDelayHours: 7,
        }),
      ],
    },
    insights: [
      createInsight("demo-insight-20", "p-demo-01", "Missed check-ins need follow-through", "The missed check-in count is driving queue work today.", 82, "questionnaires"),
      createInsight("demo-insight-21", "p-demo-02", "Adherence review still pending", "Routine adherence review remains open in the sample.", 47, "adherence"),
      createInsight("demo-insight-22", "p-demo-03", "Recovery trend needs note", "A small recovery note is still waiting in the queue.", 24),
    ],
    appointmentRequests: [
      createRequest("demo-request-20", "demo-slot-20", "p-demo-04", "2026-04-20T16:00:00.000Z", "2026-04-20T16:30:00.000Z", "Keep a late-day follow-up option visible."),
    ],
    availableSlots: [
      createSlot("demo-slot-20", "2026-04-20T16:00:00.000Z", "2026-04-20T16:30:00.000Z"),
      createSlot("demo-slot-21", "2026-04-21T09:00:00.000Z", "2026-04-21T09:30:00.000Z"),
    ],
    patients: pickPatients(["p-demo-01", "p-demo-02", "p-demo-03", "p-demo-04"]),
    updatedAtIso: "2026-04-19T09:06:00.000Z",
  },
};

const QUIET_OPERATIONS_DAY: DashboardDemoScenario = {
  id: "quietOperationsDay",
  label: "Quiet operations day",
  indicatorLabel: "Demo mode",
  anchorIso: DEMO_ANCHOR_ISO,
  dataset: {
    summary: {
      openAlertsCount: 0,
      assignedToMeAlertsCount: 0,
      pendingInsightsCount: 0,
      todayAppointmentsCount: 0,
      missedCheckinsCount: 0,
      openFollowUpTasksCount: 0,
      messagesNeedingResponseCount: 0,
    },
    priorityQueue: [],
    safetyEvents: [],
    todayAppointments: [],
    followUpTasks: [],
    communicationOverview: {
      counts: {
        needsResponseCount: 0,
        flaggedBySafetyCount: 0,
        followUpRequestedCount: 0,
      },
      items: [],
    },
    insights: [],
    appointmentRequests: [],
    availableSlots: [],
    patients: pickPatients(["p-demo-01", "p-demo-02", "p-demo-03"]),
    updatedAtIso: "2026-04-19T09:00:00.000Z",
  },
};

const CONSTRAINED_CAPACITY_DAY: DashboardDemoScenario = {
  id: "constrainedCapacityDay",
  label: "Constrained capacity day",
  indicatorLabel: "Demo mode",
  anchorIso: DEMO_ANCHOR_ISO,
  dataset: {
    summary: {
      openAlertsCount: 1,
      assignedToMeAlertsCount: 0,
      pendingInsightsCount: 1,
      todayAppointmentsCount: 3,
      missedCheckinsCount: 0,
      openFollowUpTasksCount: 2,
      messagesNeedingResponseCount: 2,
    },
    priorityQueue: [
      {
        id: "demo-capacity-queue-1",
        itemType: "appointment_exception",
        patientId: "p-demo-04",
        title: "Visible scheduling pressure",
        subtitle: "Requests are ahead of published capacity",
        priority: "high",
        status: "open",
        source: "appointments",
        createdAt: "2026-04-19T09:02:00.000Z",
      },
    ],
    safetyEvents: [
      {
        id: "demo-capacity-safety-1",
        type: "NOTIFICATION_SENT",
        patientId: "p-demo-03",
        createdAt: "2026-04-19T08:26:00.000Z",
        summary: "One recent alert remains visible, but scheduling is the lead constraint.",
        alertStatus: "acknowledged",
        notificationStatus: "sent",
      },
    ],
    todayAppointments: [
      createAppointment("demo-appt-30", "p-demo-01", "2026-04-19T10:00:00.000Z", "2026-04-19T10:30:00.000Z", "upcoming", "Morning review remains on the agenda.", "2026-04-19T08:22:00.000Z"),
      createAppointment("demo-appt-31", "p-demo-02", "2026-04-19T12:00:00.000Z", "2026-04-19T12:30:00.000Z", "awaiting_confirmation", "Holding one midday slot for confirmation.", "2026-04-19T08:24:00.000Z"),
      createAppointment("demo-appt-32", "p-demo-03", "2026-04-19T15:00:00.000Z", "2026-04-19T15:30:00.000Z", "upcoming", "Afternoon video visit is already committed.", "2026-04-19T08:27:00.000Z"),
    ],
    followUpTasks: [
      createFollowUpTask("demo-task-30", "p-demo-02", "Review capacity exceptions", "high", "2026-04-19T11:30:00.000Z", "2026-04-19T08:44:00.000Z", "appointment"),
      createFollowUpTask("demo-task-31", "p-demo-04", "Confirm next scheduling option", "medium", "2026-04-19T14:30:00.000Z", "2026-04-19T08:40:00.000Z", "appointment"),
    ],
    communicationOverview: {
      counts: {
        needsResponseCount: 2,
        flaggedBySafetyCount: 0,
        followUpRequestedCount: 1,
      },
      items: [
        createCommunicationItem({
          id: "demo-capacity-thread-1",
          patientId: "p-demo-04",
          patientName: "Patient Four",
          createdAt: "2026-04-19T08:58:00.000Z",
          preview: "I can only take an afternoon slot this week.",
          needsResponse: true,
          followUpRequested: true,
          responseState: "reviewing",
        }),
        createCommunicationItem({
          id: "demo-capacity-thread-2",
          patientId: "p-demo-02",
          patientName: "Patient Two",
          createdAt: "2026-04-19T08:42:00.000Z",
          preview: "Please confirm whether the next opening is still available.",
          needsResponse: true,
          responseState: "delayed",
          responseDelayed: true,
          responseDelayHours: 6,
        }),
      ],
    },
    insights: [
      createInsight("demo-insight-30", "p-demo-04", "Capacity is the primary constraint", "Visible demand is ahead of currently open slots.", 71, "recovery"),
    ],
    appointmentRequests: [
      createRequest("demo-request-30", "demo-slot-30", "p-demo-04", "2026-04-20T13:00:00.000Z", "2026-04-20T13:30:00.000Z", "Needs afternoon availability."),
      createRequest("demo-request-31", "demo-slot-31", "p-demo-02", "2026-04-20T15:30:00.000Z", "2026-04-20T16:00:00.000Z", "Waiting on a later same-week option."),
      createRequest("demo-request-32", "demo-slot-32", "p-demo-01", "2026-04-21T11:30:00.000Z", "2026-04-21T12:00:00.000Z", "Backup review request remains visible."),
    ],
    availableSlots: [createSlot("demo-slot-30", "2026-04-21T16:00:00.000Z", "2026-04-21T16:30:00.000Z")],
    patients: pickPatients(["p-demo-01", "p-demo-02", "p-demo-03", "p-demo-04"]),
    updatedAtIso: "2026-04-19T09:08:00.000Z",
  },
};

const BALANCED_OPERATIONS_DAY: DashboardDemoScenario = {
  id: "balancedOperationsDay",
  label: "Balanced operations day",
  indicatorLabel: "Demo mode",
  anchorIso: DEMO_ANCHOR_ISO,
  dataset: {
    summary: {
      openAlertsCount: 1,
      assignedToMeAlertsCount: 0,
      pendingInsightsCount: 2,
      todayAppointmentsCount: 2,
      missedCheckinsCount: 1,
      openFollowUpTasksCount: 2,
      messagesNeedingResponseCount: 2,
    },
    priorityQueue: [
      {
        id: "demo-balanced-queue-1",
        itemType: "communication",
        patientId: "p-demo-02",
        title: "No single lane is dominating",
        subtitle: "Moderate pressure remains across the overview",
        priority: "medium",
        status: "open",
        source: "dashboard",
        createdAt: "2026-04-19T08:59:00.000Z",
      },
    ],
    safetyEvents: [
      {
        id: "demo-balanced-safety-1",
        type: "NOTIFICATION_SENT",
        patientId: "p-demo-01",
        alertId: "alert-demo-40",
        createdAt: "2026-04-19T08:28:00.000Z",
        summary: "One recent safety touchpoint remains visible in the feed.",
        alertStatus: "open",
        notificationStatus: "sent",
      },
    ],
    todayAppointments: [
      createAppointment("demo-appt-40", "p-demo-02", "2026-04-19T11:00:00.000Z", "2026-04-19T11:30:00.000Z", "upcoming", "Late-morning review remains scheduled.", "2026-04-19T08:30:00.000Z"),
      createAppointment("demo-appt-41", "p-demo-03", "2026-04-19T14:00:00.000Z", "2026-04-19T14:30:00.000Z", "awaiting_confirmation", "Afternoon confirmation is still pending.", "2026-04-19T08:34:00.000Z"),
    ],
    followUpTasks: [
      createFollowUpTask("demo-task-40", "p-demo-01", "Close one safety review", "high", "2026-04-19T12:00:00.000Z", "2026-04-19T08:46:00.000Z", "safety_review"),
      createFollowUpTask("demo-task-41", "p-demo-04", "Check routine follow-up", "medium", "2026-04-20T09:30:00.000Z", "2026-04-19T08:36:00.000Z"),
    ],
    communicationOverview: {
      counts: {
        needsResponseCount: 2,
        flaggedBySafetyCount: 1,
        followUpRequestedCount: 1,
      },
      items: [
        createCommunicationItem({
          id: "demo-balanced-thread-1",
          patientId: "p-demo-02",
          patientName: "Patient Two",
          createdAt: "2026-04-19T08:47:00.000Z",
          preview: "I can do the confirmed video visit if the time still works.",
          needsResponse: true,
          responseState: "reviewing",
        }),
        createCommunicationItem({
          id: "demo-balanced-thread-2",
          patientId: "p-demo-01",
          patientName: "Patient One",
          createdAt: "2026-04-19T08:39:00.000Z",
          preview: "The pain is slightly higher but I can still manage today.",
          needsResponse: true,
          flaggedBySafety: true,
          openAlertCount: 1,
          responseState: "delayed",
          responseDelayed: true,
          responseDelayHours: 5,
          patientRiskLevel: "high",
        }),
      ],
    },
    insights: [
      createInsight("demo-insight-40", "p-demo-03", "Routine follow-up remains", "A small recovery review remains visible.", 42),
      createInsight("demo-insight-41", "p-demo-04", "Steady recovery signal", "No single concern is dominating the queue.", 19, "recovery"),
    ],
    appointmentRequests: [
      createRequest("demo-request-40", "demo-slot-40", "p-demo-03", "2026-04-20T14:00:00.000Z", "2026-04-20T14:30:00.000Z", "Afternoon follow-up option remains open."),
    ],
    availableSlots: [
      createSlot("demo-slot-40", "2026-04-20T09:30:00.000Z", "2026-04-20T10:00:00.000Z"),
      createSlot("demo-slot-41", "2026-04-21T14:00:00.000Z", "2026-04-21T14:30:00.000Z"),
    ],
    patients: pickPatients(["p-demo-01", "p-demo-02", "p-demo-03", "p-demo-04"]),
    updatedAtIso: "2026-04-19T09:07:00.000Z",
  },
};

export const DASHBOARD_DEMO_SCENARIOS: Record<
  DashboardDemoScenarioId,
  DashboardDemoScenario
> = {
  urgentSafetyDay: URGENT_SAFETY_DAY,
  communicationBacklogDay: COMMUNICATION_BACKLOG_DAY,
  followupHeavyDay: FOLLOWUP_HEAVY_DAY,
  quietOperationsDay: QUIET_OPERATIONS_DAY,
  constrainedCapacityDay: CONSTRAINED_CAPACITY_DAY,
  balancedOperationsDay: BALANCED_OPERATIONS_DAY,
};

export const DASHBOARD_DEMO_SCENARIO_IDS = Object.keys(
  DASHBOARD_DEMO_SCENARIOS,
) as DashboardDemoScenarioId[];

export function isDashboardDemoScenarioId(
  value: string | null | undefined,
): value is DashboardDemoScenarioId {
  return Boolean(value && value in DASHBOARD_DEMO_SCENARIOS);
}

export function getDashboardDemoScenario(
  scenarioId: DashboardDemoScenarioId,
): DashboardDemoScenario {
  return DASHBOARD_DEMO_SCENARIOS[scenarioId];
}
