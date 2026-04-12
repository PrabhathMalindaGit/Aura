import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  routerPush,
  getTodayExercisePlan,
  getActiveExerciseSession,
  getPending,
  setCachedExercisePlan,
  refreshPlan,
  clearPlanError,
  setPlanError,
  planRefreshState,
  planErrorState,
  canPatientUsePlan,
  getCareModeNotice,
  } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  getTodayExercisePlan: vi.fn(),
  getActiveExerciseSession: vi.fn(async (): Promise<any> => null),
  getPending: vi.fn(async () => []),
  setCachedExercisePlan: vi.fn(async () => undefined),
  refreshPlan: vi.fn(async () => undefined),
  clearPlanError: vi.fn(async () => undefined),
  setPlanError: vi.fn(async () => undefined),
  planRefreshState: {
    label: "Just now",
    lastRefreshedAt: 1,
    refreshLocal: vi.fn(async () => undefined),
  },
  planErrorState: {
    label: "Never",
    lastError: null,
    clear: vi.fn(async () => undefined),
    setLocalError: vi.fn(async () => undefined),
  },
  canPatientUsePlan: vi.fn(() => true),
  getCareModeNotice: vi.fn((): any => null),
}));

vi.mock("expo-router", () => ({
  Redirect: () => null,
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement("mock-activity-indicator", props),
  FlatList: ({
    data = [],
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    ListFooterComponent,
    ItemSeparatorComponent,
    keyExtractor,
    ...props
  }: {
    data?: unknown[];
    renderItem: (info: { item: any; index: number }) => React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
    ListEmptyComponent?: React.ReactNode;
    ListFooterComponent?: React.ReactNode;
    ItemSeparatorComponent?: React.ComponentType | React.ReactNode;
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
              typeof ItemSeparatorComponent === "function"
                ? React.createElement(ItemSeparatorComponent)
                : ItemSeparatorComponent,
            ),
          )
        : ListEmptyComponent,
      ListFooterComponent,
    ),
  Linking: {
    canOpenURL: vi.fn(async () => true),
    openURL: vi.fn(async () => undefined),
  },
  Platform: { OS: "web" },
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
  RefreshControl: (props: Record<string, unknown>) =>
    React.createElement("mock-refresh-control", props),
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
  getTodayExercisePlan,
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

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: (props: Record<string, unknown>) => React.createElement("mock-status-pill", props),
}));

vi.mock("@/src/components/TrackerTile", () => ({
  TrackerTile: (props: Record<string, unknown>) => React.createElement("mock-tracker-tile", props),
}));

vi.mock("@/src/state/activeExerciseSession", () => ({
  getActiveExerciseSession,
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

vi.mock("@/src/state/exercisePlanCache", () => ({
  getCachedExercisePlan: vi.fn(async () => null),
  setCachedExercisePlan,
}));

vi.mock("@/src/state/lastError", () => ({
  useLastError: () => planErrorState,
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: () => false,
}));

vi.mock("@/src/state/pendingSessions", () => ({
  getPending,
}));

vi.mock("@/src/state/recoverySupport", () => ({
  canPatientUsePlan,
  getCareModeNotice,
}));

vi.mock("@/src/state/refresh", () => ({
  useLastRefreshed: () => planRefreshState,
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      primary: "#2F6FED",
      surface: "#ffffff",
      surfaceSubtle: "#FBF9F5",
      border: "#D7E0E7",
      text: "#183042",
      textMuted: "#5E7182",
      warning: "#C9892B",
      success: "#2F8F83",
    },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxxl: 40 },
    radius: { md: 14, lg: 18, xl: 24 },
    typography: {
      section: { fontSize: 20, lineHeight: 28 },
      body: { fontSize: 16, lineHeight: 24 },
      caption: { fontSize: 12, lineHeight: 16 },
      weights: { medium: "500", semibold: "600" },
    },
  }),
}));

vi.mock("@/src/utils/date", () => ({
  formatISOToHuman: vi.fn(() => "Apr 11"),
}));

import ExercisePlanScreen from "@/app/exercise-plan";

