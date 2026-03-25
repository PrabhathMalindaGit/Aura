import React from "react";
import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { React?: typeof React }).React = React;

const {
  authState,
  networkState,
  trustStatusState,
  routerPush,
  getDueProms,
  listPatientTasks,
  completePatientTask,
  listMyRequests,
  getCachedAppointmentRequests,
  setCachedAppointmentRequests,
  getCachedCheckins,
  getCachedExercisePlan,
  getCachedInsights,
  getCachedProms,
  setCachedPromDueCards,
  getCachedRehabPhases,
  getCachedTasks,
  setCachedTasks,
  getCachedWeeklyReport,
  getReminderReadState,
  markAllRemindersRead,
  markReminderRead,
  syncReminderReadState,
  getRefreshHandle,
  getErrorHandle,
} = vi.hoisted(() => {
  const refreshHandles = new Map<string, { label: string; lastRefreshedAt: number; refreshLocal: ReturnType<typeof vi.fn> }>();
  const errorHandles = new Map<
    string,
    {
      label: string;
      lastError: null;
      setLocalError: ReturnType<typeof vi.fn>;
      clear: ReturnType<typeof vi.fn>;
    }
  >();

  const getRefreshHandle = (domain: string) => {
    if (!refreshHandles.has(domain)) {
      refreshHandles.set(domain, {
        label: "Never",
        lastRefreshedAt: 0,
        refreshLocal: vi.fn(async () => undefined),
      });
    }

    return refreshHandles.get(domain)!;
  };

  const getErrorHandle = (key: string) => {
    if (!errorHandles.has(key)) {
      errorHandles.set(key, {
        label: "Never",
        lastError: null,
        setLocalError: vi.fn(async () => undefined),
        clear: vi.fn(async () => undefined),
      });
    }

    return errorHandles.get(key)!;
  };

  return {
    authState: {
      status: "signedIn" as const,
      token: "token-1",
      patient: {
        id: "patient-1",
        displayName: "Patient One",
      },
    },
    networkState: {
      offline: false,
    },
    trustStatusState: {
      kind: "ok" as const,
      pendingCount: 0,
      failedCount: 0,
    },
    routerPush: vi.fn(),
    getDueProms: vi.fn(),
    listPatientTasks: vi.fn(),
    completePatientTask: vi.fn(),
    listMyRequests: vi.fn(),
    getCachedAppointmentRequests: vi.fn(),
    setCachedAppointmentRequests: vi.fn(async () => undefined),
    getCachedCheckins: vi.fn(),
    getCachedExercisePlan: vi.fn(),
    getCachedInsights: vi.fn(),
    getCachedProms: vi.fn(),
    setCachedPromDueCards: vi.fn(async () => undefined),
    getCachedRehabPhases: vi.fn(),
    getCachedTasks: vi.fn(),
    setCachedTasks: vi.fn(async () => undefined),
    getCachedWeeklyReport: vi.fn(),
    getReminderReadState: vi.fn(),
    markAllRemindersRead: vi.fn(),
    markReminderRead: vi.fn(),
    syncReminderReadState: vi.fn(),
    getRefreshHandle,
    getErrorHandle,
  };
});

const tokenTheme = {
  colors: new Proxy(
    {},
    {
      get: () => "#446688",
    },
  ),
  spacing: new Proxy(
    {},
    {
      get: () => 12,
    },
  ),
  radius: new Proxy(
    {},
    {
      get: () => 12,
    },
  ),
  typography: new Proxy(
    {
      weights: new Proxy(
        {},
        {
          get: () => "600",
        },
      ),
    },
    {
      get: (target, prop) => {
        if (prop === "weights") {
          return target.weights;
        }

        return { fontSize: 16, lineHeight: 22 };
      },
    },
  ),
};

