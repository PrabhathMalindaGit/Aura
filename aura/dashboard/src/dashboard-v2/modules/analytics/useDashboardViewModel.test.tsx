/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJsonResponse } from "../../../test/mocks";
import type {
  DashboardCommunicationOverview,
  DashboardFollowUpTaskItem,
  DashboardPriorityQueueItem,
  DashboardSafetyEvent,
  DashboardSummary,
  DashboardTodayAppointmentItem,
  InsightItem,
  PatientSummary,
  AppointmentRequestItem,
  AppointmentSlot,
} from "../../../types/models";
import { useDashboardViewModel } from "./useDashboardViewModel";

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );

  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const SUMMARY: DashboardSummary = {
  openAlertsCount: 2,
  assignedToMeAlertsCount: 1,
  pendingInsightsCount: 2,
  todayAppointmentsCount: 1,
  missedCheckinsCount: 1,
  openFollowUpTasksCount: 3,
  messagesNeedingResponseCount: 2,
};

const PRIORITY_QUEUE: DashboardPriorityQueueItem[] = [
  {
    id: "queue-alert-1",
    itemType: "alert",
    patientId: "patient-1",
    title: "Assigned high-risk alert",
    subtitle: "Pain escalation requires review",
    priority: "high",
    status: "open",
    source: "checkin",
    createdAt: "2026-04-18T08:00:00.000Z",
    linkedEntityId: "alert-1",
    linkedEntityType: "alert",
  },
];

const SAFETY_EVENTS: DashboardSafetyEvent[] = [
  {
    id: "event-1",
    type: "NOTIFICATION_SENT",
    patientId: "patient-1",
    alertId: "alert-1",
    createdAt: "2026-04-18T08:05:00.000Z",
    summary: "Telegram escalation sent successfully.",
    alertStatus: "open",
    notificationStatus: "sent",
  },
];

const TODAY_APPOINTMENTS: DashboardTodayAppointmentItem[] = [
  {
    id: "appointment-1",
    patientId: "patient-1",
    clinicianId: "clinician-1",
    startsAt: "2026-04-18T13:00:00.000Z",
    endsAt: "2026-04-18T13:30:00.000Z",
    status: "awaiting_confirmation",
    requestStatus: "pending",
    modality: "video",
    note: "Waiting for patient confirmation.",
    updatedAt: "2026-04-18T08:10:00.000Z",
  },
];

const FOLLOW_UP_TASKS: DashboardFollowUpTaskItem[] = [
  {
    id: "task-1",
    patientId: "patient-1",
    title: "Review safety escalation",
    priority: "urgent",
    status: "open",
    dueAt: "2026-04-18T12:00:00.000Z",
    type: "safety_review",
    linkedAlertId: "alert-1",
    updatedAt: "2026-04-18T08:11:00.000Z",
  },
];

const COMMUNICATION_OVERVIEW: DashboardCommunicationOverview = {
  counts: {
    needsResponseCount: 2,
    flaggedBySafetyCount: 1,
    followUpRequestedCount: 1,
  },
  items: [
    {
      id: "communication-1",
      patientId: "patient-1",
      patientName: "Jordan Lee",
      messageId: "message-1",
      needsResponse: true,
      flaggedBySafety: true,
      followUpRequested: true,
      linkedTaskId: "task-1",
      messageCreatedAt: "2026-04-18T08:15:00.000Z",
      messagePreview: "Pain is much worse after exercise today.",
      reviewedAfterLatestInbound: true,
      lastReviewedAt: "2026-04-18T08:20:00.000Z",
      lastReviewedBy: {
        clinicianId: "clinician-1",
        displayName: "Clinician One",
      },
    },
  ],
};

