import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  routerPush,
  routerReplace,
  getCaregiverSummary,
  getCaregiverWeeklyReport,
  signOut,
  caregiverRefreshState,
  caregiverErrorState,
} = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  getCaregiverSummary: vi.fn(),
  getCaregiverWeeklyReport: vi.fn(),
  signOut: vi.fn(async () => undefined),
  caregiverRefreshState: {
    label: "Just now",
    refreshLocal: vi.fn(async () => undefined),
  },
  caregiverErrorState: {
    label: "Never",
    lastError: null,
    clear: vi.fn(async () => undefined),
    setLocalError: vi.fn(async () => undefined),
  },
}));

vi.mock("expo-router", () => ({
  Redirect: () => null,
  useRouter: () => ({
    push: routerPush,
    replace: routerReplace,
  }),
}));

vi.mock("@react-navigation/native", () => ({
  useFocusEffect: () => undefined,
}));

vi.mock("react-native", () => ({
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement("mock-activity-indicator", props),
  FlatList: ({
    data = [],
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    keyExtractor,
    ...props
  }: {
    data?: unknown[];
    renderItem: (info: { item: any; index: number }) => React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
    ListEmptyComponent?: React.ReactNode;
    keyExtractor?: (item: any, index: number) => string;
    [key: string]: unknown;
  }) =>
    React.createElement(
      "mock-flat-list",
      props,
      ListHeaderComponent,
      data.length > 0
        ? data.map((item, index) =>
            React.createElement(
              React.Fragment,
              { key: keyExtractor ? keyExtractor(item, index) : String(index) },
              renderItem({ item, index }),
            ),
          )
        : ListEmptyComponent,
    ),
  Platform: {
    OS: "web",
    select: <T,>(config: { default?: T; web?: T; ios?: T; android?: T }) =>
      config.web ?? config.default,
  },
  Pressable: ({
    children,
    ...props
  }: {
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    [key: string]: unknown;
  }) =>
    React.createElement(
      "mock-pressable",
      props,
      typeof children === "function" ? children({ pressed: false }) : children,
    ),
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

vi.mock("@/src/api/caregiver", () => ({
  getCaregiverSummary,
  getCaregiverWeeklyReport,
}));

vi.mock("@/src/components/Avatar", () => ({
  Avatar: (props: Record<string, unknown>) => React.createElement("mock-avatar", props),
}));

vi.mock("@/src/components/Banner", () => ({
  Banner: (props: Record<string, unknown>) => React.createElement("mock-banner", props),
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

vi.mock("@/src/components/LastFailedAttempt", () => ({
  LastFailedAttempt: (props: Record<string, unknown>) =>
    React.createElement("mock-last-failed-attempt", props),
}));

vi.mock("@/src/components/LastRefreshed", () => ({
  LastRefreshed: (props: Record<string, unknown>) =>
    React.createElement("mock-last-refreshed", props),
}));

vi.mock("@/src/components/MediaCard", () => ({
  MediaCard: (props: Record<string, unknown>) => React.createElement("mock-media-card", props),
}));

vi.mock("@/src/components/PrimaryButton", () => ({
  PrimaryButton: (props: Record<string, unknown>) =>
    React.createElement("mock-primary-button", props),
}));

vi.mock("@/src/components/Screen", () => ({
  Screen: ({
    header,
    children,
    ...props
  }: {
    header?: React.ReactNode;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-screen", props, header, children),
}));

vi.mock("@/src/components/SecondaryButton", () => ({
  SecondaryButton: (props: Record<string, unknown>) =>
    React.createElement("mock-secondary-button", props),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: (props: Record<string, unknown>) => React.createElement("mock-status-pill", props),
}));

vi.mock("@/src/components/TrackerTile", () => ({
  TrackerTile: (props: Record<string, unknown>) => React.createElement("mock-tracker-tile", props),
}));

vi.mock("@/src/state/caregiverSession", () => ({
  useCaregiverSession: () => ({
    status: "signedIn",
    token: "caregiver-token",
    patient: { id: "patient-1", displayName: "Patient One" },
    signOut,
  }),
}));

vi.mock("@/src/state/caregiverCache", () => ({
  getCachedCaregiverData: vi.fn(async () => null),
  getCachedCaregiverWeeklyReport: vi.fn(() => null),
  setCachedCaregiverSummary: vi.fn(async () => undefined),
  setCachedCaregiverWeeklyReport: vi.fn(async () => undefined),
}));

vi.mock("@/src/state/lastError", () => ({
  useLastError: () => caregiverErrorState,
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: () => false,
}));

vi.mock("@/src/state/refresh", () => ({
  useLastRefreshed: () => caregiverRefreshState,
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      primary: "#2F6FED",
      surface: "#ffffff",
      border: "#D7E0E7",
      text: "#183042",
      textMuted: "#5E7182",
      warning: "#C9892B",
      success: "#2F8F83",
    },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxxl: 40 },
    radius: { md: 14, lg: 18, xl: 24 },
    elevation: { none: {}, sm: {}, md: {}, card: {} },
    typography: {
      section: { fontSize: 20, lineHeight: 28 },
      body: { fontSize: 16, lineHeight: 24 },
      caption: { fontSize: 12, lineHeight: 16 },
      weights: { medium: "500", semibold: "600" },
    },
  }),
}));

vi.mock("@/src/utils/date", () => ({
  startOfWeekMondayISO: vi.fn(() => "2026-04-06"),
}));

import CaregiverHomeScreen from "@/app/caregiver-home";

function flattenText(root: ReactTestInstance): string {
  return root.findAll((node) => String(node.type) === "mock-text")
    .flatMap((node) => node.children)
    .map((child) => (typeof child === "string" ? child : ""))
    .join(" ");
}

function buildSummary(overrides?: Partial<Record<string, unknown>>) {
  return {
    ok: true,
    patientId: "patient-1",
    patient: { id: "patient-1", displayName: "Patient One" },
    updatedAt: "2026-04-12T08:00:00.000Z",
    access: {
      inviteId: "invite-1",
      codeHint: "ABCD",
      expiresAt: "2026-04-13T08:00:00.000Z",
      usedAt: "2026-04-12T07:30:00.000Z",
      revokedAt: null,
      createdAt: "2026-04-12T07:00:00.000Z",
      status: "active",
      relationship: "Partner",
      caregiverName: "Alex",
      lastAccessedAt: "2026-04-12T08:00:00.000Z",
    },
    careState: {
      state: "discharged",
      label: "Program completed",
      message:
        "The care program has ended. Historical summaries remain available here, but routine clinician monitoring is not ongoing.",
      isHistorical: true,
      dischargedAt: "2026-04-10T08:00:00.000Z",
      programSummary: "Recovery goals were met and the patient was discharged.",
      contactInstructions: "Contact the clinic directly if new care is needed.",
    },
    lastCheckin: {
      date: "2026-04-09",
      pain: 3,
      mood: 4,
    },
    safety: {
      openAlertsCount: 0,
      highRiskAlerts14d: 0,
    },
    assessments: {
      dueNowCount: 1,
    },
    plan: {
      statusLabel: "Plan assigned",
      phaseTitle: "Mobility",
      itemCount: 3,
      title: "Home plan",
    },
    nextAppointment: null,
    supportGuidance: {
      clinicContact: "Contact the clinic directly if new care is needed.",
      urgentHelp: "If the patient may need urgent help, contact local emergency services right away.",
      monitoringNote:
        "This read-only summary does not indicate ongoing routine clinician monitoring.",
    },
    ...overrides,
  };
}

function buildWeeklyReport(overrides?: Partial<Record<string, unknown>>) {
  return {
    ok: true,
    patientId: "patient-1",
    period: {
      weekStart: "2026-04-06",
      weekEnd: "2026-04-12",
      tzOffsetMinutes: 330,
    },
    careState: buildSummary().careState,
    summary: {
      headline: "A steady recovery week",
      highlights: ["Pain stayed manageable", "Medication stayed on track"],
      nextSteps: ["Keep following the plan"],
    },
    checkins: {
      count: 2,
      avgPain: 3.2,
      avgMood: 4.1,
    },
    exercises: {
      sessionCount: 2,
      totalDurationMinutes: 30,
      completedExercises: 5,
      totalExercises: 6,
    },
    medications: {
      adherencePct: 100,
    },
    hydration: {
      avgDailyMl: 1800,
    },
    nutrition: {
      avgFruitVegServings: 4,
    },
    assessments: {
      dueNowCount: 1,
      completedThisWeekCount: 0,
    },
    safety: {
      alertsCreatedThisWeek: 0,
      highRiskAlertsThisWeek: 0,
    },
    updatedAt: "2026-04-12T08:00:00.000Z",
    ...overrides,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("CaregiverHomeScreen", () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    routerPush.mockReset();
    routerReplace.mockReset();
    signOut.mockReset();
    getCaregiverSummary.mockReset();
    getCaregiverWeeklyReport.mockReset();
    caregiverRefreshState.refreshLocal.mockClear();
    caregiverErrorState.clear.mockClear();
    caregiverErrorState.setLocalError.mockClear();
    caregiverErrorState.lastError = null;
  });

  it("renders care-state and support guidance for historical caregiver access", async () => {
    getCaregiverSummary.mockResolvedValue(buildSummary());
    getCaregiverWeeklyReport.mockResolvedValue(buildWeeklyReport());

    await act(async () => {
      renderer = create(<CaregiverHomeScreen />);
      await flush();
    });

    const root = renderer!.root;
    const text = flattenText(root);
    const mediaCards = root.findAll((node) => String(node.type) === "mock-media-card");

    expect(text).toContain("Care status");
    expect(text).toContain("Historical summaries remain available here");
    expect(text).toContain("Support guidance");
    expect(text).toContain("ongoing routine clinician monitoring");
    expect(mediaCards.some((node) => node.props.title === "Plan status")).toBe(true);
  });

  it("clears the caregiver session when access is no longer valid", async () => {
    getCaregiverSummary.mockRejectedValue({
      status: 401,
      title: "Unauthorized",
      message: "Authentication failed. Please sign in again.",
      kind: "validation",
      retryable: false,
    });
    getCaregiverWeeklyReport.mockResolvedValue(buildWeeklyReport());

    await act(async () => {
      renderer = create(<CaregiverHomeScreen />);
      await flush();
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(routerReplace).toHaveBeenCalledWith("/caregiver-login");
  });
});
