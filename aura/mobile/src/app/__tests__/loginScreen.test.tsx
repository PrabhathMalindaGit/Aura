import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

const { routerPush, signIn } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  signIn: vi.fn(async () => undefined),
}));

vi.mock("expo-image", () => ({
  Image: (props: Record<string, unknown>) => React.createElement("mock-image", props),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "web" },
  Pressable: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-pressable", props, children),
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

vi.mock("@/src/components/Card", () => ({
  Card: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-card", props, children),
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

vi.mock("@/src/components/InlineNotice", () => ({
  InlineNotice: (props: Record<string, unknown>) => React.createElement("mock-inline-notice", props),
}));

vi.mock("@/src/components/LastFailedAttempt", () => ({
  LastFailedAttempt: (props: Record<string, unknown>) =>
    React.createElement("mock-last-failed-attempt", props),
}));

vi.mock("@/src/components/PrimaryButton", () => ({
  PrimaryButton: (props: Record<string, unknown>) =>
    React.createElement("mock-primary-button", props),
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

vi.mock("@/src/components/SecondaryButton", () => ({
  SecondaryButton: (props: Record<string, unknown>) =>
    React.createElement("mock-secondary-button", props),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: (props: Record<string, unknown>) => React.createElement("mock-status-pill", props),
}));

vi.mock("@/src/components/TextField", () => ({
  TextField: (props: Record<string, unknown>) => React.createElement("mock-text-field", props),
}));

vi.mock("@/src/assets/brand", () => ({
  auraBrandMark: 1,
}));

vi.mock("@/src/config/env", () => ({
  isProbablyLocalhost: true,
}));

vi.mock("@/src/state/auth", () => ({
  useAuth: () => ({
    signIn,
  }),
}));

vi.mock("@/src/state/lastError", () => ({
  useLastError: () => ({
    label: "Never",
    lastError: null,
    setLocalError: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    reload: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: () => false,
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      border: "#d7e0e7",
      primary: "#2f6fed",
      surface: "#ffffff",
      surfaceElevated: "#fbf9f5",
      textMuted: "#5e7182",
      text: "#183042",
    },
    elevation: { card: {} },
    radius: { md: 14, lg: 18, xl: 24 },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
    typography: {
      body: { fontSize: 16, lineHeight: 24 },
      caption: { fontSize: 12, lineHeight: 16 },
      title: { fontSize: 28, lineHeight: 34 },
      weights: { medium: "500", semibold: "600" },
    },
  }),
}));

import LoginScreen, { shouldShowDemoAccessChips } from "@/app/(auth)/login";

describe("Login screen", () => {
  it("renders the Aura brand area with the uploaded logo mark", async () => {
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<LoginScreen />);
    });

    const root = renderer!.root;

    expect(
      root.find((node) => node.props.testID === "login-brand-header").props.accessibilityLabel,
    ).toContain("Aura");
    expect(root.find((node) => node.props.testID === "login-aura-logo")).toBeTruthy();

    const text = root
      .findAll((node) => String(node.type) === "mock-text")
      .map((node) => node.children.join(" "))
      .join(" ");

    expect(text).toContain("Aura");
    expect(text).toContain("Rehabilitation support that keeps your recovery plan connected.");
    expect(text).toContain("Your check-ins and messages stay protected behind Aura access.");
  });

  it("does not expose demo or API diagnostics on the patient sign-in surface", async () => {
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<LoginScreen />);
    });

    const root = renderer!.root;
    const text = root
      .findAll((node) => String(node.type) === "mock-text")
      .map((node) => node.children.join(" "))
      .join(" ");

    expect(text).not.toContain("Demo:");
    expect(text).not.toContain("API:");

    const field = root.find(
      (node) => String(node.type) === "mock-text-field",
    );
    expect(field.props.placeholder).toBe("Enter your access code");
  });

  it("keeps access-code sign-in submission wired to the existing auth flow", async () => {
    let renderer: ReactTestRenderer;

    signIn.mockClear();

    await act(async () => {
      renderer = create(<LoginScreen />);
    });

    const root = renderer!.root;
    const field = root.find((node) => String(node.type) === "mock-text-field");

    await act(async () => {
      field.props.onChangeText("P1-DEMO");
    });

    const continueButton = root.find(
      (node) => String(node.type) === "mock-primary-button" && node.props.label === "Continue",
    );

    await act(async () => {
      await continueButton.props.onPress();
    });

    expect(signIn).toHaveBeenCalledWith("P1-DEMO");
  });

  it("keeps the caregiver login option visible and navigable", async () => {
    let renderer: ReactTestRenderer;

    routerPush.mockClear();

    await act(async () => {
      renderer = create(<LoginScreen />);
    });

    const caregiverButton = renderer!.root.find(
      (node) =>
        String(node.type) === "mock-secondary-button" && node.props.label === "I’m a caregiver",
    );

    await act(async () => {
      caregiverButton.props.onPress();
    });

    expect(routerPush).toHaveBeenCalledWith("/caregiver-login");
  });

  it("shows compact demo chips only for local dev mode", async () => {
    expect(shouldShowDemoAccessChips(true, true)).toBe(true);
    expect(shouldShowDemoAccessChips(false, true)).toBe(false);
    expect(shouldShowDemoAccessChips(true, false)).toBe(false);

    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<LoginScreen />);
    });

    const root = renderer!.root;
    expect(root.find((node) => node.props.testID === "login-demo-access-chips")).toBeTruthy();

    const demoChip = root.find((node) => node.props.testID === "login-demo-chip-P2-DEMO");

    await act(async () => {
      demoChip.props.onPress();
    });

    const field = root.find((node) => String(node.type) === "mock-text-field");
    expect(field.props.value).toBe("P2-DEMO");
  });
});