const PENDING_INSIGHTS: InsightItem[] = [
  {
    id: "insight-1",
    patientId: "patient-1",
    status: "pending",
    title: "Pain trend worsened",
    message: "Pain scores are rising again in the recent window.",
    category: "symptoms",
    confidence: "high",
    priority: 90,
    windowDays: 14,
    createdAt: "2026-04-18T08:35:00.000Z",
  },
  {
    id: "insight-2",
    patientId: "patient-2",
    status: "pending",
    title: "Routine follow-up remains",
    message: "A lighter-touch follow-up is still visible.",
    category: "recovery",
    confidence: "low",
    priority: 1,
    windowDays: 14,
    createdAt: "2026-04-18T08:40:00.000Z",
  },
];

const APPOINTMENT_REQUESTS: AppointmentRequestItem[] = [
  {
    requestId: "request-1",
    slotId: "slot-1",
    patientId: "patient-1",
    status: "pending",
    workflowStatus: "awaiting_confirmation",
    note: "Review demand before publishing more time.",
    startsAt: "2026-04-18T09:00:00.000Z",
    endsAt: "2026-04-18T09:30:00.000Z",
    modality: "video",
    createdAt: "2026-04-18T08:00:00.000Z",
    updatedAt: "2026-04-18T08:00:00.000Z",
  },
  {
    requestId: "request-2",
    slotId: "slot-2",
    patientId: "patient-2",
    status: "pending",
    workflowStatus: "awaiting_confirmation",
    note: "Needs the next available afternoon slot.",
    startsAt: "2026-04-19T09:00:00.000Z",
    endsAt: "2026-04-19T09:30:00.000Z",
    modality: "video",
    createdAt: "2026-04-18T08:05:00.000Z",
    updatedAt: "2026-04-18T08:05:00.000Z",
  },
];

const AVAILABLE_SLOTS: AppointmentSlot[] = [
  {
    slotId: "slot-1",
    clinicianName: "Clinician One",
    startsAt: "2026-04-18T11:00:00.000Z",
    endsAt: "2026-04-18T11:30:00.000Z",
    modality: "video",
    status: "available",
    meetingLink: "https://meet.example.com/open-capacity",
    createdAt: "2026-04-18T08:12:00.000Z",
  },
];

const PATIENTS: PatientSummary[] = [
  {
    id: "patient-1",
    displayName: "Jordan Lee",
    status: "active",
  },
  {
    id: "patient-2",
    displayName: "Avery Chen",
    status: "active",
  },
];

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function installDashboardFetchMock(
  options: {
    safetyEvents?: DashboardSafetyEvent[];
    communicationOverview?: DashboardCommunicationOverview;
  } = {},
): void {
  const safetyEvents = options.safetyEvents ?? SAFETY_EVENTS;
  const communicationOverview =
    options.communicationOverview ?? COMMUNICATION_OVERVIEW;

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input), "http://localhost");

    if (url.pathname === "/clinician/dashboard/summary") {
      return createJsonResponse({ ok: true, summary: SUMMARY });
    }

    if (url.pathname === "/clinician/dashboard/priority-queue") {
      return createJsonResponse({ ok: true, items: PRIORITY_QUEUE });
    }

    if (url.pathname === "/clinician/dashboard/recent-safety-events") {
      return createJsonResponse({ ok: true, items: safetyEvents });
    }

    if (url.pathname === "/clinician/dashboard/today-appointments") {
      return createJsonResponse({ ok: true, items: TODAY_APPOINTMENTS });
    }

    if (url.pathname === "/clinician/dashboard/follow-up-tasks") {
      return createJsonResponse({ ok: true, items: FOLLOW_UP_TASKS });
    }

    if (url.pathname === "/clinician/dashboard/communication-overview") {
      return createJsonResponse({ ok: true, overview: communicationOverview });
    }

    if (url.pathname === "/clinician/patients") {
      return createJsonResponse({ ok: true, patients: PATIENTS });
    }

    if (url.pathname === "/clinician/appointments/slots") {
      return createJsonResponse({ ok: true, items: AVAILABLE_SLOTS });
    }

    if (url.pathname === "/clinician/appointments/requests") {
      return createJsonResponse({ ok: true, items: APPOINTMENT_REQUESTS });
    }

    if (url.pathname === "/clinician/insights") {
      return createJsonResponse({ ok: true, items: PENDING_INSIGHTS });
    }

    return createJsonResponse({ ok: true });
  });
}

