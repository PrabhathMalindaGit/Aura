import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  alertMock,
  asyncStorage,
  createCheckin,
  createOperationId,
  getNutritionRange,
  getNutritionToday,
  logHydration,
  logMedicationDose,
  networkState,
  routerPush,
  secureStore,
  sendChat,
  sendNutritionSync,
  setNutritionLogError,
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
  createOperationId: vi.fn(() => "nutrition-client-mutation-1"),
  getNutritionRange: vi.fn(async () => ({
    ok: true,
    from: "2026-03-18",
    to: "2026-03-24",
    days: [],
  })),
  getNutritionToday: vi.fn(async () => ({
    ok: true,
    date: "2026-03-24",
    entry: null,
  })),
  logHydration: vi.fn(),
  logMedicationDose: vi.fn(),
  networkState: { offline: false },
  routerPush: vi.fn(),
  secureStore: {
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
  },
  sendChat: vi.fn(),
  sendNutritionSync: vi.fn(async () => undefined),
  setNutritionLogError: vi.fn(async () => undefined),
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
    ListFooterComponent,
  }: {
    ListHeaderComponent?: React.ReactNode;
    ListFooterComponent?: React.ReactNode;
  }) => React.createElement("mock-flat-list", null, ListHeaderComponent, ListFooterComponent),
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

vi.mock("@/src/state/auth", () => ({
  useAuth: vi.fn(() => ({
    status: "signedIn",
    token: "token-nutrition",
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
    setLocalError: key === "nutritionLog" ? setNutritionLogError : vi.fn(async () => undefined),
  })),
}));

vi.mock("@/src/state/nutritionCache", () => ({
  getCachedNutritionDay: vi.fn(async () => null),
  getCachedNutritionRange: vi.fn(async () => null),
  mergeCachedNutritionDays: vi.fn(async () => undefined),
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
}));

vi.mock("@/src/sync/selectors", () => ({
  selectPendingNutritionEntries: vi.fn(() => []),
  useSyncDomainSummary: vi.fn(() => ({
    failedCount: 0,
    pendingCount: 0,
  })),
}));

