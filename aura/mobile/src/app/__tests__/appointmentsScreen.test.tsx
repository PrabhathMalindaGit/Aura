import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  alertMock,
  appointmentRequestError,
  appointmentsLoadError,
  appointmentsRefresh,
  asyncStorage,
  authState,
  createAppointmentRequest,
  listAvailableSlots,
  listMyRequests,
  mutationCalls,
  networkState,
  routerPush,
  secureStore,
  speechListeners,
  speechModule,
} = vi.hoisted(() => ({
  alertMock: vi.fn(),
  appointmentRequestError: {
    label: "Never",
    lastError: null,
    clear: vi.fn(),
    setLocalError: vi.fn(),
  },
  appointmentsLoadError: {
    label: "Never",
    lastError: null,
    clear: vi.fn(),
    setLocalError: vi.fn(),
  },
  appointmentsRefresh: {
    label: "Never",
    refreshLocal: vi.fn(),
  },
  asyncStorage: {
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  authState: {
    status: "signedIn" as "loading" | "signedIn" | "signedOut",
    token: "token-appointments" as string | null,
    patient: {
      id: "patient-1",
      displayName: "Patient One",
    },
  },
  createAppointmentRequest: vi.fn(),
  listAvailableSlots: vi.fn(),
  listMyRequests: vi.fn(),
  mutationCalls: {
    createCheckin: vi.fn(),
    sendChat: vi.fn(),
    logHydration: vi.fn(),
    logNutrition: vi.fn(),
    logMedicationDose: vi.fn(),
    uploadPhoto: vi.fn(),
    createAlert: vi.fn(),
  },
  networkState: {
    offline: false,
  },
  routerPush: vi.fn(),
  secureStore: {
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
  },
  speechListeners: new Map<string, Array<(event?: unknown) => void>>(),
  speechModule: {
    isRecognitionAvailable: vi.fn(() => true),
    supportsOnDeviceRecognition: vi.fn(() => true),
    requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
    start: vi.fn(),
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
            current.filter((item) => item !== listener),
          );
        }),
      };
    }),
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: asyncStorage,
}));

vi.mock("expo-secure-store", () => secureStore);

vi.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: speechModule,
}));

vi.mock("expo-constants", () => ({
  default: { appOwnership: "expo" },
}));

vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => React.createElement("mock-redirect", { href }),
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock("@react-navigation/native", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    React.useEffect(() => effect(), [effect]);
  },
}));

