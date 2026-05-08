import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const mockTokens = {
  colors: {
    accent: "#2f6fed",
    accentTextOn: "#eef4ff",
    border: "#d7e0e7",
    danger: "#c94a3b",
    dangerTextOn: "#fcece9",
    success: "#2f8f83",
    successTextOn: "#eaf7f4",
    surfaceElevated: "#fbf9f5",
    text: "#183042",
    textMuted: "#5e7182",
    warning: "#c9892b",
    warningTextOn: "#fbf3e4",
  },
  radius: { xl: 24 },
  scheme: "light",
  spacing: { md: 12 },
  typography: {
    caption: { fontSize: 13, lineHeight: 18 },
    weights: { semibold: "600" },
  },
};

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

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => mockTokens,
}));

import { StatusPill } from "@/src/components/StatusPill";

function findTextStyle(variant: React.ComponentProps<typeof StatusPill>["variant"]) {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(<StatusPill label="Pending" variant={variant} />);
  });
  if (!renderer) {
    throw new Error("StatusPill test renderer did not mount");
  }
  const text = renderer.root.findAll((node) => String(node.type) === "mock-text")[0];
  if (!text) {
    throw new Error("StatusPill text node was not found");
  }
  return Array.isArray(text.props.style) ? text.props.style.at(-1) : text.props.style;
}

describe("StatusPill", () => {
  it("uses high-contrast foreground text for soft semantic status pills", () => {
    expect(findTextStyle("info")).toMatchObject({ color: mockTokens.colors.text });
    expect(findTextStyle("success")).toMatchObject({ color: mockTokens.colors.text });
    expect(findTextStyle("warning")).toMatchObject({ color: mockTokens.colors.text });
    expect(findTextStyle("danger")).toMatchObject({ color: mockTokens.colors.text });
  });
});
