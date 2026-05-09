import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  asyncStorage,
  createCheckin,
  getCachedMedicationToday,
  getMedicationToday,
  getMedications,
  logHydration,
  logMedicationDose,
  logNutrition,
  networkState,
  routerPush,
  secureStore,
  sendChat,
  sendMedicationSync,
  setMedicationLogError,
  speechListeners,
  speechModule,
  submitQueueableWrite,
  uploadPhoto,
} = vi.hoisted(() => ({
  asyncStorage: {
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  createCheckin: vi.fn(),
  getCachedMedicationToday: vi.fn(async (): Promise<unknown> => null),
  getMedicationToday: vi.fn(async () => ({
    ok: true,
    date: "2026-03-24",
    items: [
      {
        medicationId: "med-1",
        name: "Aspirin",
        type: "medication",
        instructions: "Take with food.",
        doses: [
          { time: "08:00", status: "due" },
          { time: "20:00", status: "due" },
        ],
      },
      {
        medicationId: "med-2",
        name: "Vitamin D",
        type: "supplement",
        instructions: "Morning supplement.",
        doses: [{ time: "09:30", status: "due" }],
      },
    ],
  })),
  getMedications: vi.fn(async () => ({
    ok: true,
    medications: [],
  })),
  logHydration: vi.fn(),
  logMedicationDose: vi.fn(),
  logNutrition: vi.fn(),
  networkState: { offline: false },
  routerPush: vi.fn(),
  secureStore: {
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
  },
  sendChat: vi.fn(),
  sendMedicationSync: vi.fn(async () => undefined),
  setMedicationLogError: vi.fn(async () => undefined),
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
  useFocusEffect: (callback: () => void | (() => void)) => {
    const didRun = React.useRef(false);
    React.useEffect(() => {
      if (didRun.current) {
        return undefined;
      }
      didRun.current = true;
      const cleanup = callback();
      return typeof cleanup === "function" ? cleanup : undefined;
    }, []);
  },
}));

vi.mock("react-native", () => ({
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement("mock-activity-indicator", props),
  FlatList: ({
    data = [],
    ListHeaderComponent,
    ListEmptyComponent,
    ItemSeparatorComponent,
    renderItem,
  }: {
    data?: unknown[];
    ListHeaderComponent?: React.ReactNode;
    ListEmptyComponent?: React.ReactNode;
    ItemSeparatorComponent?: () => React.ReactNode;
    renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
  }) =>
    React.createElement(
      "mock-flat-list",
      null,
      ListHeaderComponent,
      data.length === 0
        ? ListEmptyComponent
        : data.flatMap((item, index) => [
            React.createElement(
              React.Fragment,
              { key: `item-${index}` },
              renderItem?.({ item, index }),
            ),
            index < data.length - 1 && ItemSeparatorComponent
              ? React.createElement(
                  React.Fragment,
                  { key: `separator-${index}` },
                  ItemSeparatorComponent(),
                )
              : null,
          ]),
    ),
  Pressable: ({
    children,
    disabled,
    ...props
  }: {
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    disabled?: boolean;
    [key: string]: unknown;
  }) =>
    React.createElement(
      "mock-pressable",
      {
        accessibilityState: { disabled: Boolean(disabled) },
        disabled,
        ...props,
      },
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
    token: "token-medications",
    patient: { id: "patient-1", displayName: "Patient One" },
  })),
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: vi.fn(() => networkState.offline),
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: vi.fn(() => ({
    colors: {
      accent: "#2255aa",
      border: "#dddddd",
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
    setLocalError: key === "medicationLog" ? setMedicationLogError : vi.fn(async () => undefined),
  })),
}));

vi.mock("@/src/state/medicationTodayCache", () => ({
  getCachedMedicationToday,
  setCachedMedicationToday: vi.fn(async () => undefined),
}));

