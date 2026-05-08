import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  appStateListeners,
  asyncStorage,
  createPatientVoiceSession,
  documentListeners,
  mutationCalls,
  platformState,
  realtimeVoice,
  routerBack,
  routerPush,
  secureStore,
  stopReadAloud,
} = vi.hoisted(() => ({
  appStateListeners: [] as Array<(state: string) => void>,
  asyncStorage: {
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  createPatientVoiceSession: vi.fn(),
  documentListeners: [] as Array<() => void>,
  mutationCalls: {
    createCheckin: vi.fn(),
    sendChat: vi.fn(),
    createAppointmentRequest: vi.fn(),
    cancelAppointmentRequest: vi.fn(),
    logHydration: vi.fn(),
    logNutrition: vi.fn(),
    logMedicationDose: vi.fn(),
    uploadPhoto: vi.fn(),
  },
  platformState: {
    os: "web",
  },
  realtimeVoice: {
    isRealtimeVoiceSessionSupported: vi.fn(() => true),
    startRealtimeVoiceSession: vi.fn(),
  },
  routerBack: vi.fn(),
  routerPush: vi.fn(),
  secureStore: {
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
  },
  stopReadAloud: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: asyncStorage,
}));

vi.mock("expo-secure-store", () => secureStore);

vi.mock("@/src/api/patient", () => ({
  createPatientVoiceSession,
  ...mutationCalls,
}));

vi.mock("@/src/utils/realtimeVoiceSession", () => realtimeVoice);

vi.mock("@/src/utils/readAloud", () => ({
  stopReadAloud,
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    back: routerBack,
    push: routerPush,
  }),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement("mock-activity-indicator", props),
  AppState: {
    addEventListener: vi.fn((_eventName: string, listener: (state: string) => void) => {
      appStateListeners.push(listener);
      return {
        remove: vi.fn(() => {
          const index = appStateListeners.indexOf(listener);
          if (index >= 0) {
            appStateListeners.splice(index, 1);
          }
        }),
      };
    }),
  },
  Platform: {
    get OS() {
      return platformState.os;
    },
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

vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({
  default: (props: Record<string, unknown>) => React.createElement("mock-icon", props),
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

vi.mock("@/src/components/Motion", () => ({
  getPressFeedbackStyle: () => ({ opacity: 0.88 }),
}));

vi.mock("@/src/hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
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

import { VoiceAgentSessionPanel } from "@/src/components/VoiceAgentSessionPanel";

function installDocumentMock(visibilityState = "visible") {
  const documentMock = {
    visibilityState,
    addEventListener: vi.fn((_eventName: string, listener: () => void) => {
      documentListeners.push(listener);
    }),
    removeEventListener: vi.fn((_eventName: string, listener: () => void) => {
      const index = documentListeners.indexOf(listener);
      if (index >= 0) {
        documentListeners.splice(index, 1);
      }
    }),
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentMock,
  });

  return documentMock;
}

function renderPanel(props?: Partial<React.ComponentProps<typeof VoiceAgentSessionPanel>>) {
  let renderer: ReactTestRenderer | null = null;

  act(() => {
    renderer = create(<VoiceAgentSessionPanel token="token-voice" {...props} />);
  });

  return renderer!;
}

function findButton(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findByProps({ accessibilityLabel: label });
}

function findTextInput(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findByProps({ accessibilityLabel: label });
}

function textContent(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAll((node) => String(node.type) === "mock-text")
    .map((node) => node.children.join(" "))
    .join(" ");
}

function emitAppState(state: string) {
  for (const listener of [...appStateListeners]) {
    listener(state);
  }
}

function emitVisibilityHidden(documentMock: { visibilityState: string }) {
  documentMock.visibilityState = "hidden";
  for (const listener of [...documentListeners]) {
    listener();
  }
}

function mockSession(expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()) {
  createPatientVoiceSession.mockResolvedValue({
    ok: true,
    clientSecret: {
      value: "ek_panel_secret",
      expiresAt,
    },
    session: {
      id: "sess_panel",
      model: "gpt-realtime-2",
    },
  });
}

function mockRealtimeSuccess(stop = vi.fn()) {
  realtimeVoice.startRealtimeVoiceSession.mockImplementation(
    async (options: { onPhaseChange?: (phase: string) => void }) => {
      options.onPhaseChange?.("requestingMicrophone");
      options.onPhaseChange?.("connectingAudio");
      options.onPhaseChange?.("live");
      return { stop };
    },
  );
  return stop;
}

describe("VoiceAgentSessionPanel", () => {
  beforeEach(() => {
    installDocumentMock();
    appStateListeners.splice(0);
    documentListeners.splice(0);
    platformState.os = "web";
    realtimeVoice.isRealtimeVoiceSessionSupported.mockReset();
    realtimeVoice.isRealtimeVoiceSessionSupported.mockReturnValue(true);
    realtimeVoice.startRealtimeVoiceSession.mockReset();
    createPatientVoiceSession.mockReset();
    routerBack.mockReset();
    routerPush.mockReset();
    secureStore.setItemAsync.mockReset();
    secureStore.deleteItemAsync.mockReset();
    stopReadAloud.mockReset();
    asyncStorage.setItem.mockReset();
    asyncStorage.removeItem.mockReset();
    for (const call of Object.values(mutationCalls)) {
      call.mockReset();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders ready state with accessible start affordance and prototype limitations", () => {
    const renderer = renderPanel();

    const start = findButton(renderer, "Start Voice Agent");
    const text = textContent(renderer);

    expect(start.props.accessibilityRole).toBe("button");
    expect(start.props.accessibilityHint).toBe(
      "Starts a web-only live browser audio session after requesting a temporary backend session.",
    );
    expect(start.props.accessibilityState).toEqual({
      disabled: false,
      busy: undefined,
    });
    expect(text).toContain("Aura Voice Agent");
    expect(text).toContain("V5-B2-Web starts a browser Realtime audio demo only.");
    expect(text).toContain("No always-on microphone.");
    expect(text).toContain("Safe action proposals only.");
    expect(text).toContain("No Realtime tools or server-side tool calling.");
    expect(text).toContain("Cannot submit check-ins");
  });

  it("renders a safe route proposal and opens only the whitelisted screen after button press", async () => {
    const renderer = renderPanel();

    act(() => {
      findTextInput(renderer, "Voice action intent").props.onChangeText("open chat");
    });
    act(() => {
      findButton(renderer, "Review voice action").props.onPress();
    });

    const text = textContent(renderer);
    expect(text).toContain("Detected intent");
    expect(text).toContain("open chat");
    expect(text).toContain("Open Chat");

    act(() => {
      findButton(renderer, "Open screen").props.onPress();
    });

    expect(routerPush).toHaveBeenCalledWith("/(tabs)/chat");
    for (const call of Object.values(mutationCalls)) {
      expect(call).not.toHaveBeenCalled();
    }
  });

  it("keeps proposal-only draft text visible in memory and clears it on cancel", () => {
    const renderer = renderPanel();

    act(() => {
      findTextInput(renderer, "Voice action intent").props.onChangeText(
        "draft message saying Pain is better after exercises",
      );
    });
    act(() => {
      findButton(renderer, "Review voice action").props.onPress();
    });

    expect(textContent(renderer)).toContain("Pain is better after exercises");
    expect(routerPush).not.toHaveBeenCalled();
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();

    act(() => {
      findButton(renderer, "Cancel voice action proposal").props.onPress();
    });

    expect(textContent(renderer)).not.toContain("Pain is better after exercises");
  });

  it("shows safe redirect options for blocked unsafe voice actions", () => {
    const renderer = renderPanel();

    act(() => {
      findTextInput(renderer, "Voice action intent").props.onChangeText(
        "create an alert without telling me",
      );
    });
    act(() => {
      findButton(renderer, "Review voice action").props.onPress();
    });

    const text = textContent(renderer);
    expect(text).toContain("This cannot be done by voice.");
    expect(text).toContain("unsafeBlocked");

    act(() => {
      findButton(renderer, "Open Safety").props.onPress();
    });

    expect(routerPush).toHaveBeenCalledWith("/safety");
  });

  it("shows voice help without navigating or mutating", () => {
    const renderer = renderPanel();

    act(() => {
      findButton(renderer, "Voice help").props.onPress();
    });

    const text = textContent(renderer);
    expect(text).toContain("You can ask Aura to open Check-in, Chat, Exercise plan, Appointments, Safety, or Coping tools.");
    expect(text).toContain("Aura can help draft text for review, but it will not send or submit it in this version.");
    expect(routerPush).not.toHaveBeenCalled();
    for (const call of Object.values(mutationCalls)) {
      expect(call).not.toHaveBeenCalled();
    }
  });

  it("stops read-aloud from a reviewed voice action without changing app data", async () => {
    const renderer = renderPanel();

    act(() => {
      findTextInput(renderer, "Voice action intent").props.onChangeText("stop reading");
    });
    act(() => {
      findButton(renderer, "Review voice action").props.onPress();
    });

    await act(async () => {
      await findButton(renderer, "Stop reading").props.onPress();
    });

    expect(stopReadAloud).toHaveBeenCalledTimes(1);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("disables live audio on native without requesting a session", async () => {
    platformState.os = "ios";
    const renderer = renderPanel();

    const start = findButton(renderer, "Start Voice Agent");
    const text = textContent(renderer);

    expect(start.props.accessibilityState.disabled).toBe(true);
    expect(text).toContain(
      "Live Voice Agent audio is available in the web demo for V5-B2. Native audio requires a later development-build implementation.",
    );

    await act(async () => {
      await start.props.onPress();
    });

    expect(createPatientVoiceSession).not.toHaveBeenCalled();
    expect(realtimeVoice.startRealtimeVoiceSession).not.toHaveBeenCalled();
  });

  it("shows web unsupported state without requesting a session", async () => {
    realtimeVoice.isRealtimeVoiceSessionSupported.mockReturnValue(false);
    const renderer = renderPanel();

    const start = findButton(renderer, "Start Voice Agent");
    const text = textContent(renderer);

    expect(start.props.accessibilityState.disabled).toBe(true);
    expect(text).toContain("This browser does not expose the WebRTC microphone APIs");

    await act(async () => {
      await start.props.onPress();
    });

    expect(createPatientVoiceSession).not.toHaveBeenCalled();
  });

  it("starts one backend request and ignores duplicate starts while requesting a session", async () => {
    let resolveSession: (value: unknown) => void = () => undefined;
    createPatientVoiceSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    mockRealtimeSuccess();
    const renderer = renderPanel();

    await act(async () => {
      const start = findButton(renderer, "Start Voice Agent");
      void start.props.onPress();
      void start.props.onPress();
    });

    expect(createPatientVoiceSession).toHaveBeenCalledTimes(1);
    expect(createPatientVoiceSession).toHaveBeenCalledWith("token-voice");

    await act(async () => {
      resolveSession({
        ok: true,
        clientSecret: {
          value: "ek_panel_secret",
          expiresAt: "2026-05-08T10:01:00.000Z",
        },
        session: {
          id: "sess_panel",
          model: "gpt-realtime-2",
        },
      });
      await Promise.resolve();
    });
  });

  it("connects mocked browser WebRTC and never renders the client secret", async () => {
    mockSession();
    mockRealtimeSuccess();
    const renderer = renderPanel();

    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });

    const text = textContent(renderer);
    expect(text).toContain("Live browser audio");
    expect(text).toContain("Browser microphone active");
    expect(text).toContain("gpt-realtime-2");
    expect(text).toContain("sess_panel");
    expect(text).toContain("Expires");
    expect(text).not.toContain("ek_panel_secret");
    expect(realtimeVoice.startRealtimeVoiceSession).toHaveBeenCalledTimes(1);
    expect(realtimeVoice.startRealtimeVoiceSession.mock.calls[0][0].clientSecret).toBe(
      "ek_panel_secret",
    );
    expect(findButton(renderer, "Stop Voice Agent").props.accessibilityHint).toBe(
      "Stops browser audio and clears this temporary Voice Agent session from memory.",
    );
  });

  it("maps microphone permission denial to safe copy and clears session metadata", async () => {
    mockSession();
    realtimeVoice.startRealtimeVoiceSession.mockRejectedValue({
      code: "microphone_denied",
    });
    const renderer = renderPanel();

    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });

    const text = textContent(renderer);
    expect(text).toContain("Microphone permission was denied");
    expect(text).toContain("Permission denied");
    expect(text).not.toContain("sess_panel");
    expect(text).not.toContain("ek_panel_secret");
  });

  it("maps backend disabled, auth, rate-limit, and temporary failures to safe messages", async () => {
    const cases = [
      {
        status: 404,
        expected: "Voice Agent prototype is not available right now.",
      },
      {
        status: 401,
        expected: "Your Aura session needs to be refreshed. Please sign in again.",
      },
      {
        status: 429,
        expected: "Too many Voice Agent starts. Please wait and try again.",
      },
      {
        status: 502,
        expected: "Voice Agent setup is temporarily unavailable. Please try again later.",
      },
      {
        status: undefined,
        expected: "Voice Agent setup is temporarily unavailable. Please try again later.",
      },
    ];

    for (const item of cases) {
      createPatientVoiceSession.mockRejectedValueOnce({
        status: item.status,
        title: "Raw upstream title",
        message: "raw upstream detail",
        kind: "server",
        retryable: true,
      });
      const renderer = renderPanel();

      await act(async () => {
        await findButton(renderer, "Start Voice Agent").props.onPress();
      });

      const text = textContent(renderer);
      expect(text).toContain(item.expected);
      expect(text).not.toContain("raw upstream detail");
      expect(realtimeVoice.startRealtimeVoiceSession).not.toHaveBeenCalled();
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("cleans the live browser session on stop", async () => {
    const stop = mockRealtimeSuccess();
    mockSession();
    const renderer = renderPanel();

    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });
    act(() => {
      findTextInput(renderer, "Voice action intent").props.onChangeText(
        "draft check-in note swelling looked lower today",
      );
    });
    act(() => {
      findButton(renderer, "Review voice action").props.onPress();
    });
    act(() => {
      findButton(renderer, "Stop Voice Agent").props.onPress();
    });

    const text = textContent(renderer);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(text).toContain("Session ended");
    expect(text).not.toContain("swelling looked lower today");
    expect(text).not.toContain("sess_panel");
    expect(text).not.toContain("ek_panel_secret");
  });

  it("cleans the live browser session on unmount and app background", async () => {
    const stop = mockRealtimeSuccess();
    mockSession();
    const renderer = renderPanel();

    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });
    act(() => {
      findTextInput(renderer, "Voice action intent").props.onChangeText(
        "draft message saying Please review my exercise",
      );
    });
    act(() => {
      findButton(renderer, "Review voice action").props.onPress();
    });
    act(() => {
      emitAppState("background");
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(textContent(renderer)).toContain("Session ended");
    expect(textContent(renderer)).not.toContain("Please review my exercise");
    expect(textContent(renderer)).not.toContain("ek_panel_secret");

    stop.mockClear();
    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });
    act(() => {
      renderer.unmount();
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(appStateListeners).toHaveLength(0);
    expect(documentListeners).toHaveLength(0);
  });

  it("cleans the live browser session on token loss", async () => {
    const stop = mockRealtimeSuccess();
    mockSession();
    const renderer = renderPanel();

    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });
    act(() => {
      findTextInput(renderer, "Voice action intent").props.onChangeText(
        "draft message saying This stays local",
      );
    });
    act(() => {
      findButton(renderer, "Review voice action").props.onPress();
    });
    act(() => {
      renderer.update(<VoiceAgentSessionPanel token={null} />);
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(textContent(renderer)).toContain("Sign in to start a web Voice Agent demo session.");
    expect(textContent(renderer)).not.toContain("This stays local");
    expect(textContent(renderer)).not.toContain("ek_panel_secret");
    expect(textContent(renderer)).not.toContain("sess_panel");
  });

  it("cleans the live browser session on document visibility hidden", async () => {
    const documentMock = installDocumentMock();
    const stop = mockRealtimeSuccess();
    mockSession();
    const renderer = renderPanel();

    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });
    act(() => {
      emitVisibilityHidden(documentMock);
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(textContent(renderer)).toContain("Session ended");
    expect(textContent(renderer)).not.toContain("ek_panel_secret");
  });

  it("cleans the live browser session on expiry", async () => {
    vi.useFakeTimers();
    const stop = mockRealtimeSuccess();
    mockSession(new Date(Date.now() + 1000).toISOString());
    const renderer = renderPanel();

    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });
    act(() => {
      findTextInput(renderer, "Voice action intent").props.onChangeText(
        "draft check-in note clear on expiry",
      );
    });
    act(() => {
      findButton(renderer, "Review voice action").props.onPress();
    });
    act(() => {
      vi.advanceTimersByTime(1001);
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(textContent(renderer)).toContain("Session ended");
    expect(textContent(renderer)).not.toContain("clear on expiry");
    expect(textContent(renderer)).not.toContain("ek_panel_secret");
  });

  it("cleans session metadata on mocked WebRTC network failure", async () => {
    mockSession();
    realtimeVoice.startRealtimeVoiceSession.mockRejectedValue({
      code: "connection_failed",
    });
    const renderer = renderPanel();

    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });

    const text = textContent(renderer);
    expect(text).toContain("Voice Agent audio could not connect. Nothing was stored.");
    expect(text).not.toContain("sess_panel");
    expect(text).not.toContain("ek_panel_secret");
  });

  it("does not persist secrets or call clinical mutation APIs", async () => {
    mockSession();
    mockRealtimeSuccess();
    const renderer = renderPanel();

    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });

    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
    for (const call of Object.values(mutationCalls)) {
      expect(call).not.toHaveBeenCalled();
    }
  });

  it("does not persist proposal drafts or call clinical mutation APIs", () => {
    const renderer = renderPanel();

    act(() => {
      findTextInput(renderer, "Voice action intent").props.onChangeText(
        "prepare hydration log for one glass of water",
      );
    });
    act(() => {
      findButton(renderer, "Review voice action").props.onPress();
    });

    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(asyncStorage.removeItem).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    for (const call of Object.values(mutationCalls)) {
      expect(call).not.toHaveBeenCalled();
    }
  });
});