vi.mock("react-native", () => ({
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement("mock-activity-indicator", props),
  Alert: {
    alert: alertMock,
  },
  FlatList: ({
    data,
    ListHeaderComponent,
    ListEmptyComponent,
    ListFooterComponent,
    renderItem,
    ...props
  }: {
    data?: unknown[];
    ListHeaderComponent?: React.ReactNode;
    ListEmptyComponent?: React.ReactNode;
    ListFooterComponent?: React.ReactNode;
    renderItem?: (args: { item: unknown; index: number }) => React.ReactNode;
    [key: string]: unknown;
  }) =>
    React.createElement(
      "mock-flat-list",
      props,
      ListHeaderComponent,
      data && data.length > 0
        ? data.map((item, index) =>
            React.createElement(
              React.Fragment,
              { key: String(index) },
              renderItem?.({ item, index }),
            ),
          )
        : ListEmptyComponent,
      ListFooterComponent,
    ),
  Linking: {
    openURL: vi.fn(),
  },
  Platform: {
    OS: "ios",
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
  RefreshControl: (props: Record<string, unknown>) =>
    React.createElement("mock-refresh-control", props),
  StyleSheet: {
    create: <T extends Record<string, unknown>>(styles: T) => styles,
    hairlineWidth: 1,
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

vi.mock("@/src/api/appointments", () => ({
  cancelMyRequest: vi.fn(),
  createAppointmentRequest,
  listAvailableSlots,
  listMyRequests,
}));

vi.mock("@/src/api/patient", () => mutationCalls);

vi.mock("@/src/api/client", () => ({
  isApiError: () => false,
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
  DomainIcon: (props: Record<string, unknown>) => React.createElement("mock-icon", props),
}));

vi.mock("@/src/components/EmptyState", () => ({
  EmptyState: (props: Record<string, unknown>) =>
    React.createElement("mock-empty-state", props),
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
    React.createElement("mock-last-failed", props),
}));

vi.mock("@/src/components/LastRefreshed", () => ({
  LastRefreshed: (props: Record<string, unknown>) =>
    React.createElement("mock-last-refreshed", props),
}));

vi.mock("@/src/components/MediaCard", () => ({
  MediaCard: (props: Record<string, unknown>) =>
    React.createElement("mock-media-card", props),
}));

vi.mock("@/src/components/PrimaryButton", () => ({
  PrimaryButton: (props: Record<string, unknown>) =>
    React.createElement(
      "mock-primary-button",
      {
        accessibilityRole: "button",
        accessibilityLabel: props.label,
        ...props,
      },
      props.label as React.ReactNode,
    ),
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
    React.createElement(
      "mock-secondary-button",
      {
        accessibilityRole: "button",
        accessibilityLabel: props.label,
        ...props,
      },
      props.label as React.ReactNode,
    ),
}));

vi.mock("@/src/components/SegmentedControl", () => ({
  SegmentedControl: (props: Record<string, unknown>) =>
    React.createElement(
      "mock-segmented-control",
      props,
      (props.options as Array<{ value: string; label: string }> | undefined)?.map((option) =>
        React.createElement(
          "mock-pressable",
          {
            key: option.value,
            accessibilityRole: "button",
            accessibilityLabel: option.label,
            accessibilityState: { selected: props.value === option.value },
            onPress: () => {
              (props.onChange as (value: string) => void)?.(option.value);
            },
          },
          option.label,
        ),
      ),
    ),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: (props: Record<string, unknown>) =>
    React.createElement("mock-status-pill", props),
}));

vi.mock("@/src/state/auth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/src/state/appointmentsCache", () => ({
  getCachedAppointmentRequests: vi.fn(async () => null),
  getCachedAppointmentSlots: vi.fn(async () => null),
  setCachedAppointmentRequests: vi.fn(),
  setCachedAppointmentSlots: vi.fn(),
}));

vi.mock("@/src/state/appointmentReminders", () => ({
  clearReminderForRequest: vi.fn(),
  getAllRemindersForPatient: vi.fn(async () => ({})),
  setReminderForRequest: vi.fn(),
}));

vi.mock("@/src/state/lastError", () => ({
  useLastError: (key: string) =>
    key === "appointmentRequest" ? appointmentRequestError : appointmentsLoadError,
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: () => networkState.offline,
}));

vi.mock("@/src/state/refresh", () => ({
  useLastRefreshed: () => appointmentsRefresh,
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      accent: "#2f6fed",
      accentTextOn: "#eef4ff",
      border: "#d7e0e7",
      danger: "#c94a3b",
      dangerTextOn: "#fcece9",
      primary: "#2f6fed",
      primarySoft: "#edf4ff",
      primaryTextOn: "#ffffff",
      success: "#2f8f83",
      successTextOn: "#e7f6f3",
      surface: "#ffffff",
      surfaceElevated: "#f8fafc",
      text: "#183042",
      textMuted: "#5e7182",
      warning: "#c9892b",
      warningTextOn: "#fff6e8",
    },
    elevation: { card: {} },
    radius: { sm: 8, md: 12, lg: 16, xl: 20 },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
    typography: {
      body: { fontSize: 16, lineHeight: 22 },
      caption: { fontSize: 12, lineHeight: 16 },
      section: { fontSize: 20, lineHeight: 28 },
      weights: { medium: "500", semibold: "600" },
    },
  }),
}));

import AppointmentsScreen from "@/app/appointments";

const slots = [
  {
    slotId: "slot-1",
    clinicianName: "Dr. Rivera",
    startsAt: "2026-06-10T14:00:00.000Z",
    endsAt: "2026-06-10T14:30:00.000Z",
    modality: "video" as const,
  },
  {
    slotId: "slot-2",
    clinicianName: "Dr. Rivera",
    startsAt: "2026-06-11T15:00:00.000Z",
    endsAt: "2026-06-11T15:45:00.000Z",
    modality: "video" as const,
  },
];

const pendingRequest = {
  requestId: "request-pending-1",
  slotId: "slot-missed",
  startsAt: "2026-05-12T10:00:00.000Z",
  endsAt: "2026-05-12T10:30:00.000Z",
  createdAt: "2026-05-10T10:00:00.000Z",
  status: "pending" as const,
  workflowStatus: "missed" as const,
  modality: "video" as const,
  meetingLink: "https://example.test/visit",
};

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

async function renderScreen() {
  let renderer: ReactTestRenderer | null = null;
  await act(async () => {
    renderer = create(<AppointmentsScreen />);
    await flush();
  });
  return renderer!;
}

function textContent(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAll((node) => String(node.type) === "mock-text")
    .map((node) => node.children.join(" "))
    .join(" ");
}

function findByA11y(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findByProps({ accessibilityLabel: label });
}

function findAllByA11y(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAllByProps({ accessibilityLabel: label });
}

function findSegmentedControl(renderer: ReactTestRenderer) {
  return renderer.root.findByProps({ accessibilityLabel: "Appointments view selector" });
}

async function selectSlot(renderer: ReactTestRenderer, slotId = "slot-1") {
  await act(async () => {
    renderer.root.findByProps({ testID: `appointment-slot-${slotId}` }).props.onPress();
    await flush();
  });
}

async function reviewForVoiceRequest(renderer: ReactTestRenderer) {
  await act(async () => {
    findByA11y(renderer, "Review for voice request").props.onPress();
    await flush();
  });
}

async function listenAndEmitVoiceRequest(renderer: ReactTestRenderer, transcript: string) {
  await act(async () => {
    await findByA11y(renderer, "Listen for request confirmation").props.onPress();
    const listeners = speechListeners.get("result") ?? [];
    for (const listener of [...listeners]) {
      listener({
        isFinal: true,
        results: [{ transcript }],
      });
    }
    await flush();
  });
}

function emitSpeech(eventName: string, event?: unknown) {
  const listeners = speechListeners.get(eventName) ?? [];
  for (const listener of [...listeners]) {
    listener(event);
  }
}

describe("AppointmentsScreen final-demo appointment flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authState.status = "signedIn";
    authState.token = "token-appointments";
    authState.patient = {
      id: "patient-1",
      displayName: "Patient One",
    };
    networkState.offline = false;
    speechListeners.clear();
    speechModule.isRecognitionAvailable.mockReturnValue(true);
    speechModule.supportsOnDeviceRecognition.mockReturnValue(true);
    speechModule.requestPermissionsAsync.mockResolvedValue({ granted: true });
    speechModule.start.mockReset();
    speechModule.abort.mockReset();
    createAppointmentRequest.mockReset();
    createAppointmentRequest.mockResolvedValue({
      requestId: "request-1",
      status: "pending",
    });
    listAvailableSlots.mockReset();
    listAvailableSlots.mockResolvedValue(slots);
    listMyRequests.mockReset();
    listMyRequests.mockResolvedValue([]);
    appointmentRequestError.clear.mockReset();
    appointmentRequestError.setLocalError.mockReset();
    appointmentsLoadError.clear.mockReset();
    appointmentsLoadError.setLocalError.mockReset();
    appointmentsRefresh.refreshLocal.mockReset();
    asyncStorage.setItem.mockReset();
    asyncStorage.removeItem.mockReset();
    secureStore.setItemAsync.mockReset();
    secureStore.deleteItemAsync.mockReset();
    alertMock.mockReset();
    routerPush.mockReset();
    for (const call of Object.values(mutationCalls)) {
      call.mockReset();
    }
  });

  it("hides voice request review while preserving available appointment slots", async () => {
    const renderer = await renderScreen();

    expect(textContent(renderer)).not.toContain("Voice request review");
    expect(textContent(renderer)).not.toContain("Select a time before voice request.");
    expect(findAllByA11y(renderer, "Review for voice request")).toHaveLength(0);
    expect(findAllByA11y(renderer, "Listen for request confirmation")).toHaveLength(0);
    expect(findAllByA11y(renderer, "Cancel voice request")).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: "appointment-slot-slot-1" })).toBeTruthy();
    expect(createAppointmentRequest).not.toHaveBeenCalled();
  });

  it("renders compact appointment overview labels without awkward truncation", async () => {
    listMyRequests.mockResolvedValue([pendingRequest]);
    const renderer = await renderScreen();

    const text = textContent(renderer);
    expect(text).toContain("Planning overview");
    expect(text).toContain("No upcoming");
    expect(text).toContain("Pending");
    expect(text).toContain("1 waiting");
    expect(text).not.toContain("Pending: 1");
    expect(text).not.toContain("No upco...");
  });

  it("switches between Find time, Requests, and Upcoming appointment views", async () => {
    const renderer = await renderScreen();

    expect(findSegmentedControl(renderer).props.value).toBe("book");

    await act(async () => {
      findByA11y(renderer, "Requests").props.onPress();
      await flush();
    });
    expect(findSegmentedControl(renderer).props.value).toBe("requests");

    await act(async () => {
      findByA11y(renderer, "Upcoming").props.onPress();
      await flush();
    });
    expect(findSegmentedControl(renderer).props.value).toBe("upcoming");

    await act(async () => {
      findByA11y(renderer, "Find time").props.onPress();
      await flush();
    });
    expect(findSegmentedControl(renderer).props.value).toBe("book");
  });

  it("renders pending request cards with the cancel request action available", async () => {
    listMyRequests.mockResolvedValue([pendingRequest]);
    const renderer = await renderScreen();

    await act(async () => {
      findByA11y(renderer, "Requests").props.onPress();
      await flush();
    });

    const text = textContent(renderer);
    expect(text).toContain("This visit was missed");
    expect(text).toContain("Tue, May 12");
    expect(findByA11y(renderer, "Cancel request")).toBeTruthy();
  });

  it("keeps normal selected appointment request actions available", async () => {
    const renderer = await renderScreen();

    await selectSlot(renderer);
    await act(async () => {
      renderer.root.findByProps({ placeholder: "Optional note for your clinician" }).props.onChangeText(
        "  Morning rehab works best.  ",
      );
      await flush();
    });

    const text = textContent(renderer);
    expect(text).toContain("Selected time");
    expect(text).toContain("This sends a request for clinician approval before the visit is confirmed.");
    expect(text).not.toContain("Voice request review");
    expect(findByA11y(renderer, "Request this time")).toBeTruthy();
    expect(createAppointmentRequest).not.toHaveBeenCalled();
  });

  it("normal appointment request button still asks for confirmation without voice UI", async () => {
    const renderer = await renderScreen();

    await selectSlot(renderer);
    await act(async () => {
      findByA11y(renderer, "Request this time").props.onPress();
      await flush();
    });

    expect(alertMock).toHaveBeenCalledWith(
      "Request this slot?",
      expect.stringContaining("This sends a pending request for clinician approval."),
      expect.any(Array),
    );
    expect(createAppointmentRequest).not.toHaveBeenCalled();
  });

  it("keeps offline appointment booking quiet and free of voice warnings", async () => {
    networkState.offline = true;
    const renderer = await renderScreen();

    expect(createAppointmentRequest).not.toHaveBeenCalled();
    expect(textContent(renderer)).not.toContain("Select a time before voice request.");
    expect(textContent(renderer)).not.toContain("Voice confirmation is not available");
    expect(findAllByA11y(renderer, "Review for voice request")).toHaveLength(0);
  });

  it("does not call unrelated clinical mutation or persistence APIs from the hidden voice UI", async () => {
    const renderer = await renderScreen();

    await selectSlot(renderer);

    expect(JSON.stringify(asyncStorage.setItem.mock.calls)).not.toContain("slot-1");
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(asyncStorage.removeItem).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    for (const call of Object.values(mutationCalls)) {
      expect(call).not.toHaveBeenCalled();
    }
    expect(textContent(renderer)).not.toContain("OPENAI_API_KEY");
    expect(textContent(renderer)).not.toContain("EXPO_PUBLIC_OPENAI_API_KEY");
  });
});
