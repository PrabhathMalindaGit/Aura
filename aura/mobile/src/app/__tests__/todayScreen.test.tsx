import React from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  routerPush,
  getCachedExercisePlan,
  getCachedInsights,
} = vi.hoisted(() => ({
  routerPush: vi.fn(),
  getCachedExercisePlan: vi.fn(async () => ({
    response: {
      plan: {
        items: [{ name: "Heel slides" }, { name: "Walk for 10 minutes" }],
      },
    },
  })),
  getCachedInsights: vi.fn(async () => ({
    items: [
      {
        id: "insight-1",
        title: "Recovery is steady",
        message: "Pain has stayed within your recent range.",
      },
    ],
  })),
}));

const reminderItems = [
  {
    id: "reminder-1",
    sourceType: "communication",
    title: "Please reply to your care team",
    message: "A reply is waiting in chat.",
    status: "due",
    tone: "warning",
    group: "attention",
    unread: true,
    createdAt: "2026-04-11T08:00:00.000Z",
    updatedAt: "2026-04-11T08:10:00.000Z",
    linkedRoute: "/(tabs)/chat",
    primaryActionLabel: "Open chat",
    primaryActionIcon: "chat",
    timingLabel: "Due today",
    statusLabel: "Needs attention",
    chips: [],
  },
  {
    id: "reminder-2",
    sourceType: "task",
    title: "Review your plan",
    message: "Your plan is ready.",
    status: "unread",
    tone: "info",
    group: "soon",
    unread: true,
    createdAt: "2026-04-11T07:00:00.000Z",
    updatedAt: "2026-04-11T07:10:00.000Z",
    linkedRoute: "/exercise-plan",
    primaryActionLabel: "Open plan",
    primaryActionIcon: "exercise",
    statusLabel: "Ready",
    chips: [],
  },
  {
    id: "reminder-3",
    sourceType: "appointment",
    title: "Check your appointment",
    message: "An appointment update is available.",
    status: "informational",
    tone: "info",
    group: "soon",
    unread: false,
    createdAt: "2026-04-11T06:00:00.000Z",
    updatedAt: "2026-04-11T06:10:00.000Z",
    linkedRoute: "/appointments",
    primaryActionLabel: "View appointment",
    primaryActionIcon: "appointments",
    statusLabel: "Ready",
    chips: [],
  },
];

