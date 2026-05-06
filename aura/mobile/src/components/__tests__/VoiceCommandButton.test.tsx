import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VoiceCommandRoute } from "@/src/utils/voiceCommands";

type SpeechEventName = "start" | "end" | "result" | "error" | "nomatch";
type SpeechListener = (event?: any) => void;
type AppStateListener = (state: string) => void;

const { appStateListeners, speechModule, speechListeners, stopReadAloud } = vi.hoisted(() => {
  const listeners: Partial<Record<SpeechEventName, SpeechListener[]>> = {};
  const stateListeners: AppStateListener[] = [];

  return {
    appStateListeners: stateListeners,
    speechListeners: listeners,
    stopReadAloud: vi.fn(async () => undefined),
    speechModule: {
      addListener: vi.fn((eventName: SpeechEventName, listener: SpeechListener) => {
        listeners[eventName] = [...(listeners[eventName] ?? []), listener];
        return {
          remove: vi.fn(() => {
            listeners[eventName] = (listeners[eventName] ?? []).filter(
              (candidate) => candidate !== listener,
            );
          }),
        };
      }),
      abort: vi.fn(),
      isRecognitionAvailable: vi.fn(() => true),
      requestPermissionsAsync: vi.fn(async () => ({
        granted: true,
        status: "granted",
        canAskAgain: true,
        expires: "never",
      })),
      start: vi.fn(),
      stop: vi.fn(),
      supportsOnDeviceRecognition: vi.fn(() => true),
    },
  };
});

vi.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: speechModule,
}));

vi.mock("@/src/utils/readAloud", () => ({
  stopReadAloud,
}));

