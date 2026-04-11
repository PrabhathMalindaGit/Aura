import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

type CachedChatWrite = {
  confirmedMessages: Array<Record<string, unknown>>;
  localAttempt?: {
    text: string;
    status: "sending" | "failed" | "unknown";
    createdAt?: string;
  } | null;
  cachedAt?: string;
};

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
} = vi.hoisted(() => ({
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
  getCachedTasks: vi.fn(async () => null),
  setCachedTasks: vi.fn(async () => undefined),
  refreshChat: vi.fn(async () => undefined),
  refreshTasks: vi.fn(async () => undefined),
  networkState: { offline: false },
  chatLoadSetError: vi.fn(async () => undefined),
  chatLoadClear: vi.fn(async () => undefined),
  chatSendSetError: vi.fn(async () => undefined),
  chatSendClear: vi.fn(async () => undefined),
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
      primaryTextOn: "#ffffff",
      success: "#2f855a",
      successTextOn: "#edfdf4",
      surface: "#ffffff",
      surfaceElevated: "#f2f2f2",
      text: "#111111",
      textMuted: "#666666",
      warning: "#b7791f",
      warningTextOn: "#fff8e1",
    },
    radius: { sm: 8, md: 12, lg: 16, xl: 24 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
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

    chatHistory.mockResolvedValue([]);
    listPatientTasks.mockResolvedValue([]);
    getCachedChat.mockResolvedValue(null);
    getCachedTasks.mockResolvedValue(null);
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
    const root = renderer.root;

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
    expect(workflowCards[0].props.title).toBe("Please reply to your care team");
    expect(workflowCards[0].props.text).toBe(
      "Your care team is waiting for a reply. Open chat when you can.",
    );
    expect(workflowCards[0].props.chips).toEqual(["Overdue", "Care team message"]);
    expect(JSON.stringify(workflowCards[0].props)).not.toContain("2026-03-24T09:00:00.000Z");
  });
});