vi.mock("@/src/state/medicationsCache", () => ({
  getCachedMedications: vi.fn(async () => null),
  setCachedMedications: vi.fn(async () => undefined),
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
  selectPendingMedicationEntries: vi.fn(() => []),
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

vi.mock("@/src/sync/adapters/medications", () => ({
  sendMedicationSync,
}));

vi.mock("@/src/api/patient", () => ({
  createCheckin,
  getMedicationToday,
  getMedications,
  logHydration,
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
  normalizeUnknownError: vi.fn((error: unknown) => ({
    title: "Unexpected",
    message: error instanceof Error ? error.message : "Unexpected failure",
    kind: "unknown",
    retryable: true,
  })),
}));

vi.mock("@/src/utils/readAloud", () => ({
  stopReadAloud: vi.fn(async () => undefined),
}));

import MedicationsScreen from "../../../app/medications";

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
    renderer = create(<MedicationsScreen />);
    await Promise.resolve();
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

async function reviewDose(
  renderer: ReactTestRenderer,
  medicationName = "Aspirin",
  timeLabel = "08:00 AM",
  status: "taken" | "skipped" = "taken",
) {
  await pressA11y(renderer, `Review mark ${medicationName} dose at ${timeLabel} as ${status}`);
}

function emitSpeech(eventName: string, event?: unknown) {
  for (const listener of speechListeners.get(eventName) ?? []) {
    listener(event);
  }
}

async function listenAndEmit(renderer: ReactTestRenderer, transcript: string) {
  await act(async () => {
    findByA11y(renderer, "Listen for medication log confirmation").props.onPress();
    await Promise.resolve();
    await Promise.resolve();
    emitSpeech("result", {
      isFinal: true,
      results: transcript ? [{ transcript }] : [],
    });
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("MedicationsScreen confirmed voice medication status log", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    speechListeners.clear();
    networkState.offline = false;
    getCachedMedicationToday.mockResolvedValue(null);
    submitQueueableWrite.mockResolvedValue({
      kind: "synced",
      response: true,
    });
  });

  it("requires an existing scheduled dose before voice medication logging", async () => {
    getMedicationToday.mockResolvedValueOnce({
      ok: true,
      date: "2026-03-24",
      items: [],
    });
    const renderer = await renderScreen();

    await pressA11y(renderer, "Confirm medication voice log");

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("Choose a scheduled dose and status before voice logging.");
  });

  it("shows the exact medication name, scheduled time, status, and safety copy", async () => {
    const renderer = await renderScreen();

    await reviewDose(renderer, "Aspirin", "08:00 AM", "taken");

    const text = textContent(renderer);
    expect(text).toContain("Voice medication review");
    expect(text).toContain("Medication log: Mark Aspirin scheduled at 08:00 AM today as taken.");
    expect(text).toContain(
      "This only records medication status. It does not change your medication plan, dose, or schedule.",
    );
    expect(findByA11y(renderer, "Read medication voice log summary")).toBeTruthy();
  });

  it.each(["yes log", "confirm log", "log this"])(
    "submits through the existing medication dose action path for %s",
    async (phrase) => {
      const renderer = await renderScreen();

      await reviewDose(renderer, "Aspirin", "08:00 AM", "taken");
      await listenAndEmit(renderer, phrase);

      expect(submitQueueableWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "medications",
          send: sendMedicationSync,
          payload: expect.objectContaining({
            medicationId: "med-1",
            date: "2026-03-24",
            time: "08:00",
            status: "taken",
          }),
        }),
      );
    },
  );

  it("manual Confirm log in the voice review uses the same medication path", async () => {
    const renderer = await renderScreen();

    await reviewDose(renderer, "Aspirin", "08:00 AM", "skipped");
    await pressA11y(renderer, "Confirm medication voice log");

    expect(submitQueueableWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "medications",
        send: sendMedicationSync,
        payload: expect.objectContaining({
          medicationId: "med-1",
          date: "2026-03-24",
          time: "08:00",
          status: "skipped",
        }),
      }),
    );
  });

  it.each(["yes", "yeah", "okay", "ok", "sure", "maybe", "continue", "please", "go ahead", "submit", "send", "request", "log", ""])(
    "does not log ambiguous confirmation %s",
    async (phrase) => {
      const renderer = await renderScreen();

      await reviewDose(renderer);
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

      await reviewDose(renderer);
      await listenAndEmit(renderer, phrase);

      expect(submitQueueableWrite).not.toHaveBeenCalled();
      expect(textContent(renderer)).toContain("Medication voice log cancelled.");
      expect(findByA11y(renderer, "Confirm medication voice log").props.disabled).toBe(true);
    },
  );

  it("pressing Cancel clears the review state and does not log", async () => {
    const renderer = await renderScreen();

    await reviewDose(renderer);
    await pressA11y(renderer, "Cancel medication voice log");

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("Medication voice log cancelled.");
  });

  it("speech errors and nomatch do not log", async () => {
    const renderer = await renderScreen();

    await reviewDose(renderer);
    await act(async () => {
      findByA11y(renderer, "Listen for medication log confirmation").props.onPress();
      emitSpeech("error", { error: "network" });
      emitSpeech("nomatch");
      await Promise.resolve();
    });

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("That was not a clear log confirmation.");
  });

  it("prevents logging after the confirmation review expires", async () => {
    const renderer = await renderScreen();

    await reviewDose(renderer);
    await act(async () => {
      vi.advanceTimersByTime(31_000);
      await Promise.resolve();
    });
    await listenAndEmit(renderer, "yes log");

    expect(submitQueueableWrite).not.toHaveBeenCalled();
    expect(textContent(renderer)).toContain("Medication voice log review expired.");
  });

  it("changing selected dose invalidates the prior review snapshot", async () => {
    const renderer = await renderScreen();

    await reviewDose(renderer, "Aspirin", "08:00 AM", "taken");
    await reviewDose(renderer, "Vitamin D", "09:30 AM", "taken");
    await listenAndEmit(renderer, "yes log");

    expect(submitQueueableWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          medicationId: "med-2",
          time: "09:30",
        }),
      }),
    );
    expect(submitQueueableWrite).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          medicationId: "med-1",
          time: "08:00",
        }),
      }),
    );
  });

  it("changing selected status invalidates the prior review snapshot", async () => {
    const renderer = await renderScreen();

    await reviewDose(renderer, "Aspirin", "08:00 AM", "taken");
    await reviewDose(renderer, "Aspirin", "08:00 AM", "skipped");
    await pressA11y(renderer, "Confirm medication voice log");

    expect(submitQueueableWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          status: "skipped",
        }),
      }),
    );
    expect(submitQueueableWrite).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          status: "taken",
        }),
      }),
    );
  });

  it("offline confirmed voice log matches manual offline queue behavior", async () => {
    networkState.offline = true;
    getCachedMedicationToday.mockResolvedValue({
      date: "2026-03-24",
      items: [
        {
          medicationId: "med-1",
          name: "Aspirin",
          type: "medication",
          instructions: "Take with food.",
          doses: [{ time: "08:00", status: "due" }],
        },
      ],
    });
    submitQueueableWrite.mockResolvedValue({
      kind: "queued",
      operation: {
        operationId: "queued-medication",
        status: "blocked_offline",
      },
    } as any);
    const renderer = await renderScreen();

    await reviewDose(renderer, "Aspirin", "08:00 AM", "taken");
    await pressA11y(renderer, "Confirm medication voice log");

    expect(submitQueueableWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        isOffline: true,
        domain: "medications",
        payload: expect.objectContaining({ medicationId: "med-1", status: "taken" }),
      }),
    );
    expect(textContent(renderer)).toContain("Saved on this device");
  });

  it("validation errors block voice log and surface existing error UI", async () => {
    submitQueueableWrite.mockRejectedValue({
      title: "Validation error",
      message: "Invalid medication log.",
      kind: "validation",
      retryable: false,
    });
    const renderer = await renderScreen();

    await reviewDose(renderer, "Aspirin", "08:00 AM", "taken");
    await pressA11y(renderer, "Confirm medication voice log");

    expect(setMedicationLogError).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "validation",
        retryable: false,
      }),
    );
    expect(textContent(renderer)).toContain("Invalid medication log.");
  });

  it("supports taken and skipped but not missed", async () => {
    const renderer = await renderScreen();

    expect(findByA11y(renderer, "Review mark Aspirin dose at 08:00 AM as taken")).toBeTruthy();
    expect(findByA11y(renderer, "Review mark Aspirin dose at 08:00 AM as skipped")).toBeTruthy();
    expect(findAllByA11y(renderer, "Review mark Aspirin dose at 08:00 AM as missed")).toHaveLength(0);
  });

  it("does not expose dosage, schedule, medication creation, advice, alert, or unrelated action paths", async () => {
    const renderer = await renderScreen();

    await reviewDose(renderer);
    await pressA11y(renderer, "Confirm medication voice log");

    expect(createCheckin).not.toHaveBeenCalled();
    expect(sendChat).not.toHaveBeenCalled();
    expect(logHydration).not.toHaveBeenCalled();
    expect(logNutrition).not.toHaveBeenCalled();
    expect(logMedicationDose).not.toHaveBeenCalled();
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalledWith("/safety");
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(asyncStorage.removeItem).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();

    const text = textContent(renderer);
    expect(text).not.toContain("dose advice");
    expect(text).not.toContain("change schedule");
    expect(text).not.toContain("new medication");
    expect(text).not.toContain("create alert");
    expect(text).not.toContain("OPENAI_API_KEY");
    expect(text).not.toContain("EXPO_PUBLIC_OPENAI_API_KEY");
  });

  it("uses on-device speech recognition without persisting audio or transcript", async () => {
    const renderer = await renderScreen();

    await reviewDose(renderer);
    await act(async () => {
      findByA11y(renderer, "Listen for medication log confirmation").props.onPress();
      await Promise.resolve();
    });

    expect(speechModule.supportsOnDeviceRecognition).toHaveBeenCalled();
    expect(speechModule.start).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresOnDeviceRecognition: true,
        recordingOptions: { persist: false },
      }),
    );
    expect(textContent(renderer)).not.toContain("Transcript");
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("exposes accessible voice medication controls and live status", async () => {
    const renderer = await renderScreen();

    await reviewDose(renderer);

    expect(findByA11y(renderer, "Review mark Aspirin dose at 08:00 AM as taken").props.accessibilityHint).toContain(
      "Shows the exact medication status summary",
    );
    expect(findByA11y(renderer, "Listen for medication log confirmation").props.accessibilityHint).toContain(
      "Listens once for yes log, confirm log, or log this.",
    );
    expect(findByA11y(renderer, "Confirm medication voice log").props.accessibilityHint).toContain(
      "Logs the reviewed medication status through the same normal medication path.",
    );
    expect(findByA11y(renderer, "Cancel medication voice log").props.accessibilityHint).toContain(
      "Clears the current medication voice log review without logging.",
    );
    expect(findByA11y(renderer, "Medication voice log status").props.accessibilityLiveRegion).toBe(
      "polite",
    );
    expect(findByA11y(renderer, "Medication voice log status").props.accessibilityRole).toBe(
      "text",
    );
  });
});
