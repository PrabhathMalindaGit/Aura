import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

type AppStateListener = (state: string) => void;
type SpeechOptions = {
  onStart?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
};

const { appStateListeners, platform, speechModule } = vi.hoisted(() => {
  const stateListeners: AppStateListener[] = [];

  return {
    appStateListeners: stateListeners,
    platform: { OS: "ios" },
    speechModule: {
      maxSpeechInputLength: 120,
      speak: vi.fn((_text: string, _options?: SpeechOptions) => undefined),
      stop: vi.fn(async () => undefined),
    },
  };
});

vi.mock("expo-speech", () => speechModule);

vi.mock("react-native", () => ({
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
  Platform: platform,
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
      border: "#d8d8d8",
      danger: "#c53030",
      primary: "#2255aa",
      primaryTextOn: "#ffffff",
      surface: "#ffffff",
      surfaceElevated: "#f2f2f2",
      text: "#111111",
      textMuted: "#666666",
      warning: "#b7791f",
    },
    radius: { md: 12 },
    spacing: { xs: 4 },
    typography: {
      caption: { fontSize: 12, lineHeight: 16 },
      weights: { medium: "500" },
    },
  }),
}));

import { ReadAloudButton, normalizeReadAloudText } from "@/src/components/ReadAloudButton";

function renderButton(props: React.ComponentProps<typeof ReadAloudButton>) {
  let renderer: ReactTestRenderer | null = null;
  act(() => {
    renderer = create(<ReadAloudButton {...props} />);
  });
  return renderer!;
}

function findButton(renderer: ReactTestRenderer) {
  return renderer.root.findByProps({ accessibilityRole: "button" });
}

function emitAppState(state: string) {
  for (const listener of [...appStateListeners]) {
    listener(state);
  }
}

describe("ReadAloudButton", () => {
  beforeEach(() => {
    appStateListeners.splice(0);
    speechModule.speak.mockClear();
    speechModule.stop.mockClear();
    speechModule.maxSpeechInputLength = 120;
    platform.OS = "ios";
  });

  it("renders idle state with correct accessibility label and hint", () => {
    const renderer = renderButton({ text: "Slide your heel in and out." });

    const button = findButton(renderer);

    expect(button.props.accessibilityLabel).toBe("Read aloud");
    expect(button.props.accessibilityHint).toBe("Reads this text aloud.");
    expect(button.props.accessibilityState).toEqual({
      disabled: false,
      busy: undefined,
      selected: false,
    });
  });

  it("calls stop before speaking the expected text", async () => {
    const renderer = renderButton({ text: "  Heel slides. Slide your heel in and out.  " });

    await act(async () => {
      await findButton(renderer).props.onPress();
    });

    expect(speechModule.stop).toHaveBeenCalledTimes(1);
    expect(speechModule.speak).toHaveBeenCalledTimes(1);
    expect(speechModule.speak).toHaveBeenCalledWith(
      "Heel slides. Slide your heel in and out.",
      expect.objectContaining({ rate: expect.any(Number) }),
    );
    expect(speechModule.stop.mock.invocationCallOrder[0]).toBeLessThan(
      speechModule.speak.mock.invocationCallOrder[0],
    );
  });

  it("calls stop when pressed while speaking", async () => {
    const renderer = renderButton({ text: "Read this reply." });

    await act(async () => {
      await findButton(renderer).props.onPress();
      speechModule.speak.mock.calls[0]?.[1]?.onStart?.();
    });
    await act(async () => {
      await findButton(renderer).props.onPress();
    });

    expect(speechModule.stop).toHaveBeenCalledTimes(2);
  });

  it("maps speech callbacks to speaking and idle states", async () => {
    const statuses: string[] = [];
    const renderer = renderButton({
      text: "Read this reply.",
      onStatusChange: (status) => statuses.push(status),
    });

    await act(async () => {
      await findButton(renderer).props.onPress();
      speechModule.speak.mock.calls[0]?.[1]?.onStart?.();
    });

    expect(findButton(renderer).props.accessibilityLabel).toBe("Stop reading");
    expect(findButton(renderer).props.accessibilityHint).toBe(
      "Stops the current read-aloud playback.",
    );
    expect(findButton(renderer).props.accessibilityState.selected).toBe(true);

    await act(async () => {
      speechModule.speak.mock.calls[0]?.[1]?.onDone?.();
    });

    expect(findButton(renderer).props.accessibilityLabel).toBe("Read aloud");
    expect(statuses).toEqual(expect.arrayContaining(["speaking", "idle"]));
  });

  it("returns to idle when speech is stopped by the platform callback", async () => {
    const renderer = renderButton({ text: "Read this reply." });

    await act(async () => {
      await findButton(renderer).props.onPress();
      speechModule.speak.mock.calls[0]?.[1]?.onStart?.();
      speechModule.speak.mock.calls[0]?.[1]?.onStopped?.();
    });

    expect(findButton(renderer).props.accessibilityLabel).toBe("Read aloud");
  });

  it("keeps speech failures quiet instead of rendering an inline warning", async () => {
    const renderer = renderButton({ text: "Read this reply." });

    await act(async () => {
      await findButton(renderer).props.onPress();
      speechModule.speak.mock.calls[0]?.[1]?.onError?.();
    });

    expect(renderer.root.findAllByProps({ accessibilityRole: "alert" })).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).not.toContain(
      "Read-aloud is unavailable right now.",
    );
  });

  it("hides the control on web where read-aloud is unsupported", () => {
    platform.OS = "web";

    const renderer = renderButton({ text: "Read this reply." });

    expect(renderer.toJSON()).toBeNull();
    expect(speechModule.speak).not.toHaveBeenCalled();
  });

  it("refuses empty text without speaking", async () => {
    const renderer = renderButton({ text: "   " });

    await act(async () => {
      await findButton(renderer).props.onPress();
    });

    expect(speechModule.stop).not.toHaveBeenCalled();
    expect(speechModule.speak).not.toHaveBeenCalled();
    expect(findButton(renderer).props.accessibilityState.disabled).toBe(true);
  });

  it("stops speech on unmount and app background", async () => {
    const renderer = renderButton({ text: "Read this reply." });

    await act(async () => {
      await findButton(renderer).props.onPress();
      speechModule.speak.mock.calls[0]?.[1]?.onStart?.();
      emitAppState("background");
    });
    act(() => {
      renderer.unmount();
    });

    expect(speechModule.stop).toHaveBeenCalledTimes(3);
  });

  it("does not auto-play on mount", () => {
    renderButton({ text: "Read this reply." });

    expect(speechModule.speak).not.toHaveBeenCalled();
  });

  it("normalizes text pieces and clamps to the speech input length", () => {
    speechModule.maxSpeechInputLength = 18;

    expect(normalizeReadAloudText([" Heel slides ", null, "", " Slide slowly. "])).toBe(
      "Heel slides. Sl...",
    );
  });
});
