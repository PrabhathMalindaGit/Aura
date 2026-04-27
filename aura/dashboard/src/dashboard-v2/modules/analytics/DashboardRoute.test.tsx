/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createJsonResponse,
  installMatchMediaMock,
  installResizeObserverMock,
} from "../../../test/mocks";
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
} from "../../../types/models";
import { DashboardRouteFacade } from "../../config/routeFacades";
import {
  getDefaultDashboardV2Gates,
  resetDashboardV2GatesForTests,
  writeDashboardV2Gates,
} from "../../config/migrationGates";

const SUMMARY: DashboardSummary = {
  openAlertsCount: 1,
  assignedToMeAlertsCount: 1,
  pendingInsightsCount: 2,
  todayAppointmentsCount: 1,
  missedCheckinsCount: 1,
  openFollowUpTasksCount: 1,
  messagesNeedingResponseCount: 1,
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
    needsResponseCount: 1,
    flaggedBySafetyCount: 1,
    followUpRequestedCount: 1,
  },
  items: [
    {
      id: "communication-1",
      patientId: "patient-1",
      patientName: "Jordan Lee",
      needsResponse: true,
      flaggedBySafety: true,
      followUpRequested: true,
      linkedTaskId: "task-1",
      messageCreatedAt: "2026-04-18T08:15:00.000Z",
      messagePreview: "Pain is much worse after exercise today.",
      reviewedAfterLatestInbound: true,
      lastReviewedAt: "2026-04-18T08:20:00.000Z",
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

function installViewportMock(width: number): void {
  installMatchMediaMock((query) => {
    const maxMatch = query.match(/max-width:\s*(\d+)px/);
    if (maxMatch) {
      return width <= Number(maxMatch[1]);
    }

    const minMatch = query.match(/min-width:\s*(\d+)px/);
    if (minMatch) {
      return width >= Number(minMatch[1]);
    }

    return false;
  });
}

function installDashboardFetchMock(
  options: {
    safetyEvents?: DashboardSafetyEvent[];
    communicationOverview?: DashboardCommunicationOverview;
    appointments?: DashboardTodayAppointmentItem[];
    appointmentRequests?: AppointmentRequestItem[];
    availableSlots?: AppointmentSlot[];
  } = {},
): void {
  const safetyEvents = options.safetyEvents ?? SAFETY_EVENTS;
  const communicationOverview =
    options.communicationOverview ?? COMMUNICATION_OVERVIEW;
  const appointments = options.appointments ?? TODAY_APPOINTMENTS;
  const appointmentRequests =
    options.appointmentRequests ?? APPOINTMENT_REQUESTS;
  const availableSlots = options.availableSlots ?? AVAILABLE_SLOTS;

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
      return createJsonResponse({ ok: true, items: appointments });
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
      return createJsonResponse({ ok: true, items: availableSlots });
    }

    if (url.pathname === "/clinician/appointments/requests") {
      return createJsonResponse({ ok: true, items: appointmentRequests });
    }

    if (url.pathname === "/clinician/insights") {
      return createJsonResponse({ ok: true, items: PENDING_INSIGHTS });
    }

    return createJsonResponse({ ok: true });
  });
}

function LocationEcho(): JSX.Element {
  const location = useLocation();
  return (
    <div data-testid="location-echo">
      {JSON.stringify({
        pathname: location.pathname,
        search: location.search,
        state: location.state,
      })}
    </div>
  );
}

