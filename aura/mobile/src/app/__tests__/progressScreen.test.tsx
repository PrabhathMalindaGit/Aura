import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  routerPush,
  listCheckins,
  getHydrationRange,
  getCachedCheckins,
  setCachedCheckins,
  getCachedHydrationRange,
  mergeCachedHydrationDayTotals,
  refreshProgress,
  progressLoadSetError,
  progressLoadClear,
  networkState,
} = vi.hoisted(() => ({
  routerPush: vi.fn(),
  listCheckins: vi.fn(),
  getHydrationRange: vi.fn(),
  getCachedCheckins: vi.fn(async () => []),
  setCachedCheckins: vi.fn(async () => undefined),
  getCachedHydrationRange: vi.fn(async () => ({ days: [] })),
  mergeCachedHydrationDayTotals: vi.fn(async () => undefined),
  refreshProgress: vi.fn(async () => undefined),
  progressLoadSetError: vi.fn(async () => undefined),
  progressLoadClear: vi.fn(async () => undefined),
  networkState: { offline: false },
}));

vi.mock("expo-router", () => ({
  Redirect: () => null,
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock("react-native", () => ({
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
  RefreshControl: (props: Record<string, unknown>) =>
    React.createElement("mock-refresh-control", props),
  Platform: { OS: "web" },
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

vi.mock("@/src/api/patient", async () => {
  const actual = await vi.importActual<typeof import("@/src/api/patient")>("@/src/api/patient");
  return {
    ...actual,
    listCheckins,
    getHydrationRange,
  };
});

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

vi.mock("@/src/components/LastFailedAttempt", () => ({
  LastFailedAttempt: (props: Record<string, unknown>) =>
    React.createElement("mock-last-failed-attempt", props),
}));

vi.mock("@/src/components/MediaCard", () => ({
  MediaCard: (props: Record<string, unknown>) => React.createElement("mock-media-card", props),
}));

vi.mock("@/src/components/progress/ProgressSignalCard", () => ({
  ProgressSignalCard: (props: Record<string, unknown>) =>
    React.createElement("mock-progress-signal-card", props),
}));

vi.mock("@/src/components/progress/ProgressTrendCard", () => ({
  ProgressTrendCard: (props: Record<string, unknown>) =>
    React.createElement("mock-progress-trend-card", props),
}));

vi.mock("@/src/components/SegmentedControl", () => ({
  SegmentedControl: (props: Record<string, unknown>) =>
    React.createElement("mock-segmented-control", props),
}));

vi.mock("@/src/components/Screen", () => ({
  Screen: ({
    children,
    banner,
    ...props
  }: {
    children?: React.ReactNode;
    banner?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-screen", props, banner, children),
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

vi.mock("@/src/state/checkinsCache", () => ({
  getCachedCheckins,
  setCachedCheckins,
}));

vi.mock("@/src/state/hydrationCache", () => ({
  getCachedHydrationRange,
  mergeCachedHydrationDayTotals,
}));

vi.mock("@/src/state/lastError", () => ({
  useLastError: () => ({
    label: "Never",
    lastError: null,
    setLocalError: progressLoadSetError,
    clear: progressLoadClear,
  }),
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: () => networkState.offline,
}));

vi.mock("@/src/state/progressSelection", () => ({
  setSelectedCheckin: vi.fn(),
}));

vi.mock("@/src/state/refresh", () => ({
  useLastRefreshed: () => ({
    label: "Just now",
    lastRefreshedAt: Date.now(),
    refreshLocal: refreshProgress,
  }),
}));

vi.mock("@/src/state/trustStatus", () => ({
  useTrustStatus: () => ({
    kind: "ok",
    pendingCount: 0,
    failedCount: 0,
  }),
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      primary: "#2F6FED",
      surface: "#ffffff",
      surfaceElevated: "#FBF9F5",
      border: "#D7E0E7",
      text: "#183042",
      textMuted: "#5E7182",
      textSecondary: "#5E7182",
      textTertiary: "#8393A0",
      success: "#2F8F83",
      warning: "#C9892B",
      danger: "#C94A3B",
    },
    radius: { md: 14, lg: 18 },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
    elevation: { card: {}, sm: {}, md: {}, none: {} },
    typography: {
      body: { fontSize: 16, lineHeight: 24 },
      caption: { fontSize: 13, lineHeight: 18 },
      section: { fontSize: 21, lineHeight: 28 },
      weights: { medium: "500", semibold: "600" },
    },
  }),
}));

import ProgressScreen from "@/app/(tabs)/progress";

function flattenText(node: ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : flattenText(child as ReactTestInstance),
    )
    .join(" ");
}

describe("ProgressScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T12:00:00.000Z"));
    routerPush.mockReset();
    listCheckins.mockReset();
    getHydrationRange.mockReset();

    listCheckins.mockResolvedValue([
      {
        id: "checkin-1",
        date: "2026-04-10T09:00:00.000Z",
        pain: 3,
        mood: 4,
        adherence: { exercises: 0.9, medication: true },
        sleep: { hours: 7.5 },
      },
      {
        id: "checkin-2",
        date: "2026-04-08T09:00:00.000Z",
        pain: 4,
        mood: 4,
        adherence: { exercises: 0.8, medication: true },
        sleep: { hours: 7.1 },
      },
      {
        id: "checkin-3",
        date: "2026-04-02T09:00:00.000Z",
        pain: 6,
        mood: 3,
        adherence: { exercises: 0.5, medication: false },
        sleep: { hours: 6.5 },
        support: { wantsFollowUp: true },
      },
      {
        id: "checkin-4",
        date: "2026-03-27T09:00:00.000Z",
        pain: 7,
        mood: 2,
        adherence: { exercises: 0.4, medication: false },
        sleep: { hours: 5.9 },
      },
      {
        id: "checkin-5",
        date: "2026-03-20T09:00:00.000Z",
        pain: 7,
        mood: 2,
        adherence: { exercises: 0.3, medication: false },
        sleep: { hours: 5.7 },
      },
    ]);

    getHydrationRange.mockResolvedValue({
      days: [
        { date: "2026-04-04", totalMl: 1600 },
        { date: "2026-04-05", totalMl: 1700 },
        { date: "2026-04-06", totalMl: 1800 },
        { date: "2026-04-07", totalMl: 1900 },
        { date: "2026-04-08", totalMl: 2100 },
        { date: "2026-04-09", totalMl: 2200 },
        { date: "2026-04-10", totalMl: 2000 },
      ],
      from: "2026-01-12",
      to: "2026-04-11",
      targetMl: 2000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders one coherent progress shell with a prominent range selector", async () => {
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<ProgressScreen />);
    });

    const progressShells = renderer!.root.findAll(
      (node) => String(node.type) === "mock-view" && node.props.testID === "progress-shell",
    );

    expect(progressShells).toHaveLength(1);

    const rangeControls = renderer!.root.findAll(
      (node) =>
        String(node.type) === "mock-segmented-control" &&
        node.props.testID === "progress-range-selector",
    );

    expect(rangeControls).toHaveLength(1);
    expect(rangeControls[0]?.props.options.map((option: { label: string }) => option.label)).toEqual([
      "7d",
      "30d",
      "90d",
    ]);
  });

  it("caps the signal summary, keeps the trend-story section, and renders grouped history cards", async () => {
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<ProgressScreen />);
    });

    const signalCards = renderer!.root.findAll(
      (node) => String(node.type) === "mock-progress-signal-card",
    );
    const trendCards = renderer!.root.findAll(
      (node) => String(node.type) === "mock-progress-trend-card",
    );
    const historyCards = renderer!.root.findAll(
      (node) => String(node.type) === "mock-media-card",
    );
    const text = flattenText(renderer!.root);

    expect(signalCards).toHaveLength(4);
    expect(trendCards).toHaveLength(3);
    expect(historyCards).toHaveLength(5);
    expect(text).toContain("Pain improved");
    expect(text).toContain("This week");
    expect(text).toContain("Last week");
  });

  it("uses the shared threshold logic to surface worsening trends and stronger high-risk history emphasis", async () => {
    listCheckins.mockResolvedValue([
      {
        id: "checkin-1",
        date: "2026-04-10T09:00:00.000Z",
        pain: 8,
        mood: 2,
        adherence: { exercises: 0.4, medication: false },
        support: { wantsFollowUp: true },
      },
      {
        id: "checkin-2",
        date: "2026-04-09T09:00:00.000Z",
        pain: 7,
        mood: 2,
        adherence: { exercises: 0.5, medication: false },
      },
      {
        id: "checkin-3",
        date: "2026-04-03T09:00:00.000Z",
        pain: 3,
        mood: 4,
        adherence: { exercises: 0.9, medication: true },
      },
      {
        id: "checkin-4",
        date: "2026-03-28T09:00:00.000Z",
        pain: 2,
        mood: 4,
        adherence: { exercises: 0.8, medication: true },
      },
      {
        id: "checkin-5",
        date: "2026-03-20T09:00:00.000Z",
        pain: 2,
        mood: 4,
        adherence: { exercises: 0.9, medication: true },
      },
      {
        id: "checkin-6",
        date: "2026-03-18T09:00:00.000Z",
        pain: 3,
        mood: 4,
        adherence: { exercises: 0.85, medication: true },
      },
    ]);

    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<ProgressScreen />);
    });

    const trendCards = renderer!.root.findAll(
      (node) => String(node.type) === "mock-progress-trend-card",
    );
    const historyCards = renderer!.root.findAll(
      (node) => String(node.type) === "mock-media-card",
    );

    expect(trendCards.some((node) => node.props.statusLabel === "Worsening")).toBe(true);
    expect(
      historyCards.some(
        (node) => node.props.statusPill?.text === "Support requested" || node.props.statusPill?.text === "High pain day",
      ),
    ).toBe(true);
  });

  it("shows a clearer empty state when there are no check-ins in the selected window", async () => {
    listCheckins.mockResolvedValue([]);
    getHydrationRange.mockResolvedValue({
      days: [],
      from: "2026-04-04",
      to: "2026-04-11",
      targetMl: 2000,
    });

    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<ProgressScreen />);
    });

    const emptyState = renderer!.root.findAll(
      (node) => String(node.type) === "mock-empty-state",
    )[0];

    expect(emptyState?.props.title).toBe("No check-ins in this window yet");
    expect(emptyState?.props.description).toBe(
      "Complete a daily check-in to start building your recovery story in this review window.",
    );
    expect(emptyState?.props.ctaLabel).toBe("Start today’s check-in");
  });
});