vi.mock("react-native", () => ({
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement("mock-activity-indicator", props),
  AppState: {
    addEventListener: vi.fn((_eventName: string, listener: AppStateListener) => {
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

vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({
  default: (props: Record<string, unknown>) => React.createElement("mock-icon", props),
}));

vi.mock("@/src/components/Motion", () => ({
  getPressFeedbackStyle: () => ({ opacity: 0.8 }),
}));

vi.mock("@/src/hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      accentTextOn: "#eef6ff",
      border: "#d8d8d8",
      danger: "#c53030",
      primary: "#2255aa",
      primarySoft: "#eef4ff",
      primaryTextOn: "#ffffff",
      surface: "#ffffff",
      surfaceElevated: "#f2f2f2",
      text: "#111111",
      textMuted: "#666666",
      warning: "#b7791f",
    },
    elevation: { card: {} },
    radius: { sm: 8, md: 12, lg: 16 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
    typography: {
      body: { fontSize: 16, lineHeight: 22 },
      caption: { fontSize: 12, lineHeight: 16 },
      weights: { medium: "500", semibold: "600" },
    },
  }),
}));

import { VoiceCommandButton } from "@/src/components/VoiceCommandButton";

function renderButton(props?: Partial<React.ComponentProps<typeof VoiceCommandButton>>) {
  let renderer: ReactTestRenderer | null = null;
  const onNavigate = props?.onNavigate ?? vi.fn();
  const onGoBack = props?.onGoBack ?? vi.fn();

  act(() => {
    renderer = create(
      <VoiceCommandButton onNavigate={onNavigate} onGoBack={onGoBack} {...props} />,
    );
  });

  return {
    renderer: renderer!,
    onNavigate,
    onGoBack,
  };
}

function findMainButton(renderer: ReactTestRenderer) {
  return renderer.root.findByProps({ testID: "voice-command-button" });
}

function emitSpeech(eventName: SpeechEventName, event?: any) {
  for (const listener of speechListeners[eventName] ?? []) {
    listener(event);
  }
}

function emitAppState(state: string) {
  for (const listener of [...appStateListeners]) {
    listener(state);
  }
}

describe("VoiceCommandButton", () => {
  beforeEach(() => {
    for (const key of Object.keys(speechListeners) as SpeechEventName[]) {
      speechListeners[key] = [];
    }
    appStateListeners.splice(0);
    speechModule.addListener.mockClear();
    speechModule.abort.mockClear();
    speechModule.isRecognitionAvailable.mockReset();
    speechModule.isRecognitionAvailable.mockReturnValue(true);
    speechModule.requestPermissionsAsync.mockReset();
    speechModule.requestPermissionsAsync.mockResolvedValue({
      granted: true,
      status: "granted",
      canAskAgain: true,
      expires: "never",
    });
    speechModule.start.mockClear();
    speechModule.stop.mockClear();
    speechModule.supportsOnDeviceRecognition.mockReset();
    speechModule.supportsOnDeviceRecognition.mockReturnValue(true);
    stopReadAloud.mockClear();
  });

  it("renders idle state with accessible command affordance", () => {
    const { renderer } = renderButton();

    const button = findMainButton(renderer);

    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityLabel).toBe("Start voice command");
    expect(button.props.accessibilityHint).toBe(
      "Lets you open app screens using supported voice commands.",
    );
    expect(button.props.accessibilityState).toEqual({
      disabled: false,
      busy: undefined,
      selected: false,
    });
  });

  it("starts speech recognition with safe one-shot options", async () => {
    const { renderer } = renderButton();

    await act(async () => {
      await findMainButton(renderer).props.onPress();
    });

    expect(speechModule.start).toHaveBeenCalledWith({
      lang: "en-US",
      continuous: false,
      interimResults: true,
      maxAlternatives: 1,
      requiresOnDeviceRecognition: true,
      recordingOptions: {
        persist: false,
      },
    });
  });

  it("stops recognition when tapped while listening", async () => {
    const { renderer } = renderButton();

    await act(async () => {
      await findMainButton(renderer).props.onPress();
      emitSpeech("start");
    });
    await act(async () => {
      await findMainButton(renderer).props.onPress();
    });

    expect(speechModule.stop).toHaveBeenCalledTimes(1);
    expect(findMainButton(renderer).props.accessibilityLabel).toBe("Stop voice command");
  });

  it("handles permission denied without navigating", async () => {
    const onNavigate = vi.fn();
    speechModule.requestPermissionsAsync.mockResolvedValue({
      granted: false,
      status: "denied",
      canAskAgain: false,
      expires: "never",
    });
    const { renderer } = renderButton({ onNavigate });

    await act(async () => {
      await findMainButton(renderer).props.onPress();
    });

    expect(speechModule.start).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toContain(
      "Microphone permission was denied.",
    );
  });

  it("handles unavailable recognizer without navigating", async () => {
    const onNavigate = vi.fn();
    speechModule.isRecognitionAvailable.mockReturnValue(false);
    const { renderer } = renderButton({ onNavigate });

    await act(async () => {
      await findMainButton(renderer).props.onPress();
    });

    expect(speechModule.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toContain(
      "Voice commands are not available on this device.",
    );
  });

  it("does not navigate before a final valid command", async () => {
    const onNavigate = vi.fn();
    const { renderer } = renderButton({ onNavigate });

    await act(async () => {
      await findMainButton(renderer).props.onPress();
      emitSpeech("result", { isFinal: false, results: [{ transcript: "open chat" }] });
    });

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("navigates only after a final valid command", async () => {
    const onNavigate = vi.fn();
    const { renderer } = renderButton({ onNavigate });

    await act(async () => {
      await findMainButton(renderer).props.onPress();
      emitSpeech("result", { isFinal: true, results: [{ transcript: "open chat" }] });
    });

    expect(onNavigate).toHaveBeenCalledWith("/(tabs)/chat" satisfies VoiceCommandRoute);
    expect(renderer.root.findByProps({ accessibilityLiveRegion: "polite" }).props.children).toContain(
      "Opening chat.",
    );
  });

  it("goes back only for an exact go back command", async () => {
    const onGoBack = vi.fn();
    const { renderer } = renderButton({ onGoBack });

    await act(async () => {
      await findMainButton(renderer).props.onPress();
      emitSpeech("result", { isFinal: true, results: [{ transcript: "go back" }] });
    });

    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  it("shows unsupported copy for unsafe and unknown commands", async () => {
    const onNavigate = vi.fn();
    const { renderer } = renderButton({ onNavigate });

    await act(async () => {
      await findMainButton(renderer).props.onPress();
      emitSpeech("result", {
        isFinal: true,
        results: [{ transcript: "open chat and send message" }],
      });
    });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toContain(
      "Command not supported. Voice commands can only open screens or stop reading.",
    );
  });

  it("stops current read-aloud playback", async () => {
    const { renderer } = renderButton();

    await act(async () => {
      await findMainButton(renderer).props.onPress();
      emitSpeech("result", { isFinal: true, results: [{ transcript: "stop reading" }] });
    });

    expect(stopReadAloud).toHaveBeenCalledTimes(1);
  });

  it("shows supported command help and lets the user dismiss it", async () => {
    const { renderer } = renderButton();

    await act(async () => {
      await findMainButton(renderer).props.onPress();
      emitSpeech("result", { isFinal: true, results: [{ transcript: "help" }] });
    });

    expect(renderer.root.findByProps({ accessibilityLabel: "Supported voice commands" })).toBeTruthy();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Dismiss voice command help" }).props.onPress();
    });

    expect(
      renderer.root.findAllByProps({ accessibilityLabel: "Supported voice commands" }),
    ).toHaveLength(0);
  });

  it("cleans up recognition on unmount and app background", async () => {
    const { renderer } = renderButton();

    await act(async () => {
      await findMainButton(renderer).props.onPress();
      emitSpeech("start");
      emitAppState("background");
    });

    expect(speechModule.abort).toHaveBeenCalledTimes(1);

    await act(async () => {
      await findMainButton(renderer).props.onPress();
      emitSpeech("start");
    });
    act(() => {
      renderer.unmount();
    });

    expect(speechModule.abort).toHaveBeenCalledTimes(2);
  });
});
