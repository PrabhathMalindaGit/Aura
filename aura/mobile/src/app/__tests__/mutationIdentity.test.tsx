import React from "react";
import { act, create } from "react-test-renderer";
import { describe, beforeEach, expect, it, vi } from "vitest";

const {
  clearLastError,
  setLocalError,
  submitQueueableWrite,
  createOperationId,
} = vi.hoisted(() => ({
  clearLastError: vi.fn(async () => undefined),
  setLocalError: vi.fn(async () => undefined),
  submitQueueableWrite: vi.fn(async () => ({
    kind: "synced" as const,
    response: true,
  })),
  createOperationId: vi.fn(() => "default-mutation-id"),
}));

vi.mock("expo-router", () => ({
  Redirect: () => null,
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: () => React.createElement("mock-activity-indicator"),
  Alert: {
    alert: vi.fn(),
  },
  FlatList: ({
    ListHeaderComponent,
  }: {
    ListHeaderComponent?: React.ReactNode;
  }) => React.createElement("mock-flat-list", null, ListHeaderComponent),
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
      typeof children === "function" ? children({ pressed: false }) : children
    ),
  StyleSheet: {
    absoluteFillObject: {},
    create: <T extends Record<string, unknown>>(styles: T) => styles,
  },
  Switch: (props: Record<string, unknown>) =>
    React.createElement("mock-switch", props),
  Text: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-text", props, children),
  TextInput: (props: Record<string, unknown>) =>
    React.createElement("mock-text-input", props),
  View: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-view", props, children),
}));

vi.mock("@react-navigation/native", () => ({
  useFocusEffect: vi.fn(),
}));

vi.mock("@/src/state/auth", () => ({
  useAuth: vi.fn(() => ({
    status: "signedIn",
    token: "token-a",
    patient: { id: "patient-a", displayName: "Patient A" },
  })),
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: vi.fn(() => false),
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: vi.fn(() => ({
    colors: {
      border: "#dddddd",
      primary: "#2255aa",
      primaryTextOn: "#ffffff",
      surface: "#ffffff",
      surfaceElevated: "#f7f7f7",
      text: "#111111",
      textMuted: "#666666",
    },
    radius: { md: 12 },
    spacing: { md: 16, sm: 8, xs: 4, xxxl: 32 },
    typography: {
      body: { fontSize: 16, lineHeight: 22 },
      caption: { fontSize: 12, lineHeight: 16 },
      section: { fontSize: 20, lineHeight: 24 },
      weights: { medium: "500", semibold: "600" },
    },
  })),
}));

vi.mock("@/src/state/refresh", () => ({
  useLastRefreshed: vi.fn(() => ({
    label: "Never",
    refreshLocal: vi.fn(async () => undefined),
  })),
}));

vi.mock("@/src/state/lastError", () => ({
  useLastError: vi.fn(() => ({
    label: "None",
    lastError: null,
    clear: clearLastError,
    setLocalError,
  })),
}));

vi.mock("@/src/state/hydrationCache", () => ({
  getCachedHydrationDay: vi.fn(() => null),
  setCachedHydrationDay: vi.fn(async () => undefined),
  setCachedHydrationToday: vi.fn(async () => undefined),
}));

vi.mock("@/src/state/nutritionCache", () => ({
  getCachedNutritionDay: vi.fn(() => null),
  getCachedNutritionRange: vi.fn(() => null),
  mergeCachedNutritionDays: vi.fn((days: unknown) => days),
  setCachedNutritionDay: vi.fn(async () => undefined),
  setCachedNutritionToday: vi.fn(async () => undefined),
}));

vi.mock("@/src/sync/store", () => ({
  useSyncPatientState: vi.fn(() => ({
    version: 1,
    migratedLegacy: true,
    operations: [],
    lastOutcomeByDomain: {},
  })),
  removeSyncOperation: vi.fn(async () => undefined),
}));

vi.mock("@/src/sync/selectors", () => ({
  selectPendingHydrationEntries: vi.fn(() => []),
  selectPendingNutritionEntries: vi.fn(() => []),
  useSyncDomainSummary: vi.fn(() => ({
    failedCount: 0,
    pendingCount: 0,
  })),
}));

vi.mock("@/src/sync/copy", () => ({
  getPendingItemCopy: vi.fn(() => ({ singular: "entry", plural: "entries" })),
  getQueueableSyncSurface: vi.fn(() => ({
    label: "Ready",
    variant: "neutral",
  })),
}));

vi.mock("@/src/sync/runner", () => ({
  submitQueueableWrite,
  flushPendingWrites: vi.fn(async () => ({
    attempted: 0,
    synced: 0,
    failed: 0,
    blockedOffline: 0,
    remaining: 0,
  })),
}));

vi.mock("@/src/sync/model", () => ({
  createOperationId,
}));

vi.mock("@/src/sync/adapters/hydration", () => ({
  sendHydrationSync: vi.fn(async () => undefined),
}));

