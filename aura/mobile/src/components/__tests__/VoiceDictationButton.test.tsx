import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SpeechEventName = "start" | "end" | "result" | "error" | "nomatch";
type SpeechListener = (event?: any) => void;
type AppStateListener = (state: string) => void;

const { appStateListeners, nativePlatform, speechModule, speechListeners } = vi.hoisted(() => {
  const listeners: Partial<Record<SpeechEventName, SpeechListener[]>> = {};
  const stateListeners: AppStateListener[] = [];

  return {
    appStateListeners: stateListeners,
    nativePlatform: { OS: "ios" },
    speechListeners: listeners,
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
  Platform: nativePlatform,
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

vi.mock("@/src/components/Motion", () => ({
  getPressFeedbackStyle: () => ({ opacity: 0.8 }),
}));

vi.mock("@/src/hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      accent: "#0b74de",
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
      warningTextOn: "#fff8e1",
    },
    radius: { sm: 8, md: 12, lg: 16 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
    typography: {
      body: { fontSize: 16, lineHeight: 22 },
      caption: { fontSize: 12, lineHeight: 16 },
      weights: { medium: "500", semibold: "600" },
    },
  }),
}));

import { VoiceDictationButton } from "@/src/components/VoiceDictationButton";

function findButton(renderer: ReactTestRenderer) {
  return renderer.root.findByProps({ accessibilityRole: "button" });
}

function renderButton(props: React.ComponentProps<typeof VoiceDictationButton>) {
  let renderer: ReactTestRenderer | null = null;
  act(() => {
    renderer = create(<VoiceDictationButton {...props} />);
  });
  return renderer!;
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

describe("VoiceDictationButton", () => {
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
    nativePlatform.OS = "ios";
  });

  it("renders idle state with correct accessibility label and hint", () => {
    const renderer = renderButton({ onTranscript: vi.fn() });

    const button = findButton(renderer);

    expect(button.props.accessibilityLabel).toBe("Start voice dictation");
    expect(button.props.accessibilityHint).toBe(
      "Adds spoken words to this text field for review before sending.",
    );
    expect(button.props.accessibilityState).toEqual({
      disabled: false,
      busy: undefined,
    });
  });

  it("hides the mic on unsupported web runtime", () => {
    nativePlatform.OS = "web";

    const renderer = renderButton({ onTranscript: vi.fn() });

    expect(renderer.toJSON()).toBeNull();
    expect(speechModule.addListener).not.toHaveBeenCalled();
  });

  it("handles permission denied without sending transcript", async () => {
    const onTranscript = vi.fn();
    speechModule.requestPermissionsAsync.mockResolvedValue({
      granted: false,
      status: "denied",
      canAskAgain: false,
      expires: "never",
    });
    const renderer = renderButton({ onTranscript });

    await act(async () => {
      await findButton(renderer).props.onPress();
    });

    expect(speechModule.start).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toContain(
      "Microphone permission was denied.",
    );
  });

  it("disables safely when recognition is unavailable", async () => {
    speechModule.isRecognitionAvailable.mockReturnValue(false);
    const onTranscript = vi.fn();
    const renderer = renderButton({ onTranscript });

    await act(async () => {
      await findButton(renderer).props.onPress();
    });

    expect(speechModule.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(findButton(renderer).props.accessibilityState.disabled).toBe(true);
    expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toContain(
      "Voice dictation is not available on this device.",
    );
  });

  it("shows listening state with busy state and stop label", async () => {
    const renderer = renderButton({ onTranscript: vi.fn() });

    await act(async () => {
      await findButton(renderer).props.onPress();
      emitSpeech("start");
    });

    const button = findButton(renderer);
    expect(speechModule.start).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresOnDeviceRecognition: true,
        recordingOptions: { persist: false },
      }),
    );
    expect(button.props.accessibilityLabel).toBe("Stop voice dictation");
    expect(button.props.accessibilityHint).toBe(
      "Stops listening and adds the transcript for review.",
    );
    expect(button.props.accessibilityState.busy).toBe(true);
  });

  it("calls transcript callback only for non-empty final results", async () => {
    const onTranscript = vi.fn();
    const renderer = renderButton({ onTranscript });

    await act(async () => {
      await findButton(renderer).props.onPress();
      emitSpeech("result", { isFinal: false, results: [{ transcript: "partial" }] });
      emitSpeech("result", { isFinal: true, results: [{ transcript: "  " }] });
      emitSpeech("result", { isFinal: true, results: [{ transcript: "Pain is better today" }] });
    });

    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledWith("Pain is better today");
  });

  it("cleans up recognition on unmount", async () => {
    const renderer = renderButton({ onTranscript: vi.fn() });

    await act(async () => {
      await findButton(renderer).props.onPress();
      emitSpeech("start");
    });
    act(() => {
      renderer.unmount();
    });

    expect(speechModule.abort).toHaveBeenCalledTimes(1);
  });

  it("cleans up recognition on unmount after start is requested", async () => {
    const renderer = renderButton({ onTranscript: vi.fn() });

    await act(async () => {
      await findButton(renderer).props.onPress();
    });
    act(() => {
      renderer.unmount();
    });

    expect(speechModule.start).toHaveBeenCalledTimes(1);
    expect(speechModule.abort).toHaveBeenCalledTimes(1);
  });

  it("keeps recognition errors visible when an end event follows", async () => {
    const renderer = renderButton({ onTranscript: vi.fn() });

    await act(async () => {
      await findButton(renderer).props.onPress();
      emitSpeech("start");
      emitSpeech("error", { error: "network" });
      emitSpeech("end");
    });

    expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toContain(
      "Voice dictation needs an available speech recognizer.",
    );
  });

  it("aborts recognition when the app leaves the foreground", async () => {
    const renderer = renderButton({ onTranscript: vi.fn() });

    await act(async () => {
      await findButton(renderer).props.onPress();
      emitSpeech("start");
      emitAppState("background");
    });

    expect(speechModule.abort).toHaveBeenCalledTimes(1);
  });
});