function findHostNodes(root: ReactTestInstance, type: string) {
  return root.findAll((node) => node.type === type);
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("Exercise plan screen", () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    routerPush.mockReset();
    getTodayExercisePlan.mockReset();
    getActiveExerciseSession.mockReset();
    getPending.mockReset();
    setCachedExercisePlan.mockClear();
    refreshPlan.mockClear();
    clearPlanError.mockClear();
    setPlanError.mockClear();
    canPatientUsePlan.mockReset();
    canPatientUsePlan.mockReturnValue(true);
    getCareModeNotice.mockReset();
    getCareModeNotice.mockReturnValue(null);
    planRefreshState.refreshLocal = refreshPlan;
    planErrorState.clear = clearPlanError;
    planErrorState.setLocalError = setPlanError;
    planErrorState.lastError = null;
    planErrorState.label = "Never";
    getPending.mockResolvedValue([]);
    getActiveExerciseSession.mockResolvedValue(null);
  });

  it("treats rest-day plans as assigned and not as no-plan states", async () => {
    getTodayExercisePlan.mockResolvedValue({
      ok: true,
      patientId: "patient-1",
      date: "2026-04-11",
      dayOfWeek: 6,
      plan: {
        title: "Knee recovery",
        daysOfWeek: [1, 3, 5],
        items: [],
        version: 2,
        updatedAt: "2026-04-10T09:00:00.000Z",
      },
    });

    await act(async () => {
      renderer = create(<ExercisePlanScreen />);
      await flush();
    });

    const root = renderer!.root;
    const planCard = findHostNodes(root, "mock-media-card").find(
      (node) => node.props.title === "Nothing is scheduled for today",
    );

    expect(planCard).toBeTruthy();
    expect(planCard?.props.chips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Assigned" }),
        expect.objectContaining({ text: "Nothing scheduled today" }),
      ]),
    );

    const text = findHostNodes(root, "mock-text").map((node) => node.children.join(" "));
    expect(text).toContain("Nothing scheduled for today");
    expect(text).not.toContain("No plan has been assigned yet");
  });

  it("uses the local active-session truth to promote a single continue action", async () => {
    getTodayExercisePlan.mockResolvedValue({
      ok: true,
      patientId: "patient-1",
      date: "2026-04-11",
      dayOfWeek: 6,
      plan: {
        title: "Knee recovery",
        daysOfWeek: [1, 3, 5],
        items: [
          {
            key: "heel-slides",
            name: "Heel slides",
            instructions: "Slide your heel in and out.",
            order: 1,
          },
        ],
        version: 2,
        updatedAt: "2026-04-10T09:00:00.000Z",
      },
    });
    getActiveExerciseSession.mockResolvedValue({
      patientId: "patient-1",
      date: "2026-04-11",
      planVersion: 2,
      planTitle: "Knee recovery",
      startedAt: "2026-04-11T08:00:00.000Z",
      status: "in_progress",
      exercises: [],
      updatedAt: 1,
    });

    await act(async () => {
      renderer = create(<ExercisePlanScreen />);
      await flush();
    });

    const root = renderer!.root;
    const primaryCard = findHostNodes(root, "mock-media-card").find(
      (node) => node.props.title === "Continue today’s session",
    );
    const statusPills = findHostNodes(root, "mock-status-pill");

    expect(primaryCard).toBeTruthy();
    expect(primaryCard?.props.actions?.[0]?.label).toBe("Open session");
    expect(statusPills.some((node) => node.props.label === "In progress")).toBe(true);
  });

  it("keeps the plan readable but non-startable after discharge", async () => {
    canPatientUsePlan.mockReturnValue(false);
    getCareModeNotice.mockReturnValue({
      title: "Care program completed",
      message:
        "Your care program has ended. Historical progress stays available here, but routine messaging and check-ins are no longer active.",
    });
    getTodayExercisePlan.mockResolvedValue({
      ok: true,
      patientId: "patient-1",
      date: "2026-04-11",
      dayOfWeek: 6,
      plan: {
        title: "Knee recovery",
        daysOfWeek: [1, 3, 5],
        items: [
          {
            key: "heel-slides",
            name: "Heel slides",
            instructions: "Slide your heel in and out.",
            order: 1,
          },
        ],
        version: 2,
        updatedAt: "2026-04-10T09:00:00.000Z",
      },
    });

    await act(async () => {
      renderer = create(<ExercisePlanScreen />);
      await flush();
    });

    const root = renderer!.root;
    const banners = findHostNodes(root, "mock-banner");
    const primaryCard = findHostNodes(root, "mock-media-card").find(
      (node) => node.props.title === "Start with Heel slides",
    );

    expect(
      banners.some((node) => node.props.title === "Care program completed"),
    ).toBe(true);
    expect(primaryCard?.props.actions?.[0]?.label).toBe("View plan");
    expect(primaryCard?.props.actions?.[0]?.kind).toBe("secondary");
  });
});
