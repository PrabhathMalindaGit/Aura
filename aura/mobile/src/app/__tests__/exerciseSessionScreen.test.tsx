import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getTodayExercisePlan,
  createExerciseSession,
  getActiveExerciseSession,
  setActiveExerciseSession,
  clearActiveExerciseSession,
  getCachedExercisePlan,
  setCachedExercisePlan,
  addPending,
  routerReplace,
} = vi.hoisted(() => ({
  getTodayExercisePlan: vi.fn(),
  createExerciseSession: vi.fn(),
  getActiveExerciseSession: vi.fn(async () => null),
  setActiveExerciseSession: vi.fn(async () => undefined),
  clearActiveExerciseSession: vi.fn(async () => undefined),
  getCachedExercisePlan: vi.fn(async () => null),
  setCachedExercisePlan: vi.fn(async () => undefined),
  addPending: vi.fn(async () => "pending-1"),
  routerReplace: vi.fn(),
}));

vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => React.createElement("mock-redirect", { href }),
  useRouter: () => ({
    replace: routerReplace,
  }),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement("mock-activity-indicator", props),
  Modal: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-modal", props, children),
  Pressable: ({
    children,
    style,
    ...props
  }: {
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    style?: unknown;
    [key: string]: unknown;
  }) =>
    React.createElement(
      "mock-pressable",
      {
        ...props,
        style: typeof style === "function" ? style({ pressed: false }) : style,
      },
      typeof children === "function" ? children({ pressed: false }) : children,
    ),
  RefreshControl: (props: Record<string, unknown>) =>
    React.createElement("mock-refresh-control", props),
  ScrollView: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-scroll-view", props, children),
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
  TextInput: (props: Record<string, unknown>) => React.createElement("mock-text-input", props),
  View: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-view", props, children),
}));

vi.mock("@/src/api/client", () => ({
  isApiError: () => false,
}));

vi.mock("@/src/api/patient", () => ({
  createExerciseSession,
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

vi.mock("@/src/components/IconSet", () => ({
  DomainIcon: (props: Record<string, unknown>) => React.createElement("mock-domain-icon", props),
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

vi.mock("@/src/components/ReadAloudButton", () => ({
  ReadAloudButton: (props: Record<string, unknown>) =>
    React.createElement("mock-read-aloud-button", props),
  normalizeReadAloudText: (parts: Array<string | null | undefined>) =>
    parts.filter(Boolean).join(". "),
}));

vi.mock("@/src/components/Screen", () => ({
  Screen: ({
    children,
    header,
    ...props
  }: {
    children?: React.ReactNode;
    header?: React.ReactNode;
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

vi.mock("@/src/state/auth", () => ({
  useAuth: () => ({
    status: "signedIn",
    token: "patient-token",
    patient: { id: "patient-1", displayName: "Patient One" },
  }),
}));

vi.mock("@/src/state/activeExerciseSession", () => ({
  clearActiveExerciseSession,
  getActiveExerciseSession,
  setActiveExerciseSession,
}));

vi.mock("@/src/state/exercisePlanCache", () => ({
  getCachedExercisePlan,
  setCachedExercisePlan,
}));

vi.mock("@/src/state/lastError", () => ({
  useLastError: () => ({
    clear: vi.fn(async () => undefined),
    label: "Never",
    lastError: null,
    setLocalError: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: () => false,
}));

vi.mock("@/src/state/pendingSessions", () => ({
  addPending,
}));

vi.mock("@/src/state/refresh", () => ({
  useLastRefreshed: () => ({
    label: "Never",
    refreshLocal: vi.fn(),
  }),
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      border: "#d7e0e7",
      danger: "#c94a3b",
      dangerTextOn: "#fcece9",
      primary: "#2f6fed",
      primarySoft: "#eef4ff",
      primaryTextOn: "#ffffff",
      success: "#2f8f83",
      successSoft: "#eaf7f4",
      surface: "#ffffff",
      surfaceElevated: "#fbf9f5",
      text: "#183042",
      textMuted: "#5e7182",
      warning: "#c9892b",
      warningTextOn: "#fbf3e4",
    },
    elevation: { card: {} },
    radius: { md: 14, lg: 18, xl: 24 },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 40, xxxxl: 48 },
    typography: {
      body: { fontSize: 16, lineHeight: 24 },
      caption: { fontSize: 13, lineHeight: 18 },
      section: { fontSize: 21, lineHeight: 28 },
      title: { fontSize: 28, lineHeight: 34 },
      weights: { medium: "500", semibold: "600" },
    },
  }),
}));

vi.mock("@/src/utils/errors", () => ({
  normalizeUnknownError: () => ({
    title: "Couldn’t save",
    message: "Please try again.",
    kind: "unknown",
    retryable: true,
  }),
}));

import ExerciseSessionScreen from "@/app/exercise-session";

function flush() {
  return Promise.resolve().then(() => Promise.resolve());
}

describe("ExerciseSessionScreen feedback accessibility", () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
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
    getActiveExerciseSession.mockResolvedValue(null);
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
    }
    renderer = null;
    vi.clearAllMocks();
  });

  it("opens a feedback modal with modal semantics, selected difficulty state, pain value, and labeled note input", async () => {
    await act(async () => {
      renderer = create(<ExerciseSessionScreen />);
      await flush();
    });

    const exerciseCard = renderer!.root
      .findAll((node) => String(node.type) === "mock-media-card")
      .find((node) => node.props.title === "Heel slides");

    act(() => {
      exerciseCard?.props.actions[0].onPress();
    });

    const modal = renderer!.root.findAll((node) => String(node.type) === "mock-modal")[0];
    expect(modal).toBeDefined();
    expect(modal.props.accessibilityViewIsModal).toBe(true);
    expect(renderer!.root.findByProps({ accessibilityRole: "header" }).props.children).toBe(
      "Session feedback",
    );

    const easy = renderer!.root.findByProps({ accessibilityLabel: "Set exercise difficulty to easy" });
    expect(easy.props.accessibilityState).toEqual({ selected: false });

    act(() => {
      easy.props.onPress();
    });

    expect(
      renderer!.root.findByProps({ accessibilityLabel: "Set exercise difficulty to easy" }).props
        .accessibilityState,
    ).toEqual({ selected: true });

    const increasePain = renderer!.root.findByProps({
      accessibilityLabel: "Increase pain during exercise",
    });
    expect(increasePain.props.accessibilityValue).toEqual({
      min: 0,
      max: 5,
      now: 0,
      text: "Pain during exercise: 0 out of 5",
    });

    const note = renderer!.root.findByProps({ accessibilityLabel: "Exercise feedback note" });
    expect(note.props.accessibilityHint).toBe("Optional. Add a short note about how this exercise felt.");

    const save = renderer!.root.findByProps({ accessibilityLabel: "Save exercise feedback" });
    expect(save.props.accessibilityHint).toBe(
      "Saves this feedback and marks the exercise step complete.",
    );
  });
});
