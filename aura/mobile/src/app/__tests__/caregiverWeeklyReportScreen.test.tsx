import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  routerReplace,
  getCaregiverWeeklyReport,
  signOut,
  caregiverRefreshState,
  caregiverErrorState,
} = vi.hoisted(() => ({
  routerReplace: vi.fn(),
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
    push: vi.fn(),
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
  getCaregiverWeeklyReport,
}));

vi.mock("@/src/components/Avatar", () => ({
  Avatar: (props: Record<string, unknown>) => React.createElement("mock-avatar", props),
}));

vi.mock("@/src/components/Banner", () => ({
  Banner: (props: Record<string, unknown>) => React.createElement("mock-banner", props),
}));

vi.mock("@/src/components/GlassPanel", () => ({
  GlassPanel: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-glass-panel", props, children),
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

vi.mock("@/src/components/SegmentedControl", () => ({
  SegmentedControl: (props: Record<string, unknown>) =>
    React.createElement("mock-segmented-control", props),
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
  addDaysISO: vi.fn(() => "2026-03-30"),
  startOfWeekMondayISO: vi.fn(() => "2026-04-06"),
}));

import CaregiverWeeklyReportScreen from "@/app/caregiver-weekly-report";

function flattenText(root: ReactTestInstance): string {
  return root.findAll((node) => String(node.type) === "mock-text")
    .flatMap((node) => node.children)
    .map((child) => (typeof child === "string" ? child : ""))
    .join(" ");
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
    careState: {
      state: "inactive",
      label: "Archive view",
      message:
        "This account is inactive. Historical recovery information remains available in read-only form.",
      isHistorical: true,
      dischargedAt: "2026-04-10T08:00:00.000Z",
      programSummary: "Past progress remains available.",
      contactInstructions: "Contact the clinic directly for help.",
    },
    summary: {
      headline: "A quieter week",
      highlights: ["Check-ins were sparse"],
      nextSteps: ["Review the latest summary"],
    },
    checkins: {
      count: 1,
      avgPain: 2.4,
      avgMood: 4.2,
    },
    exercises: {
      sessionCount: 1,
      totalDurationMinutes: 15,
      completedExercises: 2,
      totalExercises: 3,
    },
    medications: {
      adherencePct: 90,
    },
    hydration: {
      avgDailyMl: 1700,
    },
    nutrition: {
      avgFruitVegServings: 3,
    },
    assessments: {
      dueNowCount: 0,
      completedThisWeekCount: 1,
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

describe("CaregiverWeeklyReportScreen", () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    routerReplace.mockReset();
    signOut.mockReset();
    getCaregiverWeeklyReport.mockReset();
    caregiverErrorState.clear.mockClear();
    caregiverErrorState.setLocalError.mockClear();
    caregiverErrorState.lastError = null;
  });

  it("renders historical weekly wording without detailed PROM score leakage", async () => {
    getCaregiverWeeklyReport.mockResolvedValue(buildWeeklyReport());

    await act(async () => {
      renderer = create(<CaregiverWeeklyReportScreen />);
      await flush();
    });

    const root = renderer!.root;
    const text = flattenText(root);
    const mediaCards = root.findAll((node) => String(node.type) === "mock-media-card");

    expect(text).toContain("historical recovery information");
    expect(mediaCards.some((node) => node.props.title === "Assessment updates")).toBe(true);
    expect(text).not.toContain("/100");
    expect(text).not.toContain("Moderate concern");
  });

  it("signs out when caregiver weekly access is revoked", async () => {
    getCaregiverWeeklyReport.mockRejectedValue({
      status: 401,
      title: "Unauthorized",
      message: "Authentication failed. Please sign in again.",
      kind: "validation",
      retryable: false,
    });

    await act(async () => {
      renderer = create(<CaregiverWeeklyReportScreen />);
      await flush();
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(routerReplace).toHaveBeenCalledWith("/caregiver-login");
  });
});