vi.mock("expo-router", () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock("@react-navigation/native", () => ({
  useFocusEffect: () => undefined,
}));

vi.mock("react-native", () => ({
  StyleSheet: {
    create: <T extends Record<string, unknown>>(styles: T) => styles,
  },
  Text: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-text", props, children),
  View: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-view", props, children),
}));

vi.mock("@/src/api/appointments", () => ({
  listMyRequests: vi.fn(async () => []),
}));

vi.mock("@/src/api/tasks", () => ({
  listPatientTasks: vi.fn(async () => []),
}));

vi.mock("@/src/api/patient", () => ({
  getDueProms: vi.fn(async () => []),
}));

vi.mock("@/src/components/Avatar", () => ({
  Avatar: (props: Record<string, unknown>) => React.createElement("mock-avatar", props),
}));

vi.mock("@/src/components/Card", () => ({
  Card: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-card", props, children),
}));

vi.mock("@/src/components/EmptyState", () => ({
  EmptyState: (props: Record<string, unknown>) => React.createElement("mock-empty-state", props),
}));

vi.mock("@/src/components/HeroHeader", () => ({
  HeroHeader: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-hero-header", props, children),
}));

vi.mock("@/src/components/IconSet", () => ({
  DomainIcon: (props: Record<string, unknown>) => React.createElement("mock-domain-icon", props),
}));

vi.mock("@/src/components/MediaCard", () => ({
  MediaCard: (props: Record<string, unknown>) => React.createElement("mock-media-card", props),
}));

vi.mock("@/src/components/PrimaryButton", () => ({
  PrimaryButton: (props: Record<string, unknown>) =>
    React.createElement("mock-primary-button", props),
}));

vi.mock("@/src/components/reminders/UnreadBadge", () => ({
  UnreadBadge: (props: Record<string, unknown>) =>
    React.createElement("mock-unread-badge", props),
}));

vi.mock("@/src/components/Screen", () => ({
  Screen: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-screen", props, children),
}));

vi.mock("@/src/components/SecondaryButton", () => ({
  SecondaryButton: (props: Record<string, unknown>) =>
    React.createElement("mock-secondary-button", props),
}));

vi.mock("@/src/components/Section", () => ({
  Section: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-section", props, children),
}));

vi.mock("@/src/components/Skeleton", () => ({
  SkeletonBlock: (props: Record<string, unknown>) =>
    React.createElement("mock-skeleton-block", props),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: (props: Record<string, unknown>) => React.createElement("mock-status-pill", props),
}));

vi.mock("@/src/components/TrackerTile", () => ({
  TrackerTile: (props: Record<string, unknown>) => React.createElement("mock-tracker-tile", props),
}));

vi.mock("@/src/components/TipCard", () => ({
  TipCard: (props: Record<string, unknown>) => React.createElement("mock-tip-card", props),
}));

vi.mock("@/src/components/TrustBanner", () => ({
  TrustBanner: (props: Record<string, unknown>) => React.createElement("mock-trust-banner", props),
}));

vi.mock("@/src/components/TrustCues", () => ({
  TrustCues: (props: Record<string, unknown>) => React.createElement("mock-trust-cues", props),
}));

vi.mock("@/src/state/auth", () => ({
  useAuth: () => ({
    token: "token-1",
    patient: {
      id: "patient-1",
      displayName: "Patient One",
    },
  }),
}));

vi.mock("@/src/state/appointmentsCache", () => ({
  getCachedAppointmentRequests: vi.fn(async () => ({ requests: [] })),
  setCachedAppointmentRequests: vi.fn(async () => undefined),
}));

vi.mock("@/src/state/checkinsCache", () => ({
  getCachedCheckins: vi.fn(async () => []),
}));

vi.mock("@/src/state/exercisePlanCache", () => ({
  getCachedExercisePlan,
}));

vi.mock("@/src/state/insightsCache", () => ({
  getCachedInsights,
}));

vi.mock("@/src/state/promsCache", () => ({
  getCachedProms: vi.fn(async () => ({ dueCards: [] })),
  setCachedPromDueCards: vi.fn(async () => undefined),
}));

vi.mock("@/src/state/rehabPhasesCache", () => ({
  getCachedRehabPhases: vi.fn(async () => ({
    rehab: {
      currentKey: "phase-1",
      phases: [{ key: "phase-1", title: "Mobility", status: "current" }],
    },
  })),
}));

vi.mock("@/src/state/inAppReminders", () => ({
  getReminderReadState: vi.fn(async () => ({ readById: {}, updatedAt: 0 })),
  markReminderRead: vi.fn(async () => ({ readById: {}, updatedAt: 0 })),
  syncReminderReadState: vi.fn(async () => ({ readById: {}, updatedAt: 0 })),
}));

vi.mock("@/src/state/refresh", () => ({
  useLastRefreshed: () => ({
    label: "Never",
    lastRefreshedAt: 0,
    refreshLocal: async () => undefined,
  }),
}));

vi.mock("@/src/state/tasksCache", () => ({
  getCachedTasks: vi.fn(async () => ({ items: [] })),
  setCachedTasks: vi.fn(async () => undefined),
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: () => false,
}));

vi.mock("@/src/state/trustStatus", () => ({
  useTrustStatus: () => ({ kind: "ok" }),
}));

vi.mock("@/src/state/weeklyReportCache", () => ({
  getCachedWeeklyReport: vi.fn(async () => ({
    report: {
      summary: {
        headline: "A steady week",
        highlights: ["Pain stayed stable", "Medication stayed on track"],
      },
    },
  })),
}));

vi.mock("@/src/dev/renderAudit", () => ({
  useDevRenderAudit: () => undefined,
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      background: "#F6F3EE",
      border: "#D7E0E7",
      text: "#183042",
      textMuted: "#5E7182",
      textTertiary: "#8393A0",
      surface: "#FFFFFF",
      surfaceElevated: "#FBF9F5",
      primary: "#2F6FED",
      primarySoft: "#EEF4FF",
      primaryTextOn: "#FFFFFF",
      success: "#2F8F83",
      accent: "#2F6FED",
      accentTextOn: "#EEF4FF",
      warning: "#C9892B",
      warningTextOn: "#FBF3E4",
      danger: "#C94A3B",
      dangerTextOn: "#FCECE9",
      focusRing: "#7AA7FF",
    },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
    radius: { sm: 10, md: 14, lg: 18, xl: 24 },
    typography: {
      title: { fontSize: 28, lineHeight: 34 },
      body: { fontSize: 16, lineHeight: 24 },
      caption: { fontSize: 13, lineHeight: 18 },
      weights: { medium: "500", semibold: "600" },
    },
  }),
}));