vi.mock("@/src/sync/adapters/nutrition", () => ({
  sendNutritionSync: vi.fn(async () => undefined),
}));

vi.mock("@/src/api/patient", () => ({
  getHydrationToday: vi.fn(async () => ({
    ok: true,
    date: "2026-03-24",
    totalMl: 0,
    targetMl: 2000,
    entries: [],
  })),
  deleteHydrationEntry: vi.fn(async () => undefined),
  getNutritionToday: vi.fn(async () => ({
    ok: true,
    date: "2026-03-24",
    entry: null,
  })),
  getNutritionRange: vi.fn(async () => ({
    ok: true,
    from: "2026-03-18",
    to: "2026-03-24",
    days: [],
  })),
}));

vi.mock("@/src/api/client", () => ({
  isApiError: vi.fn((error: unknown) => {
    return (
      typeof error === "object" &&
      error !== null &&
      "title" in error &&
      "message" in error &&
      "kind" in error &&
      "retryable" in error
    );
  }),
}));

vi.mock("@/src/components/Avatar", () => ({
  Avatar: () => React.createElement("mock-avatar"),
}));

vi.mock("@/src/components/Banner", () => ({
  Banner: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("mock-banner", null, children),
}));

vi.mock("@/src/components/Card", () => ({
  Card: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("mock-card", null, children),
}));

vi.mock("@/src/components/IconSet", () => ({
  DomainIcon: () => React.createElement("mock-domain-icon"),
}));

vi.mock("@/src/components/HeroHeader", () => ({
  HeroHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("mock-hero-header", null, children),
}));

vi.mock("@/src/components/LastFailedAttempt", () => ({
  LastFailedAttempt: () => React.createElement("mock-last-failed"),
}));

vi.mock("@/src/components/LastRefreshed", () => ({
  LastRefreshed: () => React.createElement("mock-last-refreshed"),
}));

vi.mock("@/src/components/MediaCard", () => ({
  MediaCard: () => React.createElement("mock-media-card"),
}));

vi.mock("@/src/components/PrimaryButton", () => ({
  PrimaryButton: ({
    label,
    onPress,
  }: {
    label: string;
    onPress?: () => void;
  }) => React.createElement("mock-primary-button", { label, onPress }),
}));

vi.mock("@/src/components/SecondaryButton", () => ({
  SecondaryButton: ({
    label,
    onPress,
  }: {
    label: string;
    onPress?: () => void;
  }) => React.createElement("mock-secondary-button", { label, onPress }),
}));

vi.mock("@/src/components/Screen", () => ({
  Screen: ({
    header,
    children,
  }: {
    header?: React.ReactNode;
    children?: React.ReactNode;
  }) => React.createElement("mock-screen", null, header, children),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: () => React.createElement("mock-status-pill"),
}));

vi.mock("@/src/components/TrackerTile", () => ({
  TrackerTile: () => React.createElement("mock-tracker-tile"),
}));

vi.mock("@/src/utils/date", () => ({
  todayISO: vi.fn(() => "2026-03-24"),
  addDaysISO: vi.fn(() => "2026-03-18"),
}));

import HydrationScreen from "../../../app/hydration";
import NutritionScreen from "../../../app/nutrition";

describe("tracker mutation identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createOperationId.mockReset();
    submitQueueableWrite.mockReset();
    createOperationId.mockReturnValue("default-mutation-id");
    submitQueueableWrite.mockResolvedValue({
      kind: "synced",
      response: true,
    });
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  });

  it("generates hydration clientMutationId before the first send attempt", async () => {
    createOperationId.mockReturnValueOnce("hydration-client-mutation-1");

    let root: ReturnType<typeof create>;
    await act(async () => {
      root = create(<HydrationScreen />);
    });

    const button = root!.root.findAll(
      (node) =>
        node.type === "mock-secondary-button" && node.props.label === "Add 250 ml"
    )[0];

    await act(async () => {
      button.props.onPress?.();
    });

    expect(createOperationId).toHaveBeenCalledTimes(1);
    expect(submitQueueableWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "hydration",
        payload: expect.objectContaining({
          amountMl: 250,
          date: "2026-03-24",
          clientMutationId: "hydration-client-mutation-1",
        }),
      })
    );
  });

  it("generates nutrition clientMutationId before the first send attempt", async () => {
    createOperationId.mockReturnValueOnce("nutrition-client-mutation-1");

    let root: ReturnType<typeof create>;
    await act(async () => {
      root = create(<NutritionScreen />);
    });

    const button = root!.root.findAll(
      (node) =>
        node.type === "mock-primary-button" &&
        node.props.label === "Save today’s log"
    )[0];

    await act(async () => {
      button.props.onPress?.();
    });

    expect(createOperationId).toHaveBeenCalledTimes(1);
    expect(submitQueueableWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "nutrition",
        payload: expect.objectContaining({
          date: "2026-03-24",
          clientMutationId: "nutrition-client-mutation-1",
        }),
      })
    );
  });
});
