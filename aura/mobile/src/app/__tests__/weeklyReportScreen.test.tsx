import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  routerPush,
  getWeeklyReport,
  refreshWeekly,
  clearWeeklyError,
  setWeeklyError,
  weeklyRefreshState,
  weeklyErrorState,
} = vi.hoisted(() => ({
  routerPush: vi.fn(),
  getWeeklyReport: vi.fn(),
  refreshWeekly: vi.fn(async () => undefined),
  clearWeeklyError: vi.fn(async () => undefined),
  setWeeklyError: vi.fn(async () => undefined),
  weeklyRefreshState: {
    label: "Just now",
    lastRefreshedAt: 1,
    refreshLocal: vi.fn(async () => undefined),
  },
  weeklyErrorState: {
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
  Platform: { OS: "web" },
  Share: {
    share: vi.fn(async () => undefined),
  },
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

vi.mock("@/src/api/patient", () => ({
  getWeeklyReport,
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
  EmptyState: ({
    title,
    description,
    ...props
  }: {
    title?: string;
    description?: string;
    [key: string]: unknown;
  }) => React.createElement("mock-empty-state", props, title, description),
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

vi.mock("@/src/components/SegmentedControl", () => ({
  SegmentedControl: (props: Record<string, unknown>) =>
    React.createElement("mock-segmented-control", props),
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

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: (props: Record<string, unknown>) => React.createElement("mock-status-pill", props),
}));

vi.mock("@/src/components/TrackerTile", () => ({
  TrackerTile: (props: Record<string, unknown>) => React.createElement("mock-tracker-tile", props),
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

vi.mock("@/src/state/lastError", () => ({
  useLastError: () => ({ ...weeklyErrorState }),
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: () => false,
}));

vi.mock("@/src/state/weeklyReportCache", () => ({
  getCachedWeeklyReport: vi.fn(async () => null),
  setCachedWeeklyReport: vi.fn(async () => undefined),
}));

vi.mock("@/src/state/refresh", () => ({
  useLastRefreshed: () => ({ ...weeklyRefreshState }),
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

import WeeklyReportScreen from "@/app/weekly-report";

function findHostNodes(root: ReactTestInstance, type: string) {
  return root.findAll((node) => node.type === type);
}

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
    summary: {
      headline: "A steady week",
      highlights: ["Pain stayed stable", "Medication stayed on track"],
      nextSteps: ["Keep following your plan"],
    },
    checkins: {
      count: 2,
      avgPain: 4.2,
      avgMood: 3.8,
      avgExercisesPct: 75,
      medicationYesPct: 100,
      notesCount: 1,
    },
    bodyMap: {
      topRegions: [],
    },
    sleep: {
      trackedNights: 2,
      avgHours: 7.1,
      avgQuality: 3.5,
    },
    photos: {
      uploadedThisWeek: 1,
      kinds: { swelling: 1, wound: 0, rash: 0, other: 0 },
    },
    hydration: {
      trackedDays: 2,
      avgDailyMl: 1900,
      totalMl: 3800,
      daysMeetingTarget: 1,
      targetMl: 2000,
    },
    nutrition: {
      trackedDays: 2,
      avgFruitVegServings: 3.5,
      proteinOkHighDays: 2,
      antiInflammatoryDays: 1,
      regularMealsDays: 2,
    },
    wearables: {
      trackedDays: 2,
      avgSteps: 4200,
      avgActiveMinutes: 32,
      source: "mock",
    },
    medications: {
      scheduledDoses: 4,
      takenDoses: 4,
      skippedDoses: 0,
      adherencePct: 100,
    },
    exercises: {
      sessionCount: 1,
      totalDurationMinutes: 18,
      completedExercises: 3,
      totalExercises: 4,
      avgPainDuring: 4,
      difficulty: { easy: 0, ok: 1, hard: 0 },
    },
    proms: {
      dueNowCount: 0,
      completedThisWeekCount: 1,
      latestCompleted: null,
    },
    safety: {
      alertsCreatedThisWeek: 0,
      highRiskAlertsThisWeek: 0,
    },
    ...overrides,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe("Weekly report screen", () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    routerPush.mockReset();
    getWeeklyReport.mockReset();
    refreshWeekly.mockClear();
    clearWeeklyError.mockClear();
    setWeeklyError.mockClear();
    weeklyRefreshState.refreshLocal = refreshWeekly;
    weeklyErrorState.clear = clearWeeklyError;
    weeklyErrorState.setLocalError = setWeeklyError;
    weeklyErrorState.lastError = null;
    weeklyErrorState.label = "Never";
  });

  it("renders a stable loading section before weekly data arrives", async () => {
    const pending = createDeferred<ReturnType<typeof buildWeeklyReport>>();
    getWeeklyReport.mockReturnValueOnce(pending.promise);

    await act(async () => {
      renderer = create(<WeeklyReportScreen />);
      await flush();
    });

    const root = renderer!.root;
    const sections = findHostNodes(root, "mock-section");

    expect(sections.some((node) => node.props.title === "This week at a glance")).toBe(true);
    expect(flattenText(root)).toContain("Preparing weekly summary");
    expect(findHostNodes(root, "mock-activity-indicator").length).toBe(1);
    expect(findHostNodes(root, "mock-media-card").length).toBe(0);

    await act(async () => {
      pending.resolve(buildWeeklyReport());
      await flush();
    });

    expect(
      findHostNodes(renderer!.root, "mock-media-card").some((node) => node.props.title === "Check-ins"),
    ).toBe(true);
  });

  it("does not restart the initial weekly fetch when refresh metadata changes", async () => {
    getWeeklyReport.mockResolvedValue(buildWeeklyReport());

    await act(async () => {
      renderer = create(<WeeklyReportScreen />);
      await flush();
    });

    expect(getWeeklyReport).toHaveBeenCalledTimes(1);

    weeklyRefreshState.label = "Just now";
    weeklyRefreshState.lastRefreshedAt = 2;

    await act(async () => {
      renderer!.update(<WeeklyReportScreen />);
      await flush();
    });

    expect(getWeeklyReport).toHaveBeenCalledTimes(1);
  });

  it("switches to last week with a stable placeholder instead of stale report content", async () => {
    const lastWeekRequest = createDeferred<ReturnType<typeof buildWeeklyReport>>();
    getWeeklyReport
      .mockResolvedValueOnce(buildWeeklyReport())
      .mockReturnValueOnce(lastWeekRequest.promise);

    await act(async () => {
      renderer = create(<WeeklyReportScreen />);
      await flush();
    });

    const rangeSelector = findHostNodes(renderer!.root, "mock-segmented-control")[0];

    await act(async () => {
      rangeSelector.props.onChange("last");
      await flush();
    });

    expect(getWeeklyReport).toHaveBeenCalledTimes(2);
    expect(getWeeklyReport).toHaveBeenLastCalledWith(
      "token-1",
      expect.objectContaining({ weekStart: "2026-03-30" }),
    );
    expect(flattenText(renderer!.root)).toContain("Preparing weekly summary");
    expect(
      findHostNodes(renderer!.root, "mock-media-card").some((node) => node.props.title === "Check-ins"),
    ).toBe(false);

    await act(async () => {
      lastWeekRequest.resolve(
        buildWeeklyReport({
          period: {
            weekStart: "2026-03-30",
            weekEnd: "2026-04-05",
            tzOffsetMinutes: 330,
          },
        }),
      );
      await flush();
    });

    const header = findHostNodes(renderer!.root, "mock-hero-header")[0];
    expect(header?.props.subtitle).toBe("2026-03-30 to 2026-04-05");
  });

  it("refreshes the selected week without replacing loaded content with the loading section", async () => {
    const refreshRequest = createDeferred<ReturnType<typeof buildWeeklyReport>>();
    getWeeklyReport
      .mockResolvedValueOnce(buildWeeklyReport())
      .mockReturnValueOnce(refreshRequest.promise);

    await act(async () => {
      renderer = create(<WeeklyReportScreen />);
      await flush();
    });

    const refreshButton = findHostNodes(renderer!.root, "mock-primary-button").find(
      (node) => node.props.label === "Refresh summary",
    );

    await act(async () => {
      refreshButton?.props.onPress();
      await flush();
    });

    expect(getWeeklyReport).toHaveBeenCalledTimes(2);
    expect(flattenText(renderer!.root)).not.toContain("Preparing weekly summary");
    expect(
      findHostNodes(renderer!.root, "mock-media-card").some((node) => node.props.title === "Check-ins"),
    ).toBe(true);
    expect(
      findHostNodes(renderer!.root, "mock-primary-button").some(
        (node) => node.props.label === "Refreshing..." && node.props.loading === true,
      ),
    ).toBe(true);

    await act(async () => {
      refreshRequest.resolve(buildWeeklyReport());
      await flush();
    });

    expect(getWeeklyReport).toHaveBeenCalledTimes(2);
  });

  it("shows a truthful building narrative when this week has started but summary data is still sparse", async () => {
    getWeeklyReport.mockResolvedValue(
      buildWeeklyReport({
        summary: {
          headline: "",
          highlights: [],
          nextSteps: [],
        },
        checkins: {
          count: 0,
          avgPain: null,
          avgMood: null,
          avgExercisesPct: null,
          medicationYesPct: null,
          notesCount: 0,
        },
      }),
    );

    await act(async () => {
      renderer = create(<WeeklyReportScreen />);
      await flush();
    });

    const root = renderer!.root;
    const statusPills = findHostNodes(root, "mock-status-pill");
    const text = flattenText(root);

    expect(statusPills.some((node) => node.props.label === "0 check-ins")).toBe(true);
    expect(text).toContain(
      "Your weekly summary is starting to build from your recent check-ins and recovery activity.",
    );
  });

  it("renders the detailed review shell with the expected range control and summary cards", async () => {
    getWeeklyReport.mockResolvedValue(buildWeeklyReport());

    await act(async () => {
      renderer = create(<WeeklyReportScreen />);
      await flush();
    });

    const root = renderer!.root;
    const header = findHostNodes(root, "mock-hero-header")[0];
    const rangeSelector = findHostNodes(root, "mock-segmented-control")[0];
    const mediaCards = findHostNodes(root, "mock-media-card");

    expect(header?.props.title).toBe("Weekly summary");
    expect(rangeSelector?.props.options.map((option: { label: string }) => option.label)).toEqual([
      "This week",
      "Last week",
    ]);
    expect(mediaCards.some((node) => node.props.title === "Check-ins")).toBe(true);
    expect(mediaCards.some((node) => node.props.title === "Safety")).toBe(true);
  });
});