function createWrapper(): ({
  children,
}: {
  children: ReactNode;
}) => JSX.Element {
  const queryClient = createQueryClient();

  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockNavigate.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDashboardViewModel", () => {
  it("maps the current dashboard truth into the service analytics overview model", async () => {
    installDashboardFetchMock();

    const { result } = renderHook(() => useDashboardViewModel(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.summaryLoading).toBe(false);
      expect(result.current.summaryMetrics[0]?.value).toBe("2");
    });

    expect(result.current.attention.actionPath).toBe("/alerts");
    expect(result.current.summaryMetrics.map((metric) => metric.label)).toEqual(
      [
        "Open alerts",
        "Messages needing response",
        "Open follow-up tasks",
        "Pending insights",
        "Today’s appointments",
      ],
    );
    expect(result.current.operationalLoadRows.map((row) => row.label)).toEqual([
      "Alerts",
      "Communication",
      "Follow-up queue",
      "Insights",
      "Scheduling",
    ]);
    expect(result.current.nextOpenSlotValue).toContain("Apr");
    expect(result.current.schedulingFootnote).toBe(
      "Pending requests exceed visible open capacity in the next 7 days.",
    );
    expect(result.current.priorityQueuePressureNote).toContain(
      "urgent item",
    );
  });

  it("renders supported missing metadata as Unknown without inventing reply or AI ownership truth", async () => {
    installDashboardFetchMock({
      safetyEvents: [
        {
          id: "event-unknown",
          type: "MANUAL_REVIEW",
          patientId: "patient-1",
          createdAt: "2026-04-18T08:25:00.000Z",
          summary: "Manual review moved into the safety feed.",
        },
      ],
      communicationOverview: {
        counts: {
          needsResponseCount: 1,
          flaggedBySafetyCount: 0,
          followUpRequestedCount: 0,
        },
        items: [
          {
            id: "communication-reviewed",
            patientId: "patient-1",
            patientName: "Jordan Lee",
            needsResponse: false,
            flaggedBySafety: false,
            followUpRequested: false,
            messageCreatedAt: "2026-04-18T08:30:00.000Z",
            messagePreview: "Clinician reviewed the latest thread.",
            reviewedAfterLatestInbound: true,
            lastReviewedAt: "2026-04-18T08:35:00.000Z",
          },
        ],
      },
    });

    const { result } = renderHook(() => useDashboardViewModel(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.safetySignals.length).toBe(1);
      expect(result.current.communicationSignals.length).toBe(1);
    });

    expect(result.current.safetySignals[0]?.statusLabel).toBe("Unknown");
    expect(result.current.communicationSignals[0]?.reviewLine).toContain(
      "Unknown",
    );
    expect(result.current.communicationSignals[0]?.reviewLine).not.toContain(
      "Reply received",
    );
    expect(result.current.dataContext.trustDetail).toMatch(
      /Ownership, AI authorship/i,
    );
    expect(result.current.dataContext.trustDetail).not.toMatch(
      /Owned by AI|guaranteed coverage/i,
    );
  });

  it("opens patient-linked dashboard rows into the v2 patient workspace with dashboard entry context", async () => {
    installDashboardFetchMock();

    const { result } = renderHook(() => useDashboardViewModel(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.scheduleItems.length).toBeGreaterThan(0);
    });

    result.current.openPatient("patient-1");

    expect(mockNavigate).toHaveBeenCalledWith("/patients/patient-1", {
      state: {
        patientEntryContext: {
          patientId: "patient-1",
          source: "dashboard",
          focus: "workflow",
          returnTo: "/dashboard",
        },
      },
    });
  });
});
