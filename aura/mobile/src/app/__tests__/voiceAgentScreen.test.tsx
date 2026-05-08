import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const { authState } = vi.hoisted(() => ({
  authState: {
    status: "signedIn" as "loading" | "signedIn" | "signedOut",
    token: "token-voice" as string | null,
  },
}));

vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => React.createElement("mock-redirect", { href }),
}));

vi.mock("react-native", () => ({
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

vi.mock("@/src/components/HeroHeader", () => ({
  HeroHeader: (props: Record<string, unknown>) =>
    React.createElement("mock-hero-header", props, props.children as React.ReactNode),
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

vi.mock("@/src/components/VoiceAgentSessionPanel", () => ({
  VoiceAgentSessionPanel: (props: Record<string, unknown>) =>
    React.createElement("mock-voice-agent-session-panel", props),
}));

vi.mock("@/src/state/auth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    spacing: { sm: 8, md: 12 },
    typography: {
      body: { fontSize: 16, lineHeight: 24 },
    },
    colors: {
      textMuted: "#5e7182",
    },
  }),
}));

import VoiceAgentScreen from "@/app/voice-agent";

function findHostNode(renderer: ReactTestRenderer, type: string) {
  return renderer.root.find((node) => node.type === type);
}

describe("VoiceAgentScreen", () => {
  it("renders the voice agent route for signed-in patients", () => {
    authState.status = "signedIn";
    authState.token = "token-voice";

    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = create(<VoiceAgentScreen />);
    });
    const hero = findHostNode(renderer!, "mock-hero-header");
    const panel = findHostNode(renderer!, "mock-voice-agent-session-panel");

    expect(hero.props.title).toBe("Aura Voice Agent");
    expect(panel.props.token).toBe("token-voice");
  });

  it("redirects signed-out patients to login", () => {
    authState.status = "signedOut";
    authState.token = null;

    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = create(<VoiceAgentScreen />);
    });
    const redirect = findHostNode(renderer!, "mock-redirect");

    expect(redirect.props.href).toBe("/(auth)/login");
  });
});