vi.mock("@/src/utils/date", () => ({
  addDaysISO: vi.fn(() => "2026-04-10"),
  formatISOToHuman: vi.fn(() => "Apr 8"),
  formatPatientCardTimestamp: vi.fn((value?: string) =>
    value ? "Apr 12 at 10:00 AM" : undefined,
  ),
  startOfWeekMondayISO: vi.fn(() => "2026-04-06"),
  todayISO: vi.fn(() => "2026-04-11"),
}));

vi.mock("@/src/utils/reminders", () => ({
  buildReminderItems: vi.fn(() => reminderItems),
  buildReminderPreview: vi.fn(() => reminderItems.slice(0, 1)),
  countUnreadReminders: vi.fn(() => 2),
}));

import HomeScreen from "@/app/(tabs)/index";

function findHostNodes(root: ReactTestInstance, type: string) {
  return root.findAll((node) => node.type === type);
}

describe("Today screen", () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    routerPush.mockReset();
    getCachedExercisePlan.mockReset();
    getCachedInsights.mockReset();
    getCachedExercisePlan.mockResolvedValue({
      response: {
        plan: {
          items: [{ name: "Heel slides" }, { name: "Walk for 10 minutes" }],
        },
      },
    });
    getCachedInsights.mockResolvedValue({
      items: [
        {
          id: "insight-1",
          title: "Recovery is steady",
          message: "Pain has stayed within your recent range.",
        },
      ],
    });
  });

  it("renders the new grouped attention summary and primary check-in block", async () => {
    await act(async () => {
      renderer = create(<HomeScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = renderer!.root;
    const heroHeader = findHostNodes(root, "mock-hero-header")[0];
    expect(heroHeader.props.title).toBe("Today");

    const attentionCard = findHostNodes(root, "mock-tip-card")
      .find((node) => node.props.title === "Please reply to your care team");
    expect(attentionCard).toBeTruthy();
    expect(attentionCard?.props.chips).toContain("Due today");
    expect(attentionCard?.props.chips).toContain("2 more items");

    const safetyCard = findHostNodes(root, "mock-tip-card")
      .find((node) => node.props.title === "Safety Plan");
    expect(safetyCard).toBeTruthy();

    const primaryButtons = findHostNodes(root, "mock-primary-button");
    expect(primaryButtons.map((node) => node.props.label)).toContain("Start check-in");

    const sections = findHostNodes(root, "mock-section");
    expect(sections.map((node) => node.props.title)).toEqual(
      expect.arrayContaining(["Needs your attention", "Recovery signals", "Today’s plan", "Insights"]),
    );
  });

  it("shows stronger empty states when plan and reviewed insights are not available yet", async () => {
    getCachedExercisePlan.mockResolvedValue({
      response: {
        plan: {
          items: [],
        },
      },
    });
    getCachedInsights.mockResolvedValue({ items: [] });

    await act(async () => {
      renderer = create(<HomeScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const emptyStates = findHostNodes(renderer!.root, "mock-empty-state");
    const titles = emptyStates.map((node) => node.props.title);
    const descriptions = emptyStates.map((node) => node.props.description);

    expect(titles).toEqual(
      expect.arrayContaining(["No plan assigned for today", "No reviewed insights yet"]),
    );
    expect(descriptions).toEqual(
      expect.arrayContaining([
        "There is nothing scheduled in your plan right now. Open your plan to review upcoming exercises.",
        "Keep completing check-ins and reviewed insights will appear here when they are ready.",
      ]),
    );
  });
});
