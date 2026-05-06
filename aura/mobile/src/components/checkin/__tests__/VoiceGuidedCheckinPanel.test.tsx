import { readFileSync } from "node:fs";
import { join } from "node:path";

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SpeechEventName = "start" | "end" | "result" | "error" | "nomatch";
type SpeechListener = (event?: any) => void;
type AppStateListener = (state: string) => void;

const {
  appStateListeners,
  speechListeners,
  speechModule,
  stopReadAloud,
} = vi.hoisted(() => {
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

vi.mock("@/src/components/ReadAloudButton", () => ({
  ReadAloudButton: (props: Record<string, unknown>) =>
    React.createElement("mock-read-aloud-button", {
      ...props,
      accessibilityRole: "button",
      accessibilityLabel: props.label ?? "Read aloud",
    }),
  normalizeReadAloudText: (parts: Array<string | null | undefined>) =>
    parts.filter(Boolean).join(". "),
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

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      accent: "#2f6fed",
      border: "#d7e0e7",
      danger: "#c94a3b",
      primary: "#2f6fed",
      primarySoft: "#edf4ff",
      primaryTextOn: "#ffffff",
      surface: "#ffffff",
      surfaceElevated: "#f7f9fb",
      surfaceSubtle: "#f3f6f8",
      text: "#183042",
      textMuted: "#5e7182",
      warning: "#c9892b",
      warningSoft: "#fff6e8",
    },
    elevation: { card: {} },
    radius: { sm: 8, md: 12, lg: 16 },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
    typography: {
      body: { fontSize: 16, lineHeight: 22 },
      caption: { fontSize: 12, lineHeight: 16 },
      section: { fontSize: 20, lineHeight: 28 },
      weights: { medium: "500", semibold: "600" },
    },
  }),
}));

import { VoiceGuidedCheckinPanel } from "@/src/components/checkin/VoiceGuidedCheckinPanel";

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

function textContent(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAll((node) => String(node.type) === "mock-text")
    .map((node) => node.children.join(" "))
    .join(" ");
}

function findByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findByProps({ accessibilityLabel: label });
}

function findByLabelPrefix(renderer: ReactTestRenderer, prefix: string) {
  const match = renderer.root.findAll(
    (node) =>
      typeof node.props?.accessibilityLabel === "string" &&
      node.props.accessibilityLabel.startsWith(prefix),
  )[0];

  if (!match) {
    throw new Error(`Could not find accessibility label starting with: ${prefix}`);
  }

  return match;
}

function renderPanel(overrides?: Partial<React.ComponentProps<typeof VoiceGuidedCheckinPanel>>) {
  const props = {
    includeSleep: false,
    onConfirmPain: vi.fn(),
    onConfirmMood: vi.fn(),
    onConfirmExercise: vi.fn(),
    onConfirmMedicationStatus: vi.fn(),
    onConfirmNotes: vi.fn(),
    onConfirmSleepHours: vi.fn(),
    onConfirmSleepQuality: vi.fn(),
    onEditManually: vi.fn(),
    ...overrides,
  };
  let renderer: ReactTestRenderer | null = null;

  act(() => {
    renderer = create(<VoiceGuidedCheckinPanel {...props} />);
  });

  return { renderer: renderer!, props };
}

