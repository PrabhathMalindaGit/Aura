import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const screenProps: Array<{ name: string; options: { title?: string } }> = [];

vi.mock("react-native", () => ({
  StyleSheet: {
    create: <T extends Record<string, unknown>>(styles: T) => styles,
  },
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

vi.mock("expo-router", () => {
  const Tabs = ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-tabs", props, children);

  Tabs.Screen = ({
    name,
    options,
  }: {
    name: string;
    options: { title?: string };
  }) => {
    screenProps.push({ name, options });
    return React.createElement("mock-tabs-screen", { name, options });
  };

  return { Tabs };
});

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      background: "#ffffff",
      border: "#d8d8d8",
      primary: "#2255aa",
      surface: "#ffffff",
      textMuted: "#666666",
      accentTextOn: "#eef6ff",
    },
    elevation: {
      card: {},
    },
    radius: {
      lg: 16,
    },
    typography: {
      caption: {
        fontSize: 12,
        lineHeight: 16,
      },
      weights: {
        semibold: "600",
      },
    },
  }),
}));

import TabLayout from "@/app/(tabs)/_layout";

describe("tab layout labels", () => {
  it("exposes exactly the five expected patient-facing tab labels", () => {
    screenProps.length = 0;

    act(() => {
      create(<TabLayout />);
    });

    expect(screenProps.map((entry) => entry.name)).toEqual([
      "index",
      "checkin",
      "chat",
      "progress",
      "settings",
    ]);
    expect(screenProps.map((entry) => entry.options.title)).toEqual([
      "Today",
      "Check-in",
      "Messages",
      "Progress",
      "Settings",
    ]);
  });
});
