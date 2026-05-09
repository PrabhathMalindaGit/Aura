import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  alertMock,
  asyncStorage,
  createCheckin,
  createOperationId,
  getHydrationToday,
  logMedicationDose,
  logNutrition,
  networkState,
  routerPush,
  secureStore,
  sendChat,
  setHydrationLogError,
  speechListeners,
  speechModule,
  submitQueueableWrite,
  uploadPhoto,
} = vi.hoisted(() => ({
  alertMock: vi.fn(),
  asyncStorage: {
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  createCheckin: vi.fn(),
  createOperationId: vi.fn(() => "hydration-client-mutation-1"),
  getHydrationToday: vi.fn(async () => ({
    ok: true,
    date: "2026-03-24",
    totalMl: 0,
    targetMl: 2000,
    entries: [],
  })),
  logMedicationDose: vi.fn(),
  logNutrition: vi.fn(),
  networkState: { offline: false },
  routerPush: vi.fn(),
  secureStore: {
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
  },
  sendChat: vi.fn(),
  setHydrationLogError: vi.fn(async () => undefined),
  speechListeners: new Map<string, Array<(event?: unknown) => void>>(),
  speechModule: {
    abort: vi.fn(),
    addListener: vi.fn((eventName: string, listener: (event?: unknown) => void) => {
      const listeners = speechListeners.get(eventName) ?? [];
      listeners.push(listener);
      speechListeners.set(eventName, listeners);
      return {
        remove: vi.fn(() => {
          const current = speechListeners.get(eventName) ?? [];
          speechListeners.set(
            eventName,
            current.filter((candidate) => candidate !== listener),
          );
        }),
      };
    }),
    isRecognitionAvailable: vi.fn(() => true),
    requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
    start: vi.fn(),
    stop: vi.fn(),
    supportsOnDeviceRecognition: vi.fn(() => true),
  },
  submitQueueableWrite: vi.fn(async () => ({
    kind: "synced" as const,
    response: true,
  })),
  uploadPhoto: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: asyncStorage,
}));

vi.mock("expo-secure-store", () => secureStore);

vi.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: speechModule,
}));

vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => React.createElement("mock-redirect", { href }),
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock("@react-navigation/native", () => ({
  useFocusEffect: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement("mock-activity-indicator", props),
  Alert: {
    alert: alertMock,
  },
  FlatList: ({
    ListHeaderComponent,
    ListEmptyComponent,
  }: {
    ListHeaderComponent?: React.ReactNode;
    ListEmptyComponent?: React.ReactNode;
  }) => React.createElement("mock-flat-list", null, ListHeaderComponent, ListEmptyComponent),
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
    absoluteFillObject: {},
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

vi.mock("@/src/state/auth", () => ({
  useAuth: vi.fn(() => ({
    status: "signedIn",
    token: "token-hydration",
    patient: { id: "patient-1", displayName: "Patient One" },
  })),
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: vi.fn(() => networkState.offline),
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: vi.fn(() => ({
    colors: {
      border: "#dddddd",
      dangerSoft: "#fff0f0",
      primary: "#2255aa",
      primaryTextOn: "#ffffff",
      surface: "#ffffff",
      surfaceElevated: "#f7f7f7",
      text: "#111111",
      textMuted: "#666666",
      warningSoft: "#fff8df",
    },
    radius: { md: 12 },
    spacing: { lg: 20, md: 16, sm: 8, xs: 4, xxxl: 32 },
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
  useLastError: vi.fn((key: string) => ({
    label: "None",
    lastError: null,
    clear: vi.fn(async () => undefined),
    setLocalError: key === "hydrationLog" ? setHydrationLogError : vi.fn(async () => undefined),
  })),
}));

vi.mock("@/src/state/hydrationCache", () => ({
  getCachedHydrationDay: vi.fn(async () => null),
  setCachedHydrationDay: vi.fn(async () => undefined),
  setCachedHydrationToday: vi.fn(async () => undefined),
}));

vi.mock("@/src/sync/store", () => ({
  removeSyncOperation: vi.fn(async () => undefined),
  useSyncPatientState: vi.fn(() => ({
    version: 1,
    migratedLegacy: true,
    operations: [],
    lastOutcomeByDomain: {},
  })),
}));

vi.mock("@/src/sync/selectors", () => ({
  selectPendingHydrationEntries: vi.fn(() => []),
  useSyncDomainSummary: vi.fn(() => ({
    failedCount: 0,
    pendingCount: 0,
  })),
}));

vi.mock("@/src/sync/copy", () => ({
  getPendingItemCopy: vi.fn(() => ({
    helper: "Saved on this device",
    label: "Pending",
    variant: "warning",
  })),
  getQueueableSyncSurface: vi.fn(() => ({
    label: "Ready",
    variant: "neutral",
  })),
}));

vi.mock("@/src/sync/runner", () => ({
  flushPendingWrites: vi.fn(async () => ({
    attempted: 0,
    synced: 0,
    failed: 0,
    blockedOffline: 0,
    discarded: 0,
    remaining: 0,
  })),
  submitQueueableWrite,
}));

vi.mock("@/src/sync/model", () => ({
  createOperationId,
}));

vi.mock("@/src/sync/adapters/hydration", () => ({
  sendHydrationSync: vi.fn(async () => undefined),
}));

vi.mock("@/src/api/patient", () => ({
  createCheckin,
  deleteHydrationEntry: vi.fn(async () => undefined),
  getHydrationToday,
  logMedicationDose,
  logNutrition,
  sendChat,
  uploadPhoto,
}));

vi.mock("@/src/api/client", () => ({
  isApiError: vi.fn((error: unknown) => {
    return Boolean(
      error &&
        typeof error === "object" &&
        "title" in error &&
        "message" in error &&
        "kind" in error,
    );
  }),
}));

vi.mock("@/src/components/Avatar", () => ({
  Avatar: () => React.createElement("mock-avatar"),
}));

vi.mock("@/src/components/Banner", () => ({
  Banner: (props: Record<string, unknown>) =>
    React.createElement("mock-banner", props),
}));

vi.mock("@/src/components/Card", () => ({
  Card: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("mock-card", null, children),
}));

vi.mock("@/src/components/EmptyState", () => ({
  EmptyState: (props: Record<string, unknown>) =>
    React.createElement("mock-empty-state", props),
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
  MediaCard: (props: Record<string, unknown>) =>
    React.createElement("mock-media-card", props),
}));

vi.mock("@/src/components/PrimaryButton", () => ({
  PrimaryButton: (props: Record<string, unknown>) => {
    const disabled = Boolean(props.disabled || props.loading);
    return React.createElement("mock-primary-button", {
      accessibilityState: {
        disabled,
        busy: props.loading || undefined,
      },
      ...props,
    });
  },
}));

vi.mock("@/src/components/ReadAloudButton", () => ({
  ReadAloudButton: (props: Record<string, unknown>) =>
    React.createElement("mock-read-aloud-button", {
      accessibilityLabel: props.label,
      ...props,
    }),
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

vi.mock("@/src/components/SecondaryButton", () => ({
  SecondaryButton: (props: Record<string, unknown>) => {
    const disabled = Boolean(props.disabled || props.loading);
    return React.createElement("mock-secondary-button", {
      accessibilityState: {
        disabled,
        busy: props.loading || undefined,
      },
      ...props,
    });
  },
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: () => React.createElement("mock-status-pill"),
}));

vi.mock("@/src/components/TrackerTile", () => ({
  TrackerTile: () => React.createElement("mock-tracker-tile"),
}));

vi.mock("@/src/utils/date", () => ({
  todayISO: vi.fn(() => "2026-03-24"),
}));

vi.mock("@/src/utils/errors", () => ({
  normalizeUnknownError: vi.fn(() => ({
    title: "Unexpected",
    message: "Unexpected failure",
    kind: "unknown",
    retryable: true,
  })),
}));

vi.mock("@/src/utils/readAloud", () => ({
  stopReadAloud: vi.fn(async () => undefined),
}));

import HydrationScreen from "../../../app/hydration";

function findByA11y(renderer: ReactTestRenderer, label: string) {
  const match = renderer.root.findAll(
    (node) =>
      typeof node.props?.accessibilityLabel === "string" &&
      node.props.accessibilityLabel === label,
  )[0];

  if (!match) {
    throw new Error(`Could not find accessibility label: ${label}`);
  }

  return match;
}

function findAllByA11y(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAll(
    (node) =>
      typeof node.props?.accessibilityLabel === "string" &&
      node.props.accessibilityLabel === label,
  );
}

function textContent(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAll((node) => String(node.type) === "mock-text")
    .map((node) => node.children.join(" "))
    .join(" ");
}

async function renderScreen(): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | null = null;
  await act(async () => {
    renderer = create(<HydrationScreen />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer!;
}

async function reviewAmount(renderer: ReactTestRenderer, amountMl: 250 | 500 | 750) {
  await act(async () => {
    findByA11y(renderer, `Review ${amountMl} ml hydration voice log`).props.onPress();
    await Promise.resolve();
  });
}

function emitSpeech(eventName: string, event?: unknown) {
  for (const listener of speechListeners.get(eventName) ?? []) {
    listener(event);
  }
}

async function listenAndEmit(renderer: ReactTestRenderer, transcript: string) {
  await act(async () => {
    findByA11y(renderer, "Listen for hydration log confirmation").props.onPress();
    await Promise.resolve();
    await Promise.resolve();
    emitSpeech("result", {
      isFinal: true,
      results: transcript ? [{ transcript }] : [],
    });
    await Promise.resolve();
  });
}

describe("HydrationScreen confirmed voice log", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    speechListeners.clear();
    networkState.offline = false;
    createOperationId.mockReturnValue("hydration-client-mutation-1");
    submitQueueableWrite.mockResolvedValue({
      kind: "synced",
      response: true,
    });
    getHydrationToday.mockResolvedValue({
      ok: true,
      date: "2026-03-24",
      totalMl: 0,
      targetMl: 2000,
      entries: [],
    });
  });

  it("can prepare a supported quick-add amount and shows the exact summary", async () => {
    const renderer = await renderScreen();

    await reviewAmount(renderer, 250);

    const text = textContent(renderer);
    expect(text).toContain("Voice log review");
    expect(text).toContain("Hydration log: Add 250 ml for today.");
    expect(text).toContain(
      "This logs hydration only. It does not change medication, treatment, or emergency support.",
    );
    expect(findByA11y(renderer, "Read hydration voice log summary")).toBeTruthy();
  });

  it("blocks unsupported or missing amounts from voice logging", async () => {
    const renderer = await renderScreen();

    expect(findAllByA11y(renderer, "Review 1000 ml hydration voice log")).toHaveLength(0);
    await act(async () => {
      findByA11y(renderer, "Confirm hydration voice log").props.onPress();
      await Promise.resolve();
    });

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("Choose 250 ml, 500 ml, or 750 ml before voice logging.");
  });

  it.each(["yes log", "confirm log", "log this"])(
    "submits through the existing hydration quick-add path for %s",
    async (phrase) => {
      const renderer = await renderScreen();

      await reviewAmount(renderer, 500);
      await listenAndEmit(renderer, phrase);

      expect(submitQueueableWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "hydration",
          payload: expect.objectContaining({
            amountMl: 500,
            date: "2026-03-24",
            clientMutationId: "hydration-client-mutation-1",
          }),
        }),
      );
    },
  );

  it("manual Confirm log in the voice review uses the same hydration path", async () => {
    const renderer = await renderScreen();

    await reviewAmount(renderer, 750);
    await act(async () => {
      findByA11y(renderer, "Confirm hydration voice log").props.onPress();
      await Promise.resolve();
    });

    expect(submitQueueableWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "hydration",
        payload: expect.objectContaining({
          amountMl: 750,
          date: "2026-03-24",
        }),
      }),
    );
  });

  it.each(["yes", "okay", "maybe", "", "log", "please log it"])(
    "does not log ambiguous confirmation %s",
    async (phrase) => {
      const renderer = await renderScreen();

      await reviewAmount(renderer, 250);
      await listenAndEmit(renderer, phrase);

      expect(submitQueueableWrite).not.toHaveBeenCalled();
      expect(textContent(renderer)).toContain("That was not a clear log confirmation.");
    },
  );

  it.each(["cancel", "stop", "do not log", "dont log"])(
    "clears state and does not log for cancel phrase %s",
    async (phrase) => {
      const renderer = await renderScreen();

      await reviewAmount(renderer, 250);
      await listenAndEmit(renderer, phrase);

      expect(submitQueueableWrite).not.toHaveBeenCalled();
      expect(textContent(renderer)).toContain("Hydration voice log cancelled.");
      expect(findByA11y(renderer, "Confirm hydration voice log").props.disabled).toBe(true);
    },
  );

  it("pressing Cancel clears the review state and does not log", async () => {
    const renderer = await renderScreen();

    await reviewAmount(renderer, 250);
    await act(async () => {
      findByA11y(renderer, "Cancel hydration voice log").props.onPress();
      await Promise.resolve();
    });

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("Hydration voice log cancelled.");
  });

  it("speech errors and nomatch do not log", async () => {
    const renderer = await renderScreen();

    await reviewAmount(renderer, 250);
    await act(async () => {
      findByA11y(renderer, "Listen for hydration log confirmation").props.onPress();
      emitSpeech("error", { error: "network" });
      emitSpeech("nomatch");
      await Promise.resolve();
    });

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("That was not a clear log confirmation.");
  });

  it("prevents logging after the confirmation review expires", async () => {
    const renderer = await renderScreen();

    await reviewAmount(renderer, 250);
    await act(async () => {
      vi.advanceTimersByTime(31_000);
      await Promise.resolve();
    });
    await listenAndEmit(renderer, "yes log");

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("Hydration voice log review expired.");
  });

  it("changing the reviewed amount invalidates the prior review snapshot", async () => {
    const renderer = await renderScreen();

    await reviewAmount(renderer, 250);
    await reviewAmount(renderer, 500);
    expect(textContent(renderer)).toContain("Hydration log: Add 500 ml for today.");
    await listenAndEmit(renderer, "yes log");

    expect(submitQueueableWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          amountMl: 500,
        }),
      }),
    );
    expect(submitQueueableWrite).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          amountMl: 250,
        }),
      }),
    );
  });

  it("offline confirmed voice log matches manual offline queue behavior", async () => {
    networkState.offline = true;
    submitQueueableWrite.mockResolvedValue({
      kind: "queued",
      operation: {
        operationId: "queued-hydration",
        status: "blocked_offline",
      },
    } as any);
    const renderer = await renderScreen();

    await reviewAmount(renderer, 250);
    await act(async () => {
      findByA11y(renderer, "Confirm hydration voice log").props.onPress();
      await Promise.resolve();
    });

    expect(submitQueueableWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        isOffline: true,
        domain: "hydration",
        payload: expect.objectContaining({ amountMl: 250 }),
      }),
    );
    expect(textContent(renderer)).toContain("Saved on this device");
  });

  it("validation errors block voice log and surface the existing error UI", async () => {
    submitQueueableWrite.mockRejectedValue({
      title: "Validation error",
      message: "Invalid hydration entry.",
      kind: "validation",
      retryable: false,
    });
    const renderer = await renderScreen();

    await reviewAmount(renderer, 250);
    await act(async () => {
      findByA11y(renderer, "Confirm hydration voice log").props.onPress();
      await Promise.resolve();
    });

    expect(setHydrationLogError).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "validation",
        retryable: false,
      }),
    );
    expect(textContent(renderer)).toContain("Invalid hydration entry.");
  });

  it("does not call unrelated clinical, upload, persistence, or key paths", async () => {
    const renderer = await renderScreen();

    await reviewAmount(renderer, 250);
    await act(async () => {
      findByA11y(renderer, "Confirm hydration voice log").props.onPress();
      await Promise.resolve();
    });

    expect(createCheckin).not.toHaveBeenCalled();
    expect(sendChat).not.toHaveBeenCalled();
    expect(logNutrition).not.toHaveBeenCalled();
    expect(logMedicationDose).not.toHaveBeenCalled();
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalledWith("/safety");
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(asyncStorage.removeItem).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(textContent(renderer)).not.toContain("OPENAI_API_KEY");
    expect(textContent(renderer)).not.toContain("EXPO_PUBLIC_OPENAI_API_KEY");
  });

  it("uses on-device speech recognition without persisting audio", async () => {
    const renderer = await renderScreen();

    await reviewAmount(renderer, 250);
    await act(async () => {
      findByA11y(renderer, "Listen for hydration log confirmation").props.onPress();
      await Promise.resolve();
    });

    expect(speechModule.supportsOnDeviceRecognition).toHaveBeenCalled();
    expect(speechModule.start).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresOnDeviceRecognition: true,
        recordingOptions: { persist: false },
      }),
    );
  });

  it("exposes accessible voice log controls and live status", async () => {
    const renderer = await renderScreen();

    await reviewAmount(renderer, 250);

    expect(findByA11y(renderer, "Review 250 ml hydration voice log").props.accessibilityHint).toContain(
      "Shows the exact hydration log summary",
    );
    expect(findByA11y(renderer, "Listen for hydration log confirmation").props.accessibilityHint).toContain(
      "Listens once for yes log, confirm log, or log this.",
    );
    expect(findByA11y(renderer, "Confirm hydration voice log").props.accessibilityHint).toContain(
      "Logs the reviewed hydration amount through the same normal hydration path.",
    );
    expect(findByA11y(renderer, "Cancel hydration voice log").props.accessibilityHint).toContain(
      "Clears the current hydration voice log review without logging.",
    );
    expect(findByA11y(renderer, "Hydration voice log status").props.accessibilityLiveRegion).toBe(
      "polite",
    );
  });
});