describe("VoiceGuidedCheckinPanel", () => {
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

  it("renders collapsed by default, expands accessibly, and has no submit button", () => {
    const { renderer } = renderPanel();

    expect(findByLabel(renderer, "Expand guided check-in voice assist").props.accessibilityState).toEqual({
      expanded: false,
    });
    expect(textContent(renderer)).not.toContain("Pain level");

    act(() => {
      findByLabel(renderer, "Expand guided check-in voice assist").props.onPress();
    });

    expect(findByLabel(renderer, "Collapse guided check-in voice assist").props.accessibilityState).toEqual({
      expanded: true,
    });
    expect(textContent(renderer)).toContain("Pain level");
    expect(textContent(renderer)).not.toContain("Submit");
  });

  it("starts one-shot on-device recognition only after Listen is tapped and stops read-aloud first", async () => {
    const { renderer } = renderPanel();

    act(() => {
      findByLabel(renderer, "Expand guided check-in voice assist").props.onPress();
    });

    expect(speechModule.start).not.toHaveBeenCalled();

    await act(async () => {
      await findByLabel(renderer, "Listen for pain level").props.onPress();
    });

    expect(stopReadAloud).toHaveBeenCalled();
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

  it("shows parser success details and confirms only the matching draft setter", async () => {
    const { renderer, props } = renderPanel();

    act(() => {
      findByLabel(renderer, "Expand guided check-in voice assist").props.onPress();
    });
    await act(async () => {
      await findByLabel(renderer, "Listen for pain level").props.onPress();
      await Promise.resolve();
      emitSpeech("result", {
        isFinal: true,
        results: [{ transcript: "seven out of ten" }],
      });
    });

    expect(textContent(renderer)).toContain("seven out of ten");
    expect(textContent(renderer)).toContain("7/10");
    expect(textContent(renderer)).toContain("normalized");
    expect(textContent(renderer)).toContain("Pain level");
    expect(props.onConfirmPain).not.toHaveBeenCalled();

    act(() => {
      findByLabel(renderer, "Confirm guided answer").props.onPress();
    });

    expect(props.onConfirmPain).toHaveBeenCalledWith(7);
    expect(props.onConfirmMood).not.toHaveBeenCalled();
    expect(props.onConfirmNotes).not.toHaveBeenCalled();
  });

  it("Retry, Skip, and Edit manually do not write draft values", async () => {
    const { renderer, props } = renderPanel();

    act(() => {
      findByLabel(renderer, "Expand guided check-in voice assist").props.onPress();
    });
    await act(async () => {
      await findByLabel(renderer, "Listen for pain level").props.onPress();
      await Promise.resolve();
      emitSpeech("result", {
        isFinal: true,
        results: [{ transcript: "five" }],
      });
    });
    act(() => {
      findByLabel(renderer, "Retry guided answer").props.onPress();
    });
    act(() => {
      findByLabel(renderer, "Skip guided question").props.onPress();
    });
    act(() => {
      findByLabel(renderer, "Edit guided answer manually").props.onPress();
    });

    expect(props.onConfirmPain).not.toHaveBeenCalled();
    expect(props.onConfirmMood).not.toHaveBeenCalled();
    expect(props.onEditManually).toHaveBeenCalledWith("mood");
  });

  it("keeps high-risk notes as draft only after confirmation and never submits or navigates", async () => {
    const { renderer, props } = renderPanel();

    act(() => {
      findByLabel(renderer, "Expand guided check-in voice assist").props.onPress();
    });

    for (const transcript of ["1", "4", "80 percent", "taken"]) {
      await act(async () => {
        await findByLabelPrefix(renderer, "Listen for ").props.onPress();
        await Promise.resolve();
        emitSpeech("result", { isFinal: true, results: [{ transcript }] });
      });
      act(() => {
        findByLabel(renderer, "Confirm guided answer").props.onPress();
      });
    }

    await act(async () => {
      await findByLabel(renderer, "Listen for notes").props.onPress();
      await Promise.resolve();
      emitSpeech("result", {
        isFinal: true,
        results: [{ transcript: "I need urgent help today" }],
      });
    });
    act(() => {
      findByLabel(renderer, "Confirm guided answer").props.onPress();
    });

    expect(props.onConfirmNotes).toHaveBeenCalledWith("I need urgent help today");
    expect(
      renderer.root.findAll(
        (node) =>
          node.props?.accessibilityRole === "button" &&
          typeof node.props?.accessibilityLabel === "string" &&
          node.props.accessibilityLabel.includes("Submit"),
      ),
    ).toHaveLength(0);
  });

  it("shows safety guidance for emergency-like numeric answers without writing values", async () => {
    const { renderer, props } = renderPanel();

    act(() => {
      findByLabel(renderer, "Expand guided check-in voice assist").props.onPress();
    });
    await act(async () => {
      await findByLabel(renderer, "Listen for pain level").props.onPress();
      await Promise.resolve();
      emitSpeech("result", {
        isFinal: true,
        results: [{ transcript: "call emergency" }],
      });
    });

    expect(textContent(renderer)).toContain("use the Safety screen or contact local emergency services");
    expect(props.onConfirmPain).not.toHaveBeenCalled();
  });

  it("aborts recognition and stops read-aloud on background and unmount", async () => {
    const { renderer } = renderPanel();

    act(() => {
      findByLabel(renderer, "Expand guided check-in voice assist").props.onPress();
    });
    await act(async () => {
      await findByLabel(renderer, "Listen for pain level").props.onPress();
      await Promise.resolve();
      emitSpeech("start");
      emitAppState("background");
    });
    act(() => {
      renderer.unmount();
    });

    expect(speechModule.abort).toHaveBeenCalled();
    expect(stopReadAloud).toHaveBeenCalled();
  });

  it("keeps guided UI and hook free of submit, RAG, alert, navigation, and emergency-call side effects", () => {
    const source = [
      "src/components/checkin/VoiceGuidedCheckinPanel.tsx",
      "src/hooks/useVoiceGuidedCheckin.ts",
    ]
      .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
      .join("\n");

    expect(source).not.toContain("createCheckin");
    expect(source).not.toContain("sendChat");
    expect(source).not.toContain("/rag/reply");
    expect(source).not.toContain("apiFetchJson");
    expect(source).not.toContain("Linking.openURL");
    expect(source).not.toContain("Alert.alert");
    expect(source).not.toContain("router.push");
    expect(source).not.toContain("router.replace");
    expect(source).not.toContain("fetch(");
  });
});
