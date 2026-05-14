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
  getActiveExerciseSession,
  getPending,
  getRecoveryNudge,
  getCachedRecoverySupport,
  setCachedRecoverySupport,
  canPatientUseCheckin,
  getPatientCareMode,
  getCareModeNotice,
} = vi.hoisted(() => ({
  routerPush: vi.fn(),
  getCachedExercisePlan: vi.fn(async () => ({
    response: {
      plan: {
        title: "Knee recovery",
        items: [{ name: "Heel slides" }, { name: "Walk for 10 minutes" }],
        version: 2,
      },
      date: "2026-04-11",
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
  getActiveExerciseSession: vi.fn(async () => null),
  getPending: vi.fn(async () => []),
  getRecoveryNudge: vi.fn(async (): Promise<any> => null),
  getCachedRecoverySupport: vi.fn(async () => null),
  setCachedRecoverySupport: vi.fn(async () => undefined),
  canPatientUseCheckin: vi.fn(() => true),
  getPatientCareMode: vi.fn(() => "active"),
  getCareModeNotice: vi.fn((): any => null),
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
  useFocusEffect: (effect: () => void | (() => void)) => {
    React.useEffect(() => effect(), []);
  },
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
  getRecoveryNudge,
  getWeeklyReport: vi.fn(async () => ({
    summary: {
      headline: "A steady week",
      highlights: ["Pain stayed stable", "Medication stayed on track"],
    },
    checkins: { count: 2 },
  })),
}));

vi.mock("@/src/components/Avatar", () => ({
  Avatar: (props: Record<string, unknown>) => React.createElement("mock-avatar", props),
}));

vi.mock("@/src/components/Banner", () => ({
  Banner: (props: Record<string, unknown>) => React.createElement("mock-banner", props),
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
    status: "signedIn",
    token: "token-1",
    patient: {
      id: "patient-1",
      displayName: "Patient One",
    },
  }),
}));

vi.mock("@/src/state/activeExerciseSession", () => ({
  getActiveExerciseSession,
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

vi.mock("@/src/state/pendingSessions", () => ({
  getPending,
}));

vi.mock("@/src/state/recoverySupport", () => ({
  canPatientUseCheckin,
  getCachedRecoverySupport,
  getCareModeNotice,
  getPatientCareMode,
  setCachedRecoverySupport,
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
      checkins: { count: 2 },
    },
  })),
  setCachedWeeklyReport: vi.fn(async () => undefined),
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

function getTreeIndex(root: ReactTestInstance, target: ReactTestInstance) {
  return root.findAll(() => true).indexOf(target);
}

function textContent(node: ReactTestInstance): string {
  return findHostNodes(node, "mock-text")
    .flatMap((textNode) => textNode.children)
    .filter((child): child is string => typeof child === "string")
    .join(" ");
}

describe("Today screen", () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    routerPush.mockReset();
    getCachedExercisePlan.mockReset();
    getCachedInsights.mockReset();
    getActiveExerciseSession.mockReset();
    getPending.mockReset();
    getRecoveryNudge.mockReset();
    getRecoveryNudge.mockResolvedValue(null);
    getCachedRecoverySupport.mockReset();
    getCachedRecoverySupport.mockResolvedValue(null);
    setCachedRecoverySupport.mockReset();
    canPatientUseCheckin.mockReset();
    canPatientUseCheckin.mockReturnValue(true);
    getPatientCareMode.mockReset();
    getPatientCareMode.mockReturnValue("active");
    getCareModeNotice.mockReset();
    getCareModeNotice.mockReturnValue(null);
    getCachedExercisePlan.mockResolvedValue({
      response: {
        plan: {
          title: "Knee recovery",
          items: [{ name: "Heel slides" }, { name: "Walk for 10 minutes" }],
          version: 2,
        },
        date: "2026-04-11",
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
    getActiveExerciseSession.mockResolvedValue(null);
    getPending.mockResolvedValue([]);
  });

  it("renders daily tasks before support and more recovery tools without final-demo voice entry points", async () => {
    await act(async () => {
      renderer = create(<HomeScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = renderer!.root;
    const screen = findHostNodes(root, "mock-screen")[0];
    const heroHeader = findHostNodes(root, "mock-hero-header")[0];
    expect(screen.props.background).toBeTruthy();
    expect(heroHeader.props.title).toBe("Today");

    const primaryButtons = findHostNodes(root, "mock-primary-button");
    expect(primaryButtons.map((node) => node.props.label)).toContain("Start check-in");

    const sections = findHostNodes(root, "mock-section");
    expect(sections.map((node) => node.props.title)).toEqual(
      expect.arrayContaining([
        "Today’s exercise",
        "Support",
        "Progress",
        "More recovery tools",
      ]),
    );

    const checkinCard = findHostNodes(root, "mock-card").find(
      (node) => node.props.accessibilityLabel === "Today’s check-in",
    );
    const exerciseSection = sections.find((node) => node.props.title === "Today’s exercise");
    const supportSection = sections.find((node) => node.props.title === "Support");
    const progressSection = sections.find((node) => node.props.title === "Progress");
    const moreToolsSection = sections.find((node) => node.props.title === "More recovery tools");
    const voiceCard = findHostNodes(root, "mock-tip-card").find(
      (node) => node.props.title === "Aura Voice Agent",
    );

    expect(checkinCard).toBeTruthy();
    expect(exerciseSection).toBeTruthy();
    expect(supportSection).toBeTruthy();
    expect(progressSection).toBeTruthy();
    expect(moreToolsSection).toBeTruthy();
    expect(voiceCard).toBeFalsy();
    expect(sections.map((node) => node.props.title)).not.toContain("Voice support");

    expect(getTreeIndex(root, checkinCard!)).toBeLessThan(getTreeIndex(root, exerciseSection!));
    expect(getTreeIndex(root, exerciseSection!)).toBeLessThan(getTreeIndex(root, supportSection!));
    expect(getTreeIndex(root, supportSection!)).toBeLessThan(getTreeIndex(root, progressSection!));
    expect(getTreeIndex(root, progressSection!)).toBeLessThan(getTreeIndex(root, moreToolsSection!));

    const attentionCard = findHostNodes(root, "mock-tip-card")
      .find((node) => node.props.title === "Please reply to your care team");
    expect(attentionCard).toBeTruthy();
    expect(attentionCard?.props.chips).toContain("Due today");
    expect(attentionCard?.props.chips).toContain("2 more items");

    const weeklyReportCard = findHostNodes(root, "mock-media-card").find(
      (node) => node.props.title === "Weekly report",
    );
    const reviewedInsightCard = findHostNodes(root, "mock-media-card").find(
      (node) => node.props.title === "Recovery is steady",
    );
    expect(reviewedInsightCard).toBeTruthy();
    expect(reviewedInsightCard?.props.subtitle).toBe("Pain has stayed within your recent range.");
    expect(reviewedInsightCard?.props.density).toBe("calm");
    await act(async () => {
      reviewedInsightCard?.props.actions[0].onPress();
    });
    expect(routerPush).toHaveBeenCalledWith("/insights");
    expect(weeklyReportCard).toBeTruthy();
    expect(weeklyReportCard?.props.subtitle).toBe("A steady week");
    expect(weeklyReportCard?.props.chips).toEqual([
      expect.objectContaining({ text: "2 highlights" }),
    ]);
    routerPush.mockClear();
    await act(async () => {
      weeklyReportCard?.props.onPress();
    });
    expect(routerPush).toHaveBeenCalledWith("/weekly-report");
  });

  it("opens support entries from their existing routes without exposing the voice agent shortcut", async () => {
    await act(async () => {
      renderer = create(<HomeScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const voiceCard = findHostNodes(renderer!.root, "mock-tip-card").find(
      (node) => node.props.title === "Aura Voice Agent",
    );
    const mediaCards = findHostNodes(renderer!.root, "mock-media-card");
    const chatCard = mediaCards.find((node) => node.props.title === "Chat");
    const safetyCard = mediaCards.find((node) => node.props.title === "Safety");
    const appointmentsCard = mediaCards.find((node) => node.props.title === "Appointments");

    expect(voiceCard).toBeFalsy();
    expect(chatCard).toBeTruthy();
    expect(safetyCard).toBeTruthy();
    expect(appointmentsCard).toBeTruthy();

    await act(async () => {
      chatCard?.props.onPress();
      safetyCard?.props.onPress();
      appointmentsCard?.props.onPress();
    });

    expect(routerPush).toHaveBeenCalledWith("/(tabs)/chat");
    expect(routerPush).toHaveBeenCalledWith("/safety");
    expect(routerPush).toHaveBeenCalledWith("/appointments");
    expect(routerPush).not.toHaveBeenCalledWith("/voice-agent");
  });

  it("shows rest-day plan truth and reviewed-insight empty state when no exercises are scheduled today", async () => {
    getCachedExercisePlan.mockResolvedValue({
      response: {
        plan: {
          title: "Knee recovery",
          items: [],
          version: 2,
        },
        date: "2026-04-11",
      },
    });
    getCachedInsights.mockResolvedValue({ items: [] });

    await act(async () => {
      renderer = create(<HomeScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const renderedText = textContent(renderer!.root);
    const planCard = findHostNodes(renderer!.root, "mock-media-card").find(
      (node) => node.props.title === "Plan assigned for today",
    );

    expect(planCard).toBeTruthy();
    expect(planCard?.props.subtitle).toContain("Nothing is scheduled for today");
    expect(planCard?.props.chips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Assigned" }),
        expect.objectContaining({ text: "Nothing scheduled today" }),
      ]),
    );
    expect(renderedText).toContain("No care-team insights yet");
    expect(renderedText).toContain(
      "Reviewed guidance will appear here after your clinician approves it.",
    );
  });

  it("shows one factual nudge and a calm independent-mode notice when supported", async () => {
    getPatientCareMode.mockReturnValue("independent");
    getCareModeNotice.mockReturnValue({
      title: "Independent recovery mode",
      message:
        "Your care program has ended. You can keep tracking recovery here, but routine clinician monitoring is no longer active.",
    });
    getRecoveryNudge.mockResolvedValue({
      patientId: "patient-1",
      kind: "worsening_trend",
      title: "Pain has been higher this week",
      message: "Pain has been higher this week than last week. Use today’s check-in to note what changed.",
      ruleCode: "worsening_trend",
      evidenceWindow: "Past 7 days",
      generatedAt: "2026-04-11T08:00:00.000Z",
    });

    await act(async () => {
      renderer = create(<HomeScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = renderer!.root;
    const banners = findHostNodes(root, "mock-banner");
    const nudgeCards = findHostNodes(root, "mock-tip-card").filter(
      (node) => node.props.title === "Pain has been higher this week",
    );

    expect(getRecoveryNudge).toHaveBeenCalledTimes(1);
    expect(
      banners.some((node) => node.props.title === "Independent recovery mode"),
    ).toBe(true);
    expect(nudgeCards).toHaveLength(1);
    expect(nudgeCards[0]?.props.text).toBe(
      "Pain has been higher this week than last week. Use today’s check-in to note what changed.",
    );
  });
});
