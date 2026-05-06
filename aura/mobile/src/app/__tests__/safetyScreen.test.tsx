import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const { authState, routerPush, routerReplace } = vi.hoisted(() => ({
  authState: { status: "signedIn" as "loading" | "signedIn" | "signedOut" },
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
}));

vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => React.createElement("mock-redirect", { href }),
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    push: routerPush,
    replace: routerReplace,
  }),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement("mock-activity-indicator", props),
  Alert: { alert: vi.fn() },
  Linking: {
    canOpenURL: vi.fn(async () => true),
    openURL: vi.fn(async () => undefined),
  },
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

vi.mock("@/src/components/EmptyState", () => ({
  EmptyState: (props: Record<string, unknown>) => React.createElement("mock-empty-state", props),
}));

vi.mock("@/src/components/IconSet", () => ({
  DomainIcon: (props: Record<string, unknown>) => React.createElement("mock-domain-icon", props),
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
  HeroHeader: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-hero-header", props, children),
}));

vi.mock("@/src/components/MediaCard", () => ({
  MediaCard: (props: Record<string, unknown>) => React.createElement("mock-media-card", props),
}));

vi.mock("@/src/components/PrimaryButton", () => ({
  PrimaryButton: (props: Record<string, unknown>) =>
    React.createElement("mock-primary-button", props),
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

vi.mock("@/src/components/Row", () => ({
  Row: (props: Record<string, unknown>) => React.createElement("mock-row", props),
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

vi.mock("@/src/components/Section", () => ({
  Section: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-section", props, children),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: (props: Record<string, unknown>) => React.createElement("mock-status-pill", props),
}));

vi.mock("@/src/components/TipCard", () => ({
  TipCard: (props: Record<string, unknown>) => React.createElement("mock-tip-card", props),
}));

vi.mock("@/src/state/auth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: () => false,
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      primary: "#2F6FED",
      text: "#183042",
      textMuted: "#5E7182",
      border: "#d7e0e7",
      surface: "#ffffff",
    },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
    radius: { md: 14, xl: 24 },
    typography: {
      body: { fontSize: 16, lineHeight: 24 },
      caption: { fontSize: 12, lineHeight: 16 },
      section: { fontSize: 20, lineHeight: 28 },
      weights: { semibold: "600" },
    },
  }),
}));

import SafetyScreen from "@/app/safety";
import { Linking } from "react-native";

describe("Safety screen", () => {
  it("uses patient-safe fallback copy when clinic phone details are unavailable", async () => {
    authState.status = "signedIn";
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<SafetyScreen />);
    });

    const text = renderer!.root
      .findAll((node) => String(node.type) === "mock-text")
      .map((node) => node.children.join(" "))
      .join(" ");

    expect(text).toContain("Clinic support is available in Messages");
    expect(text).not.toContain("not configured");
    expect(text).not.toContain("demo environment");
  });

  it("shows an explicit loading state instead of a spinner-only shell during auth bootstrap", async () => {
    authState.status = "loading";
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<SafetyScreen />);
    });

    const loadingState = renderer!.root.find(
      (node) => String(node.type) === "mock-empty-state",
    );
    expect(loadingState.props.title).toBe("Loading safety support");
  });

  it("adds fixed safety-guidance read-aloud without navigating or calling", async () => {
    authState.status = "signedIn";
    routerPush.mockClear();
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<SafetyScreen />);
    });

    const readAloud = renderer!.root.find(
      (node) => String(node.type) === "mock-read-aloud-button",
    );

    expect(readAloud.props.label).toBe("Read safety guidance");
    expect(readAloud.props.text).toContain("Start by messaging your care team");
    expect(readAloud.props.text).toContain("Pause and take a slow breath.");
    expect(readAloud.props.text).toContain("If you're in immediate danger");

    await act(async () => {
      readAloud.props.onPress();
    });

    expect(routerPush).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});
