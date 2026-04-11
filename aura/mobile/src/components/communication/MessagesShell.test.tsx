import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockTokens = {
  colors: {
    border: "#d7e0e7",
    primary: "#2f6fed",
    surface: "#ffffff",
    text: "#183042",
    textMuted: "#5e7182",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
  },
  radius: {
    xl: 24,
  },
  typography: {
    caption: {
      fontSize: 13,
      lineHeight: 18,
    },
    weights: {
      medium: "500",
    },
  },
};

vi.mock("react-native", () => ({
  StyleSheet: {
    create: <T extends Record<string, unknown>>(styles: T) => styles,
  },
  Pressable: ({
    children,
    style,
    ...props
  }: {
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    style?: unknown;
    [key: string]: unknown;
  }) =>
    React.createElement(
      "mock-pressable",
      {
        ...props,
        style: typeof style === "function" ? style({ pressed: false }) : style,
      },
      typeof children === "function" ? children({ pressed: false }) : children,
    ),
  ScrollView: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-scroll-view", props, children),
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

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => mockTokens,
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

vi.mock("@/src/components/IconSet", () => ({
  DomainIcon: (props: Record<string, unknown>) => React.createElement("mock-domain-icon", props),
}));

import { MessagesShell } from "@/src/components/communication/MessagesShell";

describe("MessagesShell", () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
    }
    renderer = null;
  });

  it("renders one top-level messages shell with shortcuts and composer", () => {
    const onOpenTasks = vi.fn();

    act(() => {
      renderer = create(
        <MessagesShell
          title="Messages"
          subtitle="Care team support"
          shortcuts={[
            {
              key: "tasks",
              label: "Tasks",
              icon: "tasks",
              accessibilityLabel: "Open tasks",
              onPress: onOpenTasks,
            },
            {
              key: "plan",
              label: "Plan",
              icon: "exercise",
              accessibilityLabel: "Open plan",
              onPress: () => undefined,
            },
          ]}
          contextContent={React.createElement("mock-context", {}, "Context")}
          composer={React.createElement("mock-composer", {}, "Composer")}
        >
          {React.createElement("mock-list", {}, "History")}
        </MessagesShell>,
      );
    });

    const root = renderer!.root;
    const heroHeaders = root.findAll(
      (node) =>
        typeof node.type === "string" && (node.type as string) === "mock-hero-header",
    );
    const buttons = root.findAll(
      (node) =>
        typeof node.type === "string" && (node.type as string) === "mock-pressable",
    );

    expect(heroHeaders).toHaveLength(1);
    expect(buttons.map((entry) => entry.props.accessibilityLabel)).toEqual([
      "Open tasks",
      "Open plan",
    ]);

    act(() => {
      buttons[0]?.props.onPress();
    });

    expect(onOpenTasks).toHaveBeenCalledTimes(1);
  });
});
