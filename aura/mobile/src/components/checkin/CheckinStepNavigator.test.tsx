import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockTokens = {
  colors: {
    border: "#d7e0e7",
    primary: "#2f6fed",
    surface: "#ffffff",
    success: "#2f8f83",
    successSoft: "#eaf7f4",
    text: "#183042",
    textMuted: "#5e7182",
    textTertiary: "#8393a0",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
  },
  radius: {
    lg: 18,
  },
  typography: {
    caption: {
      fontSize: 13,
      lineHeight: 18,
    },
    weights: {
      medium: "500",
      semibold: "600",
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

vi.mock("@/src/components/IconSet", () => ({
  DomainIcon: (props: Record<string, unknown>) => React.createElement("mock-domain-icon", props),
}));

import { CheckinStepNavigator } from "@/src/components/checkin/CheckinStepNavigator";

describe("CheckinStepNavigator", () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
    }
    renderer = null;
  });

  it("renders the four preserved steps and highlights progression state", () => {
    const onSelectStep = vi.fn();

    act(() => {
      renderer = create(
        <CheckinStepNavigator
          activeStep={1}
          onSelectStep={onSelectStep}
          steps={[
            { key: "symptoms", label: "Symptoms", icon: "checkin" },
            { key: "recovery", label: "Recovery", icon: "exercise" },
            { key: "support", label: "Support", icon: "coping" },
            { key: "review", label: "Review", icon: "success" },
          ]}
        />,
      );
    });

    const root = renderer!.root;
    const buttons = root.findAll(
      (node) =>
        typeof node.type === "string" &&
        (node.type as string) === "mock-pressable",
    );
    expect(buttons).toHaveLength(4);
    expect(buttons.map((entry) => entry.props.accessibilityLabel)).toEqual([
      "Step 1: Symptoms",
      "Step 2: Recovery",
      "Step 3: Support",
      "Step 4: Review",
    ]);
    expect(buttons.map((entry) => entry.props.accessibilityState?.selected)).toEqual([
      false,
      true,
      false,
      false,
    ]);

    act(() => {
      buttons[2]?.props.onPress();
    });

    expect(onSelectStep).toHaveBeenCalledWith(2);
  });
});
