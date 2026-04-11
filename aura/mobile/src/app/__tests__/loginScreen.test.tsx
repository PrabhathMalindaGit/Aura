import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const { routerPush, signIn } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  signIn: vi.fn(async () => undefined),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "web" },
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
      surface: "#ffffff",
      textMuted: "#5e7182",
    },
    spacing: { sm: 8, md: 12, lg: 16 },
    typography: {
      caption: { fontSize: 12, lineHeight: 16 },
    },
  }),
}));

import LoginScreen from "@/app/(auth)/login";

describe("Login screen", () => {
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
});