vi.mock("expo-router", () => ({
  Redirect: () => null,
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
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

vi.mock("@/src/api/appointments", () => ({
  listMyRequests,
}));

vi.mock("@/src/api/patient", () => ({
  getDueProms,
}));

vi.mock("@/src/api/tasks", () => ({
  completePatientTask,
  listPatientTasks,
}));

vi.mock("@/src/state/auth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: () => networkState.offline,
}));

vi.mock("@/src/state/trustStatus", () => ({
  useTrustStatus: () => trustStatusState,
}));

vi.mock("@/src/state/refresh", () => ({
  useLastRefreshed: (domain: string) => getRefreshHandle(domain),
}));

vi.mock("@/src/state/lastError", () => ({
  useLastError: (key: string) => getErrorHandle(key),
}));

vi.mock("@/src/state/appointmentsCache", () => ({
  getCachedAppointmentRequests,
  setCachedAppointmentRequests,
}));

vi.mock("@/src/state/checkinsCache", () => ({
  getCachedCheckins,
}));

vi.mock("@/src/state/exercisePlanCache", () => ({
  getCachedExercisePlan,
}));

vi.mock("@/src/state/insightsCache", () => ({
  getCachedInsights,
}));

vi.mock("@/src/state/promsCache", () => ({
  getCachedProms,
  setCachedPromDueCards,
}));

vi.mock("@/src/state/rehabPhasesCache", () => ({
  getCachedRehabPhases,
}));

vi.mock("@/src/state/tasksCache", () => ({
  getCachedTasks,
  setCachedTasks,
}));

vi.mock("@/src/state/weeklyReportCache", () => ({
  getCachedWeeklyReport,
}));

vi.mock("@/src/state/inAppReminders", () => ({
  getReminderReadState,
  markAllRemindersRead,
  markReminderRead,
  syncReminderReadState,
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => tokenTheme,
}));

vi.mock("@/src/components/Avatar", () => ({
  Avatar: (props: Record<string, unknown>) => React.createElement("mock-avatar", props),
}));

vi.mock("@/src/components/Banner", () => ({
  Banner: ({
    title,
    message,
    ...props
  }: {
    title?: string;
    message?: string;
    [key: string]: unknown;
  }) => React.createElement("mock-banner", props, title, message),
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

vi.mock("@/src/components/EmptyState", () => ({
  EmptyState: ({
    title,
    description,
    ctaLabel,
    ...props
  }: {
    title?: string;
    description?: string;
    ctaLabel?: string;
    [key: string]: unknown;
  }) => React.createElement("mock-empty-state", props, title, description, ctaLabel),
}));

vi.mock("@/src/components/HeroHeader", () => ({
  HeroHeader: ({
    title,
    subtitle,
    children,
    ...props
  }: {
    title?: string;
    subtitle?: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-hero-header", props, title, subtitle, children),
}));

vi.mock("@/src/components/IconSet", () => ({
  DomainIcon: (props: Record<string, unknown>) => React.createElement("mock-domain-icon", props),
}));

vi.mock("@/src/components/LastFailedAttempt", () => ({
  LastFailedAttempt: ({
    title,
    message,
    ...props
  }: {
    title?: string;
    message?: string;
    [key: string]: unknown;
  }) => React.createElement("mock-last-failed", props, title, message),
}));

vi.mock("@/src/components/LastRefreshed", () => ({
  LastRefreshed: ({
    value,
    ...props
  }: {
    value?: string;
    [key: string]: unknown;
  }) => React.createElement("mock-last-refreshed", props, value),
}));

vi.mock("@/src/components/MediaCard", () => ({
  MediaCard: ({
    title,
    body,
    ...props
  }: {
    title?: string;
    body?: string;
    [key: string]: unknown;
  }) => React.createElement("mock-media-card", props, title, body),
}));

vi.mock("@/src/components/PrimaryButton", () => ({
  PrimaryButton: ({
    label,
    ...props
  }: {
    label?: string;
    [key: string]: unknown;
  }) => React.createElement("mock-primary-button", props, label),
}));

vi.mock("@/src/components/reminders/ReminderCard", () => ({
  ReminderCard: ({
    reminder,
    ...props
  }: {
    reminder: {
      title: string;
      message: string;
      primaryActionLabel?: string;
      statusLabel?: string;
    };
    [key: string]: unknown;
  }) =>
    React.createElement(
      "mock-reminder-card",
      props,
      reminder.title,
      reminder.message,
      reminder.primaryActionLabel,
      reminder.statusLabel,
    ),
}));

vi.mock("@/src/components/reminders/UnreadBadge", () => ({
  UnreadBadge: ({
    count,
    ...props
  }: {
    count?: number;
    [key: string]: unknown;
  }) => React.createElement("mock-unread-badge", props, count ?? 0),
}));

vi.mock("@/src/components/Screen", () => ({
  Screen: ({
    title,
    banner,
    header,
    children,
    ...props
  }: {
    title?: string;
    banner?: React.ReactNode;
    header?: React.ReactNode;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-screen", props, title, banner, header, children),
}));

vi.mock("@/src/components/SecondaryButton", () => ({
  SecondaryButton: ({
    label,
    ...props
  }: {
    label?: string;
    [key: string]: unknown;
  }) => React.createElement("mock-secondary-button", props, label),
}));

vi.mock("@/src/components/Section", () => ({
  Section: ({
    title,
    subtitle,
    left,
    right,
    children,
    ...props
  }: {
    title?: string;
    subtitle?: string;
    left?: React.ReactNode;
    right?: React.ReactNode;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-section", props, title, subtitle, left, right, children),
}));

vi.mock("@/src/components/Skeleton", () => ({
  SkeletonBlock: (props: Record<string, unknown>) => React.createElement("mock-skeleton", props),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: ({
    label,
    ...props
  }: {
    label?: string;
    [key: string]: unknown;
  }) => React.createElement("mock-status-pill", props, label),
}));

vi.mock("@/src/components/TrackerTile", () => ({
  TrackerTile: ({
    title,
    subtitle,
    ...props
  }: {
    title?: string;
    subtitle?: string;
    [key: string]: unknown;
  }) => React.createElement("mock-tracker-tile", props, title, subtitle),
}));

vi.mock("@/src/components/TrustBanner", () => ({
  TrustBanner: ({
    status,
    ...props
  }: {
    status?: { kind?: string; pendingCount?: number; failedCount?: number };
    [key: string]: unknown;
  }) =>
    React.createElement(
      "mock-trust-banner",
      props,
      status?.kind ?? "ok",
      `pending:${status?.pendingCount ?? 0}`,
      `failed:${status?.failedCount ?? 0}`,
    ),
}));

vi.mock("@/src/components/TrustCues", () => ({
  TrustCues: ({
    extraPills,
    ...props
  }: {
    extraPills?: Array<{ label: string }>;
    [key: string]: unknown;
  }) =>
    React.createElement(
      "mock-trust-cues",
      props,
      ...(extraPills?.map((pill) => pill.label) ?? []),
    ),
}));

import HomeScreen from "../../../app/(tabs)/index";
import RemindersScreen from "../../../app/reminders";

function collectText(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string[] {
  if (node === null) {
    return [];
  }

  if (typeof node === "string") {
    return [node];
  }

  if (Array.isArray(node)) {
    return node.flatMap((entry) => collectText(entry));
  }

  return collectText(node.children as ReactTestRendererJSON[] | string[] | null);
}

function renderedText(renderer: ReactTestRenderer): string {
  return collectText(renderer.toJSON()).join(" ");
}

async function flushEffects(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderScreen(element: React.ReactElement): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  await flushEffects();
  return renderer;
}

describe("PROM follow-through surfaces", () => {
  beforeEach(() => {
    networkState.offline = false;
    trustStatusState.kind = "ok";
    trustStatusState.pendingCount = 0;
    trustStatusState.failedCount = 0;

    routerPush.mockReset();
    getDueProms.mockResolvedValue([]);
    listPatientTasks.mockResolvedValue([]);
    completePatientTask.mockResolvedValue(undefined);
    listMyRequests.mockResolvedValue([]);
    getCachedAppointmentRequests.mockResolvedValue(null);
    setCachedAppointmentRequests.mockClear();
    getCachedCheckins.mockResolvedValue([]);
    getCachedExercisePlan.mockResolvedValue(null);
    getCachedInsights.mockResolvedValue(null);
    getCachedProms.mockResolvedValue(null);
    setCachedPromDueCards.mockClear();
    getCachedRehabPhases.mockResolvedValue(null);
    getCachedTasks.mockResolvedValue(null);
    setCachedTasks.mockClear();
    getCachedWeeklyReport.mockResolvedValue(null);
    getReminderReadState.mockResolvedValue({
      readById: {},
      updatedAt: 0,
    });
    markAllRemindersRead.mockResolvedValue({
      readById: {},
      updatedAt: 0,
    });
    markReminderRead.mockResolvedValue({
      readById: {},
      updatedAt: 0,
    });
    syncReminderReadState.mockImplementation(async (_patientId: string, ids: string[]) => ({
      readById: Object.fromEntries(ids.map((id) => [id, 0])),
      updatedAt: 0,
    }));

    for (const domain of [
      "checkins",
      "exercisePlan",
      "rehabPhases",
      "proms",
      "weeklyReport",
      "insights",
      "appointments",
      "tasks",
      "reminders",
    ]) {
      const handle = getRefreshHandle(domain);
      handle.label = "Never";
      handle.lastRefreshedAt = 0;
      handle.refreshLocal.mockClear();
    }

    for (const key of ["remindersLoad", "remindersAction", "promsLoad", "promSubmit"]) {
      const handle = getErrorHandle(key);
      handle.lastError = null;
      handle.label = "Never";
      handle.clear.mockClear();
      handle.setLocalError.mockClear();
    }
  });

  it("shows due PROMs on the home screen from live server truth", async () => {
    getDueProms.mockResolvedValue([
      {
        id: "prom-home-1",
        templateKey: "koos",
        title: "KOOS weekly check-in",
        dueAt: "2026-03-26T08:00:00.000Z",
        status: "due",
      },
    ]);

    const renderer = await renderScreen(React.createElement(HomeScreen));
    const text = renderedText(renderer);

    expect(text).toContain("Needs your attention");
    expect(text).toContain("questionnaires");
    expect(text).toContain("KOOS weekly check-in");
    expect(text).toContain("Open questionnaire");
    expect(getDueProms).toHaveBeenCalledWith("token-1", 100);
    expect(setCachedPromDueCards).toHaveBeenCalledWith("patient-1", [
      {
        id: "prom-home-1",
        templateKey: "koos",
        title: "KOOS weekly check-in",
        dueAt: "2026-03-26T08:00:00.000Z",
        status: "due",
      },
    ]);
  });

  it("shows due PROMs on reminders from live server truth", async () => {
    getDueProms.mockResolvedValue([
      {
        id: "prom-reminders-1",
        templateKey: "promis",
        title: "PROMIS function survey",
        dueAt: "2026-03-26T09:00:00.000Z",
        status: "due",
      },
    ]);

    const renderer = await renderScreen(React.createElement(RemindersScreen));
    const text = renderedText(renderer);

    expect(text).toContain("Reminders");
    expect(text).toContain("PROMIS function survey");
    expect(text).toContain("questionnaire");
    expect(text).not.toContain("Showing saved reminders");
    expect(getDueProms).toHaveBeenCalledWith("token-1", 100);
  });

  it("keeps offline cached PROM reminders truthful and does not hide them behind local pending state", async () => {
    networkState.offline = true;
    trustStatusState.pendingCount = 1;
    getCachedProms.mockResolvedValue({
      cachedAt: Date.now(),
      dueCards: [
        {
          id: "prom-offline-1",
          templateKey: "lefs",
          title: "LEFS mobility questionnaire",
          dueAt: "2026-03-24T08:00:00.000Z",
          status: "due",
        },
      ],
      historyRows: [],
      instancesById: {
        "prom-offline-1": {
          id: "prom-offline-1",
          templateKey: "lefs",
          templateVersion: 1,
          title: "LEFS mobility questionnaire",
          dueAt: "2026-03-24T08:00:00.000Z",
          status: "due",
          completedAt: null,
          questions: [
            {
              id: "q1",
              text: "How easy was walking today?",
              type: "likert",
              min: 0,
              max: 10,
              required: true,
            },
          ],
          answers: [{ questionId: "q1", value: 4 }],
          score: null,
        },
      },
    });

    const renderer = await renderScreen(React.createElement(RemindersScreen));
    const text = renderedText(renderer);

    expect(text).toContain("Showing saved reminders");
    expect(text).toContain("Connect to refresh the latest workflow changes.");
    expect(text).toContain("LEFS mobility questionnaire");
    expect(text).toContain("This recovery questionnaire is past due.");
    expect(text).toContain("pending:1");
    expect(text).not.toContain("submitted");
    expect(text).not.toContain("reviewed");
    expect(text).not.toContain("Nothing needs your attention right now");
    expect(getDueProms).not.toHaveBeenCalled();
  });
});