function renderDashboardRoute(initialEntry: string = "/dashboard"): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <>
                <DashboardRouteFacade />
                <LocationEcho />
              </>
            }
          />
          <Route path="/alerts" element={<LocationEcho />} />
          <Route path="/communication" element={<LocationEcho />} />
          <Route path="/worklist" element={<LocationEcho />} />
          <Route path="/appointments" element={<LocationEcho />} />
          <Route path="/insights" element={<LocationEcho />} />
          <Route path="/patients/:patientId" element={<LocationEcho />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setDashboardGate(enabled: boolean): void {
  const defaults = getDefaultDashboardV2Gates();

  writeDashboardV2Gates({
    ...defaults,
    routes: {
      ...defaults.routes,
      dashboard: enabled,
    },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  installResizeObserverMock();
  installViewportMock(1440);
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetDashboardV2GatesForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("DashboardRoute", () => {
  it("falls back to the legacy dashboard when the route is explicitly rolled back", async () => {
    installDashboardFetchMock();
    setDashboardGate(false);

    renderDashboardRoute();

    expect(
      await screen.findByRole("heading", { name: "Today" }, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Open next" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("v2-dashboard-route")).not.toBeInTheDocument();
  });

  it("renders the v2 route by default, keeps the overview hierarchy, and preserves onward routing", async () => {
    installDashboardFetchMock();

    renderDashboardRoute();

    expect(await screen.findByTestId("v2-dashboard-route")).toBeVisible();
    await screen.findByText("Lane pressure at a glance");
    expect(screen.getByTestId("v2-dashboard-attention-panel")).toHaveTextContent(
      "Priority now",
    );
    expect(screen.getByTestId("v2-dashboard-attention-panel")).toHaveTextContent(
      "Start in safety review",
    );
    expect(screen.getByTestId("v2-dashboard-data-context")).not.toHaveTextContent(
      "Today",
    );
    expect(screen.getByTestId("v2-dashboard-summary-strip")).toHaveTextContent(
      "Alerts",
    );
    expect(screen.getByTestId("v2-dashboard-summary-strip")).toHaveTextContent(
      "Inbox",
    );
    expect(screen.getByTestId("v2-dashboard-summary-strip")).toHaveTextContent(
      "Follow-up",
    );
    expect(screen.getByTestId("v2-dashboard-summary-strip")).toHaveTextContent(
      "Insights",
    );
    expect(screen.getByTestId("v2-dashboard-summary-strip")).toHaveTextContent(
      "Scheduling",
    );
    expect(screen.getByTestId("v2-dashboard-urgent-queue")).toBeVisible();
    expect(screen.getByTestId("v2-dashboard-signals-section")).toBeVisible();
    expect(screen.getByTestId("v2-dashboard-data-context")).toHaveTextContent(
      "Review window",
    );
    expect(screen.getByTestId("v2-dashboard-data-context")).toHaveTextContent(
      "Schedule:",
    );
    expect(
      within(screen.getByTestId("v2-dashboard-data-context")).getByRole(
        "button",
        { name: "Open schedule" },
      ),
    ).toBeVisible();
    expect(screen.queryByText("Assigned to me alerts")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/foundation|phase 1|migration|staged/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Short lists, not secondary workbenches/i),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Open alerts").length).toBeGreaterThan(0);

    await userEvent.click(
      within(screen.getByTestId("v2-dashboard-attention-panel")).getByRole(
        "button",
        { name: "Open alerts" },
      ),
    );
    expect(await screen.findByTestId("location-echo")).toHaveTextContent(
      '"pathname":"/alerts"',
    );
  });

  it("stays read-only, renders conservative Unknown states, and preserves patient-linked routing", async () => {
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

    renderDashboardRoute();

    expect(await screen.findByTestId("v2-dashboard-route")).toBeVisible();
    const communicationItem = await screen.findByTestId(
      "v2-dashboard-communication-item-communication-reviewed",
    );
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(
      within(communicationItem).getByText(/Reviewed .* by Unknown/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Reply received|AI-authored|Owned by AI/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Acknowledge|Resolve|Assign to me|Take over|Unassign|Publish/i,
      }),
    ).not.toBeInTheDocument();

    const safetyItem = await screen.findByTestId(
      "v2-dashboard-safety-item-event-unknown",
    );
    await userEvent.click(
      within(safetyItem).getByRole("button", { name: "Jordan Lee" }),
    );
    expect(await screen.findByTestId("location-echo")).toHaveTextContent(
      '"pathname":"/patients/patient-1"',
    );
    expect(screen.getByTestId("location-echo")).toHaveTextContent(
      '"source":"dashboard"',
    );
    expect(screen.getByTestId("location-echo")).toHaveTextContent(
      '"returnTo":"/dashboard"',
    );
    expect(screen.getByTestId("location-echo")).not.toHaveTextContent(
      "/patients/patient-1/plan",
    );
    expect(screen.getByTestId("location-echo")).not.toHaveTextContent(
      '"pathname":"/patients"',
    );

  });

  it("keeps narrow data context readable without turning the route into stacked action tiles", async () => {
    installViewportMock(560);
    installDashboardFetchMock();

    renderDashboardRoute();

    expect(await screen.findByTestId("v2-dashboard-route")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /About this data/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This page does not infer historical direction/i),
    ).not.toBeVisible();
    expect(
      screen.getByText(/This route is an operational overview/i),
    ).not.toBeVisible();
    expect(
      screen.queryByText(/Short lists, not secondary workbenches/i),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("v2-dashboard-summary-strip")).toBeVisible();
  });

  it("preserves thread routing from communication rows", async () => {
    installDashboardFetchMock({
      communicationOverview: {
        counts: {
          needsResponseCount: 1,
          flaggedBySafetyCount: 0,
          followUpRequestedCount: 0,
        },
        items: [
          {
            id: "communication-thread-route",
            patientId: "patient-1",
            patientName: "Jordan Lee",
            needsResponse: true,
            flaggedBySafety: false,
            followUpRequested: false,
            messageCreatedAt: "2026-04-18T08:30:00.000Z",
            messagePreview: "A quick routing check for the thread action.",
          },
        ],
      },
    });

    renderDashboardRoute();

    const communicationItem = await screen.findByTestId(
      "v2-dashboard-communication-item-communication-thread-route",
    );
    await userEvent.click(
      within(communicationItem).getByRole("button", { name: "Open thread" }),
    );

    expect(await screen.findByTestId("location-echo")).toHaveTextContent(
      '"pathname":"/communication"',
    );
    expect(screen.getByTestId("location-echo")).toHaveTextContent(
      '"search":"?patientId=patient-1"',
    );
  });

  it("renders intentional clear states when signal and schedule pressure are empty", async () => {
    installDashboardFetchMock({
      safetyEvents: [],
      communicationOverview: {
        counts: {
          needsResponseCount: 0,
          flaggedBySafetyCount: 0,
          followUpRequestedCount: 0,
        },
        items: [],
      },
      appointments: [],
      appointmentRequests: [],
      availableSlots: [],
    });

    renderDashboardRoute();

    expect(await screen.findByTestId("v2-dashboard-route")).toBeVisible();
    expect(await screen.findByText("Nothing new in safety feed")).toBeVisible();
    expect(await screen.findByText("No replies are waiting")).toBeVisible();
    expect(screen.getByTestId("v2-dashboard-data-context")).toHaveTextContent(
      "Schedule:",
    );
    expect(screen.getByTestId("v2-dashboard-data-context")).toHaveTextContent(
      "No visible open capacity",
    );
    expect(screen.getByTestId("v2-dashboard-urgent-queue")).toBeVisible();
  });

  it("renders synthetic labeling and guards patient or thread actions in dashboard demo mode while keeping overview CTAs live", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED", "true");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => createJsonResponse({ ok: true }));

    renderDashboardRoute("/dashboard?dashboardDemo=communicationBacklogDay");

    expect(await screen.findByTestId("v2-dashboard-route")).toBeVisible();
    expect(screen.getByTestId("v2-dashboard-demo-tools")).toHaveTextContent(
      "Synthetic scenario",
    );
    expect(screen.getAllByText("Patient One").length).toBeGreaterThan(0);
    expect(screen.getByText("Data source")).toBeVisible();
    expect(
      screen.getByText(
        "Synthetic presentation dataset · Communication backlog day",
      ),
    ).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();

    const communicationItem = await screen.findByTestId(
      "v2-dashboard-communication-item-demo-backlog-thread-1",
    );
    expect(
      within(communicationItem).getByRole("button", { name: "Demo only" }),
    ).toBeDisabled();
    expect(
      within(communicationItem).getByRole("button", { name: "Patient One" }),
    ).toBeDisabled();

    await userEvent.click(
      within(screen.getByTestId("v2-dashboard-signals-section")).getByRole(
        "button",
        { name: "Open inbox" },
      ),
    );

    expect(await screen.findByTestId("location-echo")).toHaveTextContent(
      '"pathname":"/communication"',
    );
    expect(screen.getByTestId("location-echo")).not.toHaveTextContent(
      '"search":"?patientId=p-demo-01"',
    );
  });

  it("keeps URL demo params in real mode when the demo env gate is disabled", async () => {
    installDashboardFetchMock();

    renderDashboardRoute("/dashboard?dashboardDemo=communicationBacklogDay");

    expect(await screen.findByTestId("v2-dashboard-route")).toBeVisible();
    expect(
      screen.queryByTestId("v2-dashboard-demo-tools"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("v2-dashboard-demo-indicator"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Synthetic presentation dataset/i),
    ).not.toBeInTheDocument();
    expect((await screen.findAllByText("Jordan Lee")).length).toBeGreaterThan(0);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("keeps URL demo params in real mode in production-like builds even when the env gate is enabled", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED", "true");
    installDashboardFetchMock();

    renderDashboardRoute("/dashboard?dashboardDemo=communicationBacklogDay");

    expect(await screen.findByTestId("v2-dashboard-route")).toBeVisible();
    expect(
      screen.queryByTestId("v2-dashboard-demo-tools"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("v2-dashboard-demo-indicator"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Synthetic presentation dataset/i),
    ).not.toBeInTheDocument();
    expect((await screen.findAllByText("Jordan Lee")).length).toBeGreaterThan(0);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("renders demo tools only when local dev and dashboard demo capability are enabled", async () => {
    installDashboardFetchMock();

    renderDashboardRoute();

    expect(await screen.findByTestId("v2-dashboard-route")).toBeVisible();
    expect(
      screen.queryByTestId("v2-dashboard-demo-tools"),
    ).not.toBeInTheDocument();

    cleanup();
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED", "true");
    installDashboardFetchMock();

    renderDashboardRoute();

    expect(await screen.findByTestId("v2-dashboard-route")).toBeVisible();
    expect(
      screen.queryByTestId("v2-dashboard-demo-tools"),
    ).not.toBeInTheDocument();

    cleanup();
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED", "true");
    installDashboardFetchMock();

    renderDashboardRoute();

    expect(await screen.findByTestId("v2-dashboard-route")).toBeVisible();
    expect(screen.getByTestId("v2-dashboard-demo-tools")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Real mode" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("switches dashboard scenarios through the URL query param and clears back to real mode", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED", "true");
    installDashboardFetchMock();

    renderDashboardRoute();

    expect(await screen.findByTestId("v2-dashboard-route")).toBeVisible();
    expect(screen.queryByTestId("v2-dashboard-demo-indicator")).not.toBeInTheDocument();
    expect(screen.getByTestId("location-echo")).toHaveTextContent(
      '"pathname":"/dashboard"',
    );
    expect(screen.getByTestId("location-echo")).toHaveTextContent('"search":""');

    await userEvent.click(
      screen.getByRole("button", { name: "Urgent safety day" }),
    );

    expect(screen.getByTestId("v2-dashboard-demo-tools")).toHaveTextContent(
      "Synthetic scenario",
    );
    expect(screen.getByTestId("location-echo")).toHaveTextContent(
      '"search":"?dashboardDemo=urgentSafetyDay"',
    );
    expect(screen.getByRole("button", { name: "Urgent safety day" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Real mode" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Synthetic presentation dataset · Urgent safety day")).toBeVisible();
    expect(screen.getAllByText("Patient One").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "Real mode" }));

    expect(screen.queryByTestId("v2-dashboard-demo-indicator")).not.toBeInTheDocument();
    expect(screen.getByTestId("location-echo")).toHaveTextContent('"search":""');
    expect(screen.getByRole("button", { name: "Real mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(window.localStorage.length).toBe(0);
  });
});
