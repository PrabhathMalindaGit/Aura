import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CachedChatWrite = {
  confirmedMessages: Array<Record<string, unknown>>;
  localAttempt?: {
    text: string;
    status: "sending" | "failed" | "unknown";
    createdAt?: string;
  } | null;
  cachedAt?: string;
};

type SpeechEventName = "start" | "end" | "result" | "error" | "nomatch";
type SpeechListener = (event?: any) => void;

const {
  routerPush,
  routerReplace,
  routerSetParams,
  sendChat,
  chatHistory,
  listPatientTasks,
  getCachedChat,
  setCachedChat,
  getCachedTasks,
  setCachedTasks,
  refreshChat,
  refreshTasks,
  networkState,
  chatLoadSetError,
  chatLoadClear,
  chatSendSetError,
  chatSendClear,
  canPatientUseMessages,
  getCareModeNotice,
  voiceTranscript,
  speechListeners,
  speechModule,
  stopReadAloud,
} = vi.hoisted(() => {
  const listeners: Partial<Record<SpeechEventName, SpeechListener[]>> = {};

  return {
    routerPush: vi.fn(),
    routerReplace: vi.fn(),
    routerSetParams: vi.fn(),
    sendChat: vi.fn(),
    chatHistory: vi.fn(),
    listPatientTasks: vi.fn(),
    getCachedChat: vi.fn(),
    setCachedChat: vi.fn<(patientId: string, record: CachedChatWrite) => Promise<void>>(
      async () => undefined
    ),
    getCachedTasks: vi.fn(async (): Promise<any> => null),
    setCachedTasks: vi.fn(async () => undefined),
    refreshChat: vi.fn(async () => undefined),
    refreshTasks: vi.fn(async () => undefined),
    networkState: { offline: false },
    chatLoadSetError: vi.fn(async () => undefined),
    chatLoadClear: vi.fn(async () => undefined),
    chatSendSetError: vi.fn(async () => undefined),
    chatSendClear: vi.fn(async () => undefined),
    canPatientUseMessages: vi.fn(() => true),
    getCareModeNotice: vi.fn((): any => null),
    voiceTranscript: { current: "dictated update" },
    stopReadAloud: vi.fn(async () => undefined),
    speechListeners: listeners,
    speechModule: {
      addListener: vi.fn((eventName: SpeechEventName, listener: SpeechListener) => {
        const currentListeners = listeners[eventName] ?? [];
        listeners[eventName] = [...currentListeners, listener];
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

vi.mock("expo-router", () => ({
  Redirect: () => null,
  useRouter: () => ({
    push: routerPush,
    replace: routerReplace,
    setParams: routerSetParams,
  }),
  useLocalSearchParams: () => ({}),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement("mock-activity-indicator", props),
  FlatList: ({
    data = [],
    renderItem,
    ListEmptyComponent,
    keyExtractor,
    ...props
  }: {
    data?: unknown[];
    renderItem: (info: { item: any; index: number }) => React.ReactNode;
    ListEmptyComponent?: React.ReactNode;
    keyExtractor?: (item: any, index: number) => string;
    [key: string]: unknown;
  }) =>
    React.createElement(
      "mock-flat-list",
      props,
      data.length > 0
        ? data.map((item, index) =>
            React.createElement(
              React.Fragment,
              { key: keyExtractor ? keyExtractor(item, index) : String(index) },
              renderItem({ item, index })
            )
          )
        : ListEmptyComponent
    ),
  KeyboardAvoidingView: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-keyboard-avoiding-view", props, children),
  Platform: { OS: "ios" },
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
      typeof children === "function" ? children({ pressed: false }) : children
    ),
  ScrollView: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-scroll-view", props, children),
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

vi.mock("@/src/api/patient", async () => {
  const actual = await vi.importActual<typeof import("@/src/api/patient")>("@/src/api/patient");
  return {
    ...actual,
    chatHistory,
    sendChat,
  };
});

vi.mock("@/src/api/tasks", () => ({
  listPatientTasks,
}));

vi.mock("@/src/state/chatCache", () => ({
  getCachedChat,
  setCachedChat,
}));

vi.mock("@/src/state/tasksCache", () => ({
  getCachedTasks,
  setCachedTasks,
}));

vi.mock("@/src/state/auth", () => ({
  useAuth: () => ({
    status: "signedIn",
    token: "token-1",
    patient: {
      id: "patient-1",
      displayName: "Patient One",
    },
  }),
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: () => networkState.offline,
}));

vi.mock("@/src/hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      accent: "#0b74de",
      accentTextOn: "#eef6ff",
      background: "#f7f7f7",
      border: "#d8d8d8",
      danger: "#c53030",
      primary: "#2255aa",
      primarySoft: "#eef4ff",
      primaryTextOn: "#ffffff",
      success: "#2f855a",
      successTextOn: "#edfdf4",
      surface: "#ffffff",
      surfaceElevated: "#f2f2f2",
      surfaceSubtle: "#f6f6f6",
      text: "#111111",
      textMuted: "#666666",
      textTertiary: "#7a7a7a",
      warning: "#b7791f",
      warningTextOn: "#fff8e1",
    },
    radius: { sm: 8, md: 12, lg: 16, xl: 24 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
    elevation: { card: {}, sm: {}, md: {}, none: {} },
    typography: {
      body: { fontSize: 16, lineHeight: 22 },
      caption: { fontSize: 12, lineHeight: 16 },
      weights: { medium: "500", semibold: "600" },
    },
  }),
}));

vi.mock("@/src/state/refresh", () => ({
  useLastRefreshed: (domain: string) => ({
    label: "Never",
    lastRefreshedAt: null,
    refreshLocal: domain === "chat" ? refreshChat : refreshTasks,
  }),
}));

vi.mock("@/src/state/lastError", () => ({
  useLastError: (key: "chatLoad" | "chatSend") => ({
    label: "Never",
    lastError: null,
    setLocalError: key === "chatLoad" ? chatLoadSetError : chatSendSetError,
    clear: key === "chatLoad" ? chatLoadClear : chatSendClear,
  }),
}));

vi.mock("@/src/state/trustStatus", () => ({
  useTrustStatus: () => ({
    kind: "ok",
    pendingCount: 0,
    failedCount: 0,
  }),
}));

vi.mock("@/src/state/recoverySupport", () => ({
  canPatientUseMessages,
  getCareModeNotice,
}));

vi.mock("@/src/utils/readAloud", () => ({
  stopReadAloud,
}));

vi.mock("@/src/components/Avatar", () => ({
  Avatar: (props: Record<string, unknown>) => React.createElement("mock-avatar", props),
}));

vi.mock("@/src/components/Banner", () => ({
  Banner: ({
    title,
    message,
    actionLabel,
    ...props
  }: {
    title?: string;
    message?: string;
    actionLabel?: string;
    [key: string]: unknown;
  }) =>
    React.createElement(
      "mock-banner",
      props,
      title,
      message,
      actionLabel ? React.createElement("mock-banner-action", { label: actionLabel }, actionLabel) : null
    ),
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

vi.mock("@/src/components/communication/WorkflowMessageCard", () => ({
  WorkflowMessageCard: (props: Record<string, unknown>) =>
    React.createElement("mock-workflow-card", props),
}));

vi.mock("@/src/components/EmptyState", () => ({
  EmptyState: ({
    title,
    description,
  }: {
    title?: string;
    description?: string;
  }) => React.createElement("mock-empty-state", null, title, description),
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
  HeroHeader: (props: Record<string, unknown>) => React.createElement("mock-hero-header", props),
}));

vi.mock("@/src/components/IconSet", () => ({
  DomainIcon: (props: Record<string, unknown>) => React.createElement("mock-domain-icon", props),
}));

vi.mock("@/src/components/LastFailedAttempt", () => ({
  LastFailedAttempt: ({
    label,
    title,
    message,
  }: {
    label?: string;
    title?: string;
    message?: string;
  }) => React.createElement("mock-last-failed", null, label, title, message),
}));

vi.mock("@/src/components/Screen", () => ({
  Screen: ({
    header,
    banner,
    children,
    ...props
  }: {
    header?: React.ReactNode;
    banner?: React.ReactNode;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-screen", props, header, banner, children),
}));

vi.mock("@/src/components/Skeleton", () => ({
  SkeletonBlock: (props: Record<string, unknown>) => React.createElement("mock-skeleton", props),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: (props: Record<string, unknown>) => React.createElement("mock-status-pill", props),
}));

vi.mock("@/src/components/TipCard", () => ({
  TipCard: ({
    title,
    text,
    actions = [],
    testID,
    ...props
  }: {
    title?: string;
    text: string;
    actions?: Array<{
      label: string;
      onPress: () => void;
      disabled?: boolean;
      kind?: string;
    }>;
    testID?: string;
    [key: string]: unknown;
  }) =>
    React.createElement(
      "mock-tip-card",
      { ...props, testID, title, text, actions },
      title,
      text,
      ...actions.map((action) =>
        React.createElement(
          "mock-tip-action",
          {
            key: action.label,
            label: action.label,
            onPress: action.onPress,
            disabled: action.disabled,
            kind: action.kind,
          },
          action.label
        )
      )
    ),
}));

vi.mock("@/src/components/VoiceDictationButton", () => ({
  VoiceDictationButton: (props: Record<string, unknown>) =>
    React.createElement("mock-voice-dictation-button", {
      ...props,
      accessibilityRole: "button",
      accessibilityLabel: "Start voice dictation",
      accessibilityHint: "Adds spoken words to this text field for review before sending.",
      accessibilityState: { disabled: Boolean(props.disabled), busy: undefined },
      onPress: () => {
        (props.onTranscript as (text: string) => void)?.(voiceTranscript.current);
      },
    }),
}));

vi.mock("@/src/components/ReadAloudButton", () => ({
  ReadAloudButton: (props: Record<string, unknown>) =>
    React.createElement("mock-read-aloud-button" as any, {
      ...props,
      accessibilityRole: "button",
      accessibilityLabel: props.label ?? "Read aloud",
      onPress: vi.fn(),
    } as any),
  normalizeReadAloudText: (parts: Array<string | null | undefined>) =>
    parts.filter(Boolean).join(". "),
}));

vi.mock("@/src/components/TrustBanner", () => ({
  TrustBanner: (props: Record<string, unknown>) => React.createElement("mock-trust-banner", props),
}));

import ChatScreen from "@/app/(tabs)/chat";

function flattenText(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : flattenText(child)))
    .join(" ");
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function emitSpeech(eventName: string, event?: any): void {
  for (const listener of [...(speechListeners[eventName as SpeechEventName] ?? [])]) {
    listener(event);
  }
}

async function reviewForVoiceSend(root: ReactTestInstance): Promise<void> {
  await act(async () => {
    findByA11y(root, "Review for voice send").props.onPress();
    await flush();
  });
}

async function listenAndEmitVoiceSend(root: ReactTestInstance, transcript: string): Promise<void> {
  await act(async () => {
    await findByA11y(root, "Listen for voice send confirmation").props.onPress();
    emitSpeech("result", {
      isFinal: true,
      results: [{ transcript }],
    });
    await flush();
  });
}

async function renderScreen(): Promise<ReactTestRenderer> {
  const renderer = create(<ChatScreen />);
  await act(async () => {
    await flush();
  });
  return renderer;
}

function findByA11y(root: ReactTestInstance, label: string): ReactTestInstance {
  const match = root.findAll(
    (node) => typeof node.props?.accessibilityLabel === "string" && node.props.accessibilityLabel === label
  )[0];
  if (!match) {
    throw new Error(`Could not find accessibility label: ${label}`);
  }
  return match;
}

function getLocalAttemptCard(root: ReactTestInstance): ReactTestInstance | null {
  return (
    root.findAll(
      (node) =>
        typeof node.type === "string" &&
        String(node.type) === "mock-tip-card" &&
        node.props?.testID === "chat-local-attempt"
    )[0] ?? null
  );
}

describe("chat truth fix", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    routerPush.mockReset();
    routerReplace.mockReset();
    routerSetParams.mockReset();
    sendChat.mockReset();
    chatHistory.mockReset();
    listPatientTasks.mockReset();
    getCachedChat.mockReset();
    setCachedChat.mockClear();
    getCachedTasks.mockReset();
    setCachedTasks.mockClear();
    refreshChat.mockClear();
    refreshTasks.mockClear();
    networkState.offline = false;
    chatLoadSetError.mockClear();
    chatLoadClear.mockClear();
    chatSendSetError.mockClear();
    chatSendClear.mockClear();
    canPatientUseMessages.mockReset();
    canPatientUseMessages.mockReturnValue(true);
    getCareModeNotice.mockReset();
    getCareModeNotice.mockReturnValue(null);
    voiceTranscript.current = "dictated update";
    for (const eventName of Object.keys(speechListeners) as SpeechEventName[]) {
      delete speechListeners[eventName];
    }
    speechModule.addListener.mockClear();
    speechModule.abort.mockReset();
    speechModule.isRecognitionAvailable.mockReset();
    speechModule.isRecognitionAvailable.mockReturnValue(true);
    speechModule.supportsOnDeviceRecognition.mockReset();
    speechModule.supportsOnDeviceRecognition.mockReturnValue(true);
    speechModule.requestPermissionsAsync.mockReset();
    speechModule.requestPermissionsAsync.mockResolvedValue({
      granted: true,
      status: "granted",
      canAskAgain: true,
      expires: "never",
    });
    speechModule.start.mockReset();
    speechModule.stop.mockReset();
    stopReadAloud.mockReset();

    chatHistory.mockResolvedValue([]);
    listPatientTasks.mockResolvedValue([]);
    getCachedChat.mockResolvedValue(null);
    getCachedTasks.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists only confirmed history after low-risk success", async () => {
    sendChat.mockResolvedValue({
      ok: true,
      risk: { level: "low", reasonCodes: [] },
      messages: {
        user: {
          id: "user-1",
          role: "user",
          text: "Can I walk today?",
          createdAt: "2026-03-24T10:00:00.000Z",
        },
        assistant: {
          id: "assistant-1",
          role: "assistant",
          text: "Yes, start with a short walk.",
          createdAt: "2026-03-24T10:00:01.000Z",
        },
      },
    });

    const renderer = await renderScreen();
    const root = renderer!.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("Can I walk today?");
      await flush();
    });

    await act(async () => {
      findByA11y(root, "Send message").props.onPress();
      await flush();
    });

    expect(sendChat).toHaveBeenCalledWith("token-1", "Can I walk today?");
    expect(flattenText(root)).toContain("Yes, start with a short walk.");
    expect(flattenText(root)).toContain("Sent");
    expect(getLocalAttemptCard(root)).toBeNull();

    const lastCacheCall = setCachedChat.mock.calls.at(-1);
    expect(lastCacheCall?.[0]).toBe("patient-1");
    expect(lastCacheCall?.[1]).toMatchObject({
      confirmedMessages: [
        {
          id: "user-1",
          role: "patient",
          text: "Can I walk today?",
          createdAt: "2026-03-24T10:00:00.000Z",
        },
        {
          id: "assistant-1",
          role: "assistant",
          text: "Yes, start with a short walk.",
          createdAt: "2026-03-24T10:00:01.000Z",
        },
      ],
      localAttempt: null,
    });
  });

  it("persists the confirmed user row and routes to safety on high-risk success", async () => {
    sendChat.mockResolvedValue({
      ok: true,
      risk: { level: "high", reasonCodes: ["CRISIS_LANGUAGE"] },
      alertId: "alert-9",
      messages: {
        user: {
          id: "user-9",
          role: "user",
          text: "I feel unsafe",
          createdAt: "2026-03-24T11:00:00.000Z",
        },
      },
    });

    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("I feel unsafe");
      await flush();
    });

    await act(async () => {
      findByA11y(root, "Send message").props.onPress();
      await flush();
    });

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/safety",
      params: {
        alertId: "alert-9",
        reasonCodes: "CRISIS_LANGUAGE",
      },
    });
    const lastCacheCall = setCachedChat.mock.calls.at(-1);
    expect(lastCacheCall?.[1]).toMatchObject({
      confirmedMessages: [
        {
          id: "user-9",
          role: "patient",
          text: "I feel unsafe",
          createdAt: "2026-03-24T11:00:00.000Z",
        },
      ],
      localAttempt: null,
    });
    expect(getLocalAttemptCard(root)).toBeNull();
  });

  it("appends dictated transcript to the draft without sending until Send is pressed", async () => {
    voiceTranscript.current = "better after exercises";
    sendChat.mockResolvedValue({
      ok: true,
      risk: { level: "low", reasonCodes: [] },
      messages: {
        user: {
          id: "user-voice-1",
          role: "user",
          text: "Pain is better after exercises",
          createdAt: "2026-03-24T12:00:00.000Z",
        },
      },
    });

    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("Pain is");
      findByA11y(root, "Start voice dictation").props.onPress();
      await flush();
    });

    expect(findByA11y(root, "Message input").props.value).toBe(
      "Pain is better after exercises",
    );
    expect(sendChat).not.toHaveBeenCalled();

    await act(async () => {
      findByA11y(root, "Send message").props.onPress();
      await flush();
    });

    expect(sendChat).toHaveBeenCalledWith("token-1", "Pain is better after exercises");
  });

  it("adds read-aloud only to assistant replies without sending messages", async () => {
    chatHistory.mockResolvedValue([
      {
        id: "msg-user-1",
        role: "patient",
        text: "My knee is sore.",
        createdAt: "2026-03-24T12:00:00.000Z",
      },
      {
        id: "msg-assistant-1",
        role: "assistant",
        text: "Pause and try the next exercise slowly.",
        createdAt: "2026-03-24T12:00:10.000Z",
      },
    ]);

    const renderer = await renderScreen();
    const root = renderer.root;
    const assistantReadAloudButtons = root.findAll(
      (node) =>
        String(node.type) === "mock-read-aloud-button" &&
        node.props.text === "Pause and try the next exercise slowly.",
    );

    expect(assistantReadAloudButtons).toHaveLength(1);
    expect(assistantReadAloudButtons[0].props.text).toBe(
      "Pause and try the next exercise slowly.",
    );

    await act(async () => {
      assistantReadAloudButtons[0].props.onPress();
      await flush();
    });

    expect(sendChat).not.toHaveBeenCalled();
  });

  it("routes high-risk dictated text through the existing send flow", async () => {
    voiceTranscript.current = "I feel unsafe";
    sendChat.mockResolvedValue({
      ok: true,
      risk: { level: "high", reasonCodes: ["CRISIS_LANGUAGE"] },
      alertId: "alert-voice",
      messages: {
        user: {
          id: "user-voice-2",
          role: "user",
          text: "I feel unsafe",
          createdAt: "2026-03-24T12:10:00.000Z",
        },
      },
    });

    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Start voice dictation").props.onPress();
      await flush();
    });

    expect(sendChat).not.toHaveBeenCalled();

    await act(async () => {
      findByA11y(root, "Send message").props.onPress();
      await flush();
    });

    expect(sendChat).toHaveBeenCalledWith("token-1", "I feel unsafe");
    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/safety",
      params: {
        alertId: "alert-voice",
        reasonCodes: "CRISIS_LANGUAGE",
      },
    });
  });

  it("keeps offline send blocking unchanged after dictation fills the draft", async () => {
    networkState.offline = true;
    voiceTranscript.current = "Pain increased after walking";
    getCachedChat.mockResolvedValue({
      confirmedMessages: [],
      localAttempt: null,
    });
    getCachedTasks.mockResolvedValue({ items: [] });

    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Start voice dictation").props.onPress();
      await flush();
    });

    expect(findByA11y(root, "Message input").props.value).toBe(
      "Pain increased after walking",
    );
    expect(sendChat).not.toHaveBeenCalled();

    await act(async () => {
      findByA11y(root, "Send message").props.onPress();
      await flush();
    });

    expect(sendChat).not.toHaveBeenCalled();
    expect(chatSendSetError).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "offline",
        retryable: true,
      }),
    );
  });

  it("blocks voice send review for empty or whitespace-only messages", async () => {
    const renderer = await renderScreen();
    const root = renderer.root;

    await reviewForVoiceSend(root);
    expect(sendChat).not.toHaveBeenCalled();
    expect(flattenText(root)).toContain("Voice send needs a message.");

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("    ");
      await flush();
    });
    await reviewForVoiceSend(root);

    expect(sendChat).not.toHaveBeenCalled();
    expect(flattenText(root)).toContain("Voice send needs a message.");
  });

  it("shows the exact trimmed draft in voice send review before any send can happen", async () => {
    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("  Pain is better today  ");
      await flush();
    });
    await reviewForVoiceSend(root);

    const text = flattenText(root);
    expect(text).toContain("Voice send review");
    expect(text).toContain("Pain is better today");
    expect(text).toContain(
      "I’ll send this exact message after you say ‘yes send.’ High-risk content still goes through Aura’s normal safety review. Aura does not call emergency services.",
    );
    expect(findByA11y(root, "Read voice message summary")).toBeTruthy();
    expect(sendChat).not.toHaveBeenCalled();
  });

  it.each(["yes send", "confirm send", "send message"])(
    "sends through the existing chat path after explicit voice confirmation %s",
    async (phrase) => {
      sendChat.mockResolvedValue({
        ok: true,
        risk: { level: "low", reasonCodes: [] },
        messages: {
          user: {
            id: `user-${phrase.replace(/\s+/g, "-")}`,
            role: "user",
            text: "Pain is better today",
            createdAt: "2026-03-24T12:20:00.000Z",
          },
          assistant: {
            id: `assistant-${phrase.replace(/\s+/g, "-")}`,
            role: "assistant",
            text: "Thanks for sharing.",
            createdAt: "2026-03-24T12:20:01.000Z",
          },
        },
      });

      const renderer = await renderScreen();
      const root = renderer.root;

      await act(async () => {
        findByA11y(root, "Message input").props.onChangeText("Pain is better today");
        await flush();
      });
      await reviewForVoiceSend(root);
      await listenAndEmitVoiceSend(root, phrase);

      expect(sendChat).toHaveBeenCalledWith("token-1", "Pain is better today");
      expect(flattenText(root)).toContain("Thanks for sharing.");
    },
  );

  it.each(["yes", "okay", "maybe", ""])(
    "does not send ambiguous voice confirmation %s",
    async (phrase) => {
      const renderer = await renderScreen();
      const root = renderer.root;

      await act(async () => {
        findByA11y(root, "Message input").props.onChangeText("Pain is better today");
        await flush();
      });
      await reviewForVoiceSend(root);
      await listenAndEmitVoiceSend(root, phrase);

      expect(sendChat).not.toHaveBeenCalled();
      expect(flattenText(root)).toContain("That was not a clear send confirmation.");
    },
  );

  it("does not send on voice confirmation parser errors", async () => {
    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("Pain is better today");
      await flush();
    });
    await reviewForVoiceSend(root);

    await act(async () => {
      await findByA11y(root, "Listen for voice send confirmation").props.onPress();
      emitSpeech("nomatch");
      await flush();
    });

    expect(sendChat).not.toHaveBeenCalled();
    expect(flattenText(root)).toContain("That was not a clear send confirmation. Nothing was sent.");
  });

  it("does not send on voice recognition error", async () => {
    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("Pain is better today");
      await flush();
    });
    await reviewForVoiceSend(root);

    await act(async () => {
      await findByA11y(root, "Listen for voice send confirmation").props.onPress();
      emitSpeech("error", { error: "network" });
      await flush();
    });

    expect(sendChat).not.toHaveBeenCalled();
    expect(flattenText(root)).toContain("That was not a clear send confirmation. Nothing was sent.");
  });

  it.each(["cancel", "stop", "do not send", "dont send"])(
    "clears voice send state for negative phrase %s",
    async (phrase) => {
      const renderer = await renderScreen();
      const root = renderer.root;

      await act(async () => {
        findByA11y(root, "Message input").props.onChangeText("Pain is better today");
        await flush();
      });
      await reviewForVoiceSend(root);
      await listenAndEmitVoiceSend(root, phrase);

      expect(sendChat).not.toHaveBeenCalled();
      expect(flattenText(root)).toContain("Voice send cancelled.");
      expect(findByA11y(root, "Confirm voice chat send").props.accessibilityState).toMatchObject({
        disabled: true,
      });
    },
  );

  it("clears voice send state when Cancel is pressed", async () => {
    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("Pain is better today");
      await flush();
    });
    await reviewForVoiceSend(root);

    await act(async () => {
      findByA11y(root, "Cancel voice send").props.onPress();
      await flush();
    });

    expect(sendChat).not.toHaveBeenCalled();
    expect(flattenText(root)).toContain("Voice send cancelled.");
  });

  it("prevents voice send after confirmation expiry", async () => {
    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("Pain is better today");
      await flush();
    });
    await reviewForVoiceSend(root);

    await act(async () => {
      vi.advanceTimersByTime(31_000);
      await flush();
    });
    await listenAndEmitVoiceSend(root, "yes send");

    expect(sendChat).not.toHaveBeenCalled();
    expect(flattenText(root)).toContain("Voice send review expired.");
  });

  it("invalidates voice send review when the draft changes", async () => {
    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("Pain is better today");
      await flush();
    });
    await reviewForVoiceSend(root);

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("Pain is better today ");
      await flush();
    });

    expect(sendChat).not.toHaveBeenCalled();
    expect(flattenText(root)).toContain("Message changed. Review again before voice send.");
    expect(findByA11y(root, "Confirm voice chat send").props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it("routes high-risk voice-confirmed sends exactly like manual send", async () => {
    sendChat.mockResolvedValue({
      ok: true,
      risk: { level: "high", reasonCodes: ["CRISIS_LANGUAGE"] },
      alertId: "alert-voice-confirmed",
      messages: {
        user: {
          id: "user-voice-confirmed",
          role: "user",
          text: "I feel unsafe",
          createdAt: "2026-03-24T12:25:00.000Z",
        },
      },
    });

    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("I feel unsafe");
      await flush();
    });
    await reviewForVoiceSend(root);
    await listenAndEmitVoiceSend(root, "yes send");

    expect(sendChat).toHaveBeenCalledWith("token-1", "I feel unsafe");
    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/safety",
      params: {
        alertId: "alert-voice-confirmed",
        reasonCodes: "CRISIS_LANGUAGE",
      },
    });
  });

  it("keeps offline voice-confirmed send behavior identical to manual send", async () => {
    networkState.offline = true;
    getCachedChat.mockResolvedValue({
      confirmedMessages: [],
      localAttempt: null,
    });
    getCachedTasks.mockResolvedValue({ items: [] });

    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("Pain increased after walking");
      await flush();
    });
    await reviewForVoiceSend(root);

    await act(async () => {
      findByA11y(root, "Confirm voice chat send").props.onPress();
      await flush();
    });

    expect(sendChat).not.toHaveBeenCalled();
    expect(chatSendSetError).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "offline",
        retryable: true,
      }),
    );
    expect(flattenText(root)).toContain("Voice send is paused while you’re offline. Nothing was sent.");
  });

  it("does not expose unsafe voice actions, persistence, or OpenAI keys from chat voice send", async () => {
    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("Pain is better today");
      await flush();
    });
    await reviewForVoiceSend(root);

    expect(flattenText(root)).not.toContain("appointment");
    expect(flattenText(root)).not.toContain("medication dosage");
    expect(flattenText(root)).not.toContain("create alert");
    expect(JSON.stringify(setCachedChat.mock.calls)).not.toContain("Pain is better today");
    expect(flattenText(root)).not.toContain("OPENAI_API_KEY");
    expect(flattenText(root)).not.toContain("EXPO_PUBLIC_OPENAI_API_KEY");
  });

  it("exposes accessible voice send controls and live status", async () => {
    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("Pain is better today");
      await flush();
    });
    await reviewForVoiceSend(root);

    expect(findByA11y(root, "Review for voice send").props.accessibilityHint).toBe(
      "Builds a current exact message review before any voice send can happen.",
    );
    expect(findByA11y(root, "Listen for voice send confirmation").props.accessibilityHint).toBe(
      "Listens once for yes send, confirm send, or send message.",
    );
    expect(findByA11y(root, "Confirm voice chat send").props.accessibilityHint).toBe(
      "Sends the reviewed message through the same normal chat send path.",
    );
    const status = root.findAll(
      (node) =>
        String(node.type) === "mock-view" &&
        node.props.accessibilityLabel?.startsWith("Voice send state:"),
    )[0];
    expect(status.props.accessibilityLiveRegion).toBe("polite");
  });

  it("marks 502 AI-unavailable sends as failed with retry", async () => {
    sendChat.mockRejectedValue({
      status: 502,
      title: "Server error",
      message: "The service is temporarily unavailable. Please retry.",
      kind: "server",
      retryable: true,
    });

    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("Need help");
      await flush();
    });

    await act(async () => {
      findByA11y(root, "Send message").props.onPress();
      await flush();
    });

    const localAttemptCard = getLocalAttemptCard(root);
    expect(localAttemptCard?.props.title).toBe("Failed · Nothing was sent.");
    expect(localAttemptCard?.props.actions[0]?.label).toBe("Retry");
    expect(localAttemptCard?.props.actions[0]?.disabled).toBe(false);
    expect(flattenText(root)).toContain("Nothing was sent");

    const lastCacheCall = setCachedChat.mock.calls.at(-1);
    expect(lastCacheCall?.[1]).toMatchObject({
      confirmedMessages: [],
      localAttempt: {
        text: "Need help",
        status: "failed",
      },
    });
  });

  it("marks ambiguous 500 sends as unknown and refresh-first", async () => {
    sendChat.mockRejectedValue({
      status: 500,
      title: "Server error",
      message: "The service is temporarily unavailable. Please retry.",
      kind: "server",
      retryable: true,
    });

    const renderer = await renderScreen();
    const root = renderer.root;

    await act(async () => {
      findByA11y(root, "Message input").props.onChangeText("Did that go through?");
      await flush();
    });

    await act(async () => {
      findByA11y(root, "Send message").props.onPress();
      await flush();
    });

    const localAttemptCard = getLocalAttemptCard(root);
    expect(localAttemptCard?.props.title).toBe("Delivery not confirmed.");
    expect(localAttemptCard?.props.actions[0]?.label).toBe("Refresh chat");
    expect(localAttemptCard?.props.actions.map((action: { label: string }) => action.label)).not.toContain("Retry");

    await act(async () => {
      localAttemptCard?.props.actions[0]?.onPress();
      await flush();
    });

    expect(chatHistory).toHaveBeenCalledTimes(2);
    const lastCacheCall = setCachedChat.mock.calls.at(-1);
    expect(lastCacheCall?.[1]).toMatchObject({
      confirmedMessages: [],
      localAttempt: {
        text: "Did that go through?",
        status: "unknown",
      },
    });
  });

  it("renders cached unknown attempts separately from confirmed history after restart fallback", async () => {
    chatHistory.mockRejectedValue({
      status: 500,
      title: "Server error",
      message: "The service is temporarily unavailable. Please retry.",
      kind: "server",
      retryable: true,
    });
    getCachedChat.mockResolvedValue({
      confirmedMessages: [
        {
          id: "msg-11",
          role: "assistant",
          text: "Previous confirmed reply",
          createdAt: "2026-03-24T09:00:00.000Z",
        },
      ],
      cachedAt: "2026-03-24T09:05:00.000Z",
      localAttempt: {
        text: "Did this send?",
        status: "unknown",
        createdAt: "2026-03-24T09:04:00.000Z",
      },
    });

    const renderer = await renderScreen();
    const root = renderer.root;

    expect(flattenText(root)).toContain("Previous confirmed reply");
    expect(flattenText(root)).toContain("Delivery not confirmed.");
    expect(flattenText(root)).toContain("Did this send?");
    expect(getLocalAttemptCard(root)?.props.actions[0]?.label).toBe("Refresh chat");
    expect(getLocalAttemptCard(root)?.props.actions[0]?.disabled).toBe(false);
  });

  it("groups duplicate communication prompts into one patient-safe workflow card", async () => {
    listPatientTasks.mockResolvedValue([
      {
        id: "task-1",
        title: "Urgent message follow-up",
        description:
          "Patient One has a message without clinician response since 2026-03-24T09:00:00.000Z",
        type: "communication",
        priority: "urgent",
        status: "open",
        dueAt: "2026-03-24T12:00:00.000Z",
        createdAt: "2026-03-24T09:00:00.000Z",
        updatedAt: "2026-03-24T09:05:00.000Z",
        sourceLabel: "Communication no-response escalation",
        linkedMessageId: "thread-77",
        patientCompletable: false,
        patientAction: {
          kind: "chat",
          label: "Reply in chat",
        },
      },
      {
        id: "task-2",
        title: "Message follow-up",
        description:
          "Patient One has a message without clinician response since 2026-03-24T09:10:00.000Z",
        type: "communication",
        priority: "high",
        status: "open",
        dueAt: "2026-03-24T16:00:00.000Z",
        createdAt: "2026-03-24T09:10:00.000Z",
        updatedAt: "2026-03-24T09:12:00.000Z",
        sourceLabel: "Communication no-response escalation",
        linkedMessageId: "thread-77",
        patientCompletable: false,
        patientAction: {
          kind: "chat",
          label: "Reply in chat",
        },
      },
    ]);

    const renderer = await renderScreen();
    const root = renderer.root;
    const workflowCards = root.findAll((node) => String(node.type) === "mock-workflow-card");

    expect(workflowCards).toHaveLength(1);
    expect(workflowCards[0].props.title).toBe("Response delayed");
    expect(workflowCards[0].props.text).toBe(
      "A reply is taking longer than expected. You can still message your care team here.",
    );
    expect(workflowCards[0].props.chips).toEqual(["Overdue", "Care team message"]);
    expect(JSON.stringify(workflowCards[0].props)).not.toContain("2026-03-24T09:00:00.000Z");
    expect(JSON.stringify(workflowCards[0].props).toLowerCase()).not.toContain(
      "no-response escalation",
    );
    expect(JSON.stringify(workflowCards[0].props).toLowerCase()).not.toContain(
      "follow-through",
    );
  });

  it("prefers server-backed reviewing truth over rollout task prompts", async () => {
    chatHistory.mockResolvedValue({
      items: [],
      patientCommunicationSummary: "care_team_reviewing",
    });
    listPatientTasks.mockResolvedValue([
      {
        id: "task-1",
        title: "Urgent message follow-up",
        description: "Legacy communication task prompt",
        type: "communication",
        priority: "urgent",
        status: "open",
        dueAt: "2026-03-24T12:00:00.000Z",
        createdAt: "2026-03-24T09:00:00.000Z",
        updatedAt: "2026-03-24T09:05:00.000Z",
        sourceLabel: "Communication no-response escalation",
        linkedMessageId: "thread-77",
        patientCompletable: false,
        patientAction: {
          kind: "chat",
          label: "Reply in chat",
        },
      },
    ]);

    const renderer = await renderScreen();
    const root = renderer.root;
    const workflowCards = root.findAll((node) => String(node.type) === "mock-workflow-card");

    expect(workflowCards).toHaveLength(1);
    expect(workflowCards[0].props.title).toBe("Care team reviewing");
    expect(workflowCards[0].props.text).toBe(
      "Your care team is reviewing your latest update. You can still message here at any time.",
    );
    expect(workflowCards[0].props.chips).toEqual([]);
  });

  it("treats a null server summary as authoritative and suppresses rollout task fallback", async () => {
    chatHistory.mockResolvedValue({
      items: [],
      patientCommunicationSummary: null,
    });
    listPatientTasks.mockResolvedValue([
      {
        id: "task-1",
        title: "Urgent message follow-up",
        description: "Legacy communication task prompt",
        type: "communication",
        priority: "urgent",
        status: "open",
        dueAt: "2026-03-24T12:00:00.000Z",
        createdAt: "2026-03-24T09:00:00.000Z",
        updatedAt: "2026-03-24T09:05:00.000Z",
        sourceLabel: "Communication no-response escalation",
        linkedMessageId: "thread-77",
        patientCompletable: false,
        patientAction: {
          kind: "chat",
          label: "Reply in chat",
        },
      },
    ]);

    const renderer = await renderScreen();
    const root = renderer.root;
    const workflowCards = root.findAll((node) => String(node.type) === "mock-workflow-card");

    expect(workflowCards).toHaveLength(0);
    expect(flattenText(root)).toContain("You can still message here");
  });

  it("shows a calmer empty state and a not-synced-yet cue when there is no conversation history", async () => {
    const renderer = await renderScreen();
    const root = renderer.root;
    const statusPills = root.findAll(
      (node) => String(node.type) === "mock-status-pill",
    );
    const text = flattenText(root);

    expect(statusPills.map((node) => node.props.label)).toEqual(
      expect.arrayContaining(["Live messages", "Not synced yet"]),
    );
    expect(text).toContain("No messages yet");
    expect(text).toContain(
      "When you send a message here, your care team conversation will appear in this space.",
    );
  });

  it("shows archived messaging when routine conversation is no longer active", async () => {
    canPatientUseMessages.mockReturnValue(false);
    getCareModeNotice.mockReturnValue({
      title: "Care program completed",
      message:
        "Your care program has ended. Historical progress stays available here, but routine messaging and check-ins are no longer active.",
    });

    const renderer = await renderScreen();
    const root = renderer.root;
    const messageInputs = root.findAll(
      (node) => typeof node.props?.accessibilityLabel === "string" && node.props.accessibilityLabel === "Message input",
    );
    const text = flattenText(root);

    expect(messageInputs).toHaveLength(0);
    expect(text).toContain("Messages are archived");
    expect(text).toContain("Care program completed");
  });
});
