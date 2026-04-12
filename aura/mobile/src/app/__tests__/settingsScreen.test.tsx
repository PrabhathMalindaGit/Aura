import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

const {
  alertMock,
  openSettingsMock,
  listCaregiverInvites,
  getReminderPrefs,
  setReminderPrefs,
  getPermissionStatus,
  requestPermission,
  cancelReminder,
  scheduleDailyReminder,
  listScheduledRemindersCount,
  sendTestNotificationNow,
  routerPush,
  signOut,
  permissionSetError,
  permissionClear,
  scheduleSetError,
  scheduleClear,
  networkState,
  getPatientCareMode,
  getCareModeNotice,
} = vi.hoisted(() => ({
  alertMock: vi.fn(),
  openSettingsMock: vi.fn(async () => undefined),
  listCaregiverInvites: vi.fn(async () => []),
  getReminderPrefs: vi.fn(async () => ({
    enabled: true,
    hour: 19,
    minute: 0,
    notificationId: "notif-1",
  })),
  setReminderPrefs: vi.fn(async () => undefined),
  getPermissionStatus: vi.fn(async () => "granted"),
  requestPermission: vi.fn(async () => "granted"),
  cancelReminder: vi.fn(async () => undefined),
  scheduleDailyReminder: vi.fn(async () => "notif-2"),
  listScheduledRemindersCount: vi.fn(async () => 1),
  sendTestNotificationNow: vi.fn(async () => undefined),
  routerPush: vi.fn(),
  signOut: vi.fn(async () => undefined),
  permissionSetError: vi.fn(async () => undefined),
  permissionClear: vi.fn(async () => undefined),
  scheduleSetError: vi.fn(async () => undefined),
  scheduleClear: vi.fn(async () => undefined),
  networkState: { isOffline: false },
  getPatientCareMode: vi.fn(() => "active"),
  getCareModeNotice: vi.fn((): any => null),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock("@react-navigation/native", () => ({
  useFocusEffect: () => undefined,
}));

vi.mock("react-native", () => ({
  Alert: { alert: alertMock },
  Linking: { openSettings: openSettingsMock },
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
  Switch: (props: Record<string, unknown>) => React.createElement("mock-switch", props),
  Text: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-text", props, children),
  TextInput: (props: Record<string, unknown>) => React.createElement("mock-text-input", props),
  View: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-view", props, children),
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
  DomainIcon: (props: Record<string, unknown>) => React.createElement("mock-domain-icon", props),
}));

vi.mock("@/src/components/LastFailedAttempt", () => ({
  LastFailedAttempt: (props: Record<string, unknown>) =>
    React.createElement("mock-last-failed-attempt", props),
}));

vi.mock("@/src/components/Motion", () => ({
  FadeSlideIn: ({
    visible,
    children,
  }: {
    visible?: boolean;
    children?: React.ReactNode;
  }) => (visible ? <>{children}</> : null),
  getPressFeedbackStyle: () => ({}),
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

vi.mock("@/src/components/Section", () => ({
  Section: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-section", props, children),
}));

vi.mock("@/src/components/SecondaryButton", () => ({
  SecondaryButton: (props: Record<string, unknown>) =>
    React.createElement("mock-secondary-button", props),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: (props: Record<string, unknown>) => React.createElement("mock-status-pill", props),
}));

vi.mock("@/src/components/settings/SettingsGroup", () => ({
  SettingsGroup: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-settings-group", props, children),
}));

vi.mock("@/src/components/settings/SettingsItem", () => ({
  SettingsItem: (props: Record<string, unknown>) =>
    React.createElement("mock-settings-item", props),
}));

vi.mock("@/src/config/env", () => ({
  API_BASE: "http://localhost:3000",
}));

vi.mock("@/src/api/caregiver", () => ({
  listCaregiverInvites,
}));

vi.mock("@/src/dev/renderAudit", () => ({
  isPatientDebugUIEnabled: () => false,
  useDevRenderAudit: () => undefined,
}));

vi.mock("@/src/services/reminders", () => ({
  cancelReminder,
  getPermissionStatus,
  listScheduledRemindersCount,
  requestPermission,
  sanitizeReminderTime: (hour: number, minute: number) => ({ hour, minute }),
  scheduleDailyReminder,
  sendTestNotificationNow,
}));

vi.mock("@/src/state/auth", () => ({
  useAuth: () => ({
    status: "signedIn",
    token: "patient-token",
    patient: {
      id: "patient-1",
      displayName: "Patient One",
      caregiverName: "Alex",
      currentPhaseTitle: "Mobility",
    },
    signOut,
  }),
}));

vi.mock("@/src/state/checkinsCache", () => ({
  clearCachedCheckins: vi.fn(async () => undefined),
}));

vi.mock("@/src/state/copingUsage", () => ({
  resetAllUsage: vi.fn(async () => undefined),
}));

vi.mock("@/src/state/lastError", () => ({
  clearAllLastErrors: vi.fn(async () => undefined),
  useLastError: (key: string) => ({
    label: "Never",
    lastError: null,
    setLocalError: key === "reminderPermission" ? permissionSetError : scheduleSetError,
    clear: key === "reminderPermission" ? permissionClear : scheduleClear,
  }),
}));

vi.mock("@/src/state/network", () => ({
  useNetwork: () => networkState,
}));

vi.mock("@/src/state/recoverySupport", () => ({
  getPatientCareMode,
  getCareModeNotice,
}));

vi.mock("@/src/state/pendingSessions", () => ({
  clearPending: vi.fn(async () => undefined),
}));

vi.mock("@/src/state/reminderPrefs", () => ({
  getReminderPrefs,
  setReminderPrefs,
}));

vi.mock("@/src/state/refresh", () => ({
  clearAllLastRefreshed: vi.fn(async () => undefined),
}));

vi.mock("@/src/state/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));

vi.mock("@/src/theme/motion", () => ({
  runLayoutAnimationIfAllowed: () => undefined,
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      danger: "#C94A3B",
      dangerTextOn: "#FCECE9",
      border: "#D7E0E7",
      surface: "#FFFFFF",
      surfaceSubtle: "#FBF9F5",
      text: "#183042",
      textMuted: "#5E7182",
      textTertiary: "#8393A0",
    },
    radius: { md: 14, lg: 18 },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
    typography: {
      body: { fontSize: 16, lineHeight: 24 },
      caption: { fontSize: 13, lineHeight: 18 },
      section: { fontSize: 21, lineHeight: 28 },
      weights: { medium: "500", semibold: "600" },
    },
  }),
}));

vi.mock("@/src/utils/demoReset", () => ({
  resetDemoState: vi.fn(async () => undefined),
}));

import SettingsScreen from "@/app/(tabs)/settings";

function findByTypeAndProp(
  root: ReactTestInstance,
  typeName: string,
  prop: string,
  value: unknown,
) {
  return root.findAll(
    (node) => String(node.type) === typeName && node.props[prop] === value,
  );
}

function findByTestId(root: ReactTestInstance, typeName: string, testID: string) {
  return root.findAll(
    (node) => String(node.type) === typeName && node.props.testID === testID,
  );
}

describe("SettingsScreen", () => {
  beforeEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    routerPush.mockReset();
    signOut.mockReset();
    getReminderPrefs.mockClear();
    listCaregiverInvites.mockReset();
    listCaregiverInvites.mockResolvedValue([] as any);
    networkState.isOffline = false;
    getPatientCareMode.mockReset();
    getPatientCareMode.mockReturnValue("active");
    getCareModeNotice.mockReset();
    getCareModeNotice.mockReturnValue(null);
  });

  it("renders one coherent settings shell with each grouped section once", async () => {
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<SettingsScreen />);
    });

    const settingsShells = renderer!.root.findAll(
      (node) => String(node.type) === "mock-view" && node.props.testID === "settings-shell",
    );

    expect(settingsShells).toHaveLength(1);
    expect(findByTestId(renderer!.root, "mock-settings-group", "settings-group-account")).toHaveLength(1);
    expect(findByTestId(renderer!.root, "mock-settings-group", "settings-group-preferences")).toHaveLength(1);
    expect(findByTestId(renderer!.root, "mock-settings-group", "settings-group-care")).toHaveLength(1);
    expect(findByTestId(renderer!.root, "mock-settings-group", "settings-group-support")).toHaveLength(1);
    expect(findByTestId(renderer!.root, "mock-settings-group", "settings-group-app")).toHaveLength(1);
    expect(findByTestId(renderer!.root, "mock-pressable", "settings-logout-button")).toHaveLength(1);
  });

  it("keeps caregiver and safety concepts to one primary row each, without exposing developer controls", async () => {
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<SettingsScreen />);
    });

    expect(findByTypeAndProp(renderer!.root, "mock-settings-item", "title", "Caregiver access")).toHaveLength(1);
    expect(findByTypeAndProp(renderer!.root, "mock-settings-item", "title", "Safety plan")).toHaveLength(1);
    expect(findByTypeAndProp(renderer!.root, "mock-settings-item", "title", "Show developer tools")).toHaveLength(0);
    expect(findByTestId(renderer!.root, "mock-view", "settings-developer-panel")).toHaveLength(0);
  });

  it("uses live caregiver access counts for the settings row", async () => {
    let renderer: ReactTestRenderer;

    listCaregiverInvites.mockResolvedValue([
      {
        inviteId: "invite-1",
        codeHint: "ABCD",
        expiresAt: "2026-04-12T10:00:00.000Z",
        usedAt: "2026-04-12T09:00:00.000Z",
        revokedAt: null,
        createdAt: "2026-04-12T08:00:00.000Z",
        status: "active",
      },
      {
        inviteId: "invite-2",
        codeHint: "EFGH",
        expiresAt: "2026-04-13T10:00:00.000Z",
        usedAt: null,
        revokedAt: null,
        createdAt: "2026-04-12T08:30:00.000Z",
        status: "pending",
      },
    ] as any);

    await act(async () => {
      renderer = create(<SettingsScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const caregiverRows = findByTypeAndProp(
      renderer!.root,
      "mock-settings-item",
      "title",
      "Caregiver access",
    );

    expect(caregiverRows).toHaveLength(1);
    expect(caregiverRows[0]?.props.statusLabel).toBe("1 linked");
    expect(caregiverRows[0]?.props.subtitle).toContain("read-only caregiver summary");
  });

  it("keeps the developer section hidden when patient debug UI is disabled", async () => {
    let renderer: ReactTestRenderer;

    (globalThis as { __DEV__?: boolean }).__DEV__ = false;

    await act(async () => {
      renderer = create(<SettingsScreen />);
    });

    expect(findByTestId(renderer!.root, "mock-settings-group", "settings-group-developer")).toHaveLength(0);
    expect(findByTypeAndProp(renderer!.root, "mock-settings-item", "title", "Show developer tools")).toHaveLength(0);
  });

  it("shows the independent-mode notice while keeping care-summary sharing available", async () => {
    let renderer: ReactTestRenderer;

    getPatientCareMode.mockReturnValue("independent");
    getCareModeNotice.mockReturnValue({
      title: "Independent recovery mode",
      message:
        "Your care program has ended. You can keep tracking recovery here, but routine clinician monitoring is no longer active.",
    });

    await act(async () => {
      renderer = create(<SettingsScreen />);
    });

    const banners = renderer!.root.findAll((node) => String(node.type) === "mock-banner");

    expect(banners.some((node) => node.props.title === "Independent recovery mode")).toBe(true);
    expect(findByTypeAndProp(renderer!.root, "mock-settings-item", "title", "Share care summary")).toHaveLength(1);
  });
});
