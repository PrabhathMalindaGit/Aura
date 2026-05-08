import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  appStateListeners,
  createPatientVoiceSession,
  secureStore,
  asyncStorage,
  mutationCalls,
} = vi.hoisted(() => ({
  appStateListeners: [] as Array<(state: string) => void>,
  createPatientVoiceSession: vi.fn(),
  secureStore: {
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
  },
  asyncStorage: {
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
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
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: asyncStorage,
}));

vi.mock("expo-secure-store", () => secureStore);

vi.mock("@/src/api/patient", () => ({
  createPatientVoiceSession,
  ...mutationCalls,
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

describe("VoiceAgentSessionPanel", () => {
  beforeEach(() => {
    appStateListeners.splice(0);
    createPatientVoiceSession.mockReset();
    secureStore.setItemAsync.mockReset();
    secureStore.deleteItemAsync.mockReset();
    asyncStorage.setItem.mockReset();
    asyncStorage.removeItem.mockReset();
    for (const call of Object.values(mutationCalls)) {
      call.mockReset();
    }
  });

  it("renders ready state with accessible start affordance and prototype limitations", () => {
    const renderer = renderPanel();

    const start = findButton(renderer, "Start Voice Agent");
    const text = textContent(renderer);

    expect(start.props.accessibilityRole).toBe("button");
    expect(start.props.accessibilityHint).toBe(
      "Requests a temporary prototype voice-agent session from Aura.",
    );
    expect(start.props.accessibilityState).toEqual({
      disabled: false,
      busy: undefined,
    });
    expect(text).toContain("Aura Voice Agent");
    expect(text).toContain("Live audio connection is not enabled yet in V5-B1.");
    expect(text).toContain("No always-on microphone.");
    expect(text).toContain("Cannot submit check-ins");
  });

  it("starts one backend request and ignores duplicate starts while connecting", async () => {
    let resolveSession: (value: unknown) => void = () => undefined;
    createPatientVoiceSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
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

  it("shows prepared session metadata without rendering the client secret", async () => {
    createPatientVoiceSession.mockResolvedValue({
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
    const renderer = renderPanel();

    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });

    const text = textContent(renderer);
    expect(text).toContain("Prototype session ready");
    expect(text).toContain("gpt-realtime-2");
    expect(text).toContain("sess_panel");
    expect(text).toContain("Expires");
    expect(text).not.toContain("ek_panel_secret");
    expect(findButton(renderer, "Stop Voice Agent").props.accessibilityHint).toBe(
      "Clears this prepared prototype session and its temporary secret from memory.",
    );
  });

  it("clears the prepared session and client secret on stop", async () => {
    createPatientVoiceSession.mockResolvedValue({
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
    const renderer = renderPanel();

    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });
    act(() => {
      findButton(renderer, "Stop Voice Agent").props.onPress();
    });

    const text = textContent(renderer);
    expect(text).toContain("Session ended");
    expect(text).not.toContain("sess_panel");
    expect(text).not.toContain("ek_panel_secret");
  });

  it("clears the prepared session on unmount and app background", async () => {
    createPatientVoiceSession.mockResolvedValue({
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
    const renderer = renderPanel();

    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });
    act(() => {
      emitAppState("background");
    });

    expect(textContent(renderer)).toContain("Session ended");
    expect(textContent(renderer)).not.toContain("ek_panel_secret");

    await act(async () => {
      await findButton(renderer, "Start Voice Agent").props.onPress();
    });
    act(() => {
      renderer.unmount();
    });

    expect(appStateListeners).toHaveLength(0);
  });

  it("maps disabled, auth, rate-limit, and temporary failures to safe messages", async () => {
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
      act(() => {
        renderer.unmount();
      });
    }
  });

  it("does not persist secrets or call clinical mutation APIs", async () => {
    createPatientVoiceSession.mockResolvedValue({
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
});