vi.mock("@/src/sync/copy", () => ({
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

vi.mock("@/src/sync/adapters/nutrition", () => ({
  sendNutritionSync,
}));

vi.mock("@/src/api/patient", () => ({
  createCheckin,
  getNutritionRange,
  getNutritionToday,
  logHydration,
  logMedicationDose,
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
  addDaysISO: vi.fn(() => "2026-03-18"),
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

import NutritionScreen from "../../../app/nutrition";

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

function findButtonByLabel(renderer: ReactTestRenderer, label: string) {
  const match = renderer.root.findAll(
    (node) =>
      typeof node.type === "string" &&
      (String(node.type) === "mock-primary-button" ||
        String(node.type) === "mock-secondary-button") &&
      node.props.label === label,
  )[0];

  if (!match) {
    throw new Error(`Could not find button: ${label}`);
  }

  return match;
}

function findTextInput(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => String(node.type) === "mock-text-input")[0];
}

function findSwitch(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => String(node.type) === "mock-switch")[0];
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
    renderer = create(<NutritionScreen />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer!;
}

async function pressA11y(renderer: ReactTestRenderer, label: string) {
  await act(async () => {
    findByA11y(renderer, label).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function pressButton(renderer: ReactTestRenderer, label: string) {
  await act(async () => {
    findButtonByLabel(renderer, label).props.onPress?.();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function prepareReview(renderer: ReactTestRenderer) {
  await pressA11y(renderer, "Review nutrition voice log");
}

function emitSpeech(eventName: string, event?: unknown) {
  for (const listener of speechListeners.get(eventName) ?? []) {
    listener(event);
  }
}

async function listenAndEmit(renderer: ReactTestRenderer, transcript: string) {
  await act(async () => {
    findByA11y(renderer, "Listen for nutrition log confirmation").props.onPress();
    await Promise.resolve();
    await Promise.resolve();
    emitSpeech("result", {
      isFinal: true,
      results: transcript ? [{ transcript }] : [],
    });
    await Promise.resolve();
  });
}

describe("NutritionScreen confirmed voice log", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    speechListeners.clear();
    networkState.offline = false;
    createOperationId.mockReturnValue("nutrition-client-mutation-1");
    submitQueueableWrite.mockResolvedValue({
      kind: "synced",
      response: true,
    });
    getNutritionToday.mockResolvedValue({
      ok: true,
      date: "2026-03-24",
      entry: null,
    });
    getNutritionRange.mockResolvedValue({
      ok: true,
      from: "2026-03-18",
      to: "2026-03-24",
      days: [],
    });
  });

  it("shows the exact current nutrition form summary for review", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);

    const text = textContent(renderer);
    expect(text).toContain("Voice nutrition review");
    expect(text).toContain(
      "Nutrition log for today: protein ok, fruit and veg 2 servings, anti-inflammatory focus no, meal regularity mostly, appetite not set, notes none.",
    );
    expect(text).toContain(
      "This logs nutrition only. It does not give diet advice, diagnosis, treatment advice, or emergency support.",
    );
  });

  it("shows optional notes in the review summary when present", async () => {
    const renderer = await renderScreen();

    await act(async () => {
      findTextInput(renderer).props.onChangeText("  Had soup and berries.  ");
      await Promise.resolve();
    });
    await prepareReview(renderer);

    expect(textContent(renderer)).toContain("notes Had soup and berries.");
  });

  it("keeps notes trimming and capping on the existing manual path", async () => {
    const renderer = await renderScreen();
    const longNote = "x".repeat(320);

    await act(async () => {
      findTextInput(renderer).props.onChangeText(longNote);
      await Promise.resolve();
    });
    await pressButton(renderer, "Save today’s log");

    expect(submitQueueableWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "nutrition",
        payload: expect.objectContaining({
          notes: "x".repeat(280),
        }),
      }),
    );
  });

  it.each(["yes log", "confirm log", "log this"])(
    "submits through the existing nutrition save path for %s",
    async (phrase) => {
      const renderer = await renderScreen();

      await prepareReview(renderer);
      await listenAndEmit(renderer, phrase);

      expect(submitQueueableWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "nutrition",
          send: sendNutritionSync,
          payload: expect.objectContaining({
            date: "2026-03-24",
            protein: "ok",
            fruitVegServings: 2,
            antiInflammatoryFocus: false,
            mealRegularity: "mostly",
            clientMutationId: "nutrition-client-mutation-1",
          }),
        }),
      );
    },
  );

  it("manual Confirm log in the voice review uses the same nutrition path", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await pressA11y(renderer, "Confirm nutrition voice log");

    expect(submitQueueableWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "nutrition",
        send: sendNutritionSync,
        payload: expect.objectContaining({
          date: "2026-03-24",
          clientMutationId: "nutrition-client-mutation-1",
        }),
      }),
    );
  });

  it.each(["yes", "yeah", "okay", "ok", "sure", "maybe", "continue", "please", "go ahead", "submit", "send", "request", "log", ""])(
    "does not log ambiguous confirmation %s",
    async (phrase) => {
      const renderer = await renderScreen();

      await prepareReview(renderer);
      await listenAndEmit(renderer, phrase);

      expect(submitQueueableWrite).not.toHaveBeenCalled();
      expect(textContent(renderer)).toContain("That was not a clear log confirmation.");
    },
  );

  it.each([
    "cancel",
    "stop",
    "do not submit",
    "dont submit",
    "do not send",
    "dont send",
    "do not request",
    "dont request",
    "do not log",
    "dont log",
    "never mind",
    "go back",
  ])(
    "clears state and does not log for cancel phrase %s",
    async (phrase) => {
      const renderer = await renderScreen();

      await prepareReview(renderer);
      await listenAndEmit(renderer, phrase);

      expect(submitQueueableWrite).not.toHaveBeenCalled();
      expect(textContent(renderer)).toContain("Nutrition voice log cancelled.");
      expect(findByA11y(renderer, "Confirm nutrition voice log").props.disabled).toBe(true);
    },
  );

  it("pressing Cancel clears the review state and does not log", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await pressA11y(renderer, "Cancel nutrition voice log");

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("Nutrition voice log cancelled.");
  });

  it("speech errors and nomatch do not log", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await act(async () => {
      findByA11y(renderer, "Listen for nutrition log confirmation").props.onPress();
      emitSpeech("error", { error: "network" });
      emitSpeech("nomatch");
      await Promise.resolve();
    });

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("That was not a clear log confirmation.");
  });

  it("prevents logging after the confirmation review expires", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await act(async () => {
      vi.advanceTimersByTime(31_000);
      await Promise.resolve();
    });
    await listenAndEmit(renderer, "yes log");

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("Nutrition voice log review expired.");
  });

  it("changing protein invalidates the prior review", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await pressA11y(renderer, "Protein high");
    await pressA11y(renderer, "Confirm nutrition voice log");

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("Nutrition form changed. Review again before voice logging.");
  });

  it("changing fruitVegServings invalidates the prior review", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await pressButton(renderer, "+");
    await pressA11y(renderer, "Confirm nutrition voice log");

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("Nutrition form changed. Review again before voice logging.");
  });

  it("changing antiInflammatoryFocus invalidates the prior review", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await act(async () => {
      findSwitch(renderer).props.onValueChange(true);
      await Promise.resolve();
    });
    await pressA11y(renderer, "Confirm nutrition voice log");

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("Nutrition form changed. Review again before voice logging.");
  });

  it("changing mealRegularity invalidates the prior review", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await pressA11y(renderer, "Meal regularity regular");
    await pressA11y(renderer, "Confirm nutrition voice log");

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("Nutrition form changed. Review again before voice logging.");
  });

  it("changing appetite or notes invalidates the prior review", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await pressA11y(renderer, "Appetite normal");
    await pressA11y(renderer, "Confirm nutrition voice log");
    expect(submitQueueableWrite).not.toHaveBeenCalled();

    await prepareReview(renderer);
    await act(async () => {
      findTextInput(renderer).props.onChangeText("Changed after review");
      await Promise.resolve();
    });
    await pressA11y(renderer, "Confirm nutrition voice log");

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("Nutrition form changed. Review again before voice logging.");
  });

  it("offline confirmed voice log matches manual offline queue behavior", async () => {
    networkState.offline = true;
    submitQueueableWrite.mockResolvedValue({
      kind: "queued",
      operation: {
        operationId: "queued-nutrition",
        status: "blocked_offline",
      },
    } as any);
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await pressA11y(renderer, "Confirm nutrition voice log");

    expect(submitQueueableWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        isOffline: true,
        domain: "nutrition",
        payload: expect.objectContaining({ protein: "ok" }),
      }),
    );
    expect(textContent(renderer)).toContain("Saved on this device");
  });

  it("validation errors block voice log and surface the existing error UI", async () => {
    submitQueueableWrite.mockRejectedValue({
      title: "Validation error",
      message: "Invalid nutrition values.",
      kind: "validation",
      retryable: false,
    });
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await pressA11y(renderer, "Confirm nutrition voice log");

    expect(setNutritionLogError).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "validation",
        retryable: false,
      }),
    );
    expect(textContent(renderer)).toContain("Invalid nutrition values.");
  });

  it("successful response and queued status match existing manual behavior", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await pressA11y(renderer, "Confirm nutrition voice log");
    expect(textContent(renderer)).toContain("Today’s nutrition log synced.");

    submitQueueableWrite.mockClear();
    submitQueueableWrite.mockResolvedValue({
      kind: "queued",
      operation: {
        operationId: "queued-nutrition",
        status: "queued",
      },
    } as any);
    await prepareReview(renderer);
    await pressA11y(renderer, "Confirm nutrition voice log");

    expect(submitQueueableWrite).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "nutrition" }),
    );
    expect(textContent(renderer)).toContain("Saved on this device");
  });

  it("does not introduce diet advice, diagnosis, treatment, medication, alert, or unrelated action paths", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await pressA11y(renderer, "Confirm nutrition voice log");

    const text = textContent(renderer).toLowerCase();
    expect(text).toContain("does not give diet advice, diagnosis, treatment advice, or emergency support");
    expect(text).not.toContain("medication advice");
    expect(text).not.toContain("dosage");
    expect(text).not.toContain("create alert");
    expect(text).not.toContain("safety router bypass");
    expect(createCheckin).not.toHaveBeenCalled();
    expect(sendChat).not.toHaveBeenCalled();
    expect(logHydration).not.toHaveBeenCalled();
    expect(logMedicationDose).not.toHaveBeenCalled();
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalledWith("/safety");
  });

  it("does not persist transcript, raw audio, unconfirmed draft, or expose OpenAI keys", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await listenAndEmit(renderer, "yes log");

    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(asyncStorage.removeItem).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(textContent(renderer)).not.toContain("OPENAI_API_KEY");
    expect(textContent(renderer)).not.toContain("EXPO_PUBLIC_OPENAI_API_KEY");
  });

  it("uses on-device speech recognition without persisting audio", async () => {
    const renderer = await renderScreen();

    await prepareReview(renderer);
    await act(async () => {
      findByA11y(renderer, "Listen for nutrition log confirmation").props.onPress();
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

  it("exposes accessible voice log controls, disabled states, and live status", async () => {
    const renderer = await renderScreen();

    expect(findByA11y(renderer, "Confirm nutrition voice log").props.disabled).toBe(true);
    await prepareReview(renderer);

    expect(findByA11y(renderer, "Review nutrition voice log").props.accessibilityHint).toContain(
      "Shows the exact nutrition log summary",
    );
    expect(findByA11y(renderer, "Listen for nutrition log confirmation").props.accessibilityHint).toContain(
      "Listens once for yes log, confirm log, or log this.",
    );
    expect(findByA11y(renderer, "Confirm nutrition voice log").props.accessibilityHint).toContain(
      "Logs the reviewed nutrition form through the same normal nutrition path.",
    );
    expect(findByA11y(renderer, "Cancel nutrition voice log").props.accessibilityHint).toContain(
      "Clears the current nutrition voice log review without logging.",
    );
    expect(findByA11y(renderer, "Nutrition voice log status").props.accessibilityLiveRegion).toBe(
      "polite",
    );
  });
});
